// Simular mensaje entrante real de Evolution API v2
const ts = Math.floor(Date.now() / 1000);
const body = JSON.stringify({
  event: "messages.upsert",
  instance: "sekunet",
  data: {
    messages: [{
      key: {
        remoteJid: "50688887777@s.whatsapp.net",
        fromMe: false,
        id: "TEST-" + Date.now()
      },
      pushName: "Cliente Test",
      message: {
        conversation: "mensaje de prueba " + new Date().toISOString()
      },
      messageTimestamp: ts
    }]
  }
});

console.log("Enviando webhook a Vercel...");
fetch("https://sekachat.vercel.app/api/webhooks/evolution", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body,
}).then(async r => {
  const text = await r.text();
  console.log("Status:", r.status);
  console.log("Body:", text.slice(0, 500));
}).catch(e => console.log("ERROR:", e.message));
