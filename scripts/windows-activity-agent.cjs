const { createClient } = require('@supabase/supabase-js');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: 'C:\\Users\\Taller SK\\Documents\\PROYECTOS\\Chat de Atención Sekunet\\.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ps1Path = path.join(__dirname, 'get_active_win.ps1');

function categorizeWindow(processName, title, url = '') {
  const p = (processName || '').toLowerCase();
  const t = (title || '').toLowerCase();
  const u = (url || '').toLowerCase();

  let context = t;
  let context_type = 'app';

  if (p.includes('outlook') || p.includes('thunderbird') || p.includes('hxoutlook') || p.includes('mail')) {
    const match = t.match(/^(.+?)\s*[-–]\s*.*outlook/i);
    context = match ? match[1].trim() : t;
    context_type = 'email';
    return { category: 'Gestión de correos', label: 'Correo / Outlook', context, context_type };
  }
  if (p.includes('whatsapp') || t.includes('whatsapp')) {
    context = t.replace(/\s*[-–]\s*WhatsApp.*$/i, '').trim();
    context_type = 'chat';
    return { category: 'Soporte Mensajería', label: 'WhatsApp', context, context_type };
  }
  if (p.includes('linkus') || t.includes('linkus') || p.includes('grandstream') || p.includes('microip') || p.includes('zoiper') || p.includes('3cx')) {
    let label = 'Linkus (Softphone)';
    if (t.includes('calling') || t.includes('llamando') || t.includes('dialing')) label = 'Linkus - Llamada saliente';
    else if (t.includes('incoming') || t.includes('entrante') || t.includes('ringing') || t.includes('timbrando')) label = 'Linkus - Llamada entrante';
    else if (t.includes('connected') || t.includes('conectado') || t.includes('talking') || t.includes('hablando') || t.includes('in call') || t.includes('en llamada')) label = 'Linkus - En llamada';
    return { category: 'Soporte Telefónico', label, context, context_type: 'call' };
  }
  if (p.includes('chrome') || p.includes('msedge') || p.includes('edge') || p.includes('brave') || p.includes('firefox') || p.includes('opera')) {
    // 1. Quitar sufijo del navegador
    let cleanContext = (title || '').replace(/\s*[-–—]\s*(Brave|Google Chrome|Microsoft Edge|Firefox|Opera).*$/i, '').trim();
    // 2. Quitar prefijo de badges de notificación como (1) , (43) , *
    cleanContext = cleanContext.replace(/^\(\d+\+?\)\s*/, '').replace(/^\*\s*/, '').trim();
    context = cleanContext;
    context_type = 'web';
    const lowerClean = cleanContext.toLowerCase();

    // Detección directa por URL
    if (u) {
      if (u.includes('odoo')) return { category: 'Atención de tickets', label: 'Odoo ERP', context: cleanContext || 'Odoo ERP', context_type };
      if (u.includes('localhost:3100') || u.includes('sekunet.com')) return { category: 'Operativa', label: 'Seka Chat', context: cleanContext || 'Seka Chat', context_type };
      if (u.includes('hikvision') || u.includes('hik-partner') || u.includes('cloudsso')) return { category: 'Soporte', label: 'Hikvision', context: cleanContext || 'Hikvision', context_type };
      if (u.includes('supabase')) return { category: 'Control Administrativo', label: 'Supabase', context: 'Consola Supabase', context_type };
      if (u.includes('youtube')) return { category: 'No Laboral', label: 'YouTube', context: cleanContext, context_type };
      if (u.includes('facebook') || u.includes('instagram') || u.includes('tiktok') || u.includes('twitter') || u.includes('x.com')) return { category: 'No Laboral', label: 'Redes Sociales', context: cleanContext, context_type };
      if (u.includes('github') || u.includes('stackoverflow')) return { category: 'Investigación y desarrollo', label: 'Documentación / GitHub', context: cleanContext, context_type };
    }

    // Odoo ERP (tickets #04xxx, cotizaciones, presupuestos, portal Odoo, pedidos S1xxxx)
    if (
      lowerClean.includes('odoo') ||
      /#\d{4,6}/.test(lowerClean) ||
      lowerClean.includes('cotizaciones') ||
      lowerClean.includes('presupuesto') ||
      /\b[sS]\d{5}\b/.test(lowerClean)
    ) {
      return { category: 'Atención de tickets', label: 'Odoo ERP', context: cleanContext || 'Odoo ERP', context_type };
    }

    if (lowerClean.includes('google one') || lowerClean.includes('one.google')) {
      return { category: 'Utilidades', label: 'Google One', context: 'Google One', context_type: 'web' };
    }
    if (lowerClean.includes('supabase')) {
      return { category: 'Control Administrativo', label: 'Supabase', context: 'Supabase', context_type: 'web' };
    }
    if (lowerClean.includes('tienda 3d') || lowerClean.includes('tienda3d') || (lowerClean.includes('rma') && lowerClean.includes('garant'))) {
      return { category: 'Trámites de garantías', label: `Garantías Tienda 3D`, context: cleanContext, context_type };
    }
    if (
      lowerClean.includes('sekunet') ||
      lowerClean.includes('seka chat') ||
      lowerClean.includes('localhost:3100') ||
      lowerClean.includes('atención al cliente') ||
      lowerClean.includes('chat sekunet') ||
      lowerClean.includes('mi bandeja de gestión')
    ) {
      return { category: 'Operativa', label: 'Seka Chat', context: cleanContext, context_type };
    }
    if (lowerClean.includes('youtube')) return { category: 'No Laboral', label: 'YouTube', context: cleanContext, context_type };
    if (lowerClean.includes('facebook') || lowerClean.includes('instagram') || lowerClean.includes('tiktok') || lowerClean.includes('twitter') || lowerClean.includes('x.com')) {
      return { category: 'No Laboral', label: 'Redes Sociales', context: cleanContext, context_type };
    }
    if (lowerClean.includes('github') || lowerClean.includes('stackoverflow') || lowerClean.includes('docs.') || lowerClean.includes('developer') || lowerClean.includes('npmjs')) {
      return { category: 'Investigación y desarrollo', label: 'Documentación / GitHub', context: cleanContext, context_type };
    }
    if (lowerClean.includes('buscar con google') || lowerClean.includes('google search') || lowerClean.includes('google.com/search')) {
      return { category: 'Utilidades', label: 'Búsqueda en Google', context: 'Búsqueda en Google', context_type };
    }
    if (lowerClean.includes('hikvision') || lowerClean.includes('hik-partner') || lowerClean.includes('cloudsso') || lowerClean.includes('hik-connect')) {
      return { category: 'Soporte', label: 'Hikvision', context: cleanContext, context_type };
    }

    // TÍTULOS GENÉRICOS O NAVEGACIÓN WEB GENERAL:
    const genericWebTitles = [
      'nuevo', 'nueva pestaña', 'new tab', 'iniciar sesión', 'iniciar sesion',
      'login', 'sign in', 'acceso', 'acceder', 'sin título', 'sin titulo',
      'bienvenido', 'home', 'inicio', 'configuración', 'configuracion',
      '500: internal server error', 'error'
    ];
    if (genericWebTitles.includes(lowerClean) || genericWebTitles.some(g => lowerClean === g || lowerClean.startsWith(g + ' '))) {
      return { category: 'Utilidades', label: 'Navegador Web', context: cleanContext || 'Navegación Web', context_type };
    }

    // Si hay URL capturada, usar el dominio limpio como nombre de software
    if (url) {
      try {
        const uObj = new URL(url.startsWith('http') ? url : `https://${url}`);
        const domain = uObj.hostname.replace(/^www\./, '');
        return { category: 'Utilidades', label: domain, context: cleanContext || domain, context_type };
      } catch {}
    }

    const cleanTitle = cleanContext.split(' - ')[0] || cleanContext;
    return { category: 'Utilidades', label: cleanTitle.substring(0, 45).trim() || 'Navegador Web', context, context_type };
  }
  if (p.includes('spotify') || t.includes('spotify')) {
    return { category: 'Utilidades', label: 'Spotify', context, context_type: 'music' };
  }
  if (p.includes('calc') || t.includes('calculadora')) {
    return { category: 'Utilidades', label: 'Calculadora', context, context_type: 'app' };
  }
  if (p.includes('notepad') || t.includes('bloc de notas')) {
    return { category: 'Utilidades', label: 'Bloc de notas', context, context_type: 'app' };
  }
  if (p.includes('excel')) {
    context = t.replace(/\s*[-–]\s*(Microsoft\s*)?Excel.*$/i, '').trim();
    return { category: 'Gestión de documentos', label: `Excel - ${title.substring(0, 40)}`, context, context_type: 'document' };
  }
  if (p.includes('winword') || p.includes('word')) {
    context = t.replace(/\s*[-–]\s*(Microsoft\s*)?Word.*$/i, '').trim();
    return { category: 'Gestión de documentos', label: `Word - ${title.substring(0, 40)}`, context, context_type: 'document' };
  }
  if (p.includes('powerpnt')) return { category: 'Gestión de documentos', label: `PowerPoint - ${title.substring(0, 40)}`, context, context_type: 'document' };
  if (p.includes('code') || p.includes('cursor') || p.includes('windsurf') || p.includes('devenv') || p.includes('antigravity')) {
    return { category: 'Investigación y desarrollo', label: `Editor de Código (${p.includes('antigravity') ? 'Antigravity' : p})`, context, context_type: 'code' };
  }
  if (p.includes('powershell') || p.includes('cmd') || p.includes('windowsterminal')) {
    return { category: 'Investigación y desarrollo', label: 'Terminal de Comandos', context, context_type: 'terminal' };
  }
  if (p.includes('odoo') || t.includes('odoo')) return { category: 'Atención de tickets', label: 'Odoo', context, context_type };
  if (p.includes('explorer')) {
    if (t.includes('program manager')) {
      return { category: 'Utilidades', label: 'Escritorio de Windows', context: 'Escritorio', context_type: 'system' };
    }
    if (t.includes('conmutac') || t.includes('task switching')) {
      return { category: 'Utilidades', label: 'Conmutación de tareas', context: 'Alt+Tab', context_type: 'system' };
    }
    return { category: 'Gestión de archivos', label: `Explorador de Windows: ${title.substring(0, 35)}`, context, context_type: 'folder' };
  }
  if (p.includes('anydesk') || p.includes('teamviewer') || p.includes('mstsc') || p.includes('rustdesk')) {
    return { category: 'Soporte remoto', label: `Soporte Remoto (${p})`, context, context_type };
  }

  return { category: 'Operativa', label: title ? `${p} - ${title.substring(0, 35)}` : (processName || 'Aplicación de Windows'), context, context_type };
}

