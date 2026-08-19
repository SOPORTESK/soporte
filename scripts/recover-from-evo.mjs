// Recuperar mensajes de Evolution API v2 (formato correcto)
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
const envContent = readFileSync(envPath, "utf8");
const env = {};
for (const line of envContent.split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const EVO_URL = env.EVOLUTION_API_URL.replace(/\/$/, "");
const EVO_KEY = env.EVOLUTION_API_KEY;
const INSTANCE = env.EVOLUTION_INSTANCE;
const PHONE = "50663381153";
const JID = `${PHONE}@s.whatsapp.net`;

async function tryFetch(method, path, body) {
  const url = `${EVO_URL}${path}`;
  console.log(`\n${method} ${url}`);
  console.log(`Body: ${JSON.stringify(body)}`);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "apikey": EVO_KEY,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    if (res.ok) {
      return text;
    } else {
      console.log(`Error: ${text.slice(0, 500)}`);
      return null;
    }
  } catch (e) {
    console.log(`Fetch error: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log(`Buscando mensajes de ${PHONE} en Evolution API v2...`);

  // findMessages con where como objeto
  const msgs1 = await tryFetch("POST", `/chat/findMessages/${INSTANCE}`, {
    where: { "key.remoteJid": JID },
    limit: 100,
  });
  if (msgs1) {
    console.log(`\n¡Mensajes encontrados! (${msgs1.length} chars)`);
    console.log(msgs1.slice(0, 5000));
    if (msgs1.length > 5000) console.log(`... (${msgs1.length} chars total)`);
    return;
  }

  // Probar con remoteJid sin key.
  const msgs2 = await tryFetch("POST", `/chat/findMessages/${INSTANCE}`, {
    where: { "remoteJid": JID },
    limit: 100,
  });
  if (msgs2) {
    console.log(`\n¡Mensajes encontrados! (${msgs2.length} chars)`);
    console.log(msgs2.slice(0, 5000));
    return;
  }

  // findChats
  const chats = await tryFetch("POST", `/chat/findChats/${INSTANCE}`, {
    where: { "remoteJid": JID },
    limit: 10,
  });
  if (chats) {
    console.log(`\n¡Chat encontrado! (${chats.length} chars)`);
    console.log(chats.slice(0, 3000));
  }

  // findContacts
  const contacts = await tryFetch("POST", `/chat/findContacts/${INSTANCE}`, {
    where: { "remoteJid": JID },
    limit: 10,
  });
  if (contacts) {
    console.log(`\n¡Contacto encontrado! (${contacts.length} chars)`);
    console.log(contacts.slice(0, 3000));
  }

  // Listar todos los contacts sin filtro
  const allContacts = await tryFetch("POST", `/chat/findContacts/${INSTANCE}`, {});
  if (allContacts) {
    console.log(`\nTotal contactos: ${allContacts.length} chars`);
    if (allContacts.includes(PHONE) || allContacts.includes("63381153")) {
      console.log(`¡Número encontrado en contactos!`);
      const idx = allContacts.indexOf("63381153");
      console.log(allContacts.slice(Math.max(0, idx - 300), idx + 500));
    } else {
      console.log(`Número no encontrado en contactos`);
      console.log(`Primeros 1000 chars: ${allContacts.slice(0, 1000)}`);
    }
  }
}

main().catch(console.error);
