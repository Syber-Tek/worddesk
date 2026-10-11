import { app, Menu, BrowserWindow, ipcMain, screen, dialog, Notification, nativeImage, nativeTheme } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import {
  initDatabase,
  refreshLibraries,
  getStatusMessage,
  getBibles,
  getBibleStats,
  getBooks,
  getVerses,
  searchVerses,
  getHymns,
  searchHymns,
  listHymns,
  getHymnLyrics,
  importHymnsBatch,
  importSqlFile,
  importXmlBibleFile,
  removeBible,
  rescanBiblesFolder,
  importSngFile,
  importSngFolder,
  getHymnsCount,
  getHymnCategories
} from './db.js';
import { initUpdater } from './updater.js';
import { mediaKind, naturalCompare } from './lib/mediaKinds.js';
import { safeStoredName, storedNameFor, toFileUrl } from './lib/mediaStore.js';

let dbPath = '';
let dbError = null;
let mainWindow = null;
let stageWindow = null;
const presentationWindows = new Map(); // displayId -> BrowserWindow

// WordDesk never talks to a proxy — it is offline-first, and the only
// outbound call it can make is the opt-in update check. Letting Chromium consult
// the system proxy would make its network service run WPAD auto-discovery every
// time the machine joins a network, which is what kills that service
// ("Network service crashed or was terminated") and stalls the app. A direct
// connection is both correct here and keeps the service out of the picture.
app.commandLine.appendSwitch('no-proxy-server');

// ─── Old hardware / broken GPU drivers ────────────────────────────────────────
// Church laptops are often 10+ years old (Sandy Bridge and similar, with Intel
// HD 3000-class graphics and a 2012 driver stack). Chromium's GPU process does
// not always come up there, and when it does not, the window it paints is blank
// or never appears at all. Software rendering always works, so on the machines
// that need it we relaunch once with hardware acceleration switched off.
//
// The marker file makes this a one-shot self-heal: it is only written when the
// GPU is genuinely unavailable, and its presence disables acceleration before
// ready, so the relaunch cannot loop.
const gpuCompatMarker = () => path.join(app.getPath('userData'), 'gpu-compat.flag');
const gpuCompatEnabled = () => {
  try {
    return fs.existsSync(gpuCompatMarker());
  } catch {
    return false;
  }
};
if (gpuCompatEnabled()) {
  app.disableHardwareAcceleration();
}

// A startup log next to the database. A packaged app that never opens a window
// gives the operator nothing to report with, and this is the one artefact that
// says what happened and how long it took.
const startedAt = Date.now();
const startupLogPath = () => path.join(app.getPath('userData'), 'startup.log');
const startupLog = (message) => {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    const file = startupLogPath();
    // Keep it bounded. It is an aid for one bad launch, and an unbounded log on a
    // slow disk is the last thing this machine needs.
    if (fs.existsSync(file) && fs.statSync(file).size > 256 * 1024) {
      fs.writeFileSync(file, `--- truncated, app started ${new Date().toISOString()} ---\n`, 'utf-8');
    }
    fs.appendFileSync(file, line, 'utf-8');
  } catch {
    // Logging must never be the reason the app fails to start.
  }
  console.log(message);
};

// A renderer that dies (out of memory on a small machine, or a GPU crash) leaves
// a permanently blank window otherwise. Reloading is the cheapest recovery and
// the window state is app state in localStorage, so nothing is lost.
const watchForBlankWindows = (win, name) => {
  if (!win || win.isDestroyed()) return;
  let crashes = 0;
  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    startupLog(`${name} renderer gone (${details.reason}, exit ${details.exitCode})`);
    if (win.isDestroyed()) return;
    if (crashes >= 3) {
      startupLog(`${name} renderer crashed ${crashes} times, not reloading again`);
      return;
    }
    crashes += 1;
    win.reload();
  });
};

// ── One instance only ─────────────────────────────────────────────────────────
// Without this, launching the app while it is already running starts a SECOND
// process against the same church.db and the same output windows. That is the
// most likely thing an operator does on a slow machine - "it did not start, let
// me click it again" - and it produces two control windows fighting over the
// projector, duplicate imports, and SQLITE_BUSY write contention that WAL alone
// does not resolve. The second launch is redirected to the window that already
// exists instead. Same behaviour on Windows and macOS; on macOS this also covers
// opening the app from Finder or Spotlight while it is already running.
const gotInstanceLock = app.requestSingleInstanceLock();
if (!gotInstanceLock) {
  // The real instance is already up and the 'second-instance' handler below will
  // raise its window. Exit before touching the database or creating any window.
  app.exit(0);
}

