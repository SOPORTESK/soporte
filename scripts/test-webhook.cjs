// Test webhook
const body = JSON.stringify({
  event: "MESSAGES_UPSERT",
  data: {
    messages: [{
      key: { id: "test-" + Date.now(), remoteJid: "50688887777@s.whatsapp.net" },
      message: { conversation: "test desde script" },
      messageTimestamp: Math.floor(Date.now() / 1000)
    }]
  }
});

fetch("https://sekachat.vercel.app/api/webhooks/evolution", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body,
}).then(async r => {
  console.log("Status:", r.status);
  const text = await r.text();
  console.log("Body:", text.slice(0, 500));
}).catch(e => console.log("ERROR:", e.message));
