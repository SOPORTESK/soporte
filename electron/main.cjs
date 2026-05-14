// ─── ELECTRON MAIN — Shell que carga kachat.vercel.app ───────────────────────
const { app, BrowserWindow, Notification, ipcMain, shell, Menu, session, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const { autoUpdater } = require('electron-updater');

const PROD_URL = 'https://kachat.vercel.app';
const DEV_URL  = 'http://localhost:3100';
const isDev    = process.env.NODE_ENV === 'development';

const APP_ICON = fs.existsSync(path.join(__dirname, '../public/logo.ico'))
  ? path.join(__dirname, '../public/logo.ico')
  : path.join(__dirname, '../public/logo.png');

if (process.platform === 'win32') {
  app.setAppUserModelId('com.sekunet.soporte');
}

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width          : 1400,
    height         : 900,
    minWidth       : 900,
    minHeight      : 600,
    title          : 'Soporte Sekunet',
    icon           : APP_ICON,
    backgroundColor: '#0f172a',
    webPreferences : {
      preload         : path.join(__dirname, 'preload.cjs'),
      nodeIntegration : false,
      contextIsolation: true,
      partition       : 'persist:sekunet',
    },
  });

  win.loadURL(isDev ? DEV_URL : PROD_URL);

  if (isDev) {
    win.webContents.once('did-finish-load', () => {
      win.webContents.openDevTools({ mode: 'detach' });
    });
  }

  // Links externos se abren en el navegador del sistema
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('https://kachat.vercel.app')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// ─── AUTO-ACTUALIZACIÓN ───────────────────────────────────────────────────────
function setupAutoUpdater() {
  if (isDev) return;

  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', () => {
    if (Notification.isSupported()) {
      new Notification({
        title: '🔄 Actualización disponible',
        body : 'Descargando la nueva versión de Soporte Sekunet...',
        icon : APP_ICON,
      }).show();
    }
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(win, {
      type   : 'info',
      title  : 'Actualización lista',
      message: 'Se descargó una nueva versión. ¿Instalar y reiniciar ahora?',
      buttons: ['Instalar ahora', 'Más tarde'],
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] Error:', err.message);
  });
}

// ─── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.on('recargar', () => win?.webContents.reload());

ipcMain.on('notificar-n2', (_, data) => {
  if (!Notification.isSupported()) return;
  const notif = new Notification({
    title      : '🔔 TRANSFERENCIA A NIVEL 2',
    body       : `Cliente: ${data.cliente}\nTeléfono: ${data.telefono}\nAsignado a: ${data.agente}`,
    icon       : APP_ICON,
    urgency    : 'critical',
    timeoutType: 'never',
  });
  notif.on('click', () => { win?.show(); win?.focus(); });
  notif.show();
});

ipcMain.on('notificar-modo-manual', () => {
  if (!Notification.isSupported()) return;
  const notif = new Notification({
    title  : '⚠️ MODO MANUAL ACTIVO',
    body   : 'El agente IA no responde. Los agentes humanos deben atender directamente.',
    icon   : APP_ICON,
    urgency: 'critical',
  });
  notif.on('click', () => { win?.show(); win?.focus(); });
  notif.show();
});

// ─── APP READY ────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: wss: data: blob:;"
        ],
      },
    });
  });

  createWindow();
  setupAutoUpdater();

  const menu = Menu.buildFromTemplate([
    {
      label: 'Navegación',
      submenu: [
        { label: '← Atrás',          accelerator: 'Alt+Left',  click: () => win?.webContents.canGoBack()    && win.webContents.goBack() },
        { label: '→ Adelante',        accelerator: 'Alt+Right', click: () => win?.webContents.canGoForward() && win.webContents.goForward() },
        { type: 'separator' },
        { label: '⟳ Recargar',        accelerator: 'F5',        click: () => win?.webContents.reload() },
        { label: 'Recargar sin caché', accelerator: 'Shift+F5', click: () => win?.webContents.reloadIgnoringCache() },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        { role: 'zoomIn',    label: 'Acercar',     accelerator: 'CmdOrCtrl+=' },
        { role: 'zoomOut',   label: 'Alejar',      accelerator: 'CmdOrCtrl+-' },
        { role: 'resetZoom', label: 'Zoom normal', accelerator: 'CmdOrCtrl+0' },
        ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools', label: 'DevTools' }] : []),
      ],
    },
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        { role: 'close',    label: 'Cerrar' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
