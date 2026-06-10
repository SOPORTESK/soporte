import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(
  req: NextRequest,
  { params }: { params: { caseId: string; messageIndex: string } }
) {
  const supabase = createServiceClient();
  const { emoji, author, historyType } = await req.json();
  
  console.log("[REACTION API] Iniciando", { caseId: params.caseId, messageIndex: params.messageIndex, emoji, author, historyType });
  
  // historyType: "histcliente" o "histtecnico"
  const validHistoryTypes = ["histcliente", "histtecnico"];
  if (!validHistoryTypes.includes(historyType)) {
    console.error("[REACTION API] historyType inválido:", historyType);
    return NextResponse.json({ ok: false, error: "historyType inválido" }, { status: 400 });
  }

  // Si el caseId contiene separadores, es un ID de grupo - necesitamos encontrar el caso real
  let targetCaseId = params.caseId;
  if (params.caseId.includes("|") || params.caseId.includes(":")) {
    console.log("[REACTION API] ID de grupo detectado, buscando caso real con teléfono:", params.caseId.split("|")[0]);
    const { data: cases } = await supabase
      .from("sek_cases")
      .select("id")
      .ilike("customer_phone", params.caseId.split("|")[0])
      .limit(1);
    
    if (cases && cases.length > 0) {
      targetCaseId = String(cases[0].id);
      console.log("[REACTION API] Caso real encontrado:", targetCaseId);
    } else {
      console.error("[REACTION API] No se encontró caso real para el grupo");
      return NextResponse.json({ ok: false, error: "Caso no encontrado" }, { status: 404 });
    }
  }

  const { data: caseData, error: fetchError } = await supabase
    .from("sek_cases")
    .select("*")
    .eq("id", targetCaseId)
    .single();

  if (fetchError || !caseData) {
    console.error("[REACTION API] Error al buscar caso:", fetchError);
    return NextResponse.json({ ok: false, error: "Caso no encontrado" }, { status: 404 });
  }

  const history = caseData[historyType] || [];
  const msgIndex = parseInt(params.messageIndex);

  console.log("[REACTION API] Historial length:", history.length, "msgIndex:", msgIndex);

  if (msgIndex < 0 || msgIndex >= history.length) {
    console.error("[REACTION API] Índice de mensaje inválido");
    return NextResponse.json({ ok: false, error: "Índice de mensaje inválido" }, { status: 400 });
  }

  const message = history[msgIndex];
  const messageObj = typeof message === "object" && message !== null ? message : { content: String(message || "") };
  const reactions = (messageObj as any).reactions || [];

  console.log("[REACTION API] Reacciones actuales:", reactions);

  // Verificar si el usuario ya reaccionó con este emoji
  const existingReactionIndex = reactions.findIndex(
    (r: any) => r.emoji === emoji && r.author === author
  );

  let updatedReactions;
  let reactionToSend = emoji;

  if (existingReactionIndex >= 0) {
    // Quitar reacción existente
    updatedReactions = reactions.filter((_: any, i: number) => i !== existingReactionIndex);
    reactionToSend = ""; // Vacío elimina la reacción en WhatsApp
    console.log("[REACTION API] Quitando reacción existente");
  } else {
    // Agregar nueva reacción
    updatedReactions = [
      ...reactions,
      { emoji, author, time: new Date().toISOString() }
    ];
    console.log("[REACTION API] Agregando nueva reacción");
  }

  // Sincronizar con WhatsApp si es un canal de WhatsApp y tiene messageId
  const isWhatsApp = String(caseData.canal || "").toLowerCase() === "whatsapp";
  const messageId = (messageObj as any).messageId;
  const to = caseData.customer_phone;

  if (isWhatsApp && messageId && to) {
    const EVO_URL = process.env.EVOLUTION_API_URL || "";
    const EVO_KEY = process.env.EVOLUTION_API_KEY || "";
    const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE || "";

    if (EVO_URL && EVO_KEY && EVO_INSTANCE) {
      const targetJid = to.includes("@") ? to : `${to.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
      try {
        console.log("[REACTION API] Sincronizando con WhatsApp via Evolution API", {
          to: targetJid,
          reaction: reactionToSend,
          messageId,
          fromMe: (messageObj as any).fromMe ?? (historyType === "histtecnico")
        });

        const res = await fetch(`${EVO_URL.replace(/\/$/, "")}/message/sendReaction/${encodeURIComponent(EVO_INSTANCE)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: EVO_KEY
          },
          body: JSON.stringify({
            number: targetJid,
            reaction: reactionToSend,
            key: {
              remoteJid: targetJid,
              fromMe: (messageObj as any).fromMe ?? (historyType === "histtecnico"),
              id: messageId
            }
          })
        });

        const resData = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error("[REACTION API] Error en respuesta de Evolution:", res.status, resData);
        } else {
          console.log("[REACTION API] Sincronización exitosa con WhatsApp.");
        }
      } catch (evoErr) {
        console.error("[REACTION API] Error conectando con Evolution API:", evoErr);
      }
    } else {
      console.warn("[REACTION API] Evolution API no configurada para sincronizar reacción.");
    }
  } else {
    console.log("[REACTION API] Omitiendo sincronización con WhatsApp:", { isWhatsApp, hasMessageId: !!messageId, to });
  }

  // Actualizar el mensaje en la base de datos
  const updatedHistory = [...history];
  updatedHistory[msgIndex] = { ...messageObj, reactions: updatedReactions } as any;

  const { error: updateError } = await supabase
    .from("sek_cases")
    .update({ [historyType]: updatedHistory })
    .eq("id", targetCaseId);

  if (updateError) {
    console.error("[REACTION API] Error al actualizar:", updateError);
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  console.log("[REACTION API] Reacción guardada exitosamente");
  return NextResponse.json({ ok: true, reactions: updatedReactions });
}
