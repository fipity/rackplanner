/**
 * RackPlanner desktop: runs the normal RackPlanner server inside Electron's
 * main process, bound to 127.0.0.1 on a free port, and shows the web UI in a
 * window. Designs live in the user's app-data folder.
 */
import { BrowserWindow, Menu, app, dialog, nativeTheme, shell } from 'electron';
import { mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const resources = app.isPackaged ? process.resourcesPath : path.join(here, 'resources');
const dataDir = path.join(app.getPath('userData'), 'data');
const homepage = 'https://github.com/fipity/rackplanner';

/** @type {BrowserWindow | null} */
let win = null;
let origin = '';

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.setAppUserModelId('com.fipity.rackplanner');
  app.whenReady().then(start, fail);
  app.on('window-all-closed', () => app.quit());
  // Keep every window on the app; links elsewhere open in the browser.
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (e, url) => {
      if (isInternal(url)) return;
      e.preventDefault();
      openExternal(url);
    });
  });
}

async function start() {
  origin = await startServer();
  Menu.setApplicationMenu(buildMenu());
  createWindow();
}

function fail(err) {
  dialog.showErrorBox('RackPlanner could not start', String(err?.stack ?? err));
  app.exit(1);
}

/** A free TCP port on the loopback interface. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = /** @type {net.AddressInfo} */ (srv.address());
      srv.close(() => resolve(port));
    });
  });
}

async function startServer() {
  const port = await freePort();
  mkdirSync(dataDir, { recursive: true });
  delete process.env.BASIC_AUTH_USER;
  delete process.env.BASIC_AUTH_PASS;
  Object.assign(process.env, {
    NODE_ENV: 'production',
    PORT: String(port),
    HOST: '127.0.0.1',
    DATA_DIR: dataDir,
    CATALOG_DIR: path.join(resources, 'catalog'),
    EXAMPLES_DIR: path.join(resources, 'examples'),
    WEB_DIST: path.join(resources, 'web'),
    LOG_LEVEL: process.env.RACKPLANNER_LOG_LEVEL ?? 'warn',
  });
  // The server module starts listening as a side effect of being imported.
  await import(pathToFileURL(path.join(here, 'server', 'index.js')).href);
  return `http://127.0.0.1:${port}`;
}

const isInternal = (url) => url === origin || url.startsWith(`${origin}/`);

function openExternal(url) {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'RackPlanner',
    icon: path.join(resources, 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#09090b' : '#fafafa',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.once('ready-to-show', () => win?.show());
  win.on('closed', () => (win = null));

  const wc = win.webContents;
  // App pages (e.g. the print view) open in their own window; everything else in the browser.
  wc.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 1100, height: 900, autoHideMenuBar: true, icon: path.join(resources, 'icon.png') } };
    }
    openExternal(url);
    return { action: 'deny' };
  });
  void win.loadURL(origin);
}

function buildMenu() {
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    {
      label: '&File',
      submenu: [
        { label: 'Home', accelerator: 'Alt+Home', click: () => void win?.loadURL(origin) },
        { label: 'Open Data Folder', click: () => void shell.openPath(dataDir) },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    // No Edit menu: its undo/redo accelerators would swallow the app's own Ctrl+Z / Ctrl+Y.
    {
      label: '&View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '&Help',
      submenu: [
        { label: 'RackPlanner on GitHub', click: () => void shell.openExternal(homepage) },
        { label: 'Report an Issue', click: () => void shell.openExternal(`${homepage}/issues`) },
        { type: 'separator' },
        {
          label: 'About RackPlanner',
          click: () =>
            void dialog.showMessageBox({
              type: 'info',
              title: 'About RackPlanner',
              message: `RackPlanner ${app.getVersion()}`,
              detail: `Visual home-lab rack designer.\n\nDesigns are stored in:\n${dataDir}\n\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`,
            }),
        },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}
