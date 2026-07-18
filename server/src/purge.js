import fs from 'node:fs'
import path from 'node:path'
import { db, uploadsDir, audit } from './db.js'

// Permanently and securely delete a user and everything tied to them.
// Runs inside a single transaction; physical files are removed after commit.
//
// Removed: account row, profile info, auth credentials (sessions + email
// tokens + password hash via the row), private chats the user is in (which
// cascade their messages, attachments rows and reactions), calls, reports,
// and uploaded files from disk (chat attachments + avatar).
//
// Groups: the schema only has 1:1 DM chats, so there is no group ownership to
// transfer. When group chats are added, transfer/delete logic goes here.
export function purgeUser(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
  if (!user) return { ok: false, reason: 'not_found' }

  // Collect physical files to delete (do the disk IO after the DB transaction).
  const files = new Set()
  const chatIds = db
    .prepare('SELECT chat_id FROM chat_members WHERE user_id = ?')
    .all(userId)
    .map((r) => r.chat_id)

  for (const chatId of chatIds) {
    const atts = db
      .prepare(
        `SELECT a.path FROM attachments a
         JOIN messages m ON m.id = a.message_id
         WHERE m.chat_id = ?`,
      )
      .all(chatId)
    for (const a of atts) files.add(a.path)
  }
  if (user.avatar) files.add(path.basename(user.avatar))

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM reports WHERE reporter_id = ? OR target_user_id = ?').run(userId, userId)
    db.prepare('DELETE FROM calls WHERE caller_id = ? OR callee_id = ?').run(userId, userId)
    // Deleting the chats the user belongs to cascades messages, attachments,
    // reactions and chat_members for those conversations.
    for (const chatId of chatIds) db.prepare('DELETE FROM chats WHERE id = ?').run(chatId)
    // Deleting the user cascades their sessions and email tokens.
    db.prepare('DELETE FROM users WHERE id = ?').run(userId)
  })
  tx()

  for (const f of files) {
    try {
      fs.unlinkSync(path.join(uploadsDir, path.basename(f)))
    } catch {
      /* file already gone — ignore */
    }
  }

  audit(null, 'account.purged', userId, { username: user.username, chats: chatIds.length, files: files.size })
  return { ok: true, username: user.username }
}

const MONTH_MS = 30 * 86400_000
export const DELETE_PERIODS = [1, 3, 6, 12, 18, 24]

export function scheduleDate(months) {
  return new Date(Date.now() + months * MONTH_MS).toISOString()
}

// Purge every account whose scheduled deletion time has arrived. Returns count.
export function runDueDeletions() {
  const due = db
    .prepare("SELECT id FROM users WHERE delete_scheduled_at IS NOT NULL AND delete_scheduled_at <= datetime('now')")
    .all()
  for (const u of due) purgeUser(u.id)
  return due.length
}
