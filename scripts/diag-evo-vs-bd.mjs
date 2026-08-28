/**
 * diag-evo-vs-bd.mjs
 * Compara los mensajes recientes en Evolution API con los que están en la BD
 * para los tres números que reportan "Esperando este mensaje".
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const env = {};
for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const EVO_URL = env.EVOLUTION_API_URL || "https://evolution-api-latest-is1z.onrender.com";
const EVO_KEY = env.EVOLUTION_API_KEY || "SEKUNET_EVO_KEY_123";
const EVO_INSTANCE = env.EVOLUTION_INSTANCE || "sekunet";

const phones = ["50689950611", "50661014444", "50687283434"];

function extractText(msg) {
  if (!msg?.message) return null;
  return (
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.imageMessage?.caption ||
    msg.message.videoMessage?.caption ||
    msg.message.documentMessage?.caption ||
    null
  );
}

function jidToPhone(jid) {
  if (!jid) return null;
  const s = String(jid);
  if (s.endsWith("@s.whatsapp.net")) return s.replace("@s.whatsapp.net", "");
  const m = s.match(/^(\d+)@/);
  return m ? m[1] : null;
}

async function main() {
  for (const phone of phones) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`NUMERO: +${phone}`);
    console.log(`${"=".repeat(60)}\n`);

    // 1. Buscar mensajes recientes en Evolution API
    const jid = `${phone}@s.whatsapp.net`;
    try {
      const url = `${EVO_URL.replace(/\/$/, "")}/chat/findMessages/${encodeURIComponent(EVO_INSTANCE)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVO_KEY },
        body: JSON.stringify({ where: { key: { remoteJid: jid } }, limit: 20 }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        console.log(`  Evolution API error: ${res.status}`);
        continue;
      }

      const data = await res.json();
      const records = data?.messages?.records || data?.messages || [];

      console.log(`  Evolution API: ${records.length} mensajes recientes\n`);

      // 2. Buscar caso en BD
      const { data: cases } = await db
        .from("sek_cases")
        .select("id, histcliente, histtecnico, estado")
        .or(`customer_phone.ilike.%${phone}%`)
        .order("created_at", { ascending: false })
        .limit(1);

      const caso = cases?.[0];
      if (!caso) {
        console.log("  No hay caso en BD");
        continue;
      }

      // Recopilar todos los messageIds de la BD
      const bdIds = new Set();
      const hc = Array.isArray(caso.histcliente) ? caso.histcliente : [];
      const ht = Array.isArray(caso.histtecnico) ? caso.histtecnico : [];
      for (const m of [...hc, ...ht]) {
        if (m?.messageId) bdIds.add(m.messageId);
      }

      console.log(`  BD: caso ${caso.id} (${caso.estado}), ${bdIds.size} messageIds conocidos\n`);

      // 3. Comparar
      console.log(`  --- Mensajes en Evolution API ---`);
      let missing = 0;
      for (const r of records.slice(0, 15)) {
        const msgId = r.key?.id;
        const fromMe = r.key?.fromMe;
        const text = extractText(r);
        const ts = r.messageTimestamp;
        const time = ts ? new Date(ts < 1e12 ? ts * 1000 : ts).toISOString() : "?";
        const inBd = msgId && bdIds.has(msgId);
        const status = inBd ? "OK" : "*** NO EN BD ***";

        if (!inBd) missing++;

        const content = text ? text.slice(0, 50) : fromMe ? "(media saliente)" : "(media entrante)";
        console.log(`    ${status} | ${time} | fromMe=${fromMe} | id=${(msgId || "?").slice(0, 20)} | "${content}"`);
      }

      console.log(`\n  *** ${missing} mensajes en Evolution API que NO están en la BD ***`);
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
    }
  }
}

main().catch(console.error);
