import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.libera.messenger',
  appName: 'Libera',
  webDir: 'dist',

  // IMPORTANT — point the app at your running Libera stack.
  //
  // The native app is a shell around the web client; chats/calls need the
  // backend. Easiest reliable setup: load the app from your server so the
  // session cookie and Socket.IO stay same-origin (exactly like the browser).
  //
  // Local testing (phone on the same Wi-Fi as your Mac):
  //   1. run:  npm run dev --prefix server   and   npm run dev --prefix app -- --host
  //   2. uncomment and set your Mac's LAN IP:
  // server: { url: 'http://192.168.1.23:5173', cleartext: true },
  //
  // Android emulator reaching a dev server on the host Mac uses the special
  // alias 10.0.2.2 (verified working):
  // server: { url: 'http://10.0.2.2:5173', cleartext: true },
  //
  // Production: deploy the server behind HTTPS (it serves app/dist itself) and:
  // server: { url: 'https://your-libera-domain.com' },
  //
  // After changing this file run:  npx cap sync android   (or ios)
};

export default config;
