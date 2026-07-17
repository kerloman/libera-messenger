// Libera end-to-end test: spawns the server on a scratch database and drives
// the complete two-account flow over real HTTP + Socket.IO.
import { execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { io } from 'socket.io-client'

const PORT = 3101
const BASE = `http://localhost:${PORT}`
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const tmp = path.join(root, 'data', 'test')
fs.rmSync(tmp, { recursive: true, force: true })
fs.mkdirSync(tmp, { recursive: true })

let passed = 0
let failed = 0
const ok = (cond, name) => {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.error(`  ✗ FAIL: ${name}`) }
}
const section = (t) => console.log(`\n— ${t}`)

// tiny client with a cookie jar
function client() {
  let cookie = null
  return {
    get cookie() { return cookie },
    async req(method, p, body, form) {
      const res = await fetch(BASE + p, {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body && !form ? { 'content-type': 'application/json' } : {}),
        },
        body: form ? form : body ? JSON.stringify(body) : undefined,
      })
      const setc = res.headers.get('set-cookie')
      if (setc) cookie = setc.split(';')[0]
      let json = null
      try { json = await res.json() } catch { /* non-JSON */ }
      return { status: res.status, json }
    },
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
function once(socket, event, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout)
    socket.once(event, (data) => { clearTimeout(t); resolve(data) })
  })
}

const children = []
process.on('exit', () => children.forEach((c) => { try { c.kill('SIGKILL') } catch { /* gone */ } }))