function formatExecutiveDuration(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) {
    const sec = Math.round(ms / 1000);
    return `${sec}s`;
  }
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const remM = min % 60;
  return remM > 0 ? `${h}h ${remM}min` : `${h}h`;
}

function formatExecutiveAction(category, label, context, durationMs) {
  const durStr = durationMs > 0 ? ` (${formatExecutiveDuration(durationMs)})` : '';
  const cleanContext = (context || '').replace(/\s+/g, ' ').trim();
  
  if (category === 'Gestión de Correos') {
    return cleanContext && !cleanContext.toLowerCase().includes('outlook') 
      ? `Gestión de Correo: "${cleanContext}"${durStr}`
      : `Gestión de Correos / Outlook${durStr}`;
  }
  if (category === 'Atención por llamada') {
    return `Atención Telefónica: ${label}${cleanContext ? ` — ${cleanContext}` : ''}${durStr}`;
  }
  if (category === 'Atención chat' || category === 'Mensajería') {
    return cleanContext 
      ? `Atención por Chat: WhatsApp — ${cleanContext}${durStr}`
      : `Atención por Chat: WhatsApp${durStr}`;
  }
  if (category === 'Atención de Tickets') {
    return cleanContext 
      ? `Atención de Tickets: ${cleanContext}${durStr}`
      : `Atención de Tickets: Odoo ERP${durStr}`;
  }
  if (category === 'Gestión de Garantías' || category === 'Trámites de garantías') {
    return cleanContext 
      ? `Gestión de Garantías: ${cleanContext}${durStr}`
      : `Gestión de Garantías: Tienda 3D${durStr}`;
  }
  if (category === 'Optimización de procesos' || category === 'Investigación y desarrollo') {
    return cleanContext 
      ? `Optimización / Desarrollo: ${label} — ${cleanContext}${durStr}`
      : `Optimización de Procesos: ${label}${durStr}`;
  }
  if (category === 'Control administrativo' || category === 'Gestión de documentos') {
    return cleanContext 
      ? `Control Administrativo: ${label} — ${cleanContext}${durStr}`
      : `Control Administrativo: ${label}${durStr}`;
  }
  if (category === 'Soporte técnico' || category === 'Soporte remoto') {
    return `Soporte Técnico: ${label}${cleanContext ? ` — ${cleanContext}` : ''}${durStr}`;
  }
  if (category === 'Entretenimiento' || category === 'No Laboral') {
    return `Pausa / Entretenimiento: ${label}${cleanContext ? ` — ${cleanContext}` : ''}${durStr}`;
  }
  if (category === 'Inactividad') {
    return `Pausa / Inactividad del sistema${durStr}`;
  }
  return cleanContext 
    ? `${label}: ${cleanContext}${durStr}`
    : `${label}${durStr}`;
}

