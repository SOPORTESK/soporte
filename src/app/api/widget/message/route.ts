import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { broadcastCaseEvent } from "@/lib/realtime-broadcast";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { 
      session_id, 
      content, 
      role = "user",
      mediaUrl,
      mediaType,
      fileName
    } = body as Record<string, string>;

    if (!session_id || (!content?.trim() && !mediaUrl)) {
      return NextResponse.json({ error: "Faltan datos requeridos" }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: existing, error: fetchErr } = await supabase
      .from("sek_cases")
      .select("id, histcliente, estado")
      .eq("id", session_id)
      .eq("canal", "widget")
      .maybeSingle();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
    }

    const entry = {
      role,
      time: new Date().toISOString(),
      content: content?.trim() || fileName || "Archivo adjunto",
      mediaUrl,
      mediaType,
      fileName
    };

    const newHist = [...(Array.isArray(existing.histcliente) ? existing.histcliente : []), entry];

    const { error: updateErr } = await supabase
      .from("sek_cases")
      .update({ histcliente: newHist })
      .eq("id", session_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    const pushedEntry = Array.isArray(newHist) && newHist.length > 0 ? newHist[newHist.length - 1] : null;
    await broadcastCaseEvent({
      eventType: "UPDATE",
      action: pushedEntry ? "deltaEntry" : "refresh_history",
      caseId: String(session_id),
      new: {
        id: session_id,
        last_message_at: pushedEntry?.time || new Date().toISOString(),
        last_message_preview: String(pushedEntry?.content || "").slice(0, 200),
      },
      delta: pushedEntry
        ? { col: role === "user" ? "histcliente" : "histtecnico", entry: pushedEntry }
        : undefined,
    });

    // Disparar ia-agent para que responda al mensaje
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const casoEstado = String(existing.estado || "").toLowerCase();
    if (SUPABASE_URL && SERVICE_KEY && role === "user" && casoEstado === "ia_atendiendo") {
      try {
        // Hacemos el fetch en "fire and forget" o con await, pero como es Vercel,
        // no bloquearemos la respuesta al widget para que la UI sea rápida.
        fetch(`${SUPABASE_URL}/functions/v1/ia-agent`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ case_id: session_id }),
        }).then(async (iaRes) => {
          if (iaRes.ok) {
            await broadcastCaseEvent({
              eventType: "UPDATE",
              action: "refresh_history",
              caseId: String(session_id),
              new: { id: session_id, updated_at: new Date().toISOString() },
            });
          }
        }).catch(err => console.error("[widget-webhook] Error background ia-agent:", err));
      } catch (err) {
        console.error("[widget-webhook] Error invocando ia-agent:", err);
      }
    }

    return NextResponse.json({ ok: true, entry });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error inesperado" }, { status: 500 });
  }
}
