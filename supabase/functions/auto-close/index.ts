import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INACTIVITY_MINUTES = 5;
const CLOSE_MSG = "Debido a que no hemos recibido respuesta, vamos a cerrar esta conversación. Si necesita ayuda, con gusto le atendemos. ¡Que tenga un buen día!";

const db = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async () => {
  const { data: casos, error } = await db
    .from("sek_cases")
    .select("id, canal, histcliente, histtecnico, created_at")
    .not("estado", "in", '("cerrado","resuelto")')
    .limit(200);

  if (error) {
    console.error("[auto-close] Error al leer casos:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!casos || casos.length === 0) {
    return new Response(JSON.stringify({ closed: 0 }), { status: 200 });
  }

  const now = Date.now();
  const threshold = INACTIVITY_MINUTES * 60 * 1000;
  let closed = 0;

  for (const caso of casos) {
    /* Solo cuenta inactividad del CLIENTE */
    const clientMsgs = (caso.histcliente ?? []).filter((m: any) => m?.role === "user");
    const lastClientTime = clientMsgs.length > 0
      ? clientMsgs[clientMsgs.length - 1].time
      : caso.created_at;

    const elapsed = now - new Date(lastClientTime).getTime();
    if (elapsed < threshold) continue;

    /* Agregar mensaje de cierre al historial del cliente */
    const closeEntry = {
      role: "tecnico",
      content: CLOSE_MSG,
      time: new Date().toISOString(),
      author: "Soporte Sekunet",
    };
    const newHist = [...(caso.histtecnico ?? []), closeEntry];

    const { error: updateErr } = await db
      .from("sek_cases")
      .update({ estado: "cerrado", histtecnico: newHist })
      .eq("id", caso.id);

    if (updateErr) {
      console.error("[auto-close] Error cerrando caso", caso.id, updateErr.message);
      continue;
    }

    console.log(`[auto-close] Caso ${caso.id} cerrado por inactividad (${Math.round(elapsed / 60000)} min)`);
    closed++;
  }

  return new Response(JSON.stringify({ closed }), { status: 200 });
});
