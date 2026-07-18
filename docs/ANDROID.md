# Libera on Android

The Android app is a [Capacitor](https://capacitorjs.com) shell that loads the
Libera web client in a native WebView. Messaging, presence, receipts, file/voice
attachments, and WebRTC voice/video calls all run inside that WebView against
your Libera backend — so the phone must be able to reach a running server.

This was built and verified on an emulator: the debug APK installs, launches,
the native camera/mic/notification permission prompts fire, and a real account
was registered through the app UI against the backend (username availability
check, account creation, and login all round-tripped to the database).

## What is configured

| Item | Value / status |
|---|---|
| Application ID | `app.libera.messenger` |
| min SDK | 24 (Android 7.0) |
| target / compile SDK | 36 |
| versionCode / versionName | `1` / `1.0` (bump in `android/app/build.gradle`) |
| Permissions | INTERNET, ACCESS_NETWORK_STATE, CAMERA, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, POST_NOTIFICATIONS, READ_EXTERNAL_STORAGE (≤ SDK 32) |
| Runtime permission prompt | `MainActivity` requests camera/mic/notifications on launch |
| Release keystore | `android/keystore/libera-release.keystore` (generated locally, gitignored) |
| Signing config | wired in `android/app/build.gradle` from `android/keystore.properties` (gitignored) |
| R8 / ProGuard | disabled for release (WebView shell — nothing to shrink/obfuscate; default rules file present at `android/app/proguard-rules.pro`) |
| cleartext traffic | enabled (`usesCleartextTraffic`) so you can test against an `http://` LAN dev server; use HTTPS in production |

### Backend / server URL — you must set this

The app has no backend baked in. Point it at your Libera server in
[`app/capacitor.config.ts`](../app/capacitor.config.ts), then run
`npx cap sync android`:

- **Emulator → dev server on this Mac:** `http://10.0.2.2:5173` (10.0.2.2 is the
  emulator's alias for the host — this is what the verification run used).
- **Physical phone → dev server on this Mac:** `http://<your-Mac-LAN-IP>:5173`
  (same Wi-Fi; run the client with `--host`).
- **Production:** deploy the server behind HTTPS (it serves `app/dist` itself)
  and use `https://your-domain`. Drop `cleartext` for HTTPS.

### Push notifications & Firebase — honest status

**Not implemented.** `POST_NOTIFICATIONS` is declared and the app shows
*in-app* browser notifications while open, but there is **no FCM/Firebase
integration**, so there is no background push and **no incoming-call ring when
the app is closed** — calls only ring while the app is in the foreground. Adding
this requires a Firebase project, `google-services.json` in `android/app/`, the
`@capacitor/push-notifications` plugin, and an FCM sender in the Node backend.
The Gradle file already applies the google-services plugin *if* you drop in a
`google-services.json`.

## Prerequisites (one time)

Already set up on this machine; listed for reproduction on another:

```bash
brew install openjdk@21
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
# Android SDK at ~/Library/Android/sdk with platform 36 + build-tools installed
echo "sdk.dir=$HOME/Library/Android/sdk" > app/android/local.properties
```

## 1 · Run on an emulator

```bash
# create an AVD once (arm64 image already installed):
~/Library/Android/sdk/cmdline-tools/latest/bin/avdmanager create avd \
  -n libera-test -k "system-images;android-36;google_apis;arm64-v8a" -d pixel_7

# boot it:
~/Library/Android/sdk/emulator/emulator -avd libera-test &

# start the backend + client (client bound to all interfaces):
npm run dev --prefix server
npm run dev --prefix app -- --host

# set server url to http://10.0.2.2:5173 in capacitor.config.ts, then:
cd app && npx cap sync android && npx cap run android
```

## 2 · Run on a physical device

Enable **Developer options → USB debugging** on the phone, plug it in, accept
the trust prompt, then:

```bash
adb devices                       # confirm the phone is listed
# set server url to http://<Mac-LAN-IP>:5173 in capacitor.config.ts
cd app && npx cap sync android && npx cap run android   # pick your device
```

## 3 · Debug APK

```bash
cd app/android
./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk
```

## 4 · Signed release APK

Signing is already configured (`keystore.properties` + keystore exist locally).

```bash
cd app/android
./gradlew assembleRelease
# → app/build/outputs/apk/release/app-release.apk   (signed, verified with apksigner)
```

To regenerate the keystore on a new machine (keep the password safe — you need
the *same* keystore to ship updates):

```bash
keytool -genkeypair -v -keystore app/android/keystore/libera-release.keystore \
  -alias libera -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Libera, OU=Mobile, O=Libera, C=US"
# then create app/android/keystore.properties with:
#   storeFile=keystore/libera-release.keystore
#   storePassword=...
#   keyAlias=libera
#   keyPassword=...
```

## 5 · Android App Bundle (.aab) for Google Play

```bash
cd app/android
./gradlew bundleRelease
# → app/build/outputs/bundle/release/app-release.aab
```

Upload the `.aab` in the Google Play Console (Play re-signs it with the app
signing key you enrol).

## 6 · Install an APK on a phone

```bash
adb install -r app/android/app/build/outputs/apk/release/app-release.apk
# or copy the .apk to the phone and open it (allow "install unknown apps")
```

## 7 · Testing checklist (two accounts)

1. Register account A in the app (or on the web); register account B on a second
   device / emulator / browser.
2. In A: search B's `@username` → open profile → **Message** → send. B receives
   it in real time; read ticks and typing indicators update live.
3. Attach a photo and record a voice message (grant camera/mic when prompted).
4. Tap the phone/video icon to place a **WebRTC call**; accept on B. (Both
   devices need mic/camera and a network path; across mobile networks configure
   a TURN server — see server `.env.example`.)
5. Notifications: while the app is backgrounded but running, an incoming message
   raises an in-app notification. Background/closed-app push is **not** wired
   (see status above).
6. Admin: sign in as the first-registered (owner) account → Settings → Admin
   panel. A normal account has no admin entry and gets `403` from `/api/admin/*`.

## Where the build outputs land

```
app/android/app/build/outputs/apk/debug/app-debug.apk        ← debug APK
app/android/app/build/outputs/apk/release/app-release.apk    ← signed release APK
app/android/app/build/outputs/bundle/release/app-release.aab ← Play bundle
```

## Known limitations on Android

- No background/closed-app push or incoming-call ringing (no FCM yet).
- Calls are 1-to-1; strict mobile NATs need a TURN server.
- No end-to-end encryption (TLS in transit + server-side storage only).
- R8 minification is off by default; enable and re-test if you want smaller APKs.
