# Libera on Desktop (macOS & Windows)

The desktop app is an [Electron](https://www.electronjs.org) shell that loads the
Libera web client from your backend. Because it points at the **same server** as
the web, iOS and Android clients, accounts, messages, media, receipts, presence
and typing indicators sync across every platform automatically — there is one
database and one realtime API behind all of them.

Verified on this machine (Apple Silicon, macOS 26): the packaged `.app` launches,
loads the client, and shares the backend — a desktop-registered account
(`macuser`) and the Android-registered account (`droid`) coexist in the same
database, and the desktop session can search and find the Android user.

## What's configured

| Item | Value |
|---|---|
| App id | `app.libera.messenger` |
| Framework | Electron 33 + electron-builder 25 |
| macOS targets | dmg + zip, `arm64` and `x64` (Apple Silicon M1–M4 + Intel) |
| Windows targets | NSIS `.exe` installer + `.appx`/`.msix`, `x64` |
| Linux (bonus) | AppImage + deb |
| Camera / mic | auto-granted for the trusted server origin (WebRTC calls + voice messages) |
| macOS permissions | `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSPhotoLibraryUsageDescription` in Info.plist; hardened-runtime entitlements in `assets/entitlements.mac.plist` |
| Native integration | menu bar with keyboard shortcuts (⌘R reconnect, ⌘C/V/X, zoom, fullscreen, devtools), Dock/taskbar, single-instance focus, external links open in the system browser, light/dark follow the OS |
| Window | resizable, min 380×560, hidden-inset title bar on macOS |

### Backend / server URL

The desktop app has no backend baked in; it connects to your Libera server:

1. `LIBERA_SERVER_URL` environment variable, or
2. `~/.libera-desktop.json` → `{ "serverUrl": "https://your-domain" }`, or
3. default `http://localhost:3001`.

If it can't reach the server it shows a friendly offline screen with a Retry
button (⌘R / Ctrl-R). For a shared team/production setup, deploy the backend
behind HTTPS (it serves `app/dist` itself) and set the URL to that domain.

## Prerequisites

```bash
# build the web client the server serves, and have the backend running:
npm run build --prefix app
npm run dev   --prefix server        # http://localhost:3001

cd desktop && npm install            # installs Electron + electron-builder
```

## Run in development

```bash
cd desktop
npm run dev          # LIBERA_SERVER_URL=http://localhost:3001 electron .
```

## macOS — build & distribute

```bash
cd desktop
npm run dist:mac
```

Outputs in `desktop/release/`:

| File | What it is |
|---|---|
| `Libera-1.0.0-arm64.dmg` | drag-to-Applications installer (Apple Silicon) — **verified: mounts and installs** |
| `Libera-1.0.0-arm64-mac.zip` | zipped `.app` (auto-update / manual) |
| `Libera-1.0.0-x64.dmg` / `-x64-mac.zip` | Intel Mac builds |
| `mac-arm64/Libera.app` | the raw `.app` bundle (234 MB) |

**Signing / notarization:** builds are ad-hoc signed by default, which runs
locally. For distribution outside your own machine, sign & notarize with an
Apple Developer ID:

```bash
export CSC_LINK=/path/to/DeveloperID.p12         # your signing cert
export CSC_KEY_PASSWORD=…
export APPLE_ID=…  APPLE_APP_SPECIFIC_PASSWORD=…  APPLE_TEAM_ID=…
npm run dist:mac                                  # electron-builder notarizes automatically
```

Archive / export equivalents (electron-builder handles these): the `.app` is in
`release/mac-*/`, the distributable `.dmg`/`.zip` in `release/`.

## Windows — build & distribute

```bash
cd desktop
npm run dist:win           # NSIS .exe + .appx (.msix)
```

Outputs in `desktop/release/`:

| File | What it is |
|---|---|
| `Libera Setup 1.0.0.exe` | NSIS installer (choose folder, desktop + start-menu shortcuts) |
| `win-unpacked/Libera.exe` | the app executable |
| `Libera 1.0.0.appx` | MSIX/AppX package for the Microsoft Store / sideloading |

**What was verified here, honestly:** the **NSIS `.exe` installer was
cross-built from macOS** (electron-builder auto-downloads a bundled Wine) and is
a genuine Windows PE binary (`Libera Setup 1.0.0.exe`, 79 MB, verified with
`file`). It was **not run or tested** — that requires an actual Windows 10/11
machine. The **`.appx`/`.msix` target cannot be built on macOS** (it needs
`makeappx.exe` from the Windows SDK); run `npm run dist:win` on Windows (or a
Windows CI runner) to produce it. Everything is configured — only the build host
needs to be Windows for the MSIX.

To code-sign the Windows build, set `CSC_LINK`/`CSC_KEY_PASSWORD` to your
Authenticode certificate before `npm run dist:win`.

## Linux (bonus)

```bash
cd desktop && npm run dist:all      # or: npx electron-builder --linux
# → release/Libera-1.0.0.AppImage, release/libera-desktop_1.0.0_amd64.deb
```

## Cross-platform sync — how it works

Nothing special is synced by the desktop app itself; every client is a view onto
the same backend:

- **Messages, media, voice messages, files** → REST `POST /chats/:id/messages` +
  Socket.IO `msg:new`, stored once in SQLite.
- **Read receipts, delivered ticks, typing, online/last-seen** → Socket.IO
  events broadcast to every connected device of the participants.
- **Contacts, profiles** → the same `users` table and `/users/*` endpoints.
- **Calls** → WebRTC signaling over the shared Socket.IO connection.

So: register on iPhone → sign in on macOS and all chats appear → continue on
Windows → your friend replies from Android, and every device updates in real
time. Sign-in on each device is just a normal login to the same server.

## Known limitations

- Desktop calls are 1-to-1 (same engine as web); strict NATs need a TURN server.
- No end-to-end encryption (TLS in transit + server-side storage).
- Windows `.msix` must be built on Windows; the `.exe` cross-builds from macOS
  but should be smoke-tested on Windows before release.
- Screen sharing capability is enabled in the permission handler
  (`display-capture`) but the web client does not yet expose a share button.
