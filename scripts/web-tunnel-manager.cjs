require('./dns-boost.cjs');

const { spawn, execFile } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const ROOT_DIR = path.join(__dirname, '..');
dotenv.config({ path: path.join(ROOT_DIR, '.env.local') });

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kzcyxeracvfxynddyjld.supabase.co').replace(/\/$/, '');
const SUPABASE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUxMTk1NCwiZXhwIjoyMDkxMDg3OTU0fQ.GlF4Zieqqc1V1IAPshPFKb1QzKBBbO8n1RGK_wG_JuM'
).trim();

const LOCAL_APP_URL = 'http://127.0.0.1:3100';
const METRICS_ADDR = '127.0.0.1:28083';
const METRICS_URL = `http://${METRICS_ADDR}/metrics`;
const CLOUDFLARED_EXE = path.join(ROOT_DIR, 'cloudflared.exe');
const SETTING_KEY = 'active_app_server';

let child = null;
let currentTunnelUrl = '';
let lastSyncedUrl = '';
let lastSyncTime = 0;
let haZeroCount = 0;
let probeFailCount = 0;
let lastRestartAt = 0;
let restarting = false;
let shuttingDown = false;
let syncingPromise = null;

function getLanUrl() {
  try {
    const nets = os.networkInterfaces();
    for (const [name, addrs] of Object.entries(nets)) {
      if (/vethernet|wsl|docker|loopback|hyper-v/i.test(name)) continue;
      for (const a of addrs || []) {
        if (a.family === 'IPv4' && !a.internal) {
          return `http://${a.address}:3100`;
        }
      }
    }
  } catch {}
  return 'http://127.0.0.1:3100';
}

