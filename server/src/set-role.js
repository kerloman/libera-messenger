// Secure role bootstrap — run from the server host (shell access required).
//
// This is the ONLY way to grant Owner/Admin without an existing admin, which is
// deliberate: a normal user can never elevate themselves through the app or API.
// Whoever controls the server can run this.
//
//   node src/set-role.js <username-or-email> <owner|admin|moderator|user>
//   node src/set-role.js --list
//
import { db, audit } from './db.js'

const ROLES = ['user', 'moderator', 'admin', 'owner']
const [, , who, role] = process.argv

function list() {
  const rows = db
    .prepare('SELECT username, display_name, email, role, status, created_at FROM users ORDER BY created_at')
    .all()
  if (rows.length === 0) return console.log('No users registered yet.')
  console.log(`\n${rows.length} registered user(s):\n`)
  for (const r of rows) {
    console.log(
      `  @${r.username.padEnd(18)} ${r.role.padEnd(10)} ${r.status.padEnd(10)} ${String(r.email).padEnd(26)} joined ${r.created_at}`,
    )
  }
  console.log('')
}

if (who === '--list' || (!who && !role)) {
  list()
  process.exit(0)
}

if (!who || !role) {
  console.error('Usage: node src/set-role.js <username-or-email> <owner|admin|moderator|user>')
  console.error('       node src/set-role.js --list')
  process.exit(1)
}

if (!ROLES.includes(role)) {
  console.error(`Invalid role "${role}". Choose one of: ${ROLES.join(', ')}`)
  process.exit(1)
}

const user = db
  .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE')
  .get(who, who)

if (!user) {
  console.error(`No user found matching "${who}". Run with --list to see all users.`)
  process.exit(1)
}

db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id)
audit(null, 'cli.set_role', user.id, { username: user.username, from: user.role, to: role })

console.log(`✓ @${user.username} (${user.email}) is now: ${role}`)
console.log(`  They can open the admin panel at Settings → Workspace → Admin panel after re-opening the app.`)
