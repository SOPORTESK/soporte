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
let _enterTime = Date.now();
let _lastHeartbeat = Date.now();

const args = process.argv.slice(2);
const getArg = (name) => {
  const found = args.find(a => a.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : null;
};
const AGENT_EMAIL = getArg('agent') || process.env.ADMIN_DEFAULT_EMAIL || 'cbatista@sekunet.com';
const AGENT_NAME = getArg('name') || process.env.ADMIN_DEFAULT_NAME || 'César Andrés Batista';

console.log(`[Windows Agent] Corriendo para ${AGENT_EMAIL} (${AGENT_NAME})`);

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

    if (label !== _lastLabel || (title !== _lastTitle && Math.abs(now - _enterTime) > 10000)) {
      const dwellMs = now - _enterTime;
      if (_lastLabel && dwellMs >= 5000) {
        const lastCatInfo = categorizeWindow(_lastProcess, _lastTitle);
        await supabase.from('activity_log').insert({
          agent_email: AGENT_EMAIL,
          agent_name: AGENT_NAME,
          action: `Usó "${_lastLabel}" durante ${Math.round(dwellMs/1000)}s${_lastTitle ? ` (${_lastTitle.substring(0, 50)})` : ''}`,
          category: lastCatInfo.category,
          duration_ms: dwellMs,
          metadata: {
            app_name: _lastLabel,
            label: _lastLabel,
            process: _lastProcess,
            title: _lastTitle,
            source: 'desktop',
            duration_seconds: Math.round(dwellMs/1000),
            context: lastCatInfo.context,
            context_type: lastCatInfo.context_type
          }
        });
        console.log(`[Windows Agent] [Dwell] ${_lastLabel} (${Math.round(dwellMs/1000)}s)`);
      }

      await supabase.from('activity_log').insert({
        agent_email: AGENT_EMAIL,
        agent_name: AGENT_NAME,
        action: `Abrió / Cambió a "${label}"${title ? ` — ${title.substring(0, 50)}` : ''}`,
        category,
        duration_ms: 0,
        metadata: {
          app_name: label,
          label,
          process: procName,
          title,
          source: 'desktop',
          context,
          context_type
        }
      });
      console.log(`[Windows Agent] [Entrada] ${label} (${category}) — ${title.substring(0, 40)}`);

      _lastProcess = procName;
      _lastTitle = title;
      _lastLabel = label;
      _enterTime = now;
      _lastHeartbeat = now;
    } else {
      if (now - _lastHeartbeat >= 60000) {
        _lastHeartbeat = now;
        const dwellSec = Math.round((now - _enterTime) / 1000);
        await supabase.from('activity_log').insert({
          agent_email: AGENT_EMAIL,
          agent_name: AGENT_NAME,
          action: `Sigue usando "${label}" (lleva ${Math.round(dwellSec/60)}m)${title ? ` — ${title.substring(0, 50)}` : ''}`,
          category,
          duration_ms: 60000,
          metadata: {
            app_name: label,
            label,
            process: procName,
            title,
            source: 'desktop',
            dwell_seconds: dwellSec
          }
        });
        console.log(`[Windows Agent] [Heartbeat] ${label}`);
      }
    }
  } catch (e) {
    console.error('[Windows Agent] Error:', e.message);
  }
}

setInterval(poll, 3000);
poll();