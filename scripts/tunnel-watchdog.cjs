const { execSync } = require('child_process');
const dns = require('dns');

if (dns.setDefaultResultOrder) {
  try {
    dns.setDefaultResultOrder('ipv4first');
  } catch {}
}

const SUPABASE_URL = "https://kzcyxeracvfxynddyjld.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUxMTk1NCwiZXhwIjoyMDkxMDg3OTU0fQ.GlF4Zieqqc1V1IAPshPFKb1QzKBBbO8n1RGK_wG_JuM";

let failCount = 0;
let lastRestart = 0;
let lastSyncedUrl = '';
let lastSyncTime = 0;

async function syncToSupabase(url) {
  const payload = JSON.stringify({ url, apiKey: 'SEKUNET_EVO_KEY_123', instance: 'sekunet' });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/sek_app_settings?on_conflict=key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          key: 'evolution_api_config',
          value: payload,
          iv: 'none',
          tag: 'none',
          updated_at: new Date().toISOString()
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        lastSyncedUrl = url;
        lastSyncTime = Date.now();
        console.log('[Tunnel Watchdog] URL sincronizada en Supabase con éxito:', url);
        return true;
      } else {
        console.warn('[Tunnel Watchdog] Supabase sync retornó:', res.status);
      }
    } catch (e) {
      console.error(`[Tunnel Watchdog] Error sincronizando a Supabase (intento ${attempt}/3):`, e.message);
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  return false;
}

async function checkTunnel() {
  try {
    const res = await fetch('http://127.0.0.1:28081/metrics', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error('Metrics status ' + res.status);
    const text = await res.text();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (!match || !match[0]) {
      throw new Error('No active trycloudflare URL in metrics');
    }

    const currentUrl = match[0];

    // Verificar conexiones HA activas de cloudflared directamente en las métricas locales
    // (evita falsos positivos por bloqueo de loopback/IPv6 hacia trycloudflare.com desde la misma red)
    const haMatch = text.match(/^cloudflared_tunnel_ha_connections\s+(\d+)/m);
    const haConnections = haMatch ? parseInt(haMatch[1], 10) : 1;
    if (haConnections <= 0) {
      throw new Error('cloudflared_tunnel_ha_connections is 0 (tunnel disconnected from Cloudflare edge)');
    }

    // Sincronizar con Supabase si cambió la URL o cada 5 minutos
    if (currentUrl !== lastSyncedUrl || Date.now() - lastSyncTime > 5 * 60 * 1000) {
      await syncToSupabase(currentUrl);
    }

    failCount = 0;
  } catch (err) {
    failCount++;
    console.warn(`[Tunnel Watchdog] Fallo #${failCount}: ${err.message}`);

    // Solo reiniciar si las métricas locales del contenedor o las conexiones HA llevan 4 fallos seguidos (2 min)
    if (failCount >= 4 && Date.now() - lastRestart > 300000) {
      lastRestart = Date.now();
      failCount = 0;
      console.log('[Tunnel Watchdog] Reiniciando contenedor chatdeatencinsekunet-evolution-tunnel-1...');
      try {
        execSync('docker restart chatdeatencinsekunet-evolution-tunnel-1', { stdio: 'inherit' });
        console.log('[Tunnel Watchdog] Contenedor reiniciado con éxito.');
        setTimeout(checkTunnel, 8000);
      } catch (restartErr) {
        console.error('[Tunnel Watchdog] Error reiniciando contenedor:', restartErr.message);
      }
    }
  }
}

console.log('[Tunnel Watchdog] Iniciado con verificación HA local y auto-sync IPv4 a Supabase.');
setInterval(checkTunnel, 30000);
checkTunnel();