app.on('second-instance', () => {
  startupLog('second instance launched, focusing the existing window');
  for (const win of [mainWindow, stageWindow]) {
    if (!win || win.isDestroyed()) continue;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
    return;
  }
});

// ── Native chrome theming ─────────────────────────────────────────────────────
// The renderer owns the app theme (dark / light / system). The main process
// mirrors that choice onto the chrome the OS draws for us, so the Windows title
// bar and the taskbar icon follow the in-app theme instead of the OS theme:
//   - titleBarStyle 'hidden' + titleBarOverlay replaces the native title bar
//     with our own header area, tinted through setTitleBarOverlay()
//   - setBackgroundColor() kills the white flash before the renderer paints
//   - setIcon() swaps the taskbar / window icon
const TITLE_BAR_HEIGHT = 48; // must match the in-app Header height (h-12)

const NATIVE_THEME = {
  dark: { titleBarColor: '#141518', symbolColor: '#EDEDEE', background: '#0B0C0E' },
  light: { titleBarColor: '#FFFFFF', symbolColor: '#111827', background: '#F3F4F6' },
};

// Only Windows and Linux get the overlay treatment. macOS keeps its native
// title bar (different metrics, and the traffic lights need their own gutter),
// but it still picks up the app theme through nativeTheme below.
const usesTitleBarOverlay = process.platform === 'win32' || process.platform === 'linux';

let appThemeMode = 'dark';

const getEffectiveTheme = () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light');

// Window options that make a freshly created window match the active theme.
const nativeChromeOptions = () => {
  const theme = NATIVE_THEME[getEffectiveTheme()];
  return {
    backgroundColor: theme.background,
    ...(usesTitleBarOverlay
      ? {
          titleBarStyle: 'hidden',
          titleBarOverlay: {
            color: theme.titleBarColor,
            symbolColor: theme.symbolColor,
            height: TITLE_BAR_HEIGHT,
          },
        }
      : {}),
  };
};

function applyNativeTheme() {
  // Projector / stage windows are deliberately left alone: they render their own
  // black output canvas and are not app chrome.
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const theme = NATIVE_THEME[getEffectiveTheme()];

  if (usesTitleBarOverlay) {
    mainWindow.setTitleBarOverlay({
      color: theme.titleBarColor,
      symbolColor: theme.symbolColor,
      height: TITLE_BAR_HEIGHT,
    });
  }
  mainWindow.setBackgroundColor(theme.background);

  const icon = getAppIcon(getEffectiveTheme());
  if (icon && !icon.isEmpty()) {
    mainWindow.setIcon(icon);
  }
}

ipcMain.handle('set-app-theme', (_event, themeMode) => {
  appThemeMode = ['dark', 'light', 'system'].includes(themeMode) ? themeMode : 'dark';
  // Drives the OS-level widgets (title bar, scrollbars, native dialogs) and
  // resolves 'system' to whatever the PC is currently set to.
  nativeTheme.themeSource = appThemeMode;
  applyNativeTheme();
  return { success: true, themeMode: appThemeMode, effectiveTheme: getEffectiveTheme() };
});

ipcMain.handle('get-app-theme', () => ({
  themeMode: appThemeMode,
  effectiveTheme: getEffectiveTheme(),
  hasTitleBarOverlay: usesTitleBarOverlay,
}));

function getDisplayDetails() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const allDisplays = screen.getAllDisplays();

  return allDisplays.map((display, index) => ({
    id: display.id,
    label: display.label || `Display ${index + 1}`,
    isPrimary: display.id === primaryDisplay.id,
    width: display.bounds.width,
    height: display.bounds.height,
    bounds: display.bounds,
  }));
}

ipcMain.handle('get-app-info', () => {
  return {
    appName: 'WordDesk',
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    isOffline: true,
    // When true the OS title bar is hidden and the in-app header doubles as the
    // drag handle, so the renderer has to reserve room for the caption buttons.
    hasTitleBarOverlay: usesTitleBarOverlay,
  };
});

ipcMain.handle('get-db-status', () => {
  if (dbError) {
    return { dbPath, message: `Database unavailable: ${dbError}`, createdAt: null, error: true };
  }
  const status = getStatusMessage();
  return {
    dbPath,
    message: status ? status.message : 'Database empty',
    createdAt: status ? status.created_at : null,
    error: false,
  };
});

ipcMain.handle('get-displays', () => {
  return getDisplayDetails();
});

