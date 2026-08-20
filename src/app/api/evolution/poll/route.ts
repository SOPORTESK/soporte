import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";

// Polling de mensajes desde Evolution API como fallback al webhook.
// Render free tier se duerme y pierde webhooks. Este endpoint busca
// mensajes recientes en Evolution API y los procesa si no están en Supabase.
//
// Se llama desde un cron job de Vercel cada 1-2 minutos.

export const maxDuration = 60;

function get(obj: any, path: string) {
  return path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

function jidToPhone(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const s = String(jid);
  if (s.endsWith("@s.whatsapp.net")) return s.replace("@s.whatsapp.net", "");
  if (s.endsWith("@lid")) return null; // LID opaco, no se puede resolver aquí
  const m = s.match(/^(\d+)@/);
  return m ? m[1] : null;
}

function extractText(msg: any): string | null {
  if (!msg) return null;
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.audioMessage?.caption ||
    null
  );
}

export async function GET(req: NextRequest) {
  // Protección: solo Vercel Cron puede llamar este endpoint
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const evoCfg = await getEvolutionConfig();
  const EVO_URL = evoCfg.url;
  const EVO_KEY = evoCfg.apiKey;
  const EVO_INSTANCE = evoCfg.instance;

  if (!EVO_URL || !EVO_KEY || !EVO_INSTANCE) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  try {
    // Buscar los últimos 20 mensajes en Evolution API
    const url = `${EVO_URL.replace(/\/$/, "")}/chat/findMessages/${encodeURIComponent(EVO_INSTANCE)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVO_KEY },
      body: JSON.stringify({ limit: 20 }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "evo_error", status: res.status }, { status: 502 });
    }

    const data = await res.json();
    const records = data?.messages?.records || [];
    if (records.length === 0) {
      return NextResponse.json({ ok: true, polled: 0, new: 0 });
    }

    // Obtener los messageIds que ya tenemos en Supabase
    // Buscar casos abiertos recientes
    const { data: openCases } = await supabase
      .from("sek_cases")
      .select("id, customer_phone, histcliente, histtecnico")
      .not("estado", "in", '("cerrado","resuelto")')
      .order("created_at", { ascending: false })
      .limit(50);

    // Set de messageIds ya guardados
    const knownIds = new Set<string>();
    const phoneToCase = new Map<string, string>();
    for (const c of openCases || []) {
      const phone = jidToPhone(c.customer_phone) || String(c.customer_phone || "").replace(/[^0-9]/g, "");
      if (phone) phoneToCase.set(phone, c.id);
      for (const m of (c.histcliente || [])) {
        if (m.messageId) knownIds.add(m.messageId);
      }
      for (const m of (c.histtecnico || [])) {
        if (m.messageId) knownIds.add(m.messageId);
      }
    }

    let newCount = 0;
    const newMessages: any[] = [];

    for (const record of records) {
      const msgId = record.key?.id;
      if (!msgId || knownIds.has(msgId)) continue;

      const fromMe = record.key?.fromMe;
      const remoteJid = record.key?.remoteJid;
      const senderPn = record.key?.senderPn;
      const text = extractText(record.message);
      const ts = record.messageTimestamp;

      // Resolver teléfono
      let phone: string | null = null;
      if (fromMe) {
        phone = jidToPhone(remoteJid);
      } else {
        phone = jidToPhone(senderPn) || jidToPhone(remoteJid);
      }

      if (!phone) continue;
      if (!text) continue; // Skip media por ahora, el webhook maneja eso

      // Buscar caso para este teléfono
      let caseId = phoneToCase.get(phone);
      if (!caseId) {
        // Buscar por phone parcial
        const { data: matchCase } = await supabase
          .from("sek_cases")
          .select("id")
          .or(`customer_phone.ilike.%${phone}%`)
          .not("estado", "in", '("cerrado","resuelto")')
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (matchCase) {
          caseId = matchCase.id;
          phoneToCase.set(phone, caseId);
        }
      }

      if (!caseId) continue; // No hay caso abierto para este número

      // Calcular timestamp
      let time = new Date().toISOString();
      if (ts && typeof ts === "number") {
        const ms = ts < 1e12 ? ts * 1000 : ts;
        const d = new Date(ms);
        if (!isNaN(d.getTime())) time = d.toISOString();
      }

      const entry = fromMe
        ? { role: "tecnico", time, content: text, author: "Soporte Sekunet", messageId: msgId, fromMe: true }
        : { role: "user", time, content: text, messageId: msgId, fromMe: false };

      // Append atómico
      const col = fromMe ? "histtecnico" : "histcliente";
      try {
        await supabase.rpc("sek_append_hist", {
          p_case_id: caseId,
          p_entry: entry,
          p_col: col,
          p_preview: text.slice(0, 200),
        });
        newCount++;
        newMessages.push({ msgId, phone, text: text.slice(0, 40) });
      } catch (e: any) {
        console.error("[evo-poll] Error append:", e?.message);
      }
    }

    return NextResponse.json({
      ok: true,
      polled: records.length,
      new: newCount,
      newMessages,
    });
  } catch (e: any) {
    console.error("[evo-poll] Error:", e?.message);
    return NextResponse.json({ error: "poll_failed", message: e?.message }, { status: 500 });
  }
}
