const fetch = require("node-fetch"); // Or use native fetch if Node 18+

async function testWebhook() {
  const body = {
    event: "MESSAGES_UPSERT",
    instance: { user: "50662777500@s.whatsapp.net" },
    data: {
      key: { fromMe: false, remoteJid: "50687095801@s.whatsapp.net", id: "DEBUG125" },
      pushName: "Jefatura Técnica Sekunet",
      message: { conversation: "HOLA TEST 3" }
    }
  };

  console.log("Sending to Vercel...");
  try {
    const res = await fetch("https://sekachat.vercel.app/api/webhooks/evolution", {
      method: "POST",
      headers: {
        "apikey": "SEKUNET_EVO_KEY_123",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text);
  } catch (e) {
    console.error("Fetch error:", e);
  }
}

testWebhook();