// Bible IPC Handlers
ipcMain.handle('get-bibles', () => getBibles());
ipcMain.handle('get-books', (_e, bibleId) => getBooks(bibleId));
ipcMain.handle('get-verses', (_e, bookId, chapter) => getVerses(bookId, chapter));
ipcMain.handle('search-verses', (_e, query, bibleId) => searchVerses(query, bibleId));

// Hymns IPC Handlers
ipcMain.handle('get-hymns', () => getHymns());
ipcMain.handle('get-hymns-count', () => getHymnsCount());
ipcMain.handle('get-hymn-categories', () => getHymnCategories());
ipcMain.handle('search-hymns', (_e, query, category) => searchHymns(query, category));
ipcMain.handle('list-hymns', (_e, query, category) => listHymns(query, category));
ipcMain.handle('get-hymn-lyrics', (_e, id) => getHymnLyrics(id));

// Native File Import Handler (.sng, .json, .txt)
ipcMain.handle('import-songs-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import Church Songs & Hymns File (.sng, .json, .txt)',
    properties: ['openFile'],
    filters: [
      { name: 'Song Files', extensions: ['sng', 'json', 'txt'] }
    ]
  });

  if (canceled || filePaths.length === 0) {
    return { success: false, message: 'Cancelled' };
  }

  const selectedFile = filePaths[0];
  if (selectedFile.endsWith('.sng') || selectedFile.endsWith('.txt')) {
    const result = importSngFile(selectedFile);
    if (result.success) {
      return { success: true, count: 1, fileName: path.basename(selectedFile) };
    } else {
      return { success: false, message: result.error || result.message };
    }
  }

  try {
    const rawData = fs.readFileSync(selectedFile, 'utf-8');
    const parsedData = JSON.parse(rawData);
    const hymnList = Array.isArray(parsedData) ? parsedData : (parsedData.songs || parsedData.hymns || [parsedData]);
    const importedCount = importHymnsBatch(hymnList);
    return { success: true, count: importedCount, fileName: path.basename(selectedFile) };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

// Native Bible SQL Dump Import Handler
ipcMain.handle('import-bible-sql-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import Bible SQL Dump File (.sql)',
    properties: ['openFile'],
    filters: [
      { name: 'SQL Files', extensions: ['sql'] }
    ]
  });

  if (canceled || filePaths.length === 0) {
    return { success: false, message: 'Cancelled' };
  }

  const result = importSqlFile(filePaths[0]);
  if (result.success) {
    return { success: true, fileName: path.basename(filePaths[0]) };
  } else {
    return { success: false, message: result.error || result.message };
  }
});

// Native Bible XML File Import Handler
ipcMain.handle('import-bible-xml-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import Bible XML File (.xml)',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Bible XML Files', extensions: ['xml'] }
    ]
  });

  if (canceled || filePaths.length === 0) {
    return { success: false, message: 'Cancelled' };
  }

  const results = [];
  for (const filePath of filePaths) {
    const result = importXmlBibleFile(filePath);
    results.push({
      success: result.success,
      fileName: path.basename(filePath),
      message: result.message || result.error || null
    });
  }
  return { success: true, results };
});

// Bible library management
ipcMain.handle('get-bible-stats', () => getBibleStats());

ipcMain.handle('remove-bible', (_e, bibleId) => removeBible(bibleId));

ipcMain.handle('rescan-bibles', () => rescanBiblesFolder());

