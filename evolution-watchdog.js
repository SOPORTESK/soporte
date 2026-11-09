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

let lastUrl = '';
async function tick() {
  try {
    const mRes = await fetch('http://chatdeatencinsekunet-evolution-tunnel-1:2000/metrics');
    const text = await mRes.text();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match && match[0] && match[0] !== lastUrl) {
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
        body: JSON.stringify({ key: 'evolution_api_config', value: payload, iv: 'none', tag: 'none', updated_at: new Date().toISOString() })
      });
      if (res.ok) {
        lastUrl = url;
        console.log('[watchdog] Synced tunnel URL to Supabase:', url);
      }
    }
  } catch (e) {
    console.error('[watchdog] Error:', e.message);
  }
}
tick();
setInterval(tick, 15000);
