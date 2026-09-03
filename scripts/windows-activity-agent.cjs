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

  if (p.includes('outlook') || p.includes('thunderbird') || p.includes('hxoutlook') || p.includes('mail') || t.includes('correo') || t.includes('- outlook') || t.includes('gmail') || t.includes('webmail')) {
    return { category: 'Gestión de correos', label: 'Correo / Outlook' };
  }
  if (p.includes('whatsapp') || t.includes('whatsapp')) {
    return { category: 'Mensajería', label: 'WhatsApp' };
  }
  if (p.includes('linkus') || t.includes('linkus') || p.includes('grandstream') || p.includes('microip') || p.includes('zoiper') || p.includes('3cx')) {
    let label = 'Linkus (Softphone)';
    if (t.includes('calling') || t.includes('llamando') || t.includes('dialing')) label = 'Linkus - Llamada saliente';
    else if (t.includes('incoming') || t.includes('entrante') || t.includes('ringing') || t.includes('timbrando')) label = 'Linkus - Llamada entrante';
    else if (t.includes('connected') || t.includes('conectado') || t.includes('talking') || t.includes('hablando') || t.includes('in call') || t.includes('en llamada')) label = 'Linkus - En llamada';
    return { category: 'Atención telefónica', label };
  }
  if (p.includes('chrome') || p.includes('msedge') || p.includes('edge') || p.includes('brave') || p.includes('firefox') || p.includes('opera')) {
    if (t.includes('odoo')) return { category: 'Atención de tickets', label: 'Odoo ERP' };
    if (t.includes('tienda 3d') || t.includes('tienda3d') || t.includes('rma') || t.includes('garantía') || t.includes('garantia')) {
      return { category: 'Trámites de garantías', label: `Garantías Tienda 3D - ${title.substring(0, 40)}` };
    }
    if (t.includes('sekunet') || t.includes('seka chat') || t.includes('localhost:3100')) {
      return { category: 'Operativa', label: 'Seka Chat' };
    }
    if (t.includes('youtube')) return { category: 'No Laboral', label: `YouTube - ${title.substring(0, 40)}` };
    if (t.includes('facebook') || t.includes('instagram') || t.includes('tiktok') || t.includes('twitter') || t.includes('x.com')) {
      return { category: 'No Laboral', label: `Redes Sociales - ${title.substring(0, 30)}` };
    }
    if (t.includes('github') || t.includes('stackoverflow') || t.includes('docs.') || t.includes('developer') || t.includes('npmjs')) {
      return { category: 'Investigación y desarrollo', label: `Documentación - ${title.substring(0, 40)}` };
    }
    const cleanTitle = title.split(' - ')[0] || title;
    return { category: 'Navegación Web', label: `Navegador: ${cleanTitle.substring(0, 45)}` };
  }
  if (p.includes('excel')) return { category: 'Gestión de documentos', label: `Excel - ${title.substring(0, 40)}` };
  if (p.includes('winword') || p.includes('word')) return { category: 'Gestión de documentos', label: `Word - ${title.substring(0, 40)}` };
  if (p.includes('powerpnt')) return { category: 'Gestión de documentos', label: `PowerPoint - ${title.substring(0, 40)}` };
  if (p.includes('code') || p.includes('cursor') || p.includes('windsurf') || p.includes('devenv') || p.includes('antigravity')) {
    return { category: 'Investigación y desarrollo', label: `Editor de Código (${p.includes('antigravity') ? 'Antigravity' : p})` };
  }
  if (p.includes('powershell') || p.includes('cmd') || p.includes('windowsterminal')) {
    return { category: 'Investigación y desarrollo', label: 'Terminal de Comandos' };
  }
  if (p.includes('odoo') || t.includes('odoo')) return { category: 'Atención de tickets', label: 'Odoo' };
  if (p.includes('explorer')) return { category: 'Gestión de archivos', label: `Explorador: ${title.substring(0, 35)}` };
  if (p.includes('anydesk') || p.includes('teamviewer') || p.includes('mstsc') || p.includes('rustdesk')) {
    return { category: 'Soporte remoto', label: `Soporte Remoto (${p})` };
  }

  return { category: 'Operativa', label: title ? `${p} - ${title.substring(0, 35)}` : (processName || 'Aplicación de Windows') };
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
const AGENT_EMAIL = process.env.ADMIN_DEFAULT_EMAIL || 'cbatista@sekunet.com';
const AGENT_NAME = 'César Andrés Batista';

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

    const { category, label } = categorizeWindow(procName, title);

    if (label !== _lastLabel || (title !== _lastTitle && Math.abs(now - _enterTime) > 10000)) {
      const dwellMs = now - _enterTime;
      if (_lastLabel && dwellMs >= 5000) {
        await supabase.from('activity_log').insert({
          agent_email: AGENT_EMAIL,
          agent_name: AGENT_NAME,
          action: `Usó "${_lastLabel}" durante ${Math.round(dwellMs/1000)}s${_lastTitle ? ` (${_lastTitle.substring(0, 50)})` : ''}`,
          category: categorizeWindow(_lastProcess, _lastTitle).category,
          duration_ms: dwellMs,
          metadata: {
            app_name: _lastLabel,
            label: _lastLabel,
            process: _lastProcess,
            title: _lastTitle,
            source: 'desktop',
            duration_seconds: Math.round(dwellMs/1000)
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
          source: 'desktop'
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