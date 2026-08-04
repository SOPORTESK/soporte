import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";

export async function POST(
  req: NextRequest,
  { params }: { params: { caseId: string; messageIndex: string } }
) {
  const supabase = createServiceClient();
  const { deleteType, author, historyType } = await req.json();
  
  console.log("[DELETE MSG API] Iniciando", { caseId: params.caseId, messageIndex: params.messageIndex, deleteType, author, historyType });
  
  // deleteType: "for_everyone" o "for_me"
  // historyType: "histcliente" o "histtecnico"
  const validDeleteTypes = ["for_everyone", "for_me"];
  const validHistoryTypes = ["histcliente", "histtecnico"];
  
  if (!validDeleteTypes.includes(deleteType)) {
    console.error("[DELETE MSG API] deleteType inválido:", deleteType);
    return NextResponse.json({ ok: false, error: "deleteType inválido" }, { status: 400 });
  }
  
  if (!validHistoryTypes.includes(historyType)) {
    console.error("[DELETE MSG API] historyType inválido:", historyType);
    return NextResponse.json({ ok: false, error: "historyType inválido" }, { status: 400 });
  }

  // Si el caseId contiene separadores, es un ID de grupo - necesitamos encontrar el caso real
  let targetCaseId = params.caseId;
  if (params.caseId.includes("|") || params.caseId.includes(":")) {
    console.log("[DELETE MSG API] ID de grupo detectado, buscando caso real con teléfono:", params.caseId.split("|")[0]);
    const { data: cases } = await supabase
      .from("sek_cases")
      .select("id")
      .ilike("customer_phone", params.caseId.split("|")[0])
      .limit(1);
    
    if (cases && cases.length > 0) {
      targetCaseId = String(cases[0].id);
      console.log("[DELETE MSG API] Caso real encontrado:", targetCaseId);
    } else {
      console.error("[DELETE MSG API] No se encontró caso real para el grupo");
      return NextResponse.json({ ok: false, error: "Caso no encontrado" }, { status: 404 });
    }
  }

  const { data: caseData, error: fetchError } = await supabase
    .from("sek_cases")
    .select("*")
    .eq("id", targetCaseId)
    .single();

  if (fetchError || !caseData) {
    console.error("[DELETE MSG API] Error al buscar caso:", fetchError);
    return NextResponse.json({ ok: false, error: "Caso no encontrado" }, { status: 404 });
  }

  const history = caseData[historyType] || [];
  const msgIndex = parseInt(params.messageIndex);

  console.log("[DELETE MSG API] Historial length:", history.length, "msgIndex:", msgIndex);

  if (msgIndex < 0 || msgIndex >= history.length) {
    console.error("[DELETE MSG API] Índice de mensaje inválido");
    return NextResponse.json({ ok: false, error: "Índice de mensaje inválido" }, { status: 400 });
  }

  const message = history[msgIndex];
  let updatedMessage;

  // Asegurar que message es un objeto
  const messageObj = typeof message === "object" && message !== null ? message : { content: String(message || "") };

  if (deleteType === "for_everyone") {
    // Eliminar para todos: marcar como deleted
    updatedMessage = { ...messageObj, deleted: true, content: "" };
    console.log("[DELETE MSG API] Eliminando para todos");

    // Sincronizar con WhatsApp si es un canal de WhatsApp y tiene messageId
    const isWhatsApp = String(caseData.canal || "").toLowerCase() === "whatsapp";
    const messageId = (messageObj as any).messageId;
    const to = caseData.customer_phone;

    if (isWhatsApp && messageId && to) {
      const evoCfg = await getEvolutionConfig();
      const fromMe = (messageObj as any).fromMe ?? (historyType === "histtecnico");

      if (evoCfg?.url && evoCfg?.apiKey && evoCfg?.instance) {
        const targetJid = to.includes("@") ? to : `${to.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
        try {
          console.log("[DELETE MSG API] Revocando mensaje en WhatsApp via Evolution API", {
            to: targetJid,
            messageId,
            fromMe
          });

          const res = await fetch(`${evoCfg.url.replace(/\/$/, "")}/chat/deleteMessageForEveryone/${encodeURIComponent(evoCfg.instance)}`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              apikey: evoCfg.apiKey
            },
            body: JSON.stringify({
              id: messageId,
              remoteJid: targetJid,
              fromMe: fromMe,
              participant: targetJid
            })
          });

          const resData = await res.json().catch(() => ({}));
          if (!res.ok) {
            console.error("[DELETE MSG API] Error en respuesta de Evolution:", res.status, resData);
            return NextResponse.json({ ok: false, error: `Evolution API: ${resData?.message || resData?.error || res.status}` }, { status: 500 });
          } else {
            console.log("[DELETE MSG API] Revocación exitosa en WhatsApp.");
          }
        } catch (evoErr) {
          console.error("[DELETE MSG API] Error conectando con Evolution API para revocar:", evoErr);
          return NextResponse.json({ ok: false, error: "Error conectando con Evolution API" }, { status: 500 });
        }
      } else {
        console.log("[DELETE MSG API] Evolution config no disponible, omitiendo revocación en WhatsApp");
      }
    } else {
      console.log("[DELETE MSG API] Omitiendo revocación en WhatsApp:", { isWhatsApp, hasMessageId: !!messageId, to });
    }
  } else {
    // Eliminar para mi: agregar email a deleted_for_me
    const deletedForMe = (messageObj as any).deleted_for_me || [];
    if (!deletedForMe.includes(author)) {
      updatedMessage = { ...messageObj, deleted_for_me: [...deletedForMe, author] };
      console.log("[DELETE MSG API] Eliminando para mi");
    } else {
      updatedMessage = messageObj; // Ya está eliminado para este usuario
      console.log("[DELETE MSG API] Ya estaba eliminado para mi");
    }
  }

  // Actualizar el mensaje - siempre como objeto para mantener consistencia
  const updatedHistory = [...history];
  updatedHistory[msgIndex] = updatedMessage as any;

  // Si es "for_everyone", también buscar y eliminar el mismo mensaje en el otro array
  // (el mensaje puede existir en histcliente por sincronización del webhook y en histtecnico por el chat)
  const otherHistoryType = historyType === "histcliente" ? "histtecnico" : "histcliente";
  const otherHistory = caseData[otherHistoryType] || [];
  const targetMessageId = (messageObj as any).messageId;
  let otherUpdated = false;
  let updatedOtherHistory = otherHistory;

  if (deleteType === "for_everyone" && targetMessageId && Array.isArray(otherHistory)) {
    const otherIdx = otherHistory.findIndex((e: any) =>
      typeof e === "object" && e !== null && e.messageId === targetMessageId
    );
    if (otherIdx >= 0) {
      updatedOtherHistory = [...otherHistory];
      updatedOtherHistory[otherIdx] = { ...otherHistory[otherIdx], deleted: true, content: "" };
      otherUpdated = true;
      console.log("[DELETE MSG API] También eliminando copia en", otherHistoryType, "índice", otherIdx);
    }
  }

  const updatePayload: Record<string, any> = { [historyType]: updatedHistory };
  if (otherUpdated) {
    updatePayload[otherHistoryType] = updatedOtherHistory;
  }

  const { data: updateData, error: updateError } = await supabase
    .from("sek_cases")
    .update(updatePayload)
    .eq("id", targetCaseId)
    .select("id");

  if (updateError) {
    console.error("[DELETE MSG API] Error al actualizar:", updateError);
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  if (!updateData || updateData.length === 0) {
    console.error("[DELETE MSG API] No se actualizó ninguna fila - caso no encontrado:", targetCaseId);
    return NextResponse.json({ ok: false, error: "No se pudo eliminar - caso no encontrado" }, { status: 404 });
  }

  console.log("[DELETE MSG API] Mensaje eliminado exitosamente en caso:", targetCaseId);
  return NextResponse.json({ ok: true });
}
