<p align="center"><img src="brand/logo-primary.svg" width="88" alt="Libera" /></p>
<h1 align="center">Libera</h1>
<p align="center"><b>Speak freely.</b> A real, self-hosted messenger: accounts, private chats, realtime messaging, WebRTC calls, and a role-based admin panel — with an iOS-style Liquid Glass UI.</p>

---

## 1 · What this is

Libera is a full-stack messaging application. Two people register real accounts,
find each other by username, and exchange persistent, realtime messages; they can
also call each other over WebRTC. The first registered account becomes the
application **owner** with access to a moderation/admin panel.

There is **no demo data**: a fresh install starts with zero users and an empty
chat list. Everything you see comes from the database.

| Part | Path | Stack |
|---|---|---|
| Web client | [`app/`](app/) | React 18 · TypeScript · Vite · Socket.IO client |
| Backend | [`server/`](server/) | Node.js · Express · Socket.IO · better-sqlite3 · bcrypt |
| Brand & design | [`brand/`](brand/), [`docs/`](docs/) | Logo suite, design system, architecture & security notes |

## 2 · Main features

- **Accounts** — email + password registration, unique usernames with live
  availability check, display name, avatar upload, bio; email verification and
  password reset (token links); sessions persist across restarts (180-day
  httpOnly cookies); active-session list with remote terminate.
- **People** — search registered users by exact username or display name,
  profile view, start conversation (duplicate DMs are prevented server-side).
- **Messaging** — realtime text, images, video, files, voice messages
  (MediaRecorder); replies, edits, deletes, forwarding, emoji reactions;
  timestamps, sent/delivered/read ticks, typing indicators, online/last-seen
  presence; unread badges; browser notifications; empty states everywhere;
  messages persist in SQLite and survive restarts; membership checks on every
  message and attachment request.
- **Calls** — WebRTC voice & video with Socket.IO signaling: incoming/outgoing
  screens, accept/decline/end, mute, camera on/off, camera switch, audio-output
  switch (where the browser supports `setSinkId`), duration, missed calls, and
  a per-user call history.
- **Admin panel** — owner/admin/moderator/user roles enforced **server-side**:
  user list & search (emails visible to admins only), block/suspend/restore,
  delete accounts, role management, report queue, live statistics, audit log.
  Admins cannot read private message content.

## 3 · Required software

- **Node.js ≥ 20** (developed on Node 24) and npm
- A modern browser (Chrome, Edge, Safari, Firefox)
- No external database server needed — SQLite is embedded

## 4 · Install dependencies

```bash
git clone <your-repo-url> libera && cd libera
npm install --prefix server
npm install --prefix app
```

## 5 · Configure environment variables

```bash
cp server/.env.example server/.env
```

Development works with an empty `.env`. For production set at least
`SESSION_SECRET` (long random string) and, to send real emails, the `SMTP_*`
variables. **Without SMTP configured**, verification/reset emails are printed to
the server console and available at `GET /api/dev/mailbox?email=...`
(automatically disabled in production) so you can complete the flows locally.
Never commit `server/.env` — it is gitignored.

## 6 · Backend setup, schema & security rules

The backend is self-contained: on first start it creates `server/data/libera.db`
and applies the schema in [`server/src/db.js`](server/src/db.js) (users,
sessions, email tokens, chats, chat members, messages, attachments, reactions,
calls, reports, audit log — with indexes and CHECK constraints). Access rules
are enforced in the API layer: every chat/message/attachment route verifies
membership; admin routes verify role rank; uploads are limited to 25 MB
(avatars 5 MB) with a MIME allowlist; auth endpoints are rate-limited.

## 7 · Launch (including VS Code)

```bash
code .        # open in VS Code, then in two terminals (Ctrl+`):

# terminal 1 — backend (http://localhost:3001)
npm run dev --prefix server

# terminal 2 — web client (http://localhost:5173)
npm run dev --prefix app
```

Open http://localhost:5173. The Vite dev server proxies `/api`, `/uploads` and
`/socket.io` to the backend.

**Production build:** `npm run build --prefix app` then
`npm start --prefix server` — the server detects `app/dist/` and serves the
built client itself on port 3001.

## 8 · First administrator

The **first account ever registered becomes the owner** — register yours before
exposing the app. Owners can promote others to moderator/admin in
*Settings → Admin panel → Users*. Nobody can raise their own role; all role and
status changes are validated on the server and written to the audit log.

## 9 · Test with two accounts

1. Register **account A** in your normal browser.
2. Register **account B** in a private/incognito window (or another device on
   your network — run Vite with `--host` and open `http://<your-ip>:5173`).
3. In A, search `@` username of B → open profile → **Message** → send.
4. B receives it instantly; open the chat in B and watch A's ticks turn to
   read. Try typing indicators, reactions, edits, replies, voice messages.
5. Press the phone/camera icon for a live WebRTC call (allow mic/camera).
6. Confirm B (a normal user) has no *Admin panel* entry in Settings and gets
   `403` from `/api/admin/*`, while A (owner) can manage users.

An automated version of this flow exists: `npm test --prefix server` boots a
scratch server and runs ~70 end-to-end checks (registration, auth, realtime
delivery/receipts, uploads, access control, restart persistence, call
signaling, RBAC).

## 10 · Platforms

- **Web / macOS / Windows / Linux** — any modern browser; installable as a PWA
  window from Chrome/Edge.
- **iPhone / iPad / Android** — open the served URL in the mobile browser
  (run the client with `--host` or deploy it). Native shells (Capacitor) and
  push delivery to closed apps are not included — see limitations.

## 11 · Known limitations (honest list)

- **E2E encryption is not implemented** — messages are TLS-protected in
  transit (when deployed behind HTTPS) and stored on your server, but not
  end-to-end encrypted.
- **Push notifications** work as browser notifications while the app is open
  in a tab; there is no service-worker/APNs/FCM push to closed apps, so
  incoming calls only ring while the app is open.
- **Calls** are 1-to-1; across strict NATs you must configure a TURN server
  (`TURN_*` env vars). No group calls or screen sharing.
- **Groups & channels** are not implemented (schema anticipates them; the
  admin panel moderates users and reports only).
- SQLite is a deliberate default for easy self-hosting; for multi-node
  deployments port the queries in `server/src` to PostgreSQL and add a shared
  Socket.IO adapter (Redis).
- Email delivery requires your own SMTP credentials.

## 12 · License

[MIT](LICENSE) · design & brand documentation in [`docs/`](docs/).
