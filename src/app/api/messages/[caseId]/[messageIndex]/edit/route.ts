import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 8 && !digits.startsWith("506")) return `506${digits}`;
  return digits;
}

function pickPhone(c: any): string | null {
  if (typeof c?.cliente === "object") {
    const telReal = String(c.cliente?.telefono_real || "").trim();
    if (telReal) return telReal.includes("@") ? telReal : `${normalizePhone(telReal)}@s.whatsapp.net`;
  }
  const cust = (c?.customer_phone || "").toString().trim();
  if (cust) return cust.includes("@") ? cust : `${normalizePhone(cust)}@s.whatsapp.net`;
  if (typeof c?.cliente === "object") {
    const tel = String(c.cliente?.telefono || "").trim();
    if (tel) return tel.includes("@") ? tel : `${normalizePhone(tel)}@s.whatsapp.net`;
  }
  return null;
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

  // 1) Revocar el mensaje original en WhatsApp
  if (isWhatsApp && messageId && to && evoCfg?.url && evoCfg?.apiKey && evoCfg?.instance) {
    const targetJid = to.includes("@") ? to : `${to.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
    const fromMe = (entry as any).fromMe ?? (historyType === "histtecnico");
    try {
      console.log("[EDIT MSG API] Revocando mensaje original en WhatsApp", { messageId, targetJid });
      const delRes = await fetch(`${evoCfg.url.replace(/\/$/, "")}/chat/deleteMessageForEveryone/${encodeURIComponent(evoCfg.instance)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", apikey: evoCfg.apiKey },
        body: JSON.stringify({ id: messageId, remoteJid: targetJid, fromMe, participant: targetJid })
      });
      const delData = await delRes.json().catch(() => ({}));
      if (!delRes.ok) {
        console.error("[EDIT MSG API] Error revocando original:", delRes.status, delData);
        return NextResponse.json({ error: `No se pudo revocar el mensaje original: ${delData?.message || delData?.error || delRes.status}` }, { status: 500 });
      }
      console.log("[EDIT MSG API] Mensaje original revocado OK");
    } catch (evoErr) {
      console.error("[EDIT MSG API] Error conectando con Evolution para revocar:", evoErr);
      return NextResponse.json({ error: "Error conectando con Evolution API para revocar" }, { status: 500 });
    }
  }

  // 2) Enviar el nuevo texto editado por WhatsApp
  let newMessageId: string | undefined;
  if (isWhatsApp && to && evoCfg?.url && evoCfg?.apiKey && evoCfg?.instance) {
    const targetJid = to.includes("@") ? to : `${to.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
    try {
      console.log("[EDIT MSG API] Enviando texto editado a WhatsApp", { targetJid, content: content.slice(0, 50) });
      const sendRes = await fetch(`${evoCfg.url.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(evoCfg.instance)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evoCfg.apiKey },
        body: JSON.stringify({
          number: targetJid.split("@")[0],
          text: content,
        })
      });
      const sendData = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok) {
        console.error("[EDIT MSG API] Error enviando texto editado:", sendRes.status, sendData);
        return NextResponse.json({ error: `No se pudo enviar el texto editado: ${sendData?.message || sendData?.error || sendRes.status}` }, { status: 500 });
      }
      newMessageId = sendData?.key?.id || sendData?.messageId || undefined;
      console.log("[EDIT MSG API] Texto editado enviado OK, newMessageId:", newMessageId);
    } catch (evoErr) {
      console.error("[EDIT MSG API] Error enviando texto editado:", evoErr);
      return NextResponse.json({ error: "Error enviando texto editado por WhatsApp" }, { status: 500 });
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
      ...(newMessageId ? { messageId: newMessageId, fromMe: true } : {}),
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

  return NextResponse.json({ ok: true, newMessageId });
}
