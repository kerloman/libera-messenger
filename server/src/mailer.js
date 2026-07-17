import { db } from './db.js'

// Sends real email when SMTP_* env vars are configured; otherwise stores the
// message in the email_outbox table and logs it (development mode), so
// verification and password-reset flows are fully testable without credentials.
let transport = null

async function getTransport() {
  if (!process.env.SMTP_HOST) return null
  if (!transport) {
    const nodemailer = await import('nodemailer')
    transport = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    })
  }
  return transport
}

export async function sendMail(to, subject, body) {
  db.prepare('INSERT INTO email_outbox (to_email, subject, body) VALUES (?,?,?)').run(to, subject, body)
  const t = await getTransport().catch(() => null)
  if (t) {
    await t
      .sendMail({ from: process.env.SMTP_FROM || 'Libera <no-reply@libera.local>', to, subject, text: body })
      .catch((e) => console.error('[mail] send failed:', e.message))
  } else {
    console.log(`[mail:dev] to=${to} subject="${subject}"\n${body}\n`)
  }
}
