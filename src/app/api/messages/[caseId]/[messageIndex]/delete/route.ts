import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";

// Misma prioridad que /api/evolution/send: telefono_real es el número verdadero.
// customer_phone puede ser un @lid, y WhatsApp no revoca mensajes contra un @lid.
function pickPhone(c: any): string | null {
  const cliente = typeof c?.cliente === "object" && c.cliente !== null ? c.cliente : {};
  const telReal = String(cliente.telefono_real || "").trim();
  if (telReal) return telReal;
  const cust = String(c?.customer_phone || "").trim();
  if (cust) return cust;
  const tel = String(cliente.telefono || "").trim();
  return tel || null;
}

// El messageId lo rellena el webhook al recibir el eco del envío. Si el entry
// consultado aún no lo tiene, se busca la copia del mismo mensaje en el otro
// historial (mismo contenido y timestamp cercano).
function resolveMessageId(messageObj: any, caseData: any, historyType: string): string | null {
  if (messageObj?.messageId) return messageObj.messageId;

  const otherType = historyType === "histcliente" ? "histtecnico" : "histcliente";
  const other = Array.isArray(caseData?.[otherType]) ? caseData[otherType] : [];
  const content = String(messageObj?.content || "").trim();
  const time = new Date(messageObj?.time || 0).getTime();

  const twin = other.find((e: any) => {
    if (typeof e !== "object" || e === null || !e.messageId) return false;
    const sameContent = content && String(e.content || "").trim() === content;
    const sameMedia = messageObj?.mediaUrl && e.mediaUrl === messageObj.mediaUrl;
    if (!sameContent && !sameMedia) return false;
    const diff = Math.abs(new Date(e.time || 0).getTime() - time);
    return diff < 120000;
  });

  return twin?.messageId || null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { caseId: string; messageIndex: string } }
) {
  const supabase = createServiceClient();
  const { deleteType, author, historyType } = await req.json();
  
  console.log("[DELETE MSG API] Iniciando", { caseId: params.caseId, messageIndex: params.messageIndex, deleteType, author, historyType });
  
  // Log extra para diagnosticar
  console.log("[DELETE MSG API] caseId type:", typeof params.caseId, "isGroupKey:", params.caseId.includes(":") || params.caseId.includes("|"));
  
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

  console.log("[DELETE MSG API] Mensaje encontrado:", { hasMessageId: !!messageObj?.messageId, messageId: messageObj?.messageId, content: String(messageObj?.content || "").slice(0, 50), canal: caseData.canal });

  if (deleteType === "for_everyone") {
    // Eliminar para todos: marcar como deleted
    updatedMessage = { ...messageObj, deleted: true, content: "" };
    console.log("[DELETE MSG API] Eliminando para todos");

    // Sincronizar con WhatsApp si es un canal de WhatsApp y tiene messageId
    const isWhatsApp = String(caseData.canal || "").toLowerCase() === "whatsapp";
    const messageId = resolveMessageId(messageObj, caseData, historyType);
    const to = pickPhone(caseData);

    console.log("[DELETE MSG API] WhatsApp check:", { isWhatsApp, resolvedMessageId: messageId, phone: to, canal: caseData.canal });

    if (isWhatsApp && !messageId) {
      console.error("[DELETE MSG API] Sin messageId: no se puede revocar en WhatsApp");
      return NextResponse.json({
        ok: false,
        error: "Este mensaje no se puede eliminar en WhatsApp (no tiene identificador de WhatsApp)"
      }, { status: 409 });
    }

    let whatsappRevoked = false;
    let whatsappError: string | null = null;

    if (isWhatsApp && messageId && to) {
      const evoCfg = await getEvolutionConfig();
      const fromMe = (messageObj as any).fromMe ?? (historyType === "histtecnico");

      if (evoCfg?.url && evoCfg?.apiKey && evoCfg?.instance) {
        const targetJid = to.includes("@") ? to : `${to.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
        try {
          const isGroup = targetJid.includes("@g.us");
          const bodyPayload: any = {
            id: messageId,
            remoteJid: targetJid,
            fromMe: fromMe,
          };
          if (isGroup) {
            bodyPayload.participant = targetJid;
          }

          console.log("[DELETE MSG API] Enviando a Evolution:", JSON.stringify(bodyPayload));

          const res = await fetch(`${evoCfg.url.replace(/\/$/, "")}/chat/deleteMessageForEveryone/${encodeURIComponent(evoCfg.instance)}`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              apikey: evoCfg.apiKey
            },
            body: JSON.stringify(bodyPayload)
          });

          const resData = await res.json().catch(() => ({}));
          console.log("[DELETE MSG API] Evolution response:", res.status, JSON.stringify(resData));
          if (!res.ok) {
            console.error("[DELETE MSG API] Error en respuesta de Evolution:", res.status, resData);
            whatsappError = `Evolution API: ${resData?.message || resData?.error || res.status}`;
          } else {
            console.log("[DELETE MSG API] Revocación exitosa en WhatsApp.");
            whatsappRevoked = true;
          }
        } catch (evoErr) {
          console.error("[DELETE MSG API] Error conectando con Evolution API para revocar:", evoErr);
          whatsappError = "Error conectando con Evolution API";
        }
      } else {
        console.log("[DELETE MSG API] Evolution config no disponible:", { url: !!evoCfg?.url, apiKey: !!evoCfg?.apiKey, instance: !!evoCfg?.instance });
        whatsappError = "Evolution API no configurada";
      }
    } else {
      console.log("[DELETE MSG API] Omitiendo revocación en WhatsApp:", { isWhatsApp, hasMessageId: !!messageId, to });
    }

    // Si es WhatsApp y no se revocó, retornar error para que la UI reverva
    if (isWhatsApp && !whatsappRevoked) {
      return NextResponse.json({ 
        ok: false, 
        error: whatsappError || "No se pudo eliminar del chat del cliente" 
      }, { status: 500 });
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
  const targetMessageId = resolveMessageId(messageObj, caseData, historyType);
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
