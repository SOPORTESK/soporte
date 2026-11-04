const { execSync } = require('child_process');
const crypto = require('crypto');

const SUPABASE_URL = "https://kzcyxeracvfxynddyjld.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUxMTk1NCwiZXhwIjoyMDkxMDg3OTU0fQ.GlF4Zieqqc1V1IAPshPFKb1QzKBBbO8n1RGK_wG_JuM";
const SECRET = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUxMTk1NCwiZXhwIjoyMDkxMDg3OTU0fQ.GlF4Zieqqc1V1IAPshPFKb1QzKBBbO8n1RGK_wG_JuM";
const keyBuf = crypto.scryptSync(SECRET, 'sekunet-salt-v1', 32);

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return { encrypted, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

let failCount = 0;
let lastRestart = 0;
let lastSyncedUrl = '';
let lastSyncTime = 0;

async function syncToSupabase(url) {
  try {
    const payload = JSON.stringify({ url, apiKey: 'SEKUNET_EVO_KEY_123', instance: 'sekunet' });
    const { encrypted, iv, tag } = encrypt(payload);
    const res = await fetch(SUPABASE_URL + '/rest/v1/sek_app_settings?on_conflict=key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ key: 'evolution_api_config', value: encrypted, iv, tag, updated_at: new Date().toISOString() })
    });
    if (res.ok) {
      lastSyncedUrl = url;
      lastSyncTime = Date.now();
      console.log('[Tunnel Watchdog] URL sincronizada en Supabase con éxito:', url);
    } else {
      console.warn('[Tunnel Watchdog] Supabase sync retornó:', res.status);
    }
  } catch (e) {
    console.error('[Tunnel Watchdog] Error sincronizando a Supabase:', e.message);
  }
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

    // Probar conectividad al túnel
    const pingRes = await fetch(currentUrl, { signal: AbortSignal.timeout(8000) });
    if (pingRes.status >= 500) {
      throw new Error('Tunnel returned HTTP ' + pingRes.status);
    }

    // Sincronizar con Supabase si cambió la URL o cada 10 minutos
    if (currentUrl !== lastSyncedUrl || Date.now() - lastSyncTime > 10 * 60 * 1000) {
      await syncToSupabase(currentUrl);
    }

    // Si responde ok, resetear contador de fallos
    failCount = 0;
  } catch (err) {
    failCount++;
    console.warn(`[Tunnel Watchdog] Fallo #${failCount}: ${err.message}`);

    // Si falla 3 veces consecutivas (aprox 1.5 minutos) y no se ha reiniciado en los últimos 3 minutos
    if (failCount >= 3 && Date.now() - lastRestart > 180000) {
      lastRestart = Date.now();
      failCount = 0;
      console.log('[Tunnel Watchdog] Reiniciando contenedor chatdeatencinsekunet-evolution-tunnel-1...');
      try {
        execSync('docker restart chatdeatencinsekunet-evolution-tunnel-1', { stdio: 'inherit' });
        console.log('[Tunnel Watchdog] Contenedor reiniciado con éxito.');
        // Esperar 5s y chequear para sincronizar la nueva URL
        setTimeout(checkTunnel, 5000);
      } catch (restartErr) {
        console.error('[Tunnel Watchdog] Error reiniciando contenedor:', restartErr.message);
      }
    }
  }
}

console.log('[Tunnel Watchdog] Iniciado con auto-sync a Supabase. Monitoreando túnel cada 30 segundos.');
setInterval(checkTunnel, 30000);
checkTunnel();
