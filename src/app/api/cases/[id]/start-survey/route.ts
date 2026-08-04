import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient();
  const caseId = params.id;

  const { data: caso, error: caseErr } = await supabase
    .from("sek_cases")
    .select("id, canal, estado, customer_phone, cliente, histtecnico")
    .eq("id", caseId)
    .maybeSingle();

  console.log("[start-survey] Case lookup:", caseId, "err:", caseErr?.message, "canal:", caso?.canal, "estado:", caso?.estado);

  if (caseErr || !caso) {
    return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
  }

  const canal = String(caso.canal || "").toLowerCase().trim();
  if (canal !== "whatsapp") {
    console.log("[start-survey] canal no es whatsapp:", canal);
    return NextResponse.json({ skipped: "not_whatsapp", canal }, { status: 200 });
  }

  // Resolver teléfono — limpiar sufijos @lid o @s.whatsapp.net
  const clienteObj = typeof caso.cliente === "object" ? caso.cliente as any : {};
  let phone = clienteObj?.telefono_real || clienteObj?.telefono || caso.customer_phone || "";
  // Si el phone viene con @lid, intentar usar customer_phone sin el sufijo
  if (phone.includes("@lid")) {
    phone = caso.customer_phone || clienteObj?.telefono || "";
  }
  // Limpiar cualquier sufijo @s.whatsapp.net o @lid para obtener solo el número
  phone = phone.toString().replace(/@(s\.whatsapp\.net|lid|g\.us)$/i, "").replace(/[^0-9]/g, "");
  console.log("[start-survey] phone resolved:", phone, "telefono_real:", clienteObj?.telefono_real, "telefono:", clienteObj?.telefono, "customer_phone:", caso.customer_phone);
  if (!phone || phone.length < 8) {
    return NextResponse.json({ error: "Sin teléfono válido para enviar encuesta", phone_raw: caso.customer_phone }, { status: 400 });
  }

  // Leer mensaje del flow config
  const { data: flowRow } = await supabase
    .from("sek_flow_configs")
    .select("flow_data")
    .limit(1)
    .maybeSingle();
  const nodes = flowRow?.flow_data?.nodes || [];
  const findMsg = (nodeId: string, fallback: string) => {
    const node = nodes.find((n: any) => n.id === nodeId);
    return node?.data?.message || fallback;
  };

  const surveyMsg = findMsg("pedir_calificacion", "¿Cómo calificaría la atención recibida? Responda con un número del 1 al 5, donde 1 es muy mala y 5 es excelente.");

  // Enviar por Evolution API
  const evoCfg = await getEvolutionConfig();
  console.log("[start-survey] Evolution config:", { url: evoCfg.url ? "OK" : "MISSING", apiKey: evoCfg.apiKey ? "OK" : "MISSING", instance: evoCfg.instance || "MISSING" });
  if (!evoCfg.url || !evoCfg.apiKey || !evoCfg.instance) {
    return NextResponse.json({ error: "Evolution API no configurada" }, { status: 500 });
  }

  let to = phone.toString().trim();
  if (!to.includes("@")) to = `${to.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
  const endpoint = `${evoCfg.url.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(evoCfg.instance)}`;
  console.log("[start-survey] Sending to:", to, "endpoint:", endpoint);

  let msgId: string | null = null;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoCfg.apiKey },
      body: JSON.stringify({ number: to, text: surveyMsg }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[start-survey] Error Evolution API:", res.status, errText);
      return NextResponse.json({ error: `Error enviando mensaje: ${res.status} ${errText.slice(0, 200)}` }, { status: 500 });
    }
    const resData = await res.json().catch(() => ({}));
    msgId = resData?.key?.id || null;
    console.log("[start-survey] Evolution API success, msgId:", msgId);
  } catch (e: any) {
    console.error("[start-survey] Exception:", e.message);
    return NextResponse.json({ error: "Error de conexión con Evolution" }, { status: 500 });
  }

  // Guardar mensaje en histtecnico + cambiar estado
  const now = new Date().toISOString();
  const surveyEntry: any = {
    role: "ia",
    author: "Asistente Sekunet",
    time: now,
    content: surveyMsg,
  };
  if (msgId) {
    surveyEntry.messageId = msgId;
    surveyEntry.fromMe = true;
  }

  await supabase.rpc("sek_append_hist", {
    p_case_id: caseId,
    p_entry: surveyEntry,
    p_col: "histtecnico",
    p_preview: surveyMsg.slice(0, 200),
    p_customer_phone: caso.customer_phone || to,
  });

  await supabase.from("sek_cases").update({
    estado: "calificacion_pendiente",
    last_message_at: now,
    last_message_preview: surveyMsg.slice(0, 200),
  }).eq("id", caseId);

  return NextResponse.json({ ok: true, estado: "calificacion_pendiente", survey_sent: true });
}
