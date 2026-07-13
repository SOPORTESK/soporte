import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

interface TechMessage {
  role: "user" | "assistant";
  content: string;
  time: string;
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { message, case_id, messages: clientMessages, mediaUrl, mediaType, fileName } = await req.json();

    if ((!message || typeof message !== "string" || !message.trim()) && (!mediaUrl || typeof mediaUrl !== "string")) {
      return NextResponse.json({ error: "Mensaje o adjunto requerido" }, { status: 400 });
    }

    const messages: TechMessage[] = Array.isArray(clientMessages) ? clientMessages as TechMessage[] : [];

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Verificar que sea staff
    const { data: agent } = await supabase
      .from("sek_agent_config")
      .select("email")
      .ilike("email", user.email)
      .maybeSingle();
    if (!agent) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Validar case_id: resolver claves de agrupación tel: y case:
    let validCaseId: string | null = null;
    if (case_id) {
      let caseQuery = serviceClient.from("sek_cases").select("id").limit(1);
      if (case_id.startsWith("tel:")) {
        const phone = case_id.substring(4).trim();
        caseQuery = caseQuery.ilike("customer_phone", `%${phone}%`);
      } else if (case_id.startsWith("case:")) {
        caseQuery = caseQuery.eq("id", case_id.substring(5));
      } else {
        caseQuery = caseQuery.eq("id", case_id);
      }
      const { data: caseData } = await caseQuery.maybeSingle();
      if (caseData) validCaseId = caseData.id;
    }

    const now = new Date().toISOString();
    const userMsg: TechMessage = {
      role: "user",
      content: (message || "").trim(),
      time: now,
      mediaUrl: mediaUrl || undefined,
      mediaType: mediaType || undefined,
      fileName: fileName || undefined,
    };
    const updatedMessages = [...messages, userMsg];

    // Llamar ia-agent en modo técnico
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    let responseText = "Disculpe, no pude obtener una respuesta en este momento.";

    if (SUPABASE_URL && SERVICE_KEY) {
      try {
        const iaRes = await fetch(`${SUPABASE_URL}/functions/v1/ia-agent`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: "tecnico",
            case_id: validCaseId || undefined,
            messages: updatedMessages.map(m => ({ role: m.role, content: m.content, mediaUrl: m.mediaUrl, mediaType: m.mediaType, fileName: m.fileName })),
          }),
        });
        if (iaRes.ok) {
          const iaData = await iaRes.json();
          responseText = iaData.response || responseText;
        } else {
          const errText = await iaRes.text();
          console.error("[tech-assistant] ia-agent error:", iaRes.status, errText);
        }
      } catch (e: any) {
        console.error("[tech-assistant] fetch ia-agent error:", e.message);
      }
    }

    const assistantMsg: TechMessage = { role: "assistant", content: responseText, time: new Date().toISOString() };
    const finalMessages = [...updatedMessages, assistantMsg];

    return NextResponse.json({
      ok: true,
      response: responseText,
      messages: finalMessages,
    });
  } catch (e: any) {
    console.error("[tech-assistant] error:", e.message);
    return NextResponse.json({ error: e?.message || "Error inesperado" }, { status: 500 });
  }
}