async function probeTunnelUrl(baseUrl) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/login`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      });
      if (res.status >= 200 && res.status < 400) {
        return true;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function publishActiveServerUrl(url, force = false) {
  if (!url || !url.startsWith('https://')) return false;
  if (!force && url === lastSyncedUrl && Date.now() - lastSyncTime < 6 * 60 * 60 * 1000) {
    return true;
  }
  if (syncingPromise) return syncingPromise;

  syncingPromise = (async () => {
    try {
      if (url !== lastSyncedUrl) {
        const reachable = await probeTunnelUrl(url);
        if (!reachable) {
          console.warn(`[web-tunnel] Túnel detectado (${url}) aún no responde /login; reintentando en el siguiente ciclo.`);
          return false;
        }
      }

      const now = new Date().toISOString();
      const payload = JSON.stringify({
        url,
        lanUrl: getLanUrl(),
        updated_at: now,
        host: os.hostname(),
      });

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await fetch(`${SUPABASE_URL}/rest/v1/sek_app_settings?on_conflict=key`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
              Prefer: 'resolution=merge-duplicates',
            },
            body: JSON.stringify({
              key: SETTING_KEY,
              value: payload,
              iv: 'none',
              tag: 'none',
              updated_at: now,
            }),
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) {
            lastSyncedUrl = url;
            lastSyncTime = Date.now();
            console.log(`[web-tunnel] URL activa publicada en Supabase (${SETTING_KEY}): ${url}`);
            return true;
          }
          console.warn('[web-tunnel] Supabase respondió HTTP', res.status);
        } catch (err) {
          if (attempt === 2) {
            console.warn('[web-tunnel] Error publicando en Supabase:', err.message);
          } else {
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
      }
      return false;
    } finally {
      syncingPromise = null;
    }
  })();

  return syncingPromise;
}

function restartCloudflared(reason) {
  if (shuttingDown || restarting) return;
  const now = Date.now();
  if (now - lastRestartAt < 10_000) return;
  lastRestartAt = now;
  restarting = true;
  haZeroCount = 0;
  probeFailCount = 0;
  console.warn(`[web-tunnel] Reiniciando cloudflared: ${reason}`);
  const activeChild = child;
  if (!activeChild) {
    startCloudflared();
    return;
  }
  const pid = activeChild.pid;
  try {
    activeChild.kill('SIGTERM');
  } catch {}
  if (process.platform === 'win32' && pid) {
    setTimeout(() => {
      if (child === activeChild) {
        execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => {});
      }
    }, 2000);
  }
}

function handleLogChunk(chunk) {
  const text = String(chunk || '');
  const matches = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi);
  if (matches && matches.length > 0) {
    const found = matches[matches.length - 1];
    if (found !== currentTunnelUrl) {
      currentTunnelUrl = found;
      console.log(`[web-tunnel] URL detectada en logs de cloudflared: ${found}`);
      publishActiveServerUrl(found, true).catch(() => {});
    }
  }
  if (/Unauthorized:\s*Tunnel not found/i.test(text)) {
    restartCloudflared('Unauthorized: Tunnel not found');
  }
}

function startCloudflared() {
  if (shuttingDown) return;
  if (!fs.existsSync(CLOUDFLARED_EXE)) {
    console.error(`[web-tunnel] No existe ${CLOUDFLARED_EXE}`);
    return;
  }

  restarting = false;
  currentTunnelUrl = '';
  haZeroCount = 0;
  probeFailCount = 0;

  console.log('[web-tunnel] Iniciando cloudflared hacia', LOCAL_APP_URL);
  child = spawn(
    CLOUDFLARED_EXE,
    ['tunnel', '--url', LOCAL_APP_URL, '--metrics', METRICS_ADDR, '--no-autoupdate'],
    {
      cwd: ROOT_DIR,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  child.stdout?.on('data', (d) => {
    process.stdout.write(d);
    handleLogChunk(d);
  });
  child.stderr?.on('data', (d) => {
    process.stderr.write(d);
    handleLogChunk(d);
  });

  child.on('exit', (code, signal) => {
    child = null;
    console.warn(`[web-tunnel] cloudflared terminó (code=${code}, signal=${signal})`);
    if (!shuttingDown) {
      setTimeout(startCloudflared, 5000);
    }
  });
}

async function checkTunnelHealth() {
  if (shuttingDown || restarting || !child) return;

  try {
    const res = await fetch(METRICS_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return;
    const text = await res.text();

    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match && match[0]) {
      currentTunnelUrl = match[0];
      await publishActiveServerUrl(currentTunnelUrl);
    }

    const haMatch = text.match(/^cloudflared_tunnel_ha_connections\s+(\d+)/m);
    const haConnections = haMatch ? parseInt(haMatch[1], 10) : 0;

    if (haConnections <= 0) {
      haZeroCount++;
      console.warn(`[web-tunnel] cloudflared_tunnel_ha_connections=0 (${haZeroCount}/2)`);
      if (haZeroCount >= 2) {
        let internetOk = false;
        try {
          const ping = await fetch('https://1.1.1.1/cdn-cgi/trace', { signal: AbortSignal.timeout(3500) });
          internetOk = ping.ok;
        } catch {}

        if (internetOk) {
          restartCloudflared('Internet activo pero túnel sin conexiones HA');
          return;
        }
      }
    } else {
      haZeroCount = 0;
    }

    if (currentTunnelUrl) {
      let tunnelOk = false;
      try {
        const probeRes = await fetch(`${currentTunnelUrl}/login`, {
          redirect: 'manual',
          signal: AbortSignal.timeout(5000),
        });
        tunnelOk = probeRes.status >= 200 && probeRes.status < 400;
      } catch {}

      if (tunnelOk) {
        probeFailCount = 0;
      } else {
        probeFailCount++;
        console.warn(`[web-tunnel] Probe /login falló para ${currentTunnelUrl} (${probeFailCount}/2)`);
        if (probeFailCount >= 2) {
          let localOk = false;
          let internetOk = false;
          try {
            const lr = await fetch(`${LOCAL_APP_URL}/login`, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
            localOk = lr.status >= 200 && lr.status < 400;
          } catch {}
          try {
            const ping = await fetch('https://1.1.1.1/cdn-cgi/trace', { signal: AbortSignal.timeout(3500) });
            internetOk = ping.ok;
          } catch {}
          if (localOk && internetOk) {
            restartCloudflared('túnel público no responde /login');
          }
        }
      }
    }
  } catch (err) {
    // No reiniciar por fallos puntuales de lectura local de métricas
  }
}

function shutdown(sig) {
  shuttingDown = true;
  console.log(`[web-tunnel] Recibido ${sig}, cerrando cloudflared...`);
  try {
    if (child) child.kill('SIGTERM');
  } catch {}
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startCloudflared();
setInterval(() => {
  checkTunnelHealth().catch(() => {});
}, 30_000);