const exeCandidates = [
  path.join(__dirname, 'get-active-win-url.exe'),
  path.join(__dirname, 'get-active-win.exe')
];
const exePath = exeCandidates.find(p => fs.existsSync(p)) || exeCandidates[1];

function getActiveWindow() {
  return new Promise((resolve) => {
    execFile(exePath, { timeout: 2000, windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      try {
        const data = JSON.parse(stdout.trim());
        resolve(data);
      } catch {
        resolve(null);
      }
    });
  });
}

let _lastProcess = '';
let _lastTitle = '';
let _lastUrl = '';
let _lastLabel = '';
let _lastCategory = '';
let _lastContext = '';
let _lastContextType = '';
let _enterTime = Date.now();
let _lastHeartbeat = Date.now();

const args = process.argv.slice(2);
const getArg = (name) => {
  const found = args.find(a => a.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : null;
};
const AGENT_EMAIL = getArg('agent') || process.env.ADMIN_DEFAULT_EMAIL || 'cbatista@sekunet.com';
const AGENT_NAME = getArg('name') || process.env.ADMIN_DEFAULT_NAME || 'César Andrés Batista';

console.log(`[Windows Agent] Corriendo para ${AGENT_EMAIL} (${AGENT_NAME}) - Modo Informe Ejecutivo (5 min)`);

const MIN_SESSION_MS = 15000;       // Mínimo 15s para consolidar tarea completada
const HEARTBEAT_INTERVAL = 60000;   // 1 minuto (60s) para puntos de control continuo

let _cachedSchedule = null;
let _lastScheduleFetch = 0;

async function getEffectiveSchedule(agentEmail) {
  const now = Date.now();
  if (_cachedSchedule && (now - _lastScheduleFetch < 60000)) {
    return _cachedSchedule;
  }
  try {
    const { data } = await supabase
      .from('sek_app_settings')
      .select('value')
      .eq('key', 'activity_work_schedule')
      .maybeSingle();

    if (data && data.value) {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      const normalizedEmail = (agentEmail || '').trim().toLowerCase();
      const custom = parsed.agentSchedules ? parsed.agentSchedules[normalizedEmail] : null;

      if (custom && custom.custom) {
        _cachedSchedule = {
          scheduleStart: custom.scheduleStart || parsed.scheduleStart || '08:00',
          scheduleEnd: custom.scheduleEnd || parsed.scheduleEnd || '17:00',
          scheduleEnabled: custom.scheduleEnabled !== undefined ? Boolean(custom.scheduleEnabled) : (parsed.scheduleEnabled !== false),
          workDays: Array.isArray(custom.workDays) && custom.workDays.length > 0 ? custom.workDays : (parsed.workDays || [1, 2, 3, 4, 5]),
          useMixedSchedule: Boolean(custom.useMixedSchedule !== undefined ? custom.useMixedSchedule : parsed.useMixedSchedule),
          daySchedules: custom.daySchedules || parsed.daySchedules || undefined,
          isCustom: true,
        };
      } else {
        _cachedSchedule = {
          scheduleStart: parsed.scheduleStart || '08:00',
          scheduleEnd: parsed.scheduleEnd || '17:00',
          scheduleEnabled: parsed.scheduleEnabled !== undefined ? Boolean(parsed.scheduleEnabled) : true,
          workDays: Array.isArray(parsed.workDays) && parsed.workDays.length > 0 ? parsed.workDays : [1, 2, 3, 4, 5],
          useMixedSchedule: Boolean(parsed.useMixedSchedule),
          daySchedules: parsed.daySchedules || undefined,
          isCustom: false,
        };
      }
      _lastScheduleFetch = now;
      return _cachedSchedule;
    }
  } catch (err) {
    console.error('[Windows Agent] Error fetching schedule:', err.message);
  }
  return {
    scheduleStart: '08:00',
    scheduleEnd: '17:00',
    scheduleEnabled: true,
    workDays: [1, 2, 3, 4, 5],
    isCustom: false,
  };
}

function isWithinSchedule(sched) {
  if (!sched || !sched.scheduleEnabled) return true;
  const nowCostaRica = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Costa_Rica' }));
  const day = nowCostaRica.getDay();
  if (Array.isArray(sched.workDays) && !sched.workDays.includes(day)) return false;

  let sStart = sched.scheduleStart || '08:00';
  let sEnd = sched.scheduleEnd || '17:00';

  if (sched.useMixedSchedule && sched.daySchedules && sched.daySchedules[day]) {
    const ds = sched.daySchedules[day];
    if (ds.start) sStart = ds.start;
    if (ds.end) sEnd = ds.end;
  }

  const [startH, startM] = sStart.split(':').map(Number);
  const [endH, endM] = sEnd.split(':').map(Number);

  const curMin = nowCostaRica.getHours() * 60 + nowCostaRica.getMinutes();
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;

  if (startMin <= endMin) {
    return curMin >= startMin && curMin <= endMin;
  }
  // Turno nocturno que cruza la medianoche (ej: 22:00 a 05:00)
  return curMin >= startMin || curMin <= endMin;
}

let _lastManualTaskCheck = 0;
let _hasActiveManualTask = false;

async function checkActiveManualTask(agentEmail) {
  const now = Date.now();
  if (now - _lastManualTaskCheck < 15000) return _hasActiveManualTask;
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('activity_log')
      .select('action, metadata, created_at')
      .eq('agent_email', agentEmail)
      .gte('created_at', `${today}T00:00:00`)
      .order('created_at', { ascending: false })
      .limit(10);

    _lastManualTaskCheck = now;
    if (!data || data.length === 0) {
      _hasActiveManualTask = false;
      return false;
    }
    for (const it of data) {
      const act = (it.action || '').toLowerCase();
      const meta = it.metadata || {};
      const isEnd = act.startsWith('terminó:') || act.startsWith('termino:');
      const isStart = (act.startsWith('inició:') || act.startsWith('inicio:')) && (meta.manual || meta.task);
      if (isEnd) {
        _hasActiveManualTask = false;
        return false;
      }
      if (isStart) {
        const startMs = new Date(it.created_at).getTime();
        _hasActiveManualTask = (Date.now() - startMs < 10 * 3600 * 1000);
        return _hasActiveManualTask;
      }
    }
    _hasActiveManualTask = false;
    return false;
  } catch {
    return false;
  }
}

