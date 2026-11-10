import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";
import { performAutoExtract } from "@/lib/ai/auto-extract";
import { enqueueWaOutbox, generateQueuedMessageId } from "@/lib/wa-outbox";

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

  // ── Modo No Atendido: no enviar encuesta, cerrar caso directamente ──
  const { data: unattendedRow } = await supabase
    .from("sek_agent_config")
    .select("modo_no_atendido")
    .eq("email", "system_prompt@sekunet.com")
    .maybeSingle();
  const modoNoAtendido = unattendedRow?.modo_no_atendido ?? false;

  // ── Verificación de Configuración de Encuesta de Satisfacción ──
  const { data: surveyRow } = await supabase
    .from("sek_app_settings")
    .select("value")
    .eq("key", "survey_config")
    .maybeSingle();

  let surveyEnabled = false;
  let customSurveyMsg: string | null = null;

  if (surveyRow?.value) {
    try {
      const parsed = typeof surveyRow.value === "string" ? JSON.parse(surveyRow.value) : surveyRow.value;
      if (parsed) {
        surveyEnabled = Boolean(parsed.enabled);
        if (parsed.message && typeof parsed.message === "string") {
          customSurveyMsg = parsed.message.trim();
        }
      }
    } catch (_e) {}
  }

  // Si la encuesta está deshabilitada por configuración o está activo el Modo No Atendido:
  // La encuesta se rige estrictamente por su propio interruptor independiente surveyEnabled
  if (!surveyEnabled) {
    const reason = "survey_disabled";
    console.log(`[start-survey] Encuesta omitida (${reason}) — cerrando caso directamente`);
    const now = new Date().toISOString();
    await supabase.from("sek_cases").update({
      estado: "cerrado",
      closed_at: now,
    }).eq("id", caseId);

    // Auto-extracción de IA 100% en backend (automática)
    performAutoExtract(caseId).catch(e => console.warn("[start-survey] Auto-extract error:", e));

    return NextResponse.json({ skipped: reason, closed: true, estado: "cerrado" }, { status: 200 });
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

  // Determinar mensaje de la encuesta (prioridad: plantilla personalizada de survey_config > nodo de flujo > default)
  let surveyMsg: string = customSurveyMsg || "";
  if (!surveyMsg) {
    const { data: flowRow } = await supabase
      .from("sek_flow_configs")
      .select("flow_data")
      .limit(1)
      .maybeSingle();
    const nodes = flowRow?.flow_data?.nodes || [];
    const findMsg = (nodeId: string, fallback: string) => {
      const node = nodes.find((n: any) => n.id === nodeId);
      return (node?.data?.message as string) || fallback;
    };
    surveyMsg = findMsg("pedir_calificacion", "¿Cómo calificaría la atención recibida? Responda con un número del 1 al 5, donde 1 es muy mala y 5 es excelente.");
  }
  if (!surveyMsg) {
    surveyMsg = "¿Cómo calificaría la atención recibida? Responda con un número del 1 al 5, donde 1 es muy mala y 5 es excelente.";
  }

  // Enviar por Evolution API
  const evoCfg = await getEvolutionConfig();
  console.log("[start-survey] Evolution config:", { url: evoCfg.url ? "OK" : "MISSING", apiKey: evoCfg.apiKey ? "OK" : "MISSING", instance: evoCfg.instance || "MISSING" });
  if (!evoCfg.url || !evoCfg.apiKey || !evoCfg.instance) {
    return NextResponse.json({ error: "Evolution API no configurada" }, { status: 500 });
  }

  let to = phone.toString().trim();
  if (!to.includes("@")) to = `${to.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
  const candidateUrls = Array.from(
    new Set(
      [evoCfg.url, ...(evoCfg.candidates || [])]
        .map((u) => (u || "").replace(/\/$/, ""))
        .filter(Boolean)
    )
  );
  const instance = encodeURIComponent(evoCfg.instance);

  let msgId: string | null = null;
  let surveyQueued = false;
  let lastStatus = 0;
  let lastErrText = "";

  for (const baseUrl of candidateUrls) {
    const endpoint = `${baseUrl}/message/sendText/${instance}`;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evoCfg.apiKey },
        body: JSON.stringify({ number: to, text: surveyMsg }),
        signal: AbortSignal.timeout(4500),
      });
      lastStatus = res.status;
      if (res.ok) {
        const resData = await res.json().catch(() => ({}));
        msgId = resData?.key?.id || resData?.messageId || null;
        console.log("[start-survey] Evolution API success via", baseUrl, "msgId:", msgId);
        break;
      } else {
        lastErrText = await res.text().catch(() => "");
        console.warn("[start-survey] Error Evolution API via", baseUrl, res.status, lastErrText.slice(0, 120));
      }
    } catch (e: any) {
      lastErrText = e?.message || "fetch_failed";
      console.warn("[start-survey] Exception via", baseUrl, lastErrText);
    }
  }

  if (!msgId && lastStatus !== 400) {
    const queuedId = generateQueuedMessageId();
    await enqueueWaOutbox(supabase, {
      id: queuedId,
      case_id: String(caseId),
      to: to.replace(/@s\.whatsapp\.net$/i, ""),
      text: surveyMsg,
      created_at: new Date().toISOString(),
      status: "pending",
      attempts: 0,
      last_error: lastErrText || `status_${lastStatus}`,
    });
    msgId = queuedId;
    surveyQueued = true;
    console.warn("[start-survey] Túnel no disponible, encuesta encolada en outbox:", queuedId);
  } else if (!msgId && lastStatus === 400) {
    return NextResponse.json({ error: `Error enviando encuesta: ${lastStatus} ${lastErrText.slice(0, 200)}` }, { status: 400 });
  }

  // Guardar mensaje en histtecnico + cambiar estado
  const now = new Date().toISOString();
  const surveyEntry: any = {
    role: "ia",
    author: "Asistente Sekunet",
    time: now,
    content: surveyMsg,
    fromMe: true,
    ...(msgId ? { messageId: msgId } : {}),
    ...(surveyQueued ? { queued: true } : {}),
  };

  await supabase.rpc("sek_append_hist", {
    p_case_id: caseId,
    p_entry: surveyEntry,
    p_col: "histtecnico",
    p_preview: surveyMsg.slice(0, 200),
    p_customer_phone: caso.customer_phone || to,
  });

  await supabase.from("sek_cases").update({
    estado: "calificacion_pendiente",
    closed_at: now,
    last_message_at: now,
    last_message_preview: surveyMsg.slice(0, 200),
  }).eq("id", caseId);

  // Auto-extracción de IA 100% en backend (automática y sin depender del navegador)
  performAutoExtract(caseId).catch(e => console.warn("[start-survey] Auto-extract error:", e));

  return NextResponse.json({ ok: true, estado: "calificacion_pendiente", survey_sent: true });
}
