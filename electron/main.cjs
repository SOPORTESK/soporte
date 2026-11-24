// ─── ELECTRON MAIN — Shell robusto para Sekunet Chat ───────────────────────────
const { app, BrowserWindow, Notification, ipcMain, shell, Menu, session, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const { autoUpdater } = require('electron-updater');

// Desactivar aceleración por hardware en Windows para evitar pantallas negras/azules por GPU
// Prevenir multiples instancias duplicadas en segundo plano
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

// ─── ACTIVITY TRACKER (global desktop-level) ──────────────────────────────────
const { resolveActiveServerUrl, isAppOrigin } = require('./server-resolver.cjs');
const { startDesktopTracking, stopDesktopTracking, setServerBaseUrl } = require('./tracker.cjs');

// IPC para recibir el email del agente desde la web
ipcMain.on('activity-start', (_, { email, name }) => startDesktopTracking(email, name));
ipcMain.on('activity-stop', () => stopDesktopTracking());

const DEV_URL = 'http://localhost:3100';
const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

let _activeServerUrl = null;
let _reconnecting = false;

const APP_ICON = fs.existsSync(path.join(__dirname, '../public/logo.ico'))
  ? path.join(__dirname, '../public/logo.ico')
  : path.join(__dirname, '../public/iSoTienda3D.png');

if (process.platform === 'win32') {
  app.setAppUserModelId('com.sekunet.soporte');
}

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

let win = null;

function getErrorHTML(url, errorDesc) {
  return `data:text/html;charset=utf-8,` + encodeURIComponent(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Soporte Sekunet - Reconectando</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          body { background: #090d16; color: #f1f5f9; display: flex; align-items: center; justify-content: center; height: 100vh; padding: 20px; }
          .card { background: #131b2e; border: 1px solid #233152; border-radius: 20px; padding: 40px 32px; max-width: 480px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
          .icon { width: 56px; height: 56px; background: rgba(124, 58, 237, 0.15); border: 1px solid rgba(124, 58, 237, 0.3); border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px; color: #a78bfa; font-size: 24px; }
          h2 { font-size: 18px; font-weight: 800; margin-bottom: 8px; color: #fff; }
          p { font-size: 13px; color: #94a3b8; line-height: 1.5; margin-bottom: 24px; }
          .btn-group { display: flex; gap: 10px; justify-content: center; }
          button { background: #7c3aed; color: #fff; border: none; padding: 12px 24px; border-radius: 12px; font-size: 13px; font-weight: 700; cursor: pointer; transition: 0.2s; }
          button:hover { background: #6d28d9; }
          .btn-sec { background: #1e293b; color: #cbd5e1; border: 1px solid #334155; }
          .btn-sec:hover { background: #334155; color: #fff; }
          .timer { font-size: 11px; color: #64748b; margin-top: 16px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">⚡</div>
          <h2>Conectando con Soporte Sekunet</h2>
          <p>No se pudo conectar inmediatamente con el servidor de Soporte Sekunet (${errorDesc}). Verificando enlace activo y reintentando automáticamente...</p>
          <div class="btn-group">
            <button onclick="if(window.electronAPI&&window.electronAPI.reconectarServidor){window.electronAPI.reconectarServidor();}else{window.location.reload();}">Reconectar ahora</button>
            <button class="btn-sec" onclick="window.location.href='${DEV_URL}'">Abrir servidor local</button>
          </div>
          <div class="timer" id="count">Reintentando en <span id="sec">6</span> segundos...</div>
        </div>
        <script>
          let s = 6;
          setInterval(() => {
            s--;
            if (s > 0) {
              document.getElementById('sec').innerText = s;
            } else {
              s = 6;
              document.getElementById('sec').innerText = s;
              if (window.electronAPI && window.electronAPI.reconectarServidor) {
                window.electronAPI.reconectarServidor();
              } else {
                window.location.reload();
              }
            }
          }, 1000);
        </script>
      </body>
    </html>
  `);
}

async function reconnectToActiveServer() {
  if (_reconnecting) return;
  _reconnecting = true;
  try {
    const freshUrl = isDev ? DEV_URL : await resolveActiveServerUrl({ forceRefresh: true });
    _activeServerUrl = freshUrl;
    setServerBaseUrl(freshUrl);
    console.log(`[electron] Reconectando ventana principal a ${freshUrl}...`);
    if (win && !win.isDestroyed()) {
      win.loadURL(freshUrl);
    }
  } catch (e) {
    console.error('[electron] Error reconectando al servidor activo:', e.message);
  } finally {
    _reconnecting = false;
  }
}

async function createWindow() {
  win = new BrowserWindow({
    width          : 1400,
    height         : 900,
    minWidth       : 900,
    minHeight      : 600,
    title          : 'Soporte Sekunet',
    icon           : APP_ICON,
    backgroundColor: '#090d16',
    show           : false, // Esperar a ready-to-show para evitar flash
    webPreferences : {
      preload         : path.join(__dirname, 'preload.cjs'),
      nodeIntegration : false,
      contextIsolation: true,
      partition       : 'persist:sekunet',
      backgroundThrottling: false, // No suspender procesos en segundo plano
    },
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  const targetURL = isDev ? DEV_URL : await resolveActiveServerUrl({ forceRefresh: true });
  _activeServerUrl = targetURL;
  setServerBaseUrl(targetURL);

  // Cargar URL
  const ses = win.webContents.session;
  ses.clearCache().then(() => {
    console.log(`[electron] Cargando ${targetURL}...`);
    win.loadURL(targetURL);
  }).catch(() => {
    win.loadURL(targetURL);
  });

  // Hard reload con Ctrl+Shift+R (ignora cache)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'R' && (input.control || input.meta) && input.shift) {
      console.log('[electron] Hard reload (Ctrl+Shift+R)');
      win.webContents.reloadIgnoringCache();
      event.preventDefault();
    }
    if (input.key === 'F5' || (input.key === 'r' && (input.control || input.meta))) {
      win.webContents.reload();
      event.preventDefault();
    }
  });

  if (isDev) {
    win.webContents.once('did-finish-load', () => {
      win.webContents.openDevTools({ mode: 'detach' });
    });
  }

  // Links externos se abren en el navegador del sistema
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAppOrigin(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // ─── MANEJO DE ERRORES Y AUTO-RECUPERACIÓN ─────────────────────────────────
  let reloadAttempts = 0;

  win.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3 || (validatedURL && validatedURL.startsWith('data:'))) return; // ERR_ABORTED / pantalla interna
    console.error(`[did-fail-load] ${errorCode}: ${errorDescription} | URL: ${validatedURL}`);

    if (reloadAttempts < 2) {
      reloadAttempts++;
      console.log('[electron] Reintentando resolver servidor activo automáticamente...');
      setTimeout(() => {
        reconnectToActiveServer();
      }, 1500);
      return;
    }

    // Inyectar pantalla visual de reconexión
    if (win && !win.isDestroyed()) {
      win.loadURL(getErrorHTML(validatedURL, errorDescription));
    }
  });

  win.webContents.on('did-finish-load', () => {
    const loadedUrl = win && !win.isDestroyed() ? win.webContents.getURL() : '';
    if (!loadedUrl || loadedUrl.startsWith('data:')) return;
    const title = win.webContents.getTitle() || '';
    if (/530|502|503|deployment.*paused|argo tunnel|error 1033|origin.*unreachable/i.test(title)) {
      console.warn(`[electron] Detectada página de error (${title}); re-resolviendo servidor activo en 5s...`);
      setTimeout(() => {
        reconnectToActiveServer();
      }, 5000);
      return;
    }
    reloadAttempts = 0;
  });

  // Si el proceso de renderizado crashea
  win.webContents.on('render-process-gone', (_, details) => {
    console.error(`[render-process-gone] reason: ${details.reason} | exitCode: ${details.exitCode}`);
    setTimeout(() => {
      reconnectToActiveServer();
    }, 2000);
  });

  // Si la pagina se congela
  win.webContents.on('unresponsive', () => {
    console.error('[unresponsive] la pagina dejo de responder, recargando...');
    setTimeout(() => {
      if (win && !win.isDestroyed()) {
        win.webContents.reload();
      }
    }, 3000);
  });
}

// ─── AUTO-ACTUALIZACIÓN ───────────────────────────────────────────────────────
function setupAutoUpdater() {
  if (isDev) return;

  try {
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
  } catch (e) {
    console.error('[updater] init error:', e);
  }
}

// ─── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.on('recargar', () => win?.webContents.reload());
ipcMain.on('reconectar-servidor', () => { reconnectToActiveServer(); });

ipcMain.on('abrir-impersonar', (_, { url, nombre }) => {
  const impWin = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    title: `Vista: ${nombre}`,
    icon: APP_ICON,
    backgroundColor: '#090d16',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      partition: `persist:imp-${nombre.replace(/\s+/g, '-').toLowerCase()}`,
    },
  });
  impWin.loadURL(url);
  impWin.webContents.setWindowOpenHandler(({ url: u }) => {
    if (!isAppOrigin(u)) { 
      shell.openExternal(u); 
      return { action: 'deny' }; 
    }
    return { action: 'allow' };
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

ipcMain.on('notificar-mensaje-interno', (_, data) => {
  if (win && (!win.isFocused() || win.isMinimized())) {
    win.flashFrame(true);
  }
  if (!Notification.isSupported()) return;
  const isGroup = data?.isGroup || data?.channelId === 'group_general';
  const sender = data?.senderName || 'Compañero';
  const notif = new Notification({
    title  : isGroup ? `👥 MENSAJE GRUPAL: ${sender}` : `💬 MENSAJE DE: ${sender}`,
    body   : data?.content || (data?.mediaUrl ? '📎 Archivo adjunto' : 'Nuevo mensaje interno'),
    icon   : APP_ICON,
  });
  notif.on('click', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      win.flashFrame(false);
    }
  });
  notif.show();
});

ipcMain.on('notificar-recordatorio', (_, data) => {
  if (win && (!win.isFocused() || win.isMinimized())) {
    win.flashFrame(true);
  }
  if (!Notification.isSupported()) return;

  const tipo = data?.tipo || 'tarea'; // 'tarea_asignada' | 'tarea_vencida' | 'evento_proximo' | 'recordatorio'
  let titulo = '⏰ RECORDATORIO DE AGENDA';
  if (tipo === 'tarea_asignada') {
    titulo = '📌 NUEVA TAREA ASIGNADA';
  } else if (tipo === 'evento_proximo') {
    titulo = '📅 REUNIÓN / EVENTO PROGRAMADO';
  } else if (tipo === 'tarea_vencida') {
    titulo = '⚠️ TAREA PENDIENTE / VENCIMIENTO';
  }

  const notif = new Notification({
    title  : titulo,
    body   : `${data?.titulo || 'Recordatorio'}${data?.detalle ? `\n${data.detalle}` : ''}`,
    icon   : APP_ICON,
    urgency: 'critical',
  });

  notif.on('click', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      win.flashFrame(false);
    }
  });
  notif.show();
});

// ─── APP READY ────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' http: https: ws: wss: data: blob:;"
        ],
      },
    });
  });

  await createWindow();
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
        { label: '🔄 Reconectar al servidor', click: () => reconnectToActiveServer() },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        { role: 'zoomIn',    label: 'Acercar',     accelerator: 'CmdOrCtrl+=' },
        { role: 'zoomOut',   label: 'Alejar',      accelerator: 'CmdOrCtrl+-' },
        { role: 'resetZoom', label: 'Zoom normal', accelerator: 'CmdOrCtrl+0' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Consola (DevTools)', accelerator: 'F12' },
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