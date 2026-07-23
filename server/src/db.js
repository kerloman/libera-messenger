import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dataDir = process.env.DATA_DIR || path.join(root, 'data')
fs.mkdirSync(dataDir, { recursive: true })

export const uploadsDir = process.env.UPLOADS_DIR || path.join(root, 'uploads')
fs.mkdirSync(uploadsDir, { recursive: true })

export const db = new Database(process.env.DB_PATH || path.join(dataDir, 'libera.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  bio           TEXT NOT NULL DEFAULT '',
  avatar        TEXT,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','moderator','admin','owner')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','suspended','deleted')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_display ON users(display_name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS email_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('verify','reset')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chats (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL DEFAULT 'dm' CHECK (kind IN ('dm')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id  TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_read_id      INTEGER NOT NULL DEFAULT 0,
  last_delivered_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON chat_members(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id    TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id  TEXT NOT NULL REFERENCES users(id),
  kind       TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','image','video','file','voice')),
  body       TEXT,
  reply_to   INTEGER,
  edited_at  TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id);

CREATE TABLE IF NOT EXISTS attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id    INTEGER REFERENCES messages(id) ON DELETE CASCADE, -- NULL = avatar upload

  path          TEXT NOT NULL,
  mime          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  original_name TEXT,
  duration      REAL
);
CREATE INDEX IF NOT EXISTS idx_attachments_msg ON attachments(message_id);

CREATE TABLE IF NOT EXISTS reactions (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS calls (
  id          TEXT PRIMARY KEY,
  chat_id     TEXT NOT NULL REFERENCES chats(id),
  caller_id   TEXT NOT NULL REFERENCES users(id),
  callee_id   TEXT NOT NULL REFERENCES users(id),
  video       INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'ringing'
              CHECK (status IN ('ringing','active','completed','declined','missed','failed')),
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  answered_at TEXT,
  ended_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_calls_users ON calls(caller_id, callee_id);

CREATE TABLE IF NOT EXISTS reports (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id    TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT NOT NULL REFERENCES users(id),
  reason         TEXT NOT NULL,
  details        TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  resolved_by    TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id   TEXT,
  action     TEXT NOT NULL,
  target     TEXT,
  meta       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`)

// ---- migrations (additive; safe on existing databases) ----
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name)
if (!userCols.includes('delete_scheduled_at')) {
  db.exec('ALTER TABLE users ADD COLUMN delete_scheduled_at TEXT')
}

const memberCols = db.prepare('PRAGMA table_info(chat_members)').all().map((c) => c.name)
if (!memberCols.includes('muted')) {
  db.exec('ALTER TABLE chat_members ADD COLUMN muted INTEGER NOT NULL DEFAULT 0')
}

// Privacy preferences (enforced server-side; see auth.js visibleUser).
const privacyCols = {
  privacy_last_seen: "TEXT NOT NULL DEFAULT 'everyone'",
  privacy_last_seen_mode: "TEXT NOT NULL DEFAULT 'exact'",
  privacy_online: "TEXT NOT NULL DEFAULT 'everyone'",
  privacy_photo: "TEXT NOT NULL DEFAULT 'everyone'",
  privacy_bio: "TEXT NOT NULL DEFAULT 'everyone'",
  privacy_email: "TEXT NOT NULL DEFAULT 'nobody'",
  privacy_calls: "TEXT NOT NULL DEFAULT 'everyone'",
  read_receipts: 'INTEGER NOT NULL DEFAULT 1',
  typing_indicator: 'INTEGER NOT NULL DEFAULT 1',
}
for (const [col, def] of Object.entries(privacyCols)) {
  if (!userCols.includes(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${def}`)
}

if (!userCols.includes('language')) db.exec('ALTER TABLE users ADD COLUMN language TEXT')

const sessionCols = db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name)
if (!sessionCols.includes('ip')) db.exec('ALTER TABLE sessions ADD COLUMN ip TEXT')
if (!sessionCols.includes('platform')) db.exec('ALTER TABLE sessions ADD COLUMN platform TEXT')

db.exec(`
CREATE TABLE IF NOT EXISTS contacts (
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, contact_id)
);
CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner_id);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);
`)

export function audit(actorId, action, target = null, meta = null) {
  db.prepare('INSERT INTO audit_log (actor_id, action, target, meta) VALUES (?,?,?,?)')
    .run(actorId, action, target, meta ? JSON.stringify(meta) : null)
}
