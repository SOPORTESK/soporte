import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const db = createClient(SUPABASE_URL, SERVICE_KEY);

const ARCHIVE_DAYS = 90;
const BATCH_SIZE = 50;

async function gzip(data: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const input = encoder.encode(data);
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(input);
  writer.close();
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

Deno.serve(async (req) => {
  const urlObj = new URL(req.url);
  if (urlObj.searchParams.get("debug") === "true") {
    const cutoff = new Date(Date.now() - ARCHIVE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    return new Response(JSON.stringify({ archive_days: ARCHIVE_DAYS, cutoff, batch_size: BATCH_SIZE }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cutoff = new Date(Date.now() - ARCHIVE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: casos, error } = await db
    .from("sek_cases")
    .select("*")
    .in("estado", ["cerrado", "resuelto"])
    .lt("updated_at", cutoff)
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[archive-old-cases] Error al leer casos:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!casos || casos.length === 0) {
    return new Response(JSON.stringify({ archived: 0 }), { status: 200 });
  }

  let archived = 0;
  for (const caso of casos) {
    try {
      const data = { ...caso };
      delete data.histcliente;
      delete data.histtecnico;

      const histclienteGzip = caso.histcliente ? await gzip(JSON.stringify(caso.histcliente)) : null;
      const histtecnicoGzip = caso.histtecnico ? await gzip(JSON.stringify(caso.histtecnico)) : null;

      const { error: insertErr } = await db.from("sek_case_archives").insert({
        id: caso.id,
        estado: caso.estado,
        canal: caso.canal,
        customer_phone: caso.customer_phone,
        assigned_to: caso.assigned_to,
        created_at: caso.created_at,
        updated_at: caso.updated_at,
        closed_at: caso.updated_at,
        data,
        histcliente_gzip: histclienteGzip,
        histtecnico_gzip: histtecnicoGzip,
      });

      if (insertErr) {
        console.error(`[archive-old-cases] Error insertando archivo ${caso.id}:`, insertErr.message);
        continue;
      }

      const { error: deleteErr } = await db.from("sek_cases").delete().eq("id", caso.id);
      if (deleteErr) {
        console.error(`[archive-old-cases] Error borrando caso ${caso.id}:`, deleteErr.message);
        continue;
      }

      archived++;
    } catch (e: any) {
      console.error(`[archive-old-cases] Error procesando caso ${caso.id}:`, e.message);
    }
  }

  console.log(`[archive-old-cases] Archivados ${archived} casos`);
  return new Response(JSON.stringify({ archived, total: casos.length }), { status: 200 });
});