async function main() {
  section('boot server (scratch database)')
  try { execSync(`lsof -ti:${PORT} | xargs kill -9`, { stdio: 'ignore' }) } catch { /* port free */ }
  await wait(200)
  const server = spawn(process.execPath, ['src/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmp, UPLOADS_DIR: path.join(tmp, 'uploads'), DB_PATH: path.join(tmp, 'e2e.db') },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(server)
  server.stderr.on('data', (d) => process.stderr.write('[server] ' + d))
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(BASE + '/health'); if (r.ok) break } catch { /* not up yet */ }
    await wait(100)
  }
  ok((await fetch(BASE + '/health')).ok, 'server is up')

  const A = client() // will be first user → owner
  const B = client()
  const C = client() // third user for access-control checks

  section('registration & validation')
  let r = await A.req('POST', '/api/auth/register', { email: 'bad', password: 'x', username: 'a', displayName: '' })
  ok(r.status === 400 && r.json.error, 'invalid registration rejected with clear error')

  r = await A.req('GET', '/api/auth/username-available?u=kirill')
  ok(r.json.available === true, 'username availability: free username reported available')

  r = await A.req('POST', '/api/auth/register', { email: 'kirill@example.com', password: 'password-one', username: 'kirill', displayName: 'Kirill' })
  ok(r.status === 200 && r.json.user.username === 'kirill', 'user A registered')
  ok(r.json.user.role === 'owner' && r.json.firstUser === true, 'first registered account becomes owner')

  r = await B.req('POST', '/api/auth/register', { email: 'ava@example.com', password: 'password-two', username: 'kirill', displayName: 'Ava' })
  ok(r.status === 400, 'duplicate username rejected')
  r = await A.req('GET', '/api/auth/username-available?u=kirill')
  ok(r.json.available === false, 'username availability: taken username reported taken')

  r = await B.req('POST', '/api/auth/register', { email: 'ava@example.com', password: 'password-two', username: 'ava', displayName: 'Ava Chen' })
  ok(r.status === 200 && r.json.user.role === 'user', 'user B registered as normal user')
  r = await C.req('POST', '/api/auth/register', { email: 'eve@example.com', password: 'password-eve', username: 'eve', displayName: 'Eve' })
  ok(r.status === 200, 'user C registered')

  section('email verification & password reset (dev mailbox)')
  r = await A.req('GET', '/api/dev/mailbox?email=kirill@example.com')
  const verifyToken = r.json.emails[0]?.body.match(/token=([a-f0-9]+)/)?.[1]
  ok(!!verifyToken, 'verification email delivered to outbox')
  r = await A.req('POST', '/api/auth/verify', { token: verifyToken })
  ok(r.json.ok === true, 'email verified with token')
  r = await A.req('GET', '/api/auth/me')
  ok(r.json.user.emailVerified === true, 'me reflects verified email')

  await B.req('POST', '/api/auth/request-reset', { email: 'ava@example.com' })
  r = await B.req('GET', '/api/dev/mailbox?email=ava@example.com')
  const resetToken = r.json.emails[0]?.body.match(/token=([a-f0-9]+)/)?.[1]
  ok(!!resetToken, 'password reset email delivered')
  r = await B.req('POST', '/api/auth/reset', { token: resetToken, password: 'password-two-new' })
  ok(r.json.ok === true, 'password reset accepted')
  r = await B.req('POST', '/api/auth/login', { identifier: 'ava', password: 'password-two' })
  ok(r.status === 400, 'old password no longer works')
  r = await B.req('POST', '/api/auth/login', { identifier: 'ava', password: 'password-two-new' })
  ok(r.status === 200, 'login with new password works')

  section('session persistence')
  r = await A.req('GET', '/api/auth/me')
  ok(r.status === 200 && r.json.user.username === 'kirill', 'session cookie survives (restart-equivalent) requests')
  const Arelogin = client()
  r = await Arelogin.req('POST', '/api/auth/login', { identifier: 'kirill@example.com', password: 'password-one' })
  ok(r.status === 200, 'log out / log back in works (fresh session)')

  section('user search & chat creation')
  r = await A.req('GET', '/api/users/search?q=ava')
  ok(r.json.users.length === 1 && r.json.users[0].username === 'ava', 'search finds user by exact username')
  r = await A.req('GET', '/api/users/search?q=Chen')
  ok(r.json.users.some((u) => u.username === 'ava'), 'search finds user by display name')
  r = await A.req('GET', '/api/users/search?q=nobody_here')
  ok(r.json.users.length === 0, 'search returns no invented users')

  const avaId = (await A.req('GET', '/api/users/ava')).json.user.id
  r = await A.req('POST', '/api/chats', { userId: avaId })
  const chatId = r.json.chat.id
  ok(r.status === 200 && r.json.created === true, 'private chat created')
  r = await A.req('POST', '/api/chats', { userId: avaId })
  ok(r.json.created === false && r.json.chat.id === chatId, 'duplicate chat prevented — same chat returned')

  section('empty state')
  r = await C.req('GET', '/api/chats')
  ok(Array.isArray(r.json.chats) && r.json.chats.length === 0, 'new user has zero chats (no seeded data)')

  section('realtime messaging')
  const sockA = io(BASE, { extraHeaders: { cookie: A.cookie } })
  const sockB = io(BASE, { extraHeaders: { cookie: B.cookie } })
  await Promise.all([once(sockA, 'connect'), once(sockB, 'connect')])
  ok(sockA.connected && sockB.connected, 'both sockets authenticated & connected')

  const sockNoAuth = io(BASE, { autoConnect: true })
  const authErr = await once(sockNoAuth, 'connect_error').catch(() => null)
  ok(!!authErr, 'unauthenticated socket rejected')
  sockNoAuth.close()

  const gotB = once(sockB, 'msg:new')
  const gotReceipt = once(sockA, 'receipt')
  r = await A.req('POST', '/api/chats/' + chatId + '/messages', { body: 'Hello Ava — first real message!' })
  const msg1 = r.json.message
  ok(r.status === 200 && msg1.body.includes('Hello Ava'), 'A sent message via API')
  const evt = await gotB
  ok(evt.message.id === msg1.id && evt.chatId === chatId, 'B received message in real time')

  const rec = await gotReceipt
  ok(rec.deliveredUpTo === msg1.id, 'A received delivered receipt')

  const gotRead = once(sockA, 'receipt')
  await B.req('POST', `/api/chats/${chatId}/read`, { messageId: msg1.id })
  const rd = await gotRead
  ok(rd.readUpTo === msg1.id, 'A received read receipt')

  const gotTyping = once(sockA, 'typing')
  sockB.emit('typing', { chatId, on: true })
  const ty = await gotTyping
  ok(ty.on === true && ty.chatId === chatId, 'typing indicator relayed')

  const gotA = once(sockA, 'msg:new')
  r = await B.req('POST', '/api/chats/' + chatId + '/messages', { body: 'Hi Kirill! Replying.', replyTo: msg1.id })
  ok((await gotA).message.replyTo === msg1.id, 'B replied; A received reply in real time')

  section('edit / delete / reactions / forward')
  const gotEdit = once(sockB, 'msg:edit')
  r = await A.req('PATCH', '/api/messages/' + msg1.id, { body: 'Hello Ava — edited!' })
  ok(r.json.message.edited === true, 'message edited')
  ok((await gotEdit).message.body === 'Hello Ava — edited!', 'edit broadcast in real time')

  const gotReact = once(sockA, 'msg:react')
  await B.req('POST', `/api/messages/${msg1.id}/reactions`, { emoji: '❤️' })
  ok((await gotReact).reactions[0].emoji === '❤️', 'reaction added & broadcast')

  r = await B.req('POST', '/api/chats', { userId: (await B.req('GET', '/api/users/eve')).json.user.id })
  const chatBE = r.json.chat.id
  r = await B.req('POST', `/api/messages/${msg1.id}/forward`, { chatId: chatBE })
  ok(r.status === 200 && r.json.message.body === 'Hello Ava — edited!', 'message forwarded to another chat')

  const delMsg = (await B.req('POST', '/api/chats/' + chatId + '/messages', { body: 'to be deleted' })).json.message
  const gotDel = once(sockA, 'msg:delete')
  await B.req('DELETE', '/api/messages/' + delMsg.id)
  ok((await gotDel).messageId === delMsg.id, 'delete broadcast in real time')

  section('file upload')
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(1024).fill(65)], { type: 'image/png' }), 'pixel.png')
  form.append('body', 'an image')
  r = await A.req('POST', `/api/chats/${chatId}/messages`, null, form)
  ok(r.status === 200 && r.json.message.kind === 'image' && r.json.message.attachment?.url, 'image uploaded and stored')
  const fileUrl = r.json.message.attachment.url
  const fRes = await fetch(BASE + fileUrl, { headers: { cookie: A.cookie } })
  ok(fRes.ok, 'member can download attachment')
  const fResAnon = await fetch(BASE + fileUrl)
  ok(fResAnon.status === 401, 'anonymous attachment access denied')
  const fResEve = await fetch(BASE + fileUrl, { headers: { cookie: C.cookie } })
  ok(fResEve.status === 403, 'non-member attachment access denied')

  section('access control')
  r = await C.req('GET', `/api/chats/${chatId}/messages`)
  ok(r.status === 403, 'non-member cannot read messages of a private chat')
  r = await C.req('POST', `/api/chats/${chatId}/messages`, { body: 'intruder' })
  ok(r.status === 403, 'non-member cannot post into a private chat')
  r = await C.req('PATCH', '/api/messages/' + msg1.id, { body: 'hax' })
  ok(r.status === 403 || r.status === 404, "non-member cannot edit others' messages")

  section('persistence across restart')
  server.kill()
  await wait(400)
  const server2 = spawn(process.execPath, ['src/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmp, UPLOADS_DIR: path.join(tmp, 'uploads'), DB_PATH: path.join(tmp, 'e2e.db') },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(server2)
  server2.stderr.on('data', (d) => process.stderr.write('[server2] ' + d))
  for (let i = 0; i < 50; i++) {
    try { const h = await fetch(BASE + '/health'); if (h.ok) break } catch { /* booting */ }
    await wait(100)
  }
  r = await A.req('GET', '/api/chats')
  ok(r.json.chats.length >= 1 && r.json.chats[0].lastMessage, 'chats and messages survive server restart')
  r = await A.req('GET', '/api/auth/me')
  ok(r.status === 200, 'session survives server restart')
  r = await A.req('GET', `/api/chats/${chatId}/messages`)
  ok(r.json.messages.some((m) => m.body === 'Hello Ava — edited!'), 'message content intact after restart')

  section('calls (signaling)')
  const sockA2 = io(BASE, { extraHeaders: { cookie: A.cookie } })
  const sockB2 = io(BASE, { extraHeaders: { cookie: B.cookie } })
  await Promise.all([once(sockA2, 'connect'), once(sockB2, 'connect')])
  const gotIncoming = once(sockB2, 'call:incoming')
  const invited = await new Promise((resolve) =>
    sockA2.emit('call:invite', { chatId, video: true, offer: { type: 'offer', sdp: 'x' } }, resolve))
  const incoming = await gotIncoming
  ok(invited.callId && incoming.callId === invited.callId && incoming.caller.username === 'kirill',
    'B receives incoming call with caller info')
  const gotAccepted = once(sockA2, 'call:accepted')
  sockB2.emit('call:accept', { callId: incoming.callId, answer: { type: 'answer', sdp: 'y' } })
  ok((await gotAccepted).answer.sdp === 'y', 'A receives answer (call connected)')
  const gotIce = once(sockB2, 'webrtc:ice')
  sockA2.emit('webrtc:ice', { callId: incoming.callId, candidate: { candidate: 'c' } })
  ok((await gotIce).candidate.candidate === 'c', 'ICE candidates relayed')
  const gotEnded = once(sockB2, 'call:ended')
  sockA2.emit('call:end', { callId: incoming.callId })
  ok((await gotEnded).status === 'completed', 'call ended cleanly')
  r = await A.req('GET', '/api/calls')
  ok(r.json.calls.length === 1 && r.json.calls[0].status === 'completed' && r.json.calls[0].direction === 'out',
    'call recorded in history')

  section('admin & RBAC')
  r = await C.req('GET', '/api/admin/stats')
  ok(r.status === 403, 'normal user denied admin stats')
  r = await C.req('GET', '/api/admin/users')
  ok(r.status === 403, 'normal user denied admin user list')
  r = await C.req('PATCH', '/api/admin/users/' + avaId, { role: 'admin' })
  ok(r.status === 403, 'normal user cannot grant roles')

  r = await A.req('GET', '/api/admin/stats')
  ok(r.status === 200 && r.json.totals.users === 3, 'owner sees real statistics (3 users)')
  r = await A.req('GET', '/api/admin/users?q=eve')
  const eveId = r.json.users.find((u) => u.username === 'eve')?.id
  ok(!!eveId, 'admin user search works')

  r = await A.req('PATCH', '/api/admin/users/' + eveId, { status: 'blocked' })
  ok(r.status === 200, 'owner blocks a user')
  r = await C.req('GET', '/api/auth/me')
  ok(r.status === 401, 'blocked user sessions revoked immediately')
  r = await C.req('POST', '/api/auth/login', { identifier: 'eve', password: 'password-eve' })
  ok(r.status === 400 && /blocked/i.test(r.json.error), 'blocked user cannot log in')
  r = await A.req('PATCH', '/api/admin/users/' + eveId, { status: 'active' })
  ok(r.status === 200, 'owner unblocks the user')

  r = await A.req('PATCH', '/api/admin/users/' + avaId, { role: 'moderator' })
  ok(r.status === 200, 'owner promotes B to moderator')
  r = await B.req('GET', '/api/admin/reports')
  ok(r.status === 200, 'moderator can view reports')
  r = await B.req('GET', '/api/admin/logs')
  ok(r.status === 403, 'moderator cannot view system logs (admin only)')
  r = await B.req('PATCH', '/api/admin/users/' + (await B.req('GET', '/api/users/kirill')).json.user.id, { status: 'blocked' })
  ok(r.status === 403, 'moderator cannot block the owner')
  r = await B.req('PATCH', '/api/admin/users/' + avaId, { role: 'owner' })
  ok(r.status === 400 || r.status === 403, 'no self-elevation possible')

  await C.req('POST', '/api/auth/login', { identifier: 'eve', password: 'password-eve' })
  await C.req('POST', '/api/reports', { username: 'ava', reason: 'Spam', details: 'test report' })
  r = await B.req('GET', '/api/admin/reports')
  ok(r.json.reports.some((x) => x.target.username === 'ava' && x.status === 'open'), 'report visible to moderator')
  const repId = r.json.reports[0].id
  r = await B.req('PATCH', '/api/admin/reports/' + repId, { status: 'resolved' })
  ok(r.json.ok === true, 'report resolved')

  r = await A.req('GET', '/api/admin/logs')
  ok(r.status === 200 && r.json.logs.length > 0, 'audit log records admin actions')
  ok(!JSON.stringify(r.json.logs).includes('Hello Ava'), 'admin panel does not expose private message content')

  sockA.close(); sockB.close(); sockA2.close(); sockB2.close()
  server2.kill()
  await wait(200)

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error('\nFATAL:', e); process.exit(1) })
