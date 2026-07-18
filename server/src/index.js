import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { Server } from 'socket.io'
import { db, uploadsDir } from './db.js'
import { authRequired } from './auth.js'
import { makeApi, isMember } from './api.js'
import { setupRealtime } from './rt.js'
import { runDueDeletions } from './purge.js'

const PORT = Number(process.env.PORT || 3001)
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))

const server = http.createServer(app)
const io = new Server(server, { path: '/socket.io' })
const rt = setupRealtime(io)

app.get('/health', (_req, res) => res.json({ ok: true }))

// Uploaded files: signed-in users only; message attachments additionally
// require membership in the conversation they belong to.
app.get('/uploads/:name', authRequired, (req, res) => {
  const name = path.basename(req.params.name)
  const rows = db.prepare('SELECT message_id FROM attachments WHERE path = ?').all(name)
  if (rows.length === 0) return res.status(404).end()
  const isAvatar = rows.some((r) => r.message_id === null)
  if (!isAvatar) {
    const allowed = rows.some((r) => {
      const m = db.prepare('SELECT chat_id FROM messages WHERE id = ?').get(r.message_id)
      return m && isMember(m.chat_id, req.user.id)
    })
    if (!allowed) return res.status(403).end()
  }
  res.sendFile(path.join(uploadsDir, name), { maxAge: '365d', immutable: true })
})

app.use('/api', makeApi(rt))

// Serve the built client when app/dist exists (production mode).
const dist = path.join(path.dirname(root), 'app', 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File is too large (max 25 MB).' })
  console.error(err)
  res.status(500).json({ error: 'Something went wrong.' })
})

if (!process.env.SESSION_SECRET) {
  console.warn('[warn] SESSION_SECRET not set — fine for development, set it in production (.env).')
}

server.listen(PORT, () => {
  console.log(`Libera server listening on http://localhost:${PORT}`)
})

// Enforce scheduled account deletions: sweep on startup, then hourly.
function sweepDeletions() {
  try {
    const n = runDueDeletions()
    if (n) console.log(`[deletion] purged ${n} account(s) whose scheduled date passed`)
  } catch (e) {
    console.error('[deletion] sweep failed:', e.message)
  }
}
sweepDeletions()
setInterval(sweepDeletions, 3600_000).unref()
