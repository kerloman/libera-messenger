import crypto from 'node:crypto'
import path from 'node:path'
import express from 'express'
import multer from 'multer'
import bcrypt from 'bcryptjs'
import { db, audit, uploadsDir } from './db.js'
import {
  COOKIE, RANK, authRequired, cookieOpts, createSession, destroySession, login,
  meUser, parseCookies, publicUser, register, requestPasswordReset, requireRank,
  resetPassword, sessionUser, validateRegistration, verifyEmail,
} from './auth.js'

const MAX_FILE = 25 * 1024 * 1024
const MAX_AVATAR = 5 * 1024 * 1024
const ALLOWED_MIME = /^(image\/|video\/|audio\/|application\/(pdf|zip|json|x-zip-compressed|octet-stream)|text\/)/

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) =>
      cb(null, crypto.randomUUID() + (path.extname(file.originalname || '').slice(0, 10) || '')),
  }),
  limits: { fileSize: MAX_FILE },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_MIME.test(file.mimetype)),
})

// ---- tiny in-memory rate limiter ----
const buckets = new Map()
function rateLimit(key, limit, windowMs) {
  const now = Date.now()
  const b = buckets.get(key) ?? { n: 0, t: now }
  if (now - b.t > windowMs) { b.n = 0; b.t = now }
  b.n++
  buckets.set(key, b)
  return b.n <= limit
}
const authLimiter = (req, res, next) =>
  rateLimit('auth:' + req.ip, 20, 60_000) ? next() : res.status(429).json({ error: 'Too many attempts. Try again in a minute.' })

// ---- serializers ----
function attachmentOf(messageId) {
  const a = db.prepare('SELECT * FROM attachments WHERE message_id = ?').get(messageId)
  return a
    ? { url: '/uploads/' + a.path, mime: a.mime, size: a.size, name: a.original_name, duration: a.duration }
    : null
}

function reactionsOf(messageId) {
  const rows = db.prepare('SELECT emoji, user_id FROM reactions WHERE message_id = ?').all(messageId)
  const agg = {}
  for (const r of rows) {
    agg[r.emoji] ??= { emoji: r.emoji, count: 0, userIds: [] }
    agg[r.emoji].count++
    agg[r.emoji].userIds.push(r.user_id)
  }
  return Object.values(agg)
}

export function serializeMessage(m) {
  return {
    id: m.id,
    chatId: m.chat_id,
    senderId: m.sender_id,
    kind: m.kind,
    body: m.deleted_at ? null : m.body,
    replyTo: m.reply_to,
    edited: !!m.edited_at,
    deleted: !!m.deleted_at,
    createdAt: m.created_at,
    attachment: m.deleted_at ? null : attachmentOf(m.id),
    reactions: m.deleted_at ? [] : reactionsOf(m.id),
  }
}

export function chatMembers(chatId) {
  return db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').all(chatId).map((r) => r.user_id)
}

export function isMember(chatId, userId) {
  return !!db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, userId)
}

