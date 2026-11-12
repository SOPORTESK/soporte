import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";
import { pickPhone } from "@/lib/evolution-phone";
import { broadcastCaseEvent } from "@/lib/realtime-broadcast";
import { enqueueWaOutbox, removeFromWaOutbox } from "@/lib/wa-outbox";

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
    console.log("[DELETE MSG API] ID de grupo detectado, buscando caso real");
    const { data: cases } = await supabase
      .from("sek_cases")
      .select("id")
      .ilike("customer_phone", params.caseId.split("|")[0])
      .limit(1);
    
    if (cases && cases.length > 0) {
      targetCaseId = String(cases[0].id);
    } else {
      console.error("[DELETE MSG API] No se encontró caso real para el grupo");
      return NextResponse.json({ ok: false, error: "Caso no encontrado" }, { status: 404 });
    }
  }

  const { data: caseData, error: fetchError } = await supabase
    .from("sek_cases")
    .select("id, canal, customer_phone, cliente, histcliente, histtecnico")
    .eq("id", targetCaseId)
    .single();

  if (fetchError || !caseData) {
    console.error("[DELETE MSG API] Error al buscar caso:", fetchError);
    return NextResponse.json({ ok: false, error: "Caso no encontrado" }, { status: 404 });
  }

  const history = (caseData as any)[historyType] || [];
  const msgIndex = parseInt(params.messageIndex);

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

    // Sincronizar con WhatsApp si es un canal de WhatsApp y tiene messageId real
    const isWhatsApp = String(caseData.canal || "").toLowerCase() === "whatsapp";
    let messageId = resolveMessageId(messageObj, caseData, historyType);
    const to = pickPhone(caseData);

    // Si el mensaje se acaba de enviar o estaba encolado (queued-), esperar brevemente
    // y releer una sola vez por si el eco/outbox ya escribió el messageId real de WhatsApp.
    if (isWhatsApp && (!messageId || String(messageId).startsWith("queued-"))) {
      await new Promise((r) => setTimeout(r, 1200));
      const { data: freshCase } = await supabase
        .from("sek_cases")
        .select("histcliente, histtecnico")
        .eq("id", targetCaseId)
        .maybeSingle();
      if (freshCase) {
        const freshList = (freshCase as any)[historyType] || [];
        const freshMsg = freshList[msgIndex];
        const freshObj = typeof freshMsg === "object" && freshMsg !== null ? freshMsg : messageObj;
        const resolved = resolveMessageId(freshObj, { ...caseData, ...freshCase }, historyType);
        if (resolved && !String(resolved).startsWith("queued-")) {
          messageId = resolved;
        }
      }
    }

    let whatsappRevoked = false;
    let whatsappError: string | null = null;

    if (isWhatsApp && messageId && String(messageId).startsWith("queued-")) {
      const cancelled = await removeFromWaOutbox(supabase, String(messageId));
      if (cancelled) {
        whatsappRevoked = true;
        console.log("[DELETE MSG API] Mensaje encolado cancelado antes de enviarse a WhatsApp:", messageId);
      } else {
        // Releer una vez más por si el worker lo entregó justo mientras intentábamos cancelar
        const { data: freshCase2 } = await supabase
          .from("sek_cases")
          .select("histcliente, histtecnico")
          .eq("id", targetCaseId)
          .maybeSingle();
        if (freshCase2) {
          const freshList2 = (freshCase2 as any)[historyType] || [];
          const freshMsg2 = freshList2[msgIndex];
          const freshObj2 = typeof freshMsg2 === "object" && freshMsg2 !== null ? freshMsg2 : messageObj;
          const resolved2 = resolveMessageId(freshObj2, { ...caseData, ...freshCase2 }, historyType);
          if (resolved2 && !String(resolved2).startsWith("queued-")) {
            messageId = resolved2;
          }
        }
      }
    }

    if (isWhatsApp && (!messageId || String(messageId).startsWith("queued-")) && !whatsappRevoked) {
      console.warn("[DELETE MSG API] Sin messageId real de WhatsApp, abortando 'for_everyone' para no ocultar solo local:", {
        messageId,
        canal: caseData.canal,
        phone: to,
      });
      return NextResponse.json(
        {
          ok: false,
          error:
            "Este mensaje aún no tiene ID confirmado en WhatsApp. Espera unos segundos e intenta de nuevo, o elimínalo directo en WhatsApp.",
        },
        { status: 409 }
      );
    }

    if (isWhatsApp && !whatsappRevoked && messageId && to) {
      let evoCfg = await getEvolutionConfig(false);
      if (!evoCfg?.url || !evoCfg?.apiKey || !evoCfg?.instance) {
        evoCfg = await getEvolutionConfig(true);
      }
      const fromMe = (messageObj as any).fromMe ?? (historyType === "histtecnico");
      const targetJid = to; // pickPhone ya retorna el JID completo
      const isGroup = targetJid.includes("@g.us");
      const bodyPayload: any = {
        id: messageId,
        remoteJid: targetJid,
        fromMe: fromMe,
      };
      if (isGroup && (messageObj as any).participant) {
        bodyPayload.participant = (messageObj as any).participant;
      }

      const buildCandidates = (cfg: typeof evoCfg) =>
        Array.from(
          new Set(
            [
              !process.env.VERCEL ? "http://127.0.0.1:28080" : "",
              !process.env.VERCEL ? "http://localhost:28080" : "",
              ...(cfg?.candidates || []),
              cfg?.url || "",
            ]
              .map((u) => String(u || "").replace(/\/$/, ""))
              .filter(Boolean)
          )
        );

      let candidates = buildCandidates(evoCfg);
      let refreshedCfg = false;

      if (evoCfg?.apiKey && evoCfg?.instance && candidates.length > 0) {
        for (let i = 0; i < candidates.length; i++) {
          const baseUrl = candidates[i];
          try {
            console.log("[DELETE MSG API] Enviando a Evolution:", baseUrl, JSON.stringify(bodyPayload));
            const res = await fetch(
              `${baseUrl}/chat/deleteMessageForEveryone/${encodeURIComponent(evoCfg.instance)}`,
              {
                method: "DELETE",
                headers: {
                  "Content-Type": "application/json",
                  apikey: evoCfg.apiKey,
                },
                body: JSON.stringify(bodyPayload),
                signal: AbortSignal.timeout(8000),
              }
            );

            const resData = await res.json().catch(() => ({}));
            console.log("[DELETE MSG API] Respuesta de Evolution:", res.status, JSON.stringify(resData));

            if (res.ok) {
              whatsappRevoked = true;
              console.log("[DELETE MSG API] WhatsApp revocado OK vía", baseUrl);
              break;
            }
            console.error("[DELETE MSG API] Error en respuesta de Evolution:", res.status, resData);
            whatsappError = `Evolution API: ${resData?.message || resData?.error || res.status}`;
          } catch (evoErr: any) {
            console.warn("[DELETE MSG API] Error conectando con Evolution API en", baseUrl, evoErr?.message);
            whatsappError = "Error conectando con Evolution API";
            if (!refreshedCfg) {
              refreshedCfg = true;
              const fresh = await getEvolutionConfig(true);
              for (const u of buildCandidates(fresh)) {
                if (!candidates.includes(u)) candidates.push(u);
              }
              evoCfg = fresh;
            }
          }
        }
      } else {
        whatsappError = "Evolution API no configurada";
        console.error("[DELETE MSG API] Evolution no configurada. url:", !!evoCfg?.url, "key:", !!evoCfg?.apiKey, "instance:", !!evoCfg?.instance);
      }

      // Si falló la conexión directa (túnel desde Vercel), delegar revocación al worker local vía wa_outbox_queue
      if (!whatsappRevoked) {
        const queued = await enqueueWaOutbox(supabase, {
          id: `del-${messageId}`,
          action: "delete",
          case_id: String(targetCaseId),
          to: targetJid,
          deletePayload: bodyPayload,
          created_at: new Date().toISOString(),
          status: "pending",
          attempts: 0,
          last_error: whatsappError || undefined,
        });
        if (queued) {
          whatsappRevoked = true;
          console.log("[DELETE MSG API] Revocación delegada a wa_outbox_queue:", `del-${messageId}`);
        }
      }
    }

    // Si es WhatsApp, se intentó revocar y falló, retornar error
    if (isWhatsApp && !whatsappRevoked) {
      return NextResponse.json({
        ok: false,
        error: whatsappError || "No se pudo eliminar del chat del cliente",
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

  await broadcastCaseEvent({
    eventType: "UPDATE",
    action: "refresh_history",
    caseId: String(targetCaseId),
    new: { id: targetCaseId, updated_at: new Date().toISOString() },
  });

  console.log("[DELETE MSG API] Mensaje eliminado exitosamente en caso:", targetCaseId);
  return NextResponse.json({ ok: true });
}
