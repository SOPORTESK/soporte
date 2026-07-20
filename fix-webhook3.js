const fs = require('fs');
const lines = fs.readFileSync('.env.local', 'utf8').split('\n');
const vars = {};
lines.forEach(l => { const m = l.match(/^([A-Z_]+)=(.+)/); if (m) vars[m[1]] = m[2]; });

(async () => {
  const EVO_URL = vars.EVOLUTION_API_URL;
  const EVO_KEY = vars.EVOLUTION_API_KEY;
  const EVO_INSTANCE = vars.EVOLUTION_INSTANCE;
  const base = EVO_URL.replace(/\/$/,'');

  console.log('Setting webhookBase64 to false...');
  try {
    const res = await fetch(`${base}/webhook/set/${EVO_INSTANCE}`, {
      method: 'POST',
      headers: { "Content-Type": "application/json", apikey: EVO_KEY },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: "https://sekachat.vercel.app/api/webhooks/evolution",
          byEvents: false,
          base64: false,
          events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE"]
        }
      }),
      signal: AbortSignal.timeout(60000)
    });
    const data = await res.json().catch(() => 'no json');
    console.log('Status:', res.status);
    console.log('webhookBase64:', data?.webhookBase64);
  } catch(e) {
    console.log('Failed:', e.message);
  }
})();