ipcMain.handle('backup-database', async () => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Backup WordDesk Database',
      defaultPath: `church-presenter-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    });
    if (canceled || !filePath) return { success: false, message: 'Cancelled' };
    await fs.promises.copyFile(dbPath, filePath);
    return { success: true, message: filePath };
  } catch (err) {
    return { success: false, message: String((err && err.message) || err) };
  }
});

// Save Service Plan File (*.worship / *.json)
ipcMain.handle('save-plan-file', async (_e, planData) => {
  try {
    const docsDir = app.getPath('documents');
    const defaultName = path.join(docsDir, `WordDeskPlan-${new Date().toISOString().slice(0, 10)}.worship`);
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save WordDesk Service Plan',
      defaultPath: defaultName,
      filters: [
        { name: 'WordDesk Plan (*.worship, *.word)', extensions: ['worship', 'word'] },
        { name: 'JSON Plan (*.json)', extensions: ['json'] },
      ],
    });
    if (canceled || !filePath) return { success: false, message: 'Cancelled' };
    await fs.promises.writeFile(filePath, JSON.stringify(planData, null, 2), 'utf-8');
    return { success: true, filePath, fileName: path.basename(filePath) };
  } catch (err) {
    return { success: false, message: String((err && err.message) || err) };
  }
});

// Open Service Plan File (*.worship / *.json)
ipcMain.handle('open-plan-file', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Open WordDesk Service Plan File',
      defaultPath: app.getPath('documents'),
      properties: ['openFile'],
      filters: [
        { name: 'WordDesk Plan (*.worship, *.word, *.json)', extensions: ['worship', 'word', 'json'] },
      ],
    });
    if (canceled || filePaths.length === 0) return { success: false, message: 'Cancelled' };
    const filePath = filePaths[0];
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const plan = JSON.parse(raw);
    return { success: true, filePath, fileName: path.basename(filePath), plan };
  } catch (err) {
    return { success: false, message: String((err && err.message) || err) };
  }
});

// ── Media slides (image / video / PDF) ────────────────────────────────────────
// Picked media is copied into userData/media so a saved plan stays self-contained:
// the original file can be moved, renamed or deleted and the plan still works.
// Items store the stored *filename*, never an absolute path, so plans survive the
// folder being moved or the app being reinstalled.
const mediaFolder = () => path.join(app.getPath('userData'), 'media');

const MEDIA_FILTERS = [
  { name: 'Media', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'mp4', 'webm', 'mov', 'm4v', 'pdf'] },
  { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] },
  { name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'm4v'] },
  { name: 'PDF', extensions: ['pdf'] },
];

// Copy into the media folder, de-duplicating on name so picking the same file
// twice does not fill the disk. Returns the stored filename.
async function storeMediaFile(sourcePath) {
  const kind = mediaKind(sourcePath);
  if (!kind) throw new Error(`Unsupported media type: ${path.extname(sourcePath) || 'unknown'}`);

  await fs.promises.mkdir(mediaFolder(), { recursive: true });

  // ponytail: name-based de-dupe only. A content hash would also catch "same clip
  // renamed", but that needs a full read of every file on every import.
  const storedName = storedNameFor(sourcePath, (candidate) =>
    fs.existsSync(path.join(mediaFolder(), candidate))
  );

  await fs.promises.copyFile(sourcePath, path.join(mediaFolder(), storedName));
  return { storedName, kind };
}


// Pick one or more media files and copy them into the media folder.
ipcMain.handle('pick-media-files', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Add Media Slide (image, video, or PDF)',
      properties: ['openFile', 'multiSelections'],
      filters: MEDIA_FILTERS,
    });
    if (canceled || filePaths.length === 0) return { success: false, message: 'Cancelled' };

    const media = [];
    const skipped = [];
    for (const filePath of filePaths) {
      try {
        media.push({ ...(await storeMediaFile(filePath)), sourceName: path.basename(filePath) });
      } catch (err) {
        skipped.push({ sourceName: path.basename(filePath), reason: String((err && err.message) || err) });
      }
    }
    if (media.length === 0) {
      return { success: false, message: skipped[0]?.reason || 'No supported files selected' };
    }
    return { success: true, media, skipped };
  } catch (err) {
    return { success: false, message: String((err && err.message) || err) };
  }
});

// Import a whole folder of images at once (e.g. slides exported from PowerPoint).
// Returns files in name order so slide 1 comes before slide 10.
ipcMain.handle('pick-slide-folder', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import Slide Images From Folder',
      properties: ['openDirectory'],
    });
    if (canceled || filePaths.length === 0) return { success: false, message: 'Cancelled' };

    const entries = await fs.promises.readdir(filePaths[0], { withFileTypes: true });
    const imageFiles = entries
      .filter((entry) => entry.isFile() && mediaKind(entry.name) === 'image')
      .map((entry) => path.join(filePaths[0], entry.name))
      .sort(naturalCompare);

    if (imageFiles.length === 0) return { success: false, message: 'That folder has no images in it' };

    const media = [];
    const skipped = [];
    for (const filePath of imageFiles) {
      try {
        media.push({ ...(await storeMediaFile(filePath)), sourceName: path.basename(filePath) });
      } catch (err) {
        skipped.push({ sourceName: path.basename(filePath), reason: String((err && err.message) || err) });
      }
    }
    return { success: true, media, skipped };
  } catch (err) {
    return { success: false, message: String((err && err.message) || err) };
  }
});

// Resolve a stored media filename to a file:// URL the renderer can load, and
// report whether it still exists. Used to flag missing media before it goes live.
ipcMain.handle('resolve-media-url', async (_e, storedNames = []) => {
  const folder = mediaFolder();
  const out = {};
  for (const raw of Array.isArray(storedNames) ? storedNames : []) {
    // safeStoredName rejects separators and traversal, so a name coming back from
    // the renderer can only ever resolve to a file inside the media folder. The
    // response is keyed by the *requested* string so the renderer's lookup always
    // finds its entry, even when the name had to be rejected.
    const storedName = safeStoredName(raw);
    if (!storedName) {
      out[raw] = { url: null, exists: false };
      continue;
    }
    const full = path.join(folder, storedName);
    const exists = fs.existsSync(full);
    out[raw] = { url: exists ? toFileUrl(full, path.sep) : null, exists };
  }
  return out;
});

// Point an item at a different file (the relink fallback for missing media).
ipcMain.handle('relink-media', async (_e, storedName) => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Relink Media',
      properties: ['openFile'],
      filters: MEDIA_FILTERS,
    });
    if (canceled || filePaths.length === 0) return { success: false, message: 'Cancelled' };

    // Replace the old file only once the new one is safely stored.
    const stored = await storeMediaFile(filePaths[0]);
    if (typeof storedName === 'string' && storedName) {
      const old = path.join(mediaFolder(), storedName);
      if (fs.existsSync(old)) await fs.promises.unlink(old).catch(() => {});
    }
    return { success: true, storedName: stored.storedName, kind: stored.kind, sourceName: path.basename(filePaths[0]) };
  } catch (err) {
    return { success: false, message: String((err && err.message) || err) };
  }
});

// Total bytes held in the media folder, for the Settings readout.
ipcMain.handle('get-media-usage', async () => {
  try {
    const folder = mediaFolder();
    const entries = await fs.promises.readdir(folder, { withFileTypes: true });
    let bytes = 0;
    let count = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const stat = await fs.promises.stat(path.join(folder, entry.name));
      bytes += stat.size;
      count += 1;
    }
    return { success: true, bytes, count, folder };
  } catch {
    return { success: true, bytes: 0, count: 0, folder: mediaFolder() };
  }
});

// Native OS notification (Windows toast / tray balloon) fired from the renderer.
ipcMain.on('native-notification', (_event, { title, body } = {}) => {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title: title || 'WordDesk', body: body || '' });
  notification.show();
});

// Persist launch-on-system-startup via native login-item (Windows Taskbar
// startup folder / macOS launch agent / Linux .desktop autostart).
ipcMain.handle('set-login-item-open-at-login', (_event, { openAtLogin } = {}) => {
  try {
    app.setLoginItemSettings({ openAtLogin: Boolean(openAtLogin) });
    return { success: true, openAtLogin: Boolean(openAtLogin) };
  } catch (err) {
    return { success: false, error: String((err && err.message) || err) };
  }
});
ipcMain.handle('get-login-item-open-at-login', () => {
  try {
    const s = app.getLoginItemSettings();
    return { success: true, openAtLogin: Boolean(s && s.openAtLogin) };
  } catch (err) {
    return { success: false, error: String((err && err.message) || err) };
  }
});

// Autostart the app when the OS session boots (Windows Startup folder via
// app.setLoginItemSettings / macOS login items injected from the renderer).
ipcMain.handle('set-login-item', (_event, { enabled } = {}) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      path: process.execPath,
      args: ['--hidden']
    });
    return { success: true, openAtLogin: Boolean(enabled) };
  } catch (err) {
    return { success: false, error: String((err && err.message) || err) };
  }
});

// Current persisted login-item (startup) state so the General settings toggle
// can render the real value instead of a dead defaultChecked switch.
ipcMain.handle('get-login-item', () => {
  try {
    const s = app.getLoginItemSettings();
    return { success: true, openAtLogin: Boolean(s && s.openAtLogin) };
  } catch (err) {
    return { success: false, error: String((err && err.message) || err) };
  }
});

// Fullscreen (or restore) — routed to every open presentation/projector window.
// Handler (Promise) so the renderer gets a real window count back for toasts.
const setPresentationFullscreen = (fullscreen) => {
  const isFull = Boolean(fullscreen);
  let affected = 0;
  for (const win of presentationWindows.values()) {
    if (win && !win.isDestroyed()) {
      win.setFullScreen(isFull);
      affected++;
    }
  }
  return { success: true, windows: affected };
};

ipcMain.handle('set-presentation-fullscreen', () => setPresentationFullscreen(true));

ipcMain.handle('set-presentation-fullscreen-off', () => setPresentationFullscreen(false));


// STAGE 5: PRESENTATION OUTPUT MULTI-WINDOW IPC FORWARDING
ipcMain.on('send-live-slide', (_event, slideData) => {
  for (const win of presentationWindows.values()) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-presentation-slide', slideData);
    }
  }
  if (stageWindow && !stageWindow.isDestroyed()) {
    stageWindow.webContents.send('update-presentation-slide', slideData);
  }
});

// Deck navigation sent from any projector window (arrow keys) back to the control window.
ipcMain.on('deck-nav', (_event, dir) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('deck-nav', dir);
  }
});

// Open (or close) projector windows so the renderer can choose which displays are
// used for projection, including multiple displays at once.
ipcMain.handle('open-presentation-windows', (_event, displayIds) => {
  const ids = Array.isArray(displayIds) ? displayIds.map(Number).filter((n) => Number.isFinite(n)) : [];
  const activeDisplays = screen.getAllDisplays();

  for (const [id, win] of Array.from(presentationWindows.entries())) {
    if (!ids.includes(Number(id))) {
      if (win && !win.isDestroyed()) win.destroy();
      presentationWindows.delete(id);
    }
  }

  for (const id of ids) {
    const display = activeDisplays.find((d) => d.id === Number(id));
    if (display && !presentationWindows.has(String(id))) {
      createPresentationWindow(display);
    }
  }

  return { ok: true, active: Array.from(presentationWindows.keys()).map(Number) };
});

function notifyStageStatusChange() {
  const active = Boolean(stageWindow && !stageWindow.isDestroyed());
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('stage-window-status-changed', active);
  }
}

const createStageWindow = () => {
  if (stageWindow && !stageWindow.isDestroyed()) {
    stageWindow.focus();
    notifyStageStatusChange();
    return;
  }

  const appIcon = getAppIcon();
  const displays = screen.getAllDisplays();
  const targetDisplay = displays.length > 1 ? displays[1] : displays[0];
  const bounds = targetDisplay.bounds;

  stageWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    title: 'WordDesk - Stage Display / Confidence Monitor',
    icon: appIcon,
    autoHideMenuBar: true,
    backgroundColor: '#0C0D0E',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  if (appIcon && !appIcon.isEmpty()) {
    stageWindow.setIcon(appIcon);
  }

  watchForBlankWindows(stageWindow, 'stage');

  stageWindow.on('closed', () => {
    stageWindow = null;
    notifyStageStatusChange();
  });

  const baseUrl = process.env.ELECTRON_RENDERER_URL || `file://${path.join(__dirname, '../renderer/index.html')}`;
  const stageUrl = `${baseUrl}?window=stage`;

  if (process.env.ELECTRON_RENDERER_URL) {
    stageWindow.loadURL(stageUrl);
  } else {
    stageWindow.loadFile(path.join(__dirname, '../renderer/index.html'), { query: { window: 'stage' } });
  }

  notifyStageStatusChange();
};

