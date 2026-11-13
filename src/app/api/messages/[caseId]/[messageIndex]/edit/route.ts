import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";
import { pickPhone } from "@/lib/evolution-phone";
import { broadcastCaseEvent } from "@/lib/realtime-broadcast";
import { updateWaOutboxText } from "@/lib/wa-outbox";

function isPendingMessageId(id: unknown): boolean {
  if (!id || typeof id !== "string") return true;
  const s = id.trim();
  if (!s) return true;
  return s.startsWith("queued-") || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function resolveMessageId(messageObj: any, caseData: any, historyType: string): string | null {
  if (messageObj?.messageId) return messageObj.messageId;
  const otherType = historyType === "histcliente" ? "histtecnico" : "histcliente";
  const other = Array.isArray(caseData?.[otherType]) ? caseData[otherType] : [];
  const content = String(messageObj?.content || "").trim();
  const time = new Date(messageObj?.time || 0).getTime();
  const twin = other.find((e: any) => {
    if (typeof e !== "object" || e === null || !e.messageId) return false;
    const sameContent = content && String(e.content || "").trim() === content;
    if (!sameContent) return false;
    const diff = Math.abs(new Date(e.time || 0).getTime() - time);
    return diff < 120000;
  });
  return twin?.messageId || null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { caseId: string; messageIndex: string } }
) {
  const { historyType, content } = await req.json().catch(() => ({}));
  const { caseId, messageIndex } = params;
  const idx = parseInt(messageIndex, 10);

  if (!caseId || isNaN(idx) || !historyType || !content) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  if (historyType !== "histtecnico" && historyType !== "histcliente") {
    return NextResponse.json({ error: "invalid_historyType" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Leer el caso completo (necesitamos canal, cliente, etc.)
  const { data: caseData, error: caseError } = await supabase
    .from("sek_cases")
    .select("id, canal, customer_phone, cliente, histcliente, histtecnico")
    .eq("id", caseId)
    .maybeSingle();

  if (caseError || !caseData) {
    return NextResponse.json({ error: "case_not_found" }, { status: 404 });
  }

  const rawCol = (caseData as any)[historyType];
  const history = Array.isArray(rawCol) ? rawCol : [];
  if (idx < 0 || idx >= history.length) {
    return NextResponse.json({ error: "message_not_found" }, { status: 404 });
  }

  const entry = history[idx];
  if (typeof entry !== "object" || entry === null) {
    return NextResponse.json({ error: "invalid_entry" }, { status: 400 });
  }

  if (entry.mediaUrl) {
    return NextResponse.json({ error: "cannot_edit_media" }, { status: 400 });
  }

  const isWhatsApp = String(caseData.canal || "").toLowerCase() === "whatsapp";
  const to = pickPhone(caseData);
  let messageId = resolveMessageId(entry, caseData, historyType);

  // Si el mensaje aún no tiene ID confirmado de WhatsApp (recién enviado o encolado),
  // esperar brevemente y releer por si el eco/outbox ya lo escribió.
  if (isWhatsApp && isPendingMessageId(messageId)) {
    await new Promise((r) => setTimeout(r, 1200));
    const { data: freshCase } = await supabase
      .from("sek_cases")
      .select("histcliente, histtecnico")
      .eq("id", caseId)
      .maybeSingle();
    if (freshCase) {
      const freshList = (freshCase as any)[historyType] || [];
      const freshMsg = freshList[idx];
      const freshObj = typeof freshMsg === "object" && freshMsg !== null ? freshMsg : entry;
      const resolved = resolveMessageId(freshObj, { ...caseData, ...freshCase }, historyType);
      if (resolved && !isPendingMessageId(resolved)) {
        messageId = resolved;
      }
    }
  }

  let editSucceeded = !isWhatsApp;
  let whatsappError: string | null = null;

  // Si sigue pendiente en wa_outbox, actualizar el texto en la cola antes de que salga
  if (isWhatsApp && messageId && String(messageId).startsWith("queued-")) {
    const updatedInQueue = await updateWaOutboxText(supabase, String(messageId), content);
    if (updatedInQueue) {
      editSucceeded = true;
      console.log("[EDIT MSG API] Texto actualizado en wa_outbox antes del envío:", messageId);
    } else {
      const { data: freshCase2 } = await supabase
        .from("sek_cases")
        .select("histcliente, histtecnico")
        .eq("id", caseId)
        .maybeSingle();
      if (freshCase2) {
        const freshList2 = (freshCase2 as any)[historyType] || [];
        const freshMsg2 = freshList2[idx];
        const freshObj2 = typeof freshMsg2 === "object" && freshMsg2 !== null ? freshMsg2 : entry;
        const resolved2 = resolveMessageId(freshObj2, { ...caseData, ...freshCase2 }, historyType);
        if (resolved2 && !isPendingMessageId(resolved2)) {
          messageId = resolved2;
        }
      }
    }
  }

  if (isWhatsApp && !editSucceeded && isPendingMessageId(messageId)) {
    console.warn("[EDIT MSG API] Sin messageId real de WhatsApp, abortando para no editar solo local:", {
      messageId,
      caseId,
      phone: to,
    });
    return NextResponse.json(
      {
        ok: false,
        error: "Este mensaje aún no tiene ID confirmado en WhatsApp. Espera unos segundos e intenta de nuevo.",
      },
      { status: 409 }
    );
  }

  // Editar el mensaje in-place en WhatsApp usando /chat/updateMessage/
  if (isWhatsApp && !editSucceeded && messageId && to) {
    let evoCfg = await getEvolutionConfig(false);
    if (!evoCfg?.url || !evoCfg?.apiKey || !evoCfg?.instance) {
      evoCfg = await getEvolutionConfig(true);
    }
    const targetJid = to.includes("@") ? to : `${to.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
    const cleanPhone = targetJid.split("@")[0].replace(/[^0-9]/g, "");
    const fromMe = (entry as any).fromMe ?? (historyType === "histtecnico");
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

    const candidates = buildCandidates(evoCfg);
    let refreshedCfg = false;

    if (evoCfg?.apiKey && evoCfg?.instance && candidates.length > 0) {
      for (let i = 0; i < candidates.length; i++) {
        const baseUrl = candidates[i];
        try {
          console.log("[EDIT MSG API] Editando mensaje in-place en WhatsApp:", baseUrl, { messageId, targetJid });
          const editRes = await fetch(`${baseUrl}/chat/updateMessage/${encodeURIComponent(evoCfg.instance)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoCfg.apiKey },
            body: JSON.stringify({
              number: cleanPhone,
              text: content,
              key: {
                remoteJid: targetJid,
                fromMe: fromMe,
                id: messageId,
              },
            }),
            signal: AbortSignal.timeout(8000),
          });
          const editData = await editRes.json().catch(() => ({}));
          if (editRes.ok) {
            editSucceeded = true;
            console.log("[EDIT MSG API] Mensaje editado in-place OK en WhatsApp vía", baseUrl);
            break;
          }
          console.warn("[EDIT MSG API] WhatsApp updateMessage rechazó la edición:", editRes.status, editData);
          whatsappError = `WhatsApp rechazó la edición (${editRes.status}: ${editData?.response?.message?.[0] || editData?.message || editData?.error || "no compatible o >15 min"})`;
        } catch (evoErr: any) {
          console.warn("[EDIT MSG API] Error conectando con Evolution en", baseUrl, evoErr?.message);
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
    }

    if (!editSucceeded) {
      return NextResponse.json(
        {
          ok: false,
          error: whatsappError || "No se pudo editar el mensaje en WhatsApp.",
        },
        { status: 502 }
      );
    }
  }

  // 3) Actualizar la BD con el nuevo contenido, messageId y flag edited
  // Releer el historial para no pisar cambios concurrentes
  const { data: freshData } = await supabase
    .from("sek_cases")
    .select(`${historyType}`)
    .eq("id", caseId)
    .maybeSingle();
  const freshHistory: any[] = Array.isArray(freshData?.[historyType]) ? freshData[historyType] : [];

  // Buscar el mensaje por _sourceIndex o por índice directo
  let targetIdx = idx;
  const sourceIndex = (entry as any)._sourceIndex;
  if (sourceIndex !== undefined) {
    const matchIdx = freshHistory.findIndex((e: any) => (e._sourceIndex ?? freshHistory.indexOf(e)) === sourceIndex);
    if (matchIdx >= 0) targetIdx = matchIdx;
  }

  if (targetIdx >= 0 && targetIdx < freshHistory.length) {
    freshHistory[targetIdx] = {
      ...freshHistory[targetIdx],
      content: content,
      edited: true,
      edited_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("sek_cases")
      .update({ [historyType]: freshHistory })
      .eq("id", caseId);

    if (updateError) {
      console.error("[EDIT MSG API] Error actualizando BD:", updateError);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }
    await broadcastCaseEvent({
      eventType: "UPDATE",
      action: "refresh_history",
      caseId: String(caseId),
      new: { id: caseId, updated_at: new Date().toISOString() },
    });
  }

  return NextResponse.json({ ok: true, messageId });
}