export function serializeChat(chat, forUserId, rt) {
  const peerId = chatMembers(chat.id).find((id) => id !== forUserId) ?? forUserId
  const peer = db.prepare('SELECT * FROM users WHERE id = ?').get(peerId)
  const last = db
    .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1')
    .get(chat.id)
  const my = db.prepare('SELECT * FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chat.id, forUserId)
  const theirs = db.prepare('SELECT * FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chat.id, peerId)
  const unread = db
    .prepare(
      'SELECT COUNT(*) AS n FROM messages WHERE chat_id = ? AND id > ? AND sender_id != ? AND deleted_at IS NULL',
    )
    .get(chat.id, my?.last_read_id ?? 0, forUserId).n
  return {
    id: chat.id,
    kind: chat.kind,
    peer: {
      ...publicUser(peer),
      online: rt.isOnline(peerId),
      status: peer.status,
    },
    lastMessage: last ? serializeMessage(last) : null,
    unread,
    myLastReadId: my?.last_read_id ?? 0,
    peerDeliveredUpTo: theirs?.last_delivered_id ?? 0,
    peerReadUpTo: theirs?.last_read_id ?? 0,
  }
}

// ============================================================
export function makeApi(rt) {
  const r = express.Router()

  // ---------- auth ----------
  r.post('/auth/register', authLimiter, (req, res) => {
    const out = register(req.body ?? {}, req.headers['user-agent'])
    if (out.error) return res.status(400).json({ error: out.error })
    res.setHeader('Set-Cookie', `${COOKIE}=${out.session}; ${cookieOpts()}`)
    res.json({ user: meUser(out.user), firstUser: out.firstUser })
  })

  r.get('/auth/username-available', (req, res) => {
    const u = String(req.query.u ?? '')
    const err = validateRegistration({ email: 'x@x.io', password: 'xxxxxxxx', username: u, displayName: 'x' })
    if (err) return res.json({ available: false, reason: err })
    const taken = db.prepare('SELECT 1 FROM users WHERE username = ?').get(u)
    res.json({ available: !taken, reason: taken ? 'This username is taken.' : null })
  })

  r.post('/auth/login', authLimiter, (req, res) => {
    const out = login(req.body ?? {}, req.headers['user-agent'])
    if (out.error) return res.status(400).json({ error: out.error })
    res.setHeader('Set-Cookie', `${COOKIE}=${out.session}; ${cookieOpts()}`)
    res.json({ user: meUser(out.user) })
  })

  r.post('/auth/logout', (req, res) => {
    const t = parseCookies(req.headers.cookie)[COOKIE]
    if (t) destroySession(t)
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; Max-Age=0`)
    res.json({ ok: true })
  })

  r.get('/auth/me', (req, res) => {
    const u = sessionUser(parseCookies(req.headers.cookie)[COOKIE])
    if (!u) return res.status(401).json({ error: 'Not signed in.' })
    res.json({ user: meUser(u) })
  })

  r.post('/auth/verify', (req, res) => {
    const out = verifyEmail(String(req.body?.token ?? ''))
    out.error ? res.status(400).json(out) : res.json(out)
  })

  r.post('/auth/request-reset', authLimiter, (req, res) => {
    res.json(requestPasswordReset(String(req.body?.email ?? '')))
  })

  r.post('/auth/reset', authLimiter, (req, res) => {
    const out = resetPassword(String(req.body?.token ?? ''), req.body?.password)
    out.error ? res.status(400).json(out) : res.json(out)
  })

  // Development mailbox — lets you complete verify/reset flows without SMTP.
  // Disabled automatically when SMTP is configured or NODE_ENV=production.
  r.get('/dev/mailbox', (req, res) => {
    if (process.env.SMTP_HOST || process.env.NODE_ENV === 'production')
      return res.status(404).json({ error: 'Not found.' })
    const rows = db
      .prepare('SELECT subject, body, created_at FROM email_outbox WHERE to_email = ? ORDER BY id DESC LIMIT 5')
      .all(String(req.query.email ?? ''))
    res.json({ emails: rows })
  })

  // ---------- me ----------
  r.use(authRequired)

  r.get('/config', (_req, res) => {
    const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]
    if (process.env.TURN_URL)
      iceServers.push({
        urls: process.env.TURN_URL,
        username: process.env.TURN_USER,
        credential: process.env.TURN_PASS,
      })
    res.json({ iceServers })
  })

  r.patch('/me', (req, res) => {
    const { displayName, bio } = req.body ?? {}
    if (displayName !== undefined) {
      const d = String(displayName).trim()
      if (!d || d.length > 50) return res.status(400).json({ error: 'Display name must be 1–50 characters.' })
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(d, req.user.id)
    }
    if (bio !== undefined) {
      const b = String(bio).slice(0, 200)
      db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(b, req.user.id)
    }
    res.json({ user: meUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) })
  })

  r.post('/me/avatar', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Choose an image file.' })
    if (!req.file.mimetype.startsWith('image/') || req.file.size > MAX_AVATAR)
      return res.status(400).json({ error: 'Avatar must be an image up to 5 MB.' })
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run('/uploads/' + req.file.filename, req.user.id)
    db.prepare('INSERT INTO attachments (message_id, path, mime, size, original_name) VALUES (NULL,?,?,?,?)')
      .run(req.file.filename, req.file.mimetype, req.file.size, 'avatar')
    res.json({ avatar: '/uploads/' + req.file.filename })
  })

  r.post('/me/password', (req, res) => {
    const { current, next } = req.body ?? {}
    if (!bcrypt.compareSync(String(current ?? ''), req.user.password_hash))
      return res.status(400).json({ error: 'Current password is incorrect.' })
    if (!next || String(next).length < 8)
      return res.status(400).json({ error: 'New password must be at least 8 characters.' })
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(bcrypt.hashSync(String(next), 10), req.user.id)
    res.json({ ok: true })
  })

  r.get('/me/sessions', (req, res) => {
    const current = parseCookies(req.headers.cookie)[COOKIE]
    const rows = db
      .prepare('SELECT rowid AS id, token, user_agent, created_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC')
      .all(req.user.id)
    res.json({
      sessions: rows.map((s) => ({
        id: s.id, userAgent: s.user_agent, createdAt: s.created_at, current: s.token === current,
      })),
    })
  })

  r.delete('/me/sessions/:id', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE rowid = ? AND user_id = ?').run(Number(req.params.id), req.user.id)
    res.json({ ok: true })
  })

  r.get('/me/export', (req, res) => {
    const chats = db
      .prepare('SELECT c.* FROM chats c JOIN chat_members m ON m.chat_id = c.id WHERE m.user_id = ?')
      .all(req.user.id)
    const data = {
      exportedAt: new Date().toISOString(),
      profile: meUser(req.user),
      chats: chats.map((c) => ({
        ...serializeChat(c, req.user.id, rt),
        messages: db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY id').all(c.id).map(serializeMessage),
      })),
    }
    res.setHeader('Content-Disposition', 'attachment; filename="libera-export.json"')
    res.json(data)
  })

  // ---------- users ----------
  r.get('/users/search', (req, res) => {
    const q = String(req.query.q ?? '').trim()
    if (q.length < 2) return res.json({ users: [] })
    const rows = db
      .prepare(
        `SELECT * FROM users
         WHERE status = 'active' AND id != ?
           AND (username = ? COLLATE NOCASE OR display_name LIKE ? COLLATE NOCASE)
         ORDER BY username LIMIT 20`,
      )
      .all(req.user.id, q, `%${q}%`)
    res.json({ users: rows.map((u) => ({ ...publicUser(u), online: rt.isOnline(u.id) })) })
  })

  r.get('/users/:username', (req, res) => {
    const u = db
      .prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE AND status != 'deleted'")
      .get(req.params.username)
    if (!u) return res.status(404).json({ error: 'User not found.' })
    const chat = db
      .prepare(
        `SELECT c.id FROM chats c
         JOIN chat_members a ON a.chat_id = c.id AND a.user_id = ?
         JOIN chat_members b ON b.chat_id = c.id AND b.user_id = ?
         WHERE c.kind = 'dm'`,
      )
      .get(req.user.id, u.id)
    res.json({ user: { ...publicUser(u), online: rt.isOnline(u.id) }, chatId: chat?.id ?? null })
  })

  // ---------- chats ----------
  r.post('/chats', (req, res) => {
    const target = db.prepare("SELECT * FROM users WHERE id = ? AND status = 'active'").get(String(req.body?.userId ?? ''))
    if (!target) return res.status(404).json({ error: 'User not found.' })
    if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot message yourself.' })
    const existing = db
      .prepare(
        `SELECT c.* FROM chats c
         JOIN chat_members a ON a.chat_id = c.id AND a.user_id = ?
         JOIN chat_members b ON b.chat_id = c.id AND b.user_id = ?
         WHERE c.kind = 'dm'`,
      )
      .get(req.user.id, target.id)
    if (existing) return res.json({ chat: serializeChat(existing, req.user.id, rt), created: false })

    const id = crypto.randomUUID()
    db.prepare("INSERT INTO chats (id, kind) VALUES (?, 'dm')").run(id)
    const add = db.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?,?)')
    add.run(id, req.user.id)
    add.run(id, target.id)
    const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(id)
    rt.emitToUser(target.id, 'chat:new', { chat: serializeChat(chat, target.id, rt) })
    res.json({ chat: serializeChat(chat, req.user.id, rt), created: true })
  })

  r.get('/chats', (req, res) => {
    const rows = db
      .prepare('SELECT c.* FROM chats c JOIN chat_members m ON m.chat_id = c.id WHERE m.user_id = ?')
      .all(req.user.id)
    const chats = rows
      .map((c) => serializeChat(c, req.user.id, rt))
      .sort((a, b) => (b.lastMessage?.id ?? 0) - (a.lastMessage?.id ?? 0))
    res.json({ chats })
  })

  r.get('/chats/:id/messages', (req, res) => {
    if (!isMember(req.params.id, req.user.id))
      return res.status(403).json({ error: 'You are not a member of this conversation.' })
    const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER
    const limit = Math.min(Number(req.query.limit) || 50, 100)
    const rows = db
      .prepare('SELECT * FROM messages WHERE chat_id = ? AND id < ? ORDER BY id DESC LIMIT ?')
      .all(req.params.id, before, limit)
    res.json({ messages: rows.reverse().map(serializeMessage) })
  })

  r.post('/chats/:id/messages', upload.single('file'), (req, res) => {
    const chatId = req.params.id
    if (!isMember(chatId, req.user.id))
      return res.status(403).json({ error: 'You are not a member of this conversation.' })
    if (!rateLimit('msg:' + req.user.id, 30, 10_000))
      return res.status(429).json({ error: 'Slow down a little.' })

    let kind = 'text'
    const body = String(req.body?.body ?? '').slice(0, 4000)
    if (req.file) {
      const m = req.file.mimetype
      kind = req.body?.kind === 'voice' && m.startsWith('audio/') ? 'voice'
        : m.startsWith('image/') ? 'image'
        : m.startsWith('video/') ? 'video'
        : m.startsWith('audio/') ? 'voice'
        : 'file'
    } else if (!body.trim()) {
      return res.status(400).json({ error: 'Message is empty.' })
    }

    const replyTo = Number(req.body?.replyTo) || null
    if (replyTo && !db.prepare('SELECT 1 FROM messages WHERE id = ? AND chat_id = ?').get(replyTo, chatId))
      return res.status(400).json({ error: 'Reply target not found.' })

    const info = db
      .prepare('INSERT INTO messages (chat_id, sender_id, kind, body, reply_to) VALUES (?,?,?,?,?)')
      .run(chatId, req.user.id, kind, body.trim() || null, replyTo)
    if (req.file) {
      db.prepare(
        'INSERT INTO attachments (message_id, path, mime, size, original_name, duration) VALUES (?,?,?,?,?,?)',
      ).run(info.lastInsertRowid, req.file.filename, req.file.mimetype, req.file.size,
            (req.file.originalname || '').slice(0, 120) || null, Number(req.body?.duration) || null)
    }
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid)
    const payload = serializeMessage(msg)
    rt.deliverMessage(chatId, req.user.id, payload)
    res.json({ message: payload })
  })

  r.post('/chats/:id/read', (req, res) => {
    const chatId = req.params.id
    if (!isMember(chatId, req.user.id))
      return res.status(403).json({ error: 'You are not a member of this conversation.' })
    const upTo = Number(req.body?.messageId) || 0
    db.prepare(
      `UPDATE chat_members SET last_read_id = MAX(last_read_id, ?), last_delivered_id = MAX(last_delivered_id, ?)
       WHERE chat_id = ? AND user_id = ?`,
    ).run(upTo, upTo, chatId, req.user.id)
    for (const uid of chatMembers(chatId))
      if (uid !== req.user.id)
        rt.emitToUser(uid, 'receipt', { chatId, userId: req.user.id, readUpTo: upTo, deliveredUpTo: upTo })
    res.json({ ok: true })
  })

  // ---------- messages ----------
  const ownMessage = (req, res) => {
    const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(Number(req.params.id))
    if (!m || m.deleted_at) { res.status(404).json({ error: 'Message not found.' }); return null }
    if (!isMember(m.chat_id, req.user.id)) { res.status(403).json({ error: 'Not allowed.' }); return null }
    return m
  }

  r.patch('/messages/:id', (req, res) => {
    const m = ownMessage(req, res); if (!m) return
    if (m.sender_id !== req.user.id) return res.status(403).json({ error: 'You can only edit your own messages.' })
    if (m.kind !== 'text') return res.status(400).json({ error: 'Only text messages can be edited.' })
    const body = String(req.body?.body ?? '').trim().slice(0, 4000)
    if (!body) return res.status(400).json({ error: 'Message is empty.' })
    db.prepare("UPDATE messages SET body = ?, edited_at = datetime('now') WHERE id = ?").run(body, m.id)
    const payload = serializeMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(m.id))
    for (const uid of chatMembers(m.chat_id)) rt.emitToUser(uid, 'msg:edit', { message: payload })
    res.json({ message: payload })
  })

  r.delete('/messages/:id', (req, res) => {
    const m = ownMessage(req, res); if (!m) return
    if (m.sender_id !== req.user.id) return res.status(403).json({ error: 'You can only delete your own messages.' })
    db.prepare("UPDATE messages SET deleted_at = datetime('now'), body = NULL WHERE id = ?").run(m.id)
    for (const uid of chatMembers(m.chat_id))
      rt.emitToUser(uid, 'msg:delete', { chatId: m.chat_id, messageId: m.id })
    res.json({ ok: true })
  })

  r.post('/messages/:id/reactions', (req, res) => {
    const m = ownMessage(req, res); if (!m) return
    const emoji = String(req.body?.emoji ?? '').slice(0, 16)
    if (!emoji) return res.status(400).json({ error: 'Missing emoji.' })
    const existing = db.prepare('SELECT emoji FROM reactions WHERE message_id = ? AND user_id = ?').get(m.id, req.user.id)
    db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ?').run(m.id, req.user.id)
    if (!existing || existing.emoji !== emoji)
      db.prepare('INSERT INTO reactions (message_id, user_id, emoji) VALUES (?,?,?)').run(m.id, req.user.id, emoji)
    const reactions = serializeMessage(m).reactions
    for (const uid of chatMembers(m.chat_id))
      rt.emitToUser(uid, 'msg:react', { chatId: m.chat_id, messageId: m.id, reactions })
    res.json({ reactions })
  })

  r.post('/messages/:id/forward', (req, res) => {
    const m = ownMessage(req, res); if (!m) return
    const targetChat = String(req.body?.chatId ?? '')
    if (!isMember(targetChat, req.user.id))
      return res.status(403).json({ error: 'You are not a member of the target conversation.' })
    const info = db
      .prepare('INSERT INTO messages (chat_id, sender_id, kind, body) VALUES (?,?,?,?)')
      .run(targetChat, req.user.id, m.kind, m.body)
    const att = db.prepare('SELECT * FROM attachments WHERE message_id = ?').get(m.id)
    if (att)
      db.prepare('INSERT INTO attachments (message_id, path, mime, size, original_name, duration) VALUES (?,?,?,?,?,?)')
        .run(info.lastInsertRowid, att.path, att.mime, att.size, att.original_name, att.duration)
    const payload = serializeMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid))
    rt.deliverMessage(targetChat, req.user.id, payload)
    res.json({ message: payload })
  })

  // ---------- calls ----------
  r.get('/calls', (req, res) => {
    const rows = db
      .prepare(
        `SELECT c.*, u1.username AS caller_username, u1.display_name AS caller_name,
                u2.username AS callee_username, u2.display_name AS callee_name
         FROM calls c JOIN users u1 ON u1.id = c.caller_id JOIN users u2 ON u2.id = c.callee_id
         WHERE c.caller_id = ? OR c.callee_id = ?
         ORDER BY c.started_at DESC LIMIT 50`,
      )
      .all(req.user.id, req.user.id)
    res.json({
      calls: rows.map((c) => ({
        id: c.id,
        chatId: c.chat_id,
        video: !!c.video,
        status: c.status,
        startedAt: c.started_at,
        answeredAt: c.answered_at,
        endedAt: c.ended_at,
        direction: c.caller_id === req.user.id ? 'out' : 'in',
        peer: c.caller_id === req.user.id
          ? { id: c.callee_id, username: c.callee_username, displayName: c.callee_name }
          : { id: c.caller_id, username: c.caller_username, displayName: c.caller_name },
      })),
    })
  })

  // ---------- reports ----------
  r.post('/reports', (req, res) => {
    const target = db
      .prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE AND status != 'deleted'")
      .get(String(req.body?.username ?? ''))
    if (!target) return res.status(404).json({ error: 'User not found.' })
    const reason = String(req.body?.reason ?? '').slice(0, 60)
    if (!reason) return res.status(400).json({ error: 'Choose a reason.' })
    db.prepare('INSERT INTO reports (reporter_id, target_user_id, reason, details) VALUES (?,?,?,?)')
      .run(req.user.id, target.id, reason, String(req.body?.details ?? '').slice(0, 1000))
    res.json({ ok: true })
  })

  // ---------- admin ----------
  const admin = express.Router()
  r.use('/admin', requireRank('moderator'), admin)

  admin.get('/stats', (_req, res) => {
    const n = (sql) => db.prepare(sql).get().n
    const perDay = db
      .prepare(
        `SELECT date(created_at) AS day, COUNT(*) AS n FROM messages
         WHERE created_at > datetime('now', '-7 days') GROUP BY day ORDER BY day`,
      )
      .all()
    const usersPerDay = db
      .prepare(
        `SELECT date(created_at) AS day, COUNT(*) AS n FROM users
         WHERE created_at > datetime('now', '-7 days') GROUP BY day ORDER BY day`,
      )
      .all()
    res.json({
      totals: {
        users: n('SELECT COUNT(*) AS n FROM users'),
        activeUsers: n("SELECT COUNT(*) AS n FROM users WHERE status = 'active'"),
        chats: n('SELECT COUNT(*) AS n FROM chats'),
        messages: n('SELECT COUNT(*) AS n FROM messages'),
        calls: n('SELECT COUNT(*) AS n FROM calls'),
        openReports: n("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'"),
        online: undefined,
      },
      messagesPerDay: perDay,
      usersPerDay,
    })
  })

  admin.get('/users', (req, res) => {
    const q = `%${String(req.query.q ?? '').trim()}%`
    const rows = db
      .prepare(
        `SELECT * FROM users WHERE username LIKE ? COLLATE NOCASE OR display_name LIKE ? COLLATE NOCASE
         ORDER BY created_at DESC LIMIT 100`,
      )
      .all(q, q)
    const canSeeEmail = RANK[req.user.role] >= RANK.admin
    res.json({
      users: rows.map((u) => ({
        ...publicUser(u),
        status: u.status,
        email: canSeeEmail ? u.email : null,
        emailVerified: !!u.email_verified,
      })),
    })
  })

  admin.patch('/users/:id', (req, res) => {
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
    if (!target) return res.status(404).json({ error: 'User not found.' })
    const actorRank = RANK[req.user.role]
    if (target.id !== req.user.id && RANK[target.role] >= actorRank)
      return res.status(403).json({ error: 'You cannot manage a user with an equal or higher role.' })

    const { status, role } = req.body ?? {}
    if (status !== undefined) {
      if (!['active', 'blocked', 'suspended'].includes(status))
        return res.status(400).json({ error: 'Invalid status.' })
      if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot change your own status.' })
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, target.id)
      if (status !== 'active') {
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id)
        rt.disconnectUser(target.id)
      }
      audit(req.user.id, 'admin.status', target.id, { status })
    }
    if (role !== undefined) {
      if (!['user', 'moderator', 'admin', 'owner'].includes(role))
        return res.status(400).json({ error: 'Invalid role.' })
      if (actorRank < RANK.admin) return res.status(403).json({ error: 'Only admins can change roles.' })
      if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot change your own role.' })
      if (RANK[role] >= actorRank && req.user.role !== 'owner')
        return res.status(403).json({ error: 'You cannot grant a role equal to or higher than your own.' })
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, target.id)
      audit(req.user.id, 'admin.role', target.id, { role })
    }
    res.json({ user: { ...publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(target.id)), status: target.status } })
  })

  admin.delete('/users/:id', requireRank('admin'), (req, res) => {
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
    if (!target) return res.status(404).json({ error: 'User not found.' })
    if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account here.' })
    if (RANK[target.role] >= RANK[req.user.role])
      return res.status(403).json({ error: 'You cannot delete a user with an equal or higher role.' })
    db.prepare("UPDATE users SET status = 'deleted', display_name = 'Deleted account', bio = '', avatar = NULL WHERE id = ?")
      .run(target.id)
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id)
    rt.disconnectUser(target.id)
    audit(req.user.id, 'admin.delete_user', target.id, { username: target.username })
    res.json({ ok: true })
  })

  admin.get('/reports', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT r.*, a.username AS reporter_username, b.username AS target_username, b.display_name AS target_name
         FROM reports r JOIN users a ON a.id = r.reporter_id JOIN users b ON b.id = r.target_user_id
         ORDER BY r.created_at DESC LIMIT 100`,
      )
      .all()
    res.json({
      reports: rows.map((x) => ({
        id: x.id, reason: x.reason, details: x.details, status: x.status, createdAt: x.created_at,
        reporter: x.reporter_username, target: { id: x.target_user_id, username: x.target_username, displayName: x.target_name },
      })),
    })
  })

  admin.patch('/reports/:id', (req, res) => {
    const status = String(req.body?.status ?? '')
    if (!['resolved', 'dismissed', 'open'].includes(status))
      return res.status(400).json({ error: 'Invalid status.' })
    db.prepare('UPDATE reports SET status = ?, resolved_by = ? WHERE id = ?')
      .run(status, req.user.id, Number(req.params.id))
    audit(req.user.id, 'admin.report', String(req.params.id), { status })
    res.json({ ok: true })
  })

  admin.get('/logs', requireRank('admin'), (_req, res) => {
    const rows = db
      .prepare(
        `SELECT l.*, u.username AS actor FROM audit_log l LEFT JOIN users u ON u.id = l.actor_id
         ORDER BY l.id DESC LIMIT 200`,
      )
      .all()
    res.json({ logs: rows.map((l) => ({ id: l.id, actor: l.actor, action: l.action, target: l.target, meta: l.meta, at: l.created_at })) })
  })

  return r
}
