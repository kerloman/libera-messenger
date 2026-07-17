# Libera — Security Model

## Transport & at-rest
- TLS 1.3 everywhere (HSTS, certificate pinning in native clients).
- All service data encrypted at rest (AES-256, KMS-managed keys, per-service key rings).

## End-to-end encryption
- **Protocol**: X3DH key agreement + Double Ratchet (Signal protocol family),
  AES-256-GCM message encryption, Curve25519 identity/prekeys, HMAC-SHA256 ratchet KDF.
- **Scope**: DMs and private groups (sender-keys for groups). Channels are
  server-readable by design (public broadcast) and labeled as such in the UI.
- **Verification**: per-conversation safety emojis (shown in calls as 🦄 🌊 🔑 🎻-style
  key fingerprints) and scannable QR safety codes.
- **Multi-device**: each device has its own identity key; devices are linked by QR
  handshake signed by the primary device; per-device sessions, no key escrow.

## Authentication
- Phone/email OTP (rate-limited, 10-minute expiry), OAuth (Apple/Google/Microsoft/GitHub)
  mapped to the same account graph, QR login for desktop/web.
- **2FA**: optional password (SRP — server never sees it) required on new device login.
- **Local lock**: Face ID / Touch ID / PIN gates the app locally; keys live in
  Secure Enclave / StrongBox.

## Abuse prevention
- Rate limiting per IP/device/user (Redis token buckets); progressive backoff and
  temporary bans on login endpoints.
- Spam model scores metadata only (frequency, graph, report history — never content of
  E2EE chats); channels/public groups additionally get content classification.
- User reporting → moderation queue in the admin panel; all moderator actions audited.

## Product-level privacy
- Self-destructing messages (24h/7d/30d timers, enforced client-side + server tombstones).
- Screenshot protection: `FLAG_SECURE` on Android, screen-capture detection on iOS,
  blurred app switcher previews.
- Privacy controls: last seen, online, avatar, links — each scoped to
  everyone / contacts / nobody.
- Data export: user-initiated, packaged client-side so E2EE content never transits
  servers in plaintext (demo app ships a working JSON export).

## Session hygiene
- Active session list with device, location, last activity; one-tap remote terminate;
  automatic termination after 180 days idle.
