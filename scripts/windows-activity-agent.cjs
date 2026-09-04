const { createClient } = require('@supabase/supabase-js');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: 'C:\\Users\\Taller SK\\Documents\\PROYECTOS\\Chat de Atención Sekunet\\.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ps1Path = path.join(__dirname, 'get_active_win.ps1');

function categorizeWindow(processName, title) {
  const p = (processName || '').toLowerCase();
  const t = (title || '').toLowerCase();

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
    return { category: 'Mensajería', label: 'WhatsApp', context, context_type };
  }
  if (p.includes('linkus') || t.includes('linkus') || p.includes('grandstream') || p.includes('microip') || p.includes('zoiper') || p.includes('3cx')) {
    let label = 'Linkus (Softphone)';
    if (t.includes('calling') || t.includes('llamando') || t.includes('dialing')) label = 'Linkus - Llamada saliente';
    else if (t.includes('incoming') || t.includes('entrante') || t.includes('ringing') || t.includes('timbrando')) label = 'Linkus - Llamada entrante';
    else if (t.includes('connected') || t.includes('conectado') || t.includes('talking') || t.includes('hablando') || t.includes('in call') || t.includes('en llamada')) label = 'Linkus - En llamada';
    return { category: 'Atención telefónica', label, context, context_type: 'call' };
  }
  if (p.includes('chrome') || p.includes('msedge') || p.includes('edge') || p.includes('brave') || p.includes('firefox') || p.includes('opera')) {
    context = t.replace(/\s*[-–]\s*(Brave|Google Chrome|Microsoft Edge|Firefox|Opera).*$/i, '').trim();
    context_type = 'web';
    if (t.includes('odoo')) return { category: 'Atención de tickets', label: 'Odoo ERP', context, context_type };
    if (t.includes('tienda 3d') || t.includes('tienda3d') || t.includes('rma') || t.includes('garantía') || t.includes('garantia')) {
      return { category: 'Trámites de garantías', label: `Garantías Tienda 3D - ${title.substring(0, 40)}`, context, context_type };
    }
    if (t.includes('sekunet') || t.includes('seka chat') || t.includes('localhost:3100')) {
      return { category: 'Operativa', label: 'Seka Chat', context, context_type };
    }
    if (t.includes('youtube')) return { category: 'No Laboral', label: `YouTube - ${title.substring(0, 40)}`, context, context_type };
    if (t.includes('facebook') || t.includes('instagram') || t.includes('tiktok') || t.includes('twitter') || t.includes('x.com')) {
      return { category: 'No Laboral', label: `Redes Sociales - ${title.substring(0, 30)}`, context, context_type };
    }
    if (t.includes('github') || t.includes('stackoverflow') || t.includes('docs.') || t.includes('developer') || t.includes('npmjs')) {
      return { category: 'Investigación y desarrollo', label: `Documentación - ${title.substring(0, 40)}`, context, context_type };
    }
    const cleanTitle = title.split(' - ')[0] || title;
    return { category: 'Navegación Web', label: `Navegador: ${cleanTitle.substring(0, 45)}`, context, context_type };
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
    return { category: 'Gestión de archivos', label: `Explorador: ${title.substring(0, 35)}`, context, context_type: 'folder' };
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

const exePath = path.join(__dirname, 'get-active-win.exe');

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
const HEARTBEAT_INTERVAL = 300000;  // 5 minutos (300s) para puntos de control

async function poll() {
  try {
    const win = await getActiveWindow();
    if (!win) return;

    const procName = win.Process || 'Unknown';
    const title = win.Title || '';
    const now = Date.now();

    if (procName === 'Idle' || procName === 'LockApp' || procName === 'ScreenClippingHost' || !title) {
      return;
    }

    const { category, label, context, context_type } = categorizeWindow(procName, title);

    if (label !== _lastLabel || (title !== _lastTitle && Math.abs(now - _enterTime) > 30000)) {
      const dwellMs = now - _enterTime;
      
      // Registrar la sesión concluida si superó el mínimo (15s)
      if (_lastLabel && dwellMs >= MIN_SESSION_MS) {
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
      _lastLabel = label;
      _lastCategory = category;
      _lastContext = context;
      _lastContextType = context_type;
      _enterTime = now;
      _lastHeartbeat = now;
    } else {
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