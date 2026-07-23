import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { db, audit } from './db.js'
import { sendMail } from './mailer.js'

const SESSION_DAYS = 180
export const COOKIE = 'libera_sid'

const uid = () => crypto.randomUUID()
const token = () => crypto.randomBytes(32).toString('hex')
const days = (n) => new Date(Date.now() + n * 86400_000).toISOString()

// Verified badge is derived purely from role — Owner/Admin only. It is never
// stored or client-settable, so it cannot be self-granted and disappears the
// moment a role is revoked.
export const isVerified = (role) => role === 'owner' || role === 'admin'

export const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  displayName: u.display_name,
  bio: u.bio,
  avatar: u.avatar,
  role: u.role,
  verified: isVerified(u.role),
  createdAt: u.created_at,
  lastSeenAt: u.last_seen_at,
})

// Privacy preferences (with safe defaults for rows created before the columns).
export function privacyOf(u) {
  return {
    lastSeen: u.privacy_last_seen ?? 'everyone',
    lastSeenMode: u.privacy_last_seen_mode ?? 'exact',
    online: u.privacy_online ?? 'everyone',
    photo: u.privacy_photo ?? 'everyone',
    bio: u.privacy_bio ?? 'everyone',
    email: u.privacy_email ?? 'nobody',
    calls: u.privacy_calls ?? 'everyone',
    readReceipts: u.read_receipts == null ? true : !!u.read_receipts,
    typingIndicator: u.typing_indicator == null ? true : !!u.typing_indicator,
  }
}

export const meUser = (u) => ({
  ...publicUser(u),
  email: u.email,
  emailVerified: !!u.email_verified,
  status: u.status,
  deleteScheduledAt: u.delete_scheduled_at ?? null,
  language: u.language ?? null,
  privacy: privacyOf(u),
})

const COARSE_LABEL = {
  recently: 'last seen recently',
  week: 'last seen within a week',
  month: 'last seen within a month',
  long: 'last seen a long time ago',
}

// Presence fields for a realtime event, honoring online/last-seen privacy.
// `canOnline` / `canLast` are computed by the caller (relationship-aware).
export function presenceFields(user, isOnline, canOnline, canLast) {
  const p = privacyOf(user)
  const onlineVisible = canOnline && isOnline
  const out = { online: onlineVisible, lastSeen: null, lastSeenLabel: null }
  if (!onlineVisible) {
    if (canLast) {
      if (p.lastSeenMode === 'exact') out.lastSeen = user.last_seen_at
      else out.lastSeenLabel = COARSE_LABEL[p.lastSeenMode] ?? 'last seen recently'
    } else {
      out.lastSeenLabel = 'last seen recently'
    }
  }
  return out
}

// A viewer-aware view of another user. `isContactFn(targetId, viewerId)` and
// `isOnlineFn(id)` are injected to avoid an import cycle with api/rt.
// This is where Last Seen / Online / Photo / Bio / Email privacy is ENFORCED —
// hidden fields are simply never put in the response, so the API cannot leak them.
export function visibleUser(target, viewerId, { isContact, isOnline }) {
  const p = privacyOf(target)
  const self = target.id === viewerId
  const can = (setting) =>
    self || setting === 'everyone' || (setting === 'contacts' && isContact(target.id, viewerId))

  const online = can(p.online) && isOnline(target.id)
  const base = {
    ...publicUser(target),
    avatar: can(p.photo) ? target.avatar : null,
    bio: can(p.bio) ? target.bio : '',
    email: can(p.email) ? target.email : null,
    online,
    lastSeenAt: null,
    lastSeenLabel: null,
  }
  if (!online) {
    if (can(p.lastSeen)) {
      if (p.lastSeenMode === 'exact') base.lastSeenAt = target.last_seen_at
      else base.lastSeenLabel = COARSE_LABEL[p.lastSeenMode] ?? 'last seen recently'
    } else {
      base.lastSeenLabel = 'last seen recently'
    }
  }
  return base
}

// ---------- validation ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/

export function validateRegistration({ email, password, username, displayName }) {
  if (!email || !EMAIL_RE.test(String(email))) return 'Enter a valid email address.'
  if (!password || String(password).length < 8) return 'Password must be at least 8 characters.'
  if (!username || !USERNAME_RE.test(String(username)))
    return 'Username must be 3–20 characters: letters, numbers, underscore.'
  if (!displayName || !String(displayName).trim() || String(displayName).trim().length > 50)
    return 'Display name is required (max 50 characters).'
  return null
}

// ---------- sessions ----------
export function platformOf(ua = '') {
  if (/Electron/i.test(ua)) return /Windows/i.test(ua) ? 'Windows (Desktop)' : /Mac/i.test(ua) ? 'macOS (Desktop)' : 'Desktop'
  if (/iPhone|iPad|iOS/i.test(ua)) return 'iOS'
  if (/Android/i.test(ua)) return 'Android'
  if (/Macintosh|Mac OS/i.test(ua)) return 'macOS (Web)'
  if (/Windows/i.test(ua)) return 'Windows (Web)'
  if (/Linux/i.test(ua)) return 'Linux (Web)'
  return 'Web'
}

export function createSession(userId, userAgent, ip) {
  const t = token()
  db.prepare('INSERT INTO sessions (token, user_id, user_agent, ip, platform, expires_at) VALUES (?,?,?,?,?,?)')
    .run(t, userId, userAgent?.slice(0, 200) ?? null, ip ?? null, platformOf(userAgent), days(SESSION_DAYS))
  return t
}

export function sessionUser(t) {
  if (!t) return null
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now')`,
    )
    .get(t)
  if (!row) return null
  if (row.status !== 'active') return null
  return row
}

export function destroySession(t) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(t)
}

export function cookieOpts() {
  // Secure flag in production (behind an HTTPS proxy such as Render/Railway).
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`
}

export function parseCookies(header) {
  const out = {}
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

// express middleware
export function authRequired(req, res, next) {
  const u = sessionUser(parseCookies(req.headers.cookie)[COOKIE])
  if (!u) return res.status(401).json({ error: 'Not signed in.' })
  req.user = u
  next()
}

// ---------- registration / login ----------
export function register({ email, password, username, displayName }, userAgent, ip) {
  const err = validateRegistration({ email, password, username, displayName })
  if (err) return { error: err }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
    return { error: 'An account with this email already exists.' }
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username))
    return { error: 'This username is taken.' }

  const isFirst = db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0
  const user = {
    id: uid(),
    email: String(email).trim(),
    username: String(username).trim(),
    displayName: String(displayName).trim(),
    role: isFirst ? 'owner' : 'user',
  }
  db.prepare(
    `INSERT INTO users (id, email, password_hash, username, display_name, role)
     VALUES (?,?,?,?,?,?)`,
  ).run(user.id, user.email, bcrypt.hashSync(String(password), 10), user.username, user.displayName, user.role)

  const vt = token()
  db.prepare("INSERT INTO email_tokens (token, user_id, kind, expires_at) VALUES (?,?,'verify',?)")
    .run(vt, user.id, days(3))
  sendMail(
    user.email,
    'Verify your Libera email',
    `Welcome to Libera, ${user.displayName}!\n\nVerify your email by opening:\n${baseUrl()}/verify?token=${vt}\n\nThis link expires in 3 days.`,
  )
  audit(user.id, 'user.register', user.id, { username: user.username, role: user.role })

  const session = createSession(user.id, userAgent, ip)
  return { user: db.prepare('SELECT * FROM users WHERE id = ?').get(user.id), session, firstUser: isFirst }
}

export function login({ identifier, password }, userAgent, ip) {
  if (!identifier || !password) return { error: 'Enter your email/username and password.' }
  const u = db
    .prepare('SELECT * FROM users WHERE email = ? OR username = ?')
    .get(identifier, identifier)
  if (!u || !bcrypt.compareSync(String(password), u.password_hash))
    return { error: 'Incorrect email/username or password.' }
  if (u.status === 'blocked') return { error: 'This account has been blocked.' }
  if (u.status === 'suspended') return { error: 'This account is suspended.' }
  if (u.status === 'deleted') return { error: 'Incorrect email/username or password.' }
  audit(u.id, 'user.login', u.id)
  return { user: u, session: createSession(u.id, userAgent, ip) }
}

export function verifyEmail(t) {
  const row = db
    .prepare("SELECT * FROM email_tokens WHERE token = ? AND kind = 'verify' AND expires_at > datetime('now')")
    .get(t)
  if (!row) return { error: 'This verification link is invalid or has expired.' }
  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(row.user_id)
  db.prepare('DELETE FROM email_tokens WHERE token = ?').run(t)
  return { ok: true }
}

export function requestPasswordReset(email) {
  const u = db.prepare("SELECT * FROM users WHERE email = ? AND status != 'deleted'").get(email ?? '')
  if (u) {
    const rt = token()
    db.prepare("INSERT INTO email_tokens (token, user_id, kind, expires_at) VALUES (?,?,'reset',?)")
      .run(rt, u.id, new Date(Date.now() + 3600_000).toISOString())
    sendMail(
      u.email,
      'Reset your Libera password',
      `Hi ${u.display_name},\n\nReset your password by opening:\n${baseUrl()}/reset?token=${rt}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
    )
  }
  return { ok: true } // always ok — no account enumeration
}

export function resetPassword(t, password) {
  if (!password || String(password).length < 8)
    return { error: 'Password must be at least 8 characters.' }
  const row = db
    .prepare("SELECT * FROM email_tokens WHERE token = ? AND kind = 'reset' AND expires_at > datetime('now')")
    .get(t)
  if (!row) return { error: 'This reset link is invalid or has expired.' }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(String(password), 10), row.user_id)
  db.prepare('DELETE FROM email_tokens WHERE token = ?').run(t)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id) // revoke all sessions
  audit(row.user_id, 'user.password_reset', row.user_id)
  return { ok: true }
}

function baseUrl() {
  return process.env.PUBLIC_URL || 'http://localhost:5173'
}

// ---------- RBAC ----------
export const RANK = { user: 0, moderator: 1, admin: 2, owner: 3 }

export function requireRank(minRole) {
  return (req, res, next) => {
    if (!req.user || RANK[req.user.role] < RANK[minRole])
      return res.status(403).json({ error: 'You do not have permission to do that.' })
    next()
  }
}
