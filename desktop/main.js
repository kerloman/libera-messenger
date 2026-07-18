'use strict'
const { app, BrowserWindow, Menu, shell, session, nativeTheme, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

// The desktop app is a native shell around the Libera web client. It loads the
// client from your Libera backend, so it shares the same accounts, database and
// realtime API as the web, iOS and Android clients — cross-platform sync is
// automatic because every client talks to the same server.
//
// Server URL resolution order:
//   1. LIBERA_SERVER_URL environment variable
//   2. ~/.libera-desktop.json  { "serverUrl": "https://..." }
//   3. default http://localhost:3001
function resolveServerUrl() {
  if (process.env.LIBERA_SERVER_URL) return process.env.LIBERA_SERVER_URL
  try {
    const cfgPath = path.join(app.getPath('home'), '.libera-desktop.json')
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
      if (cfg.serverUrl) return cfg.serverUrl
    }
  } catch {
    /* ignore malformed config */
  }
  return 'http://localhost:3001'
}

const SERVER_URL = resolveServerUrl()
let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 380,
    minHeight: 560,
    title: 'Libera',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#05070C' : '#E9EDF5',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  })

  // Auto-grant camera / microphone / notifications for our own server only
  // (this is what makes WebRTC calls and voice messages work on desktop).
  const trustedOrigin = new URL(SERVER_URL).origin
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    const from = wc.getURL()
    const ok =
      from.startsWith(trustedOrigin) &&
      ['media', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'display-capture'].includes(permission)
    cb(ok)
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => {
    return origin === trustedOrigin &&
      ['media', 'notifications', 'clipboard-read', 'display-capture'].includes(permission)
  })

  loadApp()

  // Open external links (http links in messages) in the real browser,
  // keep app navigation inside the window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(trustedOrigin)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

function loadApp() {
  mainWindow.loadURL(SERVER_URL).catch(() => showOffline())
  mainWindow.webContents.on('did-fail-load', (_e, code) => {
    if (code !== -3) showOffline() // -3 = aborted (normal during reload)
  })
}

function showOffline() {
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'offline.html'), {
    query: { server: SERVER_URL },
  })
}

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const reload = () => (mainWindow ? loadApp() : createWindow())

  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'Reconnect', accelerator: 'CmdOrCtrl+R', click: reload },
        { label: 'Set Server…', click: promptServer },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { label: 'Toggle Developer Tools', accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I', role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }]),
      ],
    },
    {
      role: 'help',
      submenu: [
        { label: 'Libera on GitHub', click: () => shell.openExternal('https://github.com') },
        { label: 'Connected server', click: () => dialog.showMessageBox(mainWindow, { message: 'Server', detail: SERVER_URL }) },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function promptServer() {
  // Minimal server switcher: writes ~/.libera-desktop.json and reloads.
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    message: 'Change Libera server',
    detail: `Current: ${SERVER_URL}\n\nTo point at a different server, set the LIBERA_SERVER_URL environment variable or edit ~/.libera-desktop.json, then reopen the app.`,
    buttons: ['OK', 'Open config folder'],
  })
  if (response === 1) shell.showItemInFolder(app.getPath('home'))
}

app.whenReady().then(() => {
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Single-instance lock so the dock/taskbar icon focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}
