// Enviar mensaje de prueba por WhatsApp
const EVO_URL = "http://129.146.7.74";
const EVO_KEY = "SEKUNET_EVO_KEY_123";
const phone = "50670151843";
const text = "Mensaje de prueba desde diagnóstico " + new Date().toISOString();

console.log("Enviando a", phone, ":", text);
fetch(`${EVO_URL}/message/sendText/sekunet`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: EVO_KEY },
  body: JSON.stringify({ number: phone + "@s.whatsapp.net", text })
}).then(async r => {
  console.log("Status:", r.status);
  const data = await r.json().catch(() => ({}));
  console.log("Body:", JSON.stringify(data, null, 2));
}).catch(e => console.log("ERROR:", e.message));
