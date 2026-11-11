import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";
import { broadcastCaseEvent } from "@/lib/realtime-broadcast";

// Polling de mensajes desde Evolution API como fallback al webhook.
// Render free tier se duerme y pierde webhooks. Este endpoint busca
// mensajes recientes en Evolution API y los procesa si no están en Supabase.
//
// Se llama desde un cron job de Vercel cada 1-2 minutos.

export const maxDuration = 60;

function jidToPhone(jid: string | null | undefined, rawMsg?: any): string | null {
  if (rawMsg) {
    const pn = rawMsg.key?.senderPn || rawMsg.senderPn;
    if (pn && String(pn).endsWith("@s.whatsapp.net")) {
      return String(pn).replace("@s.whatsapp.net", "").replace(/[^0-9]/g, "");
    }
  }
  if (!jid) return null;
  const s = String(jid);
  if (s.endsWith("@s.whatsapp.net")) return s.replace("@s.whatsapp.net", "");
  if (s.endsWith("@lid")) return null;
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

  // En servidor local con webhook directo activo (Evolution Docker local), omitir polling periódico
  // a menos que se solicite explícitamente con ?force=1 para no consumir Egress innecesario.
  if (!process.env.VERCEL && req.nextUrl.searchParams.get("force") !== "1") {
    return NextResponse.json({ ok: true, skipped: "local_webhook_active" });
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

    // 1. Obtener SOLO metadatos livianos de casos abiertos (evitar descargar histcliente/histtecnico de 50 chats)
    const { data: openCases } = await supabase
      .from("sek_cases")
      .select("id, customer_phone, last_message_at")
      .not("estado", "in", '("cerrado","resuelto")')
      .order("created_at", { ascending: false })
      .limit(50);

    const phoneToCaseMeta = new Map<string, { id: string; lastMessageMs: number }>();
    for (const c of openCases || []) {
      const phone = jidToPhone(c.customer_phone) || String(c.customer_phone || "").replace(/[^0-9]/g, "");
      if (phone) {
        const lastMs = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
        phoneToCaseMeta.set(phone, { id: String(c.id), lastMessageMs: isNaN(lastMs) ? 0 : lastMs });
      }
    }

    type CandidateMsg = {
      msgId: string;
      fromMe: boolean;
      phone: string;
      text: string;
      time: string;
      msgMs: number;
      caseId: string;
    };

    const candidates: CandidateMsg[] = [];
    const candidateCaseIds = new Set<string>();

    for (const record of records) {
      const msgId = record.key?.id;
      if (!msgId) continue;

      const fromMe = Boolean(record.key?.fromMe);
      const remoteJid = record.key?.remoteJid;
      const senderPn = record.key?.senderPn;
      const text = extractText(record.message);
      const ts = record.messageTimestamp;

      let phone: string | null = null;
      if (fromMe) {
        phone = jidToPhone(remoteJid);
      } else {
        if (String(remoteJid || "").endsWith("@lid")) {
          if (!senderPn) continue;
          phone = jidToPhone(senderPn);
        } else {
          phone = jidToPhone(senderPn) || jidToPhone(remoteJid);
        }
      }

      if (!phone || !text) continue;

      let msgMs = Date.now();
      let time = new Date(msgMs).toISOString();
      if (ts && typeof ts === "number") {
        const ms = ts < 1e12 ? ts * 1000 : ts;
        const d = new Date(ms);
        if (!isNaN(d.getTime())) {
          msgMs = d.getTime();
          time = d.toISOString();
        }
      }

      let meta = phoneToCaseMeta.get(phone);
      if (!meta) {
        const { data: matchCase } = await supabase
          .from("sek_cases")
          .select("id, last_message_at")
          .or(`customer_phone.ilike.%${phone}%`)
          .not("estado", "in", '("cerrado","resuelto")')
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (matchCase?.id) {
          const lastMs = matchCase.last_message_at ? new Date(matchCase.last_message_at).getTime() : 0;
          meta = { id: String(matchCase.id), lastMessageMs: isNaN(lastMs) ? 0 : lastMs };
          phoneToCaseMeta.set(phone, meta);
        }
      }

      if (!meta) continue;

      // Filtrado previo por timestamp (margen de 10 minutos por relojes/colas): si el mensaje es mucho más antiguo que last_message_at, omitir sin descargar historial
      if (meta.lastMessageMs > 0 && msgMs < meta.lastMessageMs - 600_000) {
        continue;
      }

      candidates.push({
        msgId,
        fromMe,
        phone,
        text,
        time,
        msgMs,
        caseId: meta.id,
      });
      candidateCaseIds.add(meta.id);
    }

    if (candidates.length === 0) {
      return NextResponse.json({ ok: true, polled: records.length, new: 0 });
    }

    // 2. Descargar historial SOLO de los casos candidatos puntuales para verificar messageId
    const { data: targetHistRows } = await supabase
      .from("sek_cases")
      .select("id, histcliente, histtecnico")
      .in("id", Array.from(candidateCaseIds));

    const knownIds = new Set<string>();
    for (const row of targetHistRows || []) {
      for (const m of (row.histcliente || [])) {
        if (m?.messageId) knownIds.add(m.messageId);
      }
      for (const m of (row.histtecnico || [])) {
        if (m?.messageId) knownIds.add(m.messageId);
      }
    }

    let newCount = 0;
    const newMessages: any[] = [];

    for (const c of candidates) {
      if (knownIds.has(c.msgId)) continue;
      knownIds.add(c.msgId);

      const entry = c.fromMe
        ? { role: "tecnico", time: c.time, content: c.text, author: "Soporte Sekunet", messageId: c.msgId, fromMe: true }
        : { role: "user", time: c.time, content: c.text, messageId: c.msgId, fromMe: false };

      const col = c.fromMe ? "histtecnico" : "histcliente";
      try {
        await supabase.rpc("sek_append_hist", {
          p_case_id: c.caseId,
          p_entry: entry,
          p_col: col,
          p_preview: c.text.slice(0, 200),
        });
        await broadcastCaseEvent({
          eventType: "UPDATE",
          action: "deltaEntry",
          caseId: c.caseId,
          new: {
            id: c.caseId,
            last_message_at: c.time,
            last_message_preview: c.text.slice(0, 200),
          },
          delta: { col, entry },
        });
        newCount++;
        newMessages.push({ msgId: c.msgId, phone: c.phone, text: c.text.slice(0, 40) });
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
