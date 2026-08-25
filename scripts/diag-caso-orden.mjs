/**
 * diag-caso-orden.mjs <caso-id>
 *
 * Reproduce exactamente el orden que muestra la UI (chat-view.tsx ->
 * unifyMessages) y lo compara contra el orden real de llegada, para ver
 * donde se rompe.
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

const casoId = process.argv[2];
if (!casoId) { console.error("Uso: node scripts/diag-caso-orden.mjs <caso-id>"); process.exit(1); }

const main = async () => {
  const { data: c, error } = await db
    .from("sek_cases")
    .select("id, created_at, customer_phone, histcliente, histtecnico")
    .eq("id", casoId)
    .maybeSingle();

  if (error || !c) { console.error("No encontrado:", error?.message); return; }

  console.log("Caso:", c.id, "| tel:", c.customer_phone);
  console.log("Creado:", c.created_at);
  console.log("");

  // Replica exacta de unifyMessages: histcliente primero, luego histtecnico
  const out = [];
  let seq = 0;
  const toTime = (e) => e.time || c.created_at || new Date(0).toISOString();

  for (const e of (Array.isArray(c.histcliente) ? c.histcliente : [])) {
    out.push({ arr: "histcliente", idx: out.length, rol: e.role || "user", time: toTime(e), seq: seq++, texto: String(e.content || "(media)").substring(0, 42), msgId: e.messageId || null });
  }
  for (const e of (Array.isArray(c.histtecnico) ? c.histtecnico : [])) {
    out.push({ arr: "histtecnico", idx: out.length, rol: e.role || "?", time: toTime(e), seq: seq++, texto: String(e.content || "(media)").substring(0, 42), msgId: e.messageId || null });
  }

  const ordenado = [...out].sort((a, b) => {
    const ta = new Date(a.time).getTime();
    const tb = new Date(b.time).getTime();
    const da = isNaN(ta) ? Number.MAX_SAFE_INTEGER : ta;
    const dbb = isNaN(tb) ? Number.MAX_SAFE_INTEGER : tb;
    if (da !== dbb) return da - dbb;
    return a.seq - b.seq;
  });

  console.log("ORDEN QUE MUESTRA LA UI:");
  console.log("(prec = ms si la hora trae milisegundos, SEG si viene redondeada de WhatsApp)");
  console.log("");
  let prev = null;
  for (let i = 0; i < ordenado.length; i++) {
    const m = ordenado[i];
    const t = new Date(m.time).getTime();
    const prec = t % 1000 === 0 ? "SEG" : "ms ";
    const empate = prev !== null && Math.floor(t / 1000) === Math.floor(prev / 1000) ? " <== EMPATE mismo segundo" : "";
    console.log(
      `${String(i + 1).padStart(3)}. ${m.time}  ${prec}  ${m.arr.padEnd(11)} ${String(m.rol).padEnd(8)} "${m.texto}"${empate}`
    );
    prev = t;
  }

  // Mensajes que estan en los dos arrays (mismo messageId)
  const ids = {};
  for (const m of out) if (m.msgId) { ids[m.msgId] = ids[m.msgId] || []; ids[m.msgId].push(m); }
  const dobles = Object.entries(ids).filter(([, v]) => v.length > 1);
  if (dobles.length) {
    console.log("\nMENSAJES DUPLICADOS (mismo messageId en varios lugares):");
    for (const [id, v] of dobles) {
      console.log(`  ${id.substring(0, 22)}  ->  ${v.map((x) => `${x.arr}@${x.time}`).join("  |  ")}`);
    }
  }
};

main().catch((e) => console.error("Fatal:", e.message));
