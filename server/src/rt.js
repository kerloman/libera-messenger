import crypto from 'node:crypto'
import { db, audit } from './db.js'
import { COOKIE, parseCookies, publicUser, sessionUser } from './auth.js'
import { chatMembers, isMember, blockExists } from './api.js'

// Realtime layer: presence, typing, delivery receipts, WebRTC call signaling.
export function setupRealtime(io) {
  const online = new Map() // userId -> Set<socket>
  const activeCalls = new Map() // callId -> { callerId, calleeId, chatId, video }

  const rt = {
    isOnline: (userId) => online.has(userId),
    emitToUser(userId, event, payload) {
      for (const s of online.get(userId) ?? []) s.emit(event, payload)
    },
    disconnectUser(userId) {
      for (const s of [...(online.get(userId) ?? [])]) s.disconnect(true)
    },
    // called by the REST layer after persisting a message
    deliverMessage(chatId, senderId, message) {
      for (const uid of chatMembers(chatId)) {
        if (uid === senderId) continue
        rt.emitToUser(uid, 'msg:new', { chatId, message })
        if (rt.isOnline(uid)) {
          db.prepare(
            'UPDATE chat_members SET last_delivered_id = MAX(last_delivered_id, ?) WHERE chat_id = ? AND user_id = ?',
          ).run(message.id, chatId, uid)
          rt.emitToUser(senderId, 'receipt', {
            chatId, userId: uid, deliveredUpTo: message.id, readUpTo: null,
          })
        }
      }
    },
  }

  function contactsOf(userId) {
    return db
      .prepare(
        `SELECT DISTINCT m2.user_id AS id FROM chat_members m1
         JOIN chat_members m2 ON m2.chat_id = m1.chat_id AND m2.user_id != m1.user_id
         WHERE m1.user_id = ?`,
      )
      .all(userId)
      .map((r) => r.id)
  }

  function broadcastPresence(userId, isOnline) {
    const lastSeen = new Date().toISOString()
    for (const cid of contactsOf(userId))
      if (!blockExists(userId, cid))
        rt.emitToUser(cid, 'presence', { userId, online: isOnline, lastSeen })
  }

  io.use((socket, next) => {
    const user = sessionUser(parseCookies(socket.handshake.headers.cookie)[COOKIE])
    if (!user) return next(new Error('unauthorized'))
    socket.data.user = user
    next()
  })

  io.on('connection', (socket) => {
    const me = socket.data.user
    const first = !online.has(me.id)
    if (first) online.set(me.id, new Set())
    online.get(me.id).add(socket)

    if (first) {
      broadcastPresence(me.id, true)
      // mark everything sent while offline as delivered, notify senders
      const rows = db
        .prepare(
          `SELECT m.chat_id, MAX(m.id) AS max_id FROM messages m
           JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ?
           WHERE m.sender_id != ? GROUP BY m.chat_id`,
        )
        .all(me.id, me.id)
      for (const row of rows) {
        const cur = db
          .prepare('SELECT last_delivered_id FROM chat_members WHERE chat_id = ? AND user_id = ?')
          .get(row.chat_id, me.id)
        if (cur && row.max_id > cur.last_delivered_id) {
          db.prepare('UPDATE chat_members SET last_delivered_id = ? WHERE chat_id = ? AND user_id = ?')
            .run(row.max_id, row.chat_id, me.id)
          for (const uid of chatMembers(row.chat_id))
            if (uid !== me.id)
              rt.emitToUser(uid, 'receipt', { chatId: row.chat_id, userId: me.id, deliveredUpTo: row.max_id, readUpTo: null })
        }
      }
    }

    socket.on('typing', ({ chatId, on }) => {
      if (typeof chatId !== 'string' || !isMember(chatId, me.id)) return
      for (const uid of chatMembers(chatId))
        if (uid !== me.id) rt.emitToUser(uid, 'typing', { chatId, userId: me.id, on: !!on })
    })

    // ---------- call signaling ----------
    socket.on('call:invite', ({ chatId, video, offer }, cb) => {
      if (typeof chatId !== 'string' || !isMember(chatId, me.id)) return cb?.({ error: 'Not allowed.' })
      const calleeId = chatMembers(chatId).find((id) => id !== me.id)
      if (!calleeId) return cb?.({ error: 'No one to call.' })
      const callId = crypto.randomUUID()
      db.prepare('INSERT INTO calls (id, chat_id, caller_id, callee_id, video) VALUES (?,?,?,?,?)')
        .run(callId, chatId, me.id, calleeId, video ? 1 : 0)
      if (!rt.isOnline(calleeId)) {
        db.prepare("UPDATE calls SET status = 'missed', ended_at = datetime('now') WHERE id = ?").run(callId)
        rt.emitToUser(calleeId, 'call:missed', { callId })
        return cb?.({ error: 'offline', callId })
      }
      activeCalls.set(callId, { callerId: me.id, calleeId, chatId, video: !!video })
      rt.emitToUser(calleeId, 'call:incoming', {
        callId, chatId, video: !!video, offer, caller: publicUser(me),
      })
      cb?.({ callId })
    })

    const party = (callId) => {
      const c = activeCalls.get(callId)
      if (!c || (c.callerId !== me.id && c.calleeId !== me.id)) return null
      return { ...c, other: c.callerId === me.id ? c.calleeId : c.callerId }
    }

    socket.on('call:accept', ({ callId, answer }) => {
      const c = party(callId)
      if (!c || c.calleeId !== me.id) return
      db.prepare("UPDATE calls SET status = 'active', answered_at = datetime('now') WHERE id = ?").run(callId)
      rt.emitToUser(c.callerId, 'call:accepted', { callId, answer })
    })

    socket.on('call:decline', ({ callId }) => {
      const c = party(callId)
      if (!c || c.calleeId !== me.id) return
      db.prepare("UPDATE calls SET status = 'declined', ended_at = datetime('now') WHERE id = ?").run(callId)
      activeCalls.delete(callId)
      rt.emitToUser(c.callerId, 'call:declined', { callId })
    })

    socket.on('call:end', ({ callId }) => {
      const c = party(callId)
      if (!c) return
      const row = db.prepare('SELECT status FROM calls WHERE id = ?').get(callId)
      const status = row?.status === 'active' ? 'completed' : me.id === c.callerId ? 'missed' : 'declined'
      db.prepare("UPDATE calls SET status = ?, ended_at = datetime('now') WHERE id = ?").run(status, callId)
      activeCalls.delete(callId)
      rt.emitToUser(c.other, 'call:ended', { callId, status })
    })

    socket.on('webrtc:ice', ({ callId, candidate }) => {
      const c = party(callId)
      if (!c) return
      rt.emitToUser(c.other, 'webrtc:ice', { callId, candidate })
    })

    socket.on('disconnect', () => {
      const set = online.get(me.id)
      set?.delete(socket)
      if (set && set.size === 0) {
        online.delete(me.id)
        db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?").run(me.id)
        broadcastPresence(me.id, false)
        // end any calls this user was part of
        for (const [callId, c] of activeCalls) {
          if (c.callerId === me.id || c.calleeId === me.id) {
            const row = db.prepare('SELECT status FROM calls WHERE id = ?').get(callId)
            db.prepare("UPDATE calls SET status = ?, ended_at = datetime('now') WHERE id = ?")
              .run(row?.status === 'active' ? 'completed' : 'failed', callId)
            activeCalls.delete(callId)
            rt.emitToUser(c.callerId === me.id ? c.calleeId : c.callerId, 'call:ended', { callId, status: 'ended' })
          }
        }
      }
    })
  })

  return rt
}

export { audit }
