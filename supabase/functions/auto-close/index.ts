import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INACTIVITY_MINUTES = 5;
const CLOSE_MSG = "Debido a que no hemos recibido respuesta, vamos a cerrar esta conversación. Si necesita ayuda, no dude en ponerse en contacto, con gusto le atendemos. ¡Que tenga un buen día!";

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
    /*
     * Solo cerrar si el ÚLTIMO mensaje de toda la conversación es del AGENTE/TÉCNICO.
     * Esto significa que el agente ya respondió y el cliente no ha contestado.
     * Si el último mensaje es del cliente → el cliente espera respuesta → NO cerrar.
     */
    const allMsgs: { role: string; time: string }[] = [];
    for (const m of (caso.histcliente ?? [])) {
      if (m?.time) allMsgs.push({ role: m.role || "user", time: m.time });
    }
    for (const m of (caso.histtecnico ?? [])) {
      if (m?.role === "nota") continue; // ignorar notas internas
      if (m?.time) allMsgs.push({ role: m.role || "tecnico", time: m.time });
    }
    allMsgs.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    // Si no hay mensajes, usar created_at como referencia
    if (allMsgs.length === 0) {
      const elapsed = now - new Date(caso.created_at).getTime();
      if (elapsed < threshold) continue;
    } else {
      const last = allMsgs[allMsgs.length - 1];
      // Si el último mensaje es del cliente → está esperando agente/IA → NO cerrar
      if (last.role === "user") continue;
      const elapsed = now - new Date(last.time).getTime();
      if (elapsed < threshold) continue;
    }

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

    const lastTime = allMsgs.length > 0 ? allMsgs[allMsgs.length - 1].time : caso.created_at;
    console.log(`[auto-close] Caso ${caso.id} cerrado por inactividad del cliente (${Math.round((now - new Date(lastTime).getTime()) / 60000)} min)`);
    closed++;
  }

  return new Response(JSON.stringify({ closed }), { status: 200 });
});