const closeStageWindow = () => {
  if (stageWindow && !stageWindow.isDestroyed()) {
    stageWindow.destroy();
    stageWindow = null;
  }
  notifyStageStatusChange();
};

ipcMain.handle('open-stage-window', () => {
  createStageWindow();
  return { success: true, active: true };
});

ipcMain.handle('close-stage-window', () => {
  closeStageWindow();
  return { success: true, active: false };
});

ipcMain.handle('toggle-stage-window', () => {
  if (stageWindow && !stageWindow.isDestroyed()) {
    closeStageWindow();
    return { success: true, active: false };
  } else {
    createStageWindow();
    return { success: true, active: true };
  }
});

ipcMain.handle('get-stage-window-status', () => {
  return { active: Boolean(stageWindow && !stageWindow.isDestroyed()) };
});

function getAppIcon(themeMode = 'dark') {
  // macOS takes the icon from the .app bundle and ignores setIcon(), so there is
  // nothing to swap there.
  if (process.platform === 'darwin') return undefined;

  // A light-coloured icon reads on a dark title bar and vice-versa, so each
  // theme gets the opposite icon.
  const isLightTheme = themeMode === 'light';
  const names = [
    isLightTheme ? 'app-icon-dark' : 'app-icon-light',
    isLightTheme ? 'app-icon-light' : 'app-icon-dark',
  ];
  // Windows reads .ico for a crisp multi-resolution taskbar icon; it falls back
  // to the .png if the .ico cannot be decoded.
  const extensions = process.platform === 'win32' ? ['.ico', '.png'] : ['.png'];

  // electron-builder packs src/assets INSIDE the asar, and
  // nativeImage.createFromPath() cannot read through an asar. The .ico files are
  // not shipped inside the archive, so the byte fallback is what makes the
  // theme-aware icon swap work in a packaged build.
  const roots = [
    app.getAppPath(),
    process.resourcesPath,
    process.cwd(),
    path.join(__dirname, '..', '..'),
  ];

  for (const root of roots) {
    if (!root) continue;
    for (const name of names) {
      for (const ext of extensions) {
        const file = path.join(root, 'src', 'assets', `${name}${ext}`);
        try {
          if (!fs.existsSync(file)) continue;
          // .ico only decodes through createFromPath (it yields a crisp
          // multi-resolution 256px icon for the taskbar), but createFromPath
          // cannot read through the asar, so fall back to the bytes.
          const byPath = nativeImage.createFromPath(file);
          if (!byPath.isEmpty()) return byPath;
          const byBuffer = nativeImage.createFromBuffer(fs.readFileSync(file));
          if (!byBuffer.isEmpty()) return byBuffer;
        } catch {
          // Unreadable candidate - try the next one.
        }
      }
    }
  }
  return undefined;
}

