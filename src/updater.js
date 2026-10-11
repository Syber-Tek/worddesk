import { app, ipcMain, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import fs from 'fs'
import path from 'path'

// Where users get new builds by hand. The macOS builds are not code-signed, so
// an in-app install cannot replace the app bundle there and the user has to
// download it instead.
const RELEASES_URL = 'https://github.com/Syber-Tek/worddesk-releases/releases/latest'

// Automatic checking is opt-in. A background GitHub check 45s after launch was
// the only network traffic the app ever made on its own, and on a flaky or
// captive connection that call could leave Chromium's network service unhappy
// mid-service. Nothing is contacted until the user asks for it in About &
// Updates, which keeps the offline promise true in practice.
const AUTO_CHECK_DEFAULT = false
// Wait a little after launch so a slow or offline start is not mistaken for a
// broken updater, and the service setup gets priority.
const AUTO_CHECK_STARTUP_DELAY_MS = 45 * 1000
const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

let mainWindow = null
let wired = false
let startupTimer = null
let intervalTimer = null

const send = (payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater-status', payload)
  }
}

// An unsigned macOS build cannot be replaced in place, so we surface the manual
// download instead of letting the install fail with a signing error.
const isUnsignedMac = () => process.platform === 'darwin' && !app.isSigned

// ── Automatic-check preference ───────────────────────────────────────────────
// Stored as a small JSON file in userData rather than localStorage because the
// scheduling below lives in the main process.
const prefFile = () => path.join(app.getPath('userData'), 'updater-preferences.json')

const readAutoCheck = () => {
  try {
    const raw = fs.readFileSync(prefFile(), 'utf-8')
    const parsed = JSON.parse(raw)
    if (typeof parsed.autoCheck === 'boolean') return parsed.autoCheck
  } catch {
    // No file yet, or it is unreadable — fall through to the default.
  }
  return AUTO_CHECK_DEFAULT
}

const writeAutoCheck = (value) => {
  try {
    fs.mkdirSync(path.dirname(prefFile()), { recursive: true })
    fs.writeFileSync(prefFile(), JSON.stringify({ autoCheck: value }, null, 2), 'utf-8')
  } catch (err) {
    console.warn('Could not save update preference:', err.message)
  }
}

const runCheck = () => {
  try {
    autoUpdater.checkForUpdates().catch(() => {})
  } catch {
    // A failed background check is not worth interrupting anyone over; the
    // manual button in About & Updates reports errors properly.
  }
}

const clearTimers = () => {
  if (startupTimer) {
    clearTimeout(startupTimer)
    startupTimer = null
  }
  if (intervalTimer) {
    clearInterval(intervalTimer)
    intervalTimer = null
  }
}

const scheduleAutoChecks = () => {
  clearTimers()
  if (!app.isPackaged) return
  if (!readAutoCheck()) return
  startupTimer = setTimeout(() => {
    runCheck()
    intervalTimer = setInterval(runCheck, AUTO_CHECK_INTERVAL_MS)
  }, AUTO_CHECK_STARTUP_DELAY_MS)
}

export function initUpdater(win) {
  mainWindow = win

  if (wired) return
  wired = true

  ipcMain.handle('check-for-updates', () => {
    if (!app.isPackaged) {
      return { ok: false, message: 'Updates are only available in an installed copy of WordDesk.' }
    }
    try {
      // Report the outcome through the 'updater-status' channel.
      autoUpdater.checkForUpdates().catch(() => {})
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err.message }
    }
  })

  ipcMain.handle('download-update', () => {
    if (!app.isPackaged) return { ok: false, message: 'Not an installed copy.' }
    try {
      autoUpdater.downloadUpdate().catch(() => {})
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err.message }
    }
  })

  ipcMain.handle('install-update', () => {
    if (!app.isPackaged) return { ok: false, message: 'Not an installed copy.' }
    try {
      // isSilent = true, isForceRunAfter = true
      autoUpdater.quitAndInstall(true, true)
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err.message }
    }
  })

  ipcMain.handle('open-releases-page', async () => {
    await shell.openExternal(RELEASES_URL)
    return { ok: true }
  })

  ipcMain.handle('get-auto-update-check', () => ({ autoCheck: readAutoCheck() }))

  ipcMain.handle('set-auto-update-check', (_event, value) => {
    const autoCheck = Boolean(value)
    writeAutoCheck(autoCheck)
    // Turning it on while the app is already running should take effect now,
    // not only after the next restart.
    if (autoCheck && !app.isPackaged) return { ok: true, autoCheck }
    if (autoCheck) {
      runCheck()
      intervalTimer = setInterval(runCheck, AUTO_CHECK_INTERVAL_MS)
    } else {
      clearTimers()
    }
    return { ok: true, autoCheck }
  })

  // Nothing to update from a dev run or an --dir unpackaged build, so leave the
  // listeners off rather than letting them spam errors.
  if (!app.isPackaged) return

  // The user decides when to download, and quitting after a download applies it,
  // so an update is never installed behind someone's back mid-service.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => send({ status: 'checking' }))

  autoUpdater.on('update-available', (info) => {
    send({
      status: 'available',
      version: info.version,
      releaseDate: info.releaseDate ?? null,
      manualOnly: isUnsignedMac(),
      releasesUrl: RELEASES_URL,
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    send({ status: 'up-to-date', version: info?.version ?? app.getVersion() })
  })

  autoUpdater.on('download-progress', (progress) => {
    send({
      status: 'downloading',
      percent: Math.round(progress.percent ?? 0),
      transferred: progress.transferred ?? 0,
      total: progress.total ?? 0,
      bytesPerSecond: progress.bytesPerSecond ?? 0,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    send({ status: 'downloaded', version: info?.version ?? null, manualOnly: isUnsignedMac() })
  })

  autoUpdater.on('error', (err) => {
    send({ status: 'error', message: err?.message ?? String(err) })
  })

  // Background checking, on by default. Kicked off once the listeners above are
  // in place so the first result is not missed.
  scheduleAutoChecks()
}
