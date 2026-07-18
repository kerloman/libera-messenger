'use strict'
const { contextBridge } = require('electron')

// The web client is self-contained and talks to the backend over HTTP/WebSocket,
// so the desktop shell needs no privileged bridge. We expose a tiny read-only
// marker the web app can use to tweak platform affordances if desired.
contextBridge.exposeInMainWorld('libera', {
  platform: process.platform, // 'darwin' | 'win32' | 'linux'
  desktop: true,
})