async function poll() {
  try {
    // 1. Validar jerarquía de horario: Empleado individual -> Horario operativo global
    const sched = await getEffectiveSchedule(AGENT_EMAIL);
    if (!isWithinSchedule(sched)) {
      // Al salir de horario, reiniciar estado para que no acumule tiempo nocturno
      _enterTime = 0;
      _lastLabel = '';
      _lastTitle = '';
      _lastProcess = '';
      return;
    }

    // Al reingresar al horario o tras una pausa prolongada, reiniciar enterTime
    if (!_enterTime || (Date.now() - _enterTime > 2 * 3600 * 1000)) {
      _enterTime = Date.now();
    }

    // 2. Si el agente tiene labor manual activa (almuerzo, taller, etc.), no registrar ventanas de PC
    const hasManual = await checkActiveManualTask(AGENT_EMAIL);
    if (hasManual) {
      _enterTime = Date.now();
      return;
    }

    const win = await getActiveWindow();
    if (!win) return;

    const procName = win.Process || 'Unknown';
    const title = win.Title || '';
    const url = win.URL || '';
    const now = Date.now();

    const pLower = procName.toLowerCase();
    const tLower = title.toLowerCase();

    if (
      procName === 'Idle' ||
      procName === 'LockApp' ||
      procName === 'ScreenClippingHost' ||
      pLower.endsWith('.scr') ||
      pLower.includes('mystify') ||
      pLower.includes('scrnsave') ||
      tLower.includes('mystify') ||
      !title
    ) {
      // Reiniciar enterTime para que el protector de pantalla o bloqueo no acumule horas fantasma
      _enterTime = now;
      _lastLabel = '';
      _lastTitle = '';
      _lastUrl = '';
      return;
    }

    const { category, label, context, context_type } = categorizeWindow(procName, title, url);

    if (label !== _lastLabel || (title !== _lastTitle && Math.abs(now - _enterTime) > 30000)) {
      const rawDwell = now - _enterTime;
      // Tope de seguridad: ninguna ventana continua puede acumular más de 30 min en un solo bloque
      const dwellMs = Math.min(rawDwell, 30 * 60 * 1000);
      
      const minDwell = _lastContextType === 'system' ? 60000 : MIN_SESSION_MS;
      if (_lastLabel && dwellMs >= minDwell) {
        const execAction = formatExecutiveAction(_lastCategory, _lastLabel, _lastContext, dwellMs);
        await supabase.from('activity_log').insert({
          agent_email: AGENT_EMAIL,
          agent_name: AGENT_NAME,
          action: execAction,
          category: _lastCategory,
          duration_ms: dwellMs,
          metadata: {
            app_name: _lastLabel,
            label: _lastLabel,
            process: _lastProcess,
            title: _lastTitle,
            url: _lastUrl || undefined,
            source: 'desktop',
            duration_seconds: Math.round(dwellMs / 1000),
            context: _lastContext,
            context_type: _lastContextType,
            executive_report: true
          }
        });
        console.log(`[Windows Agent] [Informe] ${execAction}`);
      }

      _lastProcess = procName;
      _lastTitle = title;
      _lastUrl = url;
      _lastLabel = label;
      _lastCategory = category;
      _lastContext = context;
      _lastContextType = context_type;
      _enterTime = now;
      _lastHeartbeat = now;
    } else {
      // Actualizar URL si se navegó dentro de la misma app/pestaña
      if (url && url !== _lastUrl) {
        _lastUrl = url;
      }
      // Punto de control cada 5 minutos continuos
      if (now - _lastHeartbeat >= HEARTBEAT_INTERVAL) {
        _lastHeartbeat = now;
        const dwellMs = now - _enterTime;
        const execAction = `En curso • ${formatExecutiveAction(category, label, context, dwellMs)}`;
        await supabase.from('activity_log').insert({
          agent_email: AGENT_EMAIL,
          agent_name: AGENT_NAME,
          action: execAction,
          category,
          duration_ms: HEARTBEAT_INTERVAL,
          metadata: {
            app_name: label,
            label,
            process: procName,
            title,
            url: url || _lastUrl || undefined,
            source: 'desktop',
            dwell_seconds: Math.round(dwellMs / 1000),
            context,
            context_type,
            checkpoint_5min: true
          }
        });
        console.log(`[Windows Agent] [Control 5min] ${execAction}`);
      }
    }
  } catch (e) {
    console.error('[Windows Agent] Error:', e.message);
  }
}

setInterval(poll, 3000);
poll();

// Motor autónomo de auto-cierre conectado a PM2 (respeta estrictamente la configuración del panel)
const { runAutoClose } = require('./auto-close-engine.cjs');
setInterval(() => {
  runAutoClose().catch(err => console.error('[AutoClose Engine] Error:', err.message));
}, 30000);
// Ejecutar una pasada inicial
runAutoClose().catch(() => {});