// ─── ELECTRON MAIN — Shell que carga sekachat.vercel.app ───────────────────────
const { app, BrowserWindow, Notification, ipcMain, shell, Menu, session, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const { autoUpdater } = require('electron-updater');

// ─── ACTIVITY TRACKER (global desktop-level) ──────────────────────────────────
const { startDesktopTracking, stopDesktopTracking } = require('./tracker.cjs');

// IPC para recibir el email del agente desde la web
ipcMain.on('activity-start', (_, { email, name }) => startDesktopTracking(email, name));
ipcMain.on('activity-stop', () => stopDesktopTracking());

const PROD_URL = 'https://sekachat.vercel.app';
const DEV_URL  = 'http://localhost:3100';

const APP_ICON = fs.existsSync(path.join(__dirname, '../public/logo.ico'))
  ? path.join(__dirname, '../public/logo.ico')
  : path.join(__dirname, '../public/iSoTienda3D.png');

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
    if (!url.startsWith('https://sekachat.vercel.app')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // ─── MANEJO DE ERRORES Y AUTO-RECARGA ──────────────────────────────────────
  let reloadAttempts = 0;
  const MAX_RELOAD_ATTEMPTS = 5;
  const RELOAD_COOLDOWN = 10000; // 10s entre intentos

  // La pagina fallo al cargar (timeout, red caida, DNS, etc)
  win.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return; // ERR_ABORTED — recarga normal, ignorar
    console.error(`[did-fail-load] ${errorCode}: ${errorDescription} | URL: ${validatedURL}`);
    if (reloadAttempts < MAX_RELOAD_ATTEMPTS) {
      reloadAttempts++;
      console.log(`[auto-reload] intento ${reloadAttempts}/${MAX_RELOAD_ATTEMPTS} en ${RELOAD_COOLDOWN/1000}s...`);
      setTimeout(() => {
        if (win && !win.isDestroyed()) {
          win.loadURL(isDev ? DEV_URL : PROD_URL);
        }
      }, RELOAD_COOLDOWN);
    }
  });

  // La pagina termino de cargar — resetear contador
  win.webContents.on('did-finish-load', () => {
    if (reloadAttempts > 0) {
      console.log(`[auto-reload] pagina cargada OK despues de ${reloadAttempts} intento(s)`);
    }
    reloadAttempts = 0;
  });

  // El proceso de renderizado se cerro o crasheo (pantalla negra)
  win.webContents.on('render-process-gone', (_, details) => {
    console.error(`[render-process-gone] reason: ${details.reason} | exitCode: ${details.exitCode}`);
    if (reloadAttempts < MAX_RELOAD_ATTEMPTS) {
      reloadAttempts++;
      console.log(`[auto-reload] render-process-gone, recargando en ${RELOAD_COOLDOWN/1000}s (intento ${reloadAttempts})...`);
      setTimeout(() => {
        if (win && !win.isDestroyed()) {
          win.loadURL(isDev ? DEV_URL : PROD_URL);
        }
      }, RELOAD_COOLDOWN);
    } else {
      console.error('[auto-reload] maximo de intentos alcanzado, no se recarga mas');
      dialog.showErrorBox(
        'Soporte Sekunet - Error',
        'La aplicacion crasheo multiples veces y no se pudo recuperar.\n\nPor favor cierre y vuelva a abrir la aplicacion.'
      );
    }
  });

  // La pagina no responde (congelada)
  win.webContents.on('unresponsive', () => {
    console.error('[unresponsive] la pagina dejo de responder');
    if (Notification.isSupported()) {
      new Notification({
        title: 'Soporte Sekunet',
        body: 'La aplicacion no responde. Recargando automaticamente...',
        icon: APP_ICON,
      }).show();
    }
    setTimeout(() => {
      if (win && !win.isDestroyed()) {
        win.webContents.reload();
      }
    }, 3000);
  });

  // El proceso GPU crasheo (causa comum de pantalla negra en Electron)
  app.on('gpu-process-crashed', (_, killed) => {
    console.error(`[gpu-process-crashed] killed: ${killed}`);
  });

  // Detectar si la pagina se queda en blanco despues de cargar
  // (pasa cuando React crashea y no renderiza nada)
  let blankCheckTimer = null;
  win.webContents.on('did-finish-load', () => {
    if (blankCheckTimer) clearTimeout(blankCheckTimer);
    blankCheckTimer = setTimeout(async () => {
      if (!win || win.isDestroyed()) return;
      try {
        // Verificar si el body esta vacio o solo tiene el background
        const result = await win.webContents.executeJavaScript(`
          document.body && document.body.innerHTML
            ? document.body.innerHTML.length
            : 0
        `);
        if (result < 100) {
          console.error(`[blank-check] body casi vacio (${result} chars), recargando...`);
          win.webContents.reload();
        }
      } catch (e) {
        // executeJavaScript puede fallar si el renderer ya no existe
        console.error('[blank-check] no se pudo inspeccionar:', e.message);
      }
    }, 5000);
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

ipcMain.on('abrir-impersonar', (_, { url, nombre }) => {
  const impWin = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    title: `Vista: ${nombre}`,
    icon: APP_ICON,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      partition: `persist:imp-${nombre.replace(/\s+/g, '-').toLowerCase()}`,
    },
  });
  impWin.loadURL(url);
  impWin.webContents.setWindowOpenHandler(({ url: u }) => {
    if (!u.startsWith('https://sekachat.vercel.app')) { shell.openExternal(u); return { action: 'deny' }; }
    return { action: 'allow' };
  });

  // Auto-recargar si crashea
  impWin.webContents.on('render-process-gone', (_, details) => {
    console.error(`[imp-render-process-gone] reason: ${details.reason}`);
    setTimeout(() => {
      if (impWin && !impWin.isDestroyed()) impWin.loadURL(url);
    }, 5000);
  });
  impWin.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
    if (errorCode === -3) return;
    console.error(`[imp-did-fail-load] ${errorCode}: ${errorDescription}`);
    setTimeout(() => {
      if (impWin && !impWin.isDestroyed()) impWin.loadURL(url);
    }, 5000);
  });
});

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
        ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools', label: 'DevTools' }] : [{ type: 'separator' }, { role: 'toggleDevTools', label: 'Consola (DevTools)', accelerator: 'F12' }]),
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
