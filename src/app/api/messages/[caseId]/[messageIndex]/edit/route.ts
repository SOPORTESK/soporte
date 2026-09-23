import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";
import { pickPhone } from "@/lib/evolution-phone";

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
    .select("*")
    .eq("id", caseId)
    .maybeSingle();

  if (caseError || !caseData) {
    return NextResponse.json({ error: "case_not_found" }, { status: 404 });
  }

  const history = Array.isArray(caseData[historyType]) ? caseData[historyType] : [];
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
  const messageId = resolveMessageId(entry, caseData, historyType);
  const evoCfg = await getEvolutionConfig();

  // Editar el mensaje in-place en WhatsApp usando /chat/updateMessage/
  // Antes se revocaba el original (deleteMessageForEveryone) y se enviaba uno
  // nuevo, lo que hacía que el cliente viera dos mensajes: "Este mensaje fue
  // eliminado" + el texto editado. Con updateMessage, WhatsApp edita el
  // mensaje original y muestra "editado", igual que en la app nativa.
  let editSucceeded = false;
  if (isWhatsApp && messageId && to && evoCfg?.url && evoCfg?.apiKey && evoCfg?.instance) {
    const targetJid = to.includes("@") ? to : `${to.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
    const fromMe = (entry as any).fromMe ?? (historyType === "histtecnico");
    try {
      console.log("[EDIT MSG API] Editando mensaje in-place en WhatsApp", { messageId, targetJid });
      const cleanPhone = targetJid.split("@")[0].replace(/[^0-9]/g, "");
      const editRes = await fetch(`${evoCfg.url.replace(/\/$/, "")}/chat/updateMessage/${encodeURIComponent(evoCfg.instance)}`, {
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
        })
      });
      const editData = await editRes.json().catch(() => ({}));
      if (!editRes.ok) {
        console.warn("[EDIT MSG API] WhatsApp updateMessage no completó in-place (ej. ventana de 15m expirada o no soportada):", editRes.status, editData);
      } else {
        editSucceeded = true;
        console.log("[EDIT MSG API] Mensaje editado in-place OK en WhatsApp");
      }
    } catch (evoErr) {
      console.error("[EDIT MSG API] Error conectando con Evolution para editar:", evoErr);
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
  }

  return NextResponse.json({ ok: true, messageId });
}