const createPresentationWindow = (display) => {
  const isPrimary = display.id === screen.getPrimaryDisplay().id;
  const bounds = display.bounds;
  const appIcon = getAppIcon();

  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    fullscreen: !isPrimary,
    title: 'WordDesk - Live Projector Output',
    icon: appIcon,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  if (appIcon && !appIcon.isEmpty()) {
    win.setIcon(appIcon);
  }

  watchForBlankWindows(win, `projector ${display.id}`);

  presentationWindows.set(String(display.id), win);
  win.on('closed', () => {
    presentationWindows.delete(String(display.id));
  });

  // Exactly one projector window is allowed to play video sound, otherwise a
  // two-projector setup plays the same clip twice. The lowest open display id owns
  // audio, so the sound moves to another window if this one is closed.
  const openIds = Array.from(presentationWindows.keys()).map(Number).sort((a, b) => a - b);
  const audioOwner = openIds[0] === Number(display.id);

  const baseUrl = process.env.ELECTRON_RENDERER_URL || `file://${path.join(__dirname, '../renderer/index.html')}`;
  const presentationUrl = `${baseUrl}?window=presentation&audio=${audioOwner ? 1 : 0}`;

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(presentationUrl);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'), {
      query: { window: 'presentation', audio: audioOwner ? '1' : '0' },
    });
  }
};

