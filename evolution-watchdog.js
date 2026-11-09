const dns = require('dns');
if (dns.setDefaultResultOrder) {
  try {
    dns.setDefaultResultOrder('ipv4first');
  } catch {}
}

const SUPABASE_URL = "https://kzcyxeracvfxynddyjld.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUxMTk1NCwiZXhwIjoyMDkxMDg3OTU0fQ.GlF4Zieqqc1V1IAPshPFKb1QzKBBbO8n1RGK_wG_JuM";

let lastUrl = '';
let lastSyncAt = 0;

async function tick() {
  try {
    const mRes = await fetch('http://chatdeatencinsekunet-evolution-tunnel-1:2000/metrics', {
      signal: AbortSignal.timeout(5000),
    });
    const text = await mRes.text();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match && match[0] && (match[0] !== lastUrl || Date.now() - lastSyncAt > 5 * 60 * 1000)) {
      const url = match[0];
      const payload = JSON.stringify({ url, apiKey: 'SEKUNET_EVO_KEY_123', instance: 'sekunet' });
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
        lastUrl = url;
        lastSyncAt = Date.now();
        console.log('[watchdog] Synced tunnel URL to Supabase:', url);
      } else {
        console.warn('[watchdog] Supabase sync status:', res.status);
      }
    }
  } catch (e) {
    console.error('[watchdog] Error:', e.message);
  }
}
tick();
setInterval(tick, 15000);