const createWindow = () => {
  const appIcon = getAppIcon(getEffectiveTheme());
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'WordDesk - Control Window',
    icon: appIcon,
    ...nativeChromeOptions(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  if (appIcon && !appIcon.isEmpty()) {
    mainWindow.setIcon(appIcon);
  }

  watchForBlankWindows(mainWindow, 'control');

  mainWindow.on('closed', () => {
    mainWindow = null;
    for (const win of presentationWindows.values()) {
      if (win && !win.isDestroyed()) {
        win.destroy();
      }
    }
    presentationWindows.clear();
    if (stageWindow && !stageWindow.isDestroyed()) {
      stageWindow.destroy();
      stageWindow = null;
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Register the auto-update IPC and point it at this window. Safe to call on
  // every (re)open: the listeners are only wired once.
  initUpdater(mainWindow);
};

// Guarded as well as the exit above: app.exit() tears the process down, but the
// rest of this module still runs to the end of its tick, so without this the
// ready handler could still be registered and reach initDatabase().
if (gotInstanceLock) {
  app.whenReady().then(() => {
  startupLog('app ready');

  // Adopt the app theme as the OS theme source so the title bar, native dialogs
  // and scrollbars follow the in-app choice. 'system' keeps tracking the PC.
  nativeTheme.themeSource = appThemeMode;

  // One-shot self-heal for machines whose GPU cannot give Chromium a usable
  // context. Checked only while the marker file is absent, so it can never
  // relaunch twice for the same machine.
  if (!gpuCompatEnabled()) {
    let status = {};
    try {
      status = app.getGPUFeatureStatus();
    } catch {
      status = {};
    }
    const broken = ['rasterization', 'webgl'].filter((feature) => status[feature] === 'unavailable');
    if (broken.length > 0) {
      // The marker is what stops this from happening again on the next launch, so
      // it has to be on disk before we relaunch. If it cannot be written - a
      // read-only or full userData folder - relaunching anyway would detect the
      // same broken GPU and relaunch forever, leaving the operator with an app
      // that never starts. That is worse than the problem being fixed, so in that
      // case carry on with the GPU as-is and leave the manual route: launch with
      // the --disable-gpu switch.
      let recorded = false;
      try {
        fs.writeFileSync(gpuCompatMarker(), new Date().toISOString(), 'utf-8');
        recorded = true;
      } catch (err) {
        startupLog(`could not record GPU compatibility flag: ${err && err.message}`);
      }

      if (recorded) {
        startupLog(`GPU unavailable (${broken.join(', ')}) - relaunching with software rendering`);
        app.relaunch();
        app.exit(0);
        return;
      }
      startupLog(`GPU unavailable (${broken.join(', ')}) - starting anyway, use --disable-gpu if this looks wrong`);
    } else {
      startupLog(`GPU ok (${JSON.stringify(status)})`);
    }
  }

  // Fires when the PC's own theme changes, so 'system' mode updates everywhere
  // without a restart.
  nativeTheme.on('updated', () => {
    applyNativeTheme();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('native-theme-changed', {
        effectiveTheme: getEffectiveTheme(),
      });
    }
  });

  // Remove the File/Edit/View menu bar in production builds only.
  // Keep it while running via `npm run dev` so DevTools shortcuts & defaults
  // stay available during development.
  if (app.isPackaged) {
    Menu.setApplicationMenu(null);
  }

  // The window is created FIRST and the library import happens afterwards. The
  // import is minutes of synchronous SQLite work on a slow hard disk, and while
  // it ran before createWindow() there was nothing on screen to look at, which
  // read to the user as "the app does not work on this laptop". The renderer
  // process paints and paints independently, so the splash shows immediately and
  // its first IPC calls simply queue in main until the import finishes.
  // Migration check: If the machine had the pre-rebrand WorshipDesk installed,
  // copy over church.db, WAL files, and user libraries so hymns/bibles/plans persist.
  try {
    const currentUserData = app.getPath('userData');
    const legacyUserData = path.join(path.dirname(currentUserData), 'worshipdesk');
    const currentDb = path.join(currentUserData, 'church.db');
    const legacyDb = path.join(legacyUserData, 'church.db');

    if (fs.existsSync(legacyDb) && !fs.existsSync(currentDb)) {
      startupLog('Migrating database from legacy worshipdesk folder to worddesk...');
      fs.mkdirSync(currentUserData, { recursive: true });
      for (const ext of ['', '-wal', '-shm']) {
        const src = `${legacyDb}${ext}`;
        const dst = `${currentDb}${ext}`;
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dst);
        }
      }
      for (const sub of ['bibles', 'hymns', 'media']) {
        const srcDir = path.join(legacyUserData, sub);
        const dstDir = path.join(currentUserData, sub);
        if (fs.existsSync(srcDir) && !fs.existsSync(dstDir)) {
          fs.cpSync(srcDir, dstDir, { recursive: true });
        }
      }
    }

    if (process.platform === 'win32') {
      const oldShortcut = path.join(app.getPath('desktop'), 'WorshipDesk.lnk');
      if (fs.existsSync(oldShortcut)) {
        try {
          fs.unlinkSync(oldShortcut);
          startupLog('Removed legacy WorshipDesk desktop shortcut');
        } catch {
          // Ignore
        }
      }

      // Automatically clean up stale WorshipDesk taskbar pinned shortcut
      const appData = app.getPath('appData');
      const taskbarDir = path.join(appData, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar');
      const oldTaskbar = path.join(taskbarDir, 'WorshipDesk.lnk');
      if (fs.existsSync(oldTaskbar)) {
        try {
          fs.unlinkSync(oldTaskbar);
          startupLog('Removed legacy WorshipDesk taskbar shortcut');
        } catch {
          // Ignore
        }
      }
    }
  } catch (err) {
    startupLog(`Legacy migration check notice: ${err && err.message}`);
  }

  try {
    dbPath = initDatabase();
    startupLog(`database opened at ${dbPath}`);
  } catch (err) {
    // A failed database must still leave a window on screen. Every data handler
    // in db.js already no-ops on a null db, so the operator gets a usable shell
    // plus Settings > Content & Backup instead of no app at all.
    startupLog(`database failed to open: ${err && (err.stack || err.message || err)}`);
    dbError = String((err && err.message) || err);
  }

  createWindow();
  startupLog(`control window created after ${Date.now() - startedAt}ms`);

  try {
    const result = refreshLibraries();
    startupLog(
      result.changed
        ? `libraries imported (bibles=${!!result.bibles} hymns=${!!result.hymns}) - ready after ${
            Date.now() - startedAt
          }ms`
        : `libraries ${result.skipped} - ready after ${Date.now() - startedAt}ms`
    );
  } catch (err) {
    startupLog(`library import failed: ${err && (err.stack || err.message || err)}`);
  }

  const notifyDisplayChange = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('displays-changed', getDisplayDetails());
    }
  };

  screen.on('display-added', notifyDisplayChange);
  screen.on('display-removed', notifyDisplayChange);
  screen.on('display-metrics-changed', notifyDisplayChange);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
  });
}

app.on('window-all-closed', () => {
  startupLog(`all windows closed after ${(Date.now() - startedAt) / 1000}s`);
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
