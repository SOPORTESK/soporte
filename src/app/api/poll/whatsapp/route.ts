import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";

export const runtime = "nodejs";

// Polling simple: consulta mensajes recientes de Evolution API y los procesa
// como si vinieran del webhook. Usado como fallback cuando el webhook falla.

const POLL_INTERVAL_MS = 30000; // 30 segundos
const processedIds = new Set<string>();

export async function GET() {
  try {
    const cfg = await getEvolutionConfig();
    if (!cfg.url || !cfg.apiKey) {
      return NextResponse.json({ ok: false, error: "not_configured" });
    }

    const evoUrl = cfg.url.replace(/\/$/, "");
    const instance = cfg.instance || "sekunet";

    // 1. Obtener chats recientes
    const chatsRes = await fetch(`${evoUrl}/chat/findChats/${instance}?offset=0&limit=20`, {
      method: "GET",
      headers: { apikey: cfg.apiKey, "Content-Type": "application/json" },
    });

    if (!chatsRes.ok) {
      return NextResponse.json({ ok: false, error: "evo_chats_failed", status: chatsRes.status });
    }

    const chats = await chatsRes.json();
    const chatList = Array.isArray(chats) ? chats : [];
    let processed = 0;

    for (const chat of chatList) {
      const remoteJid = chat.id || chat.remoteJid;
      if (!remoteJid || remoteJid.endsWith("@g.us")) continue; // ignorar grupos

      // Obtener últimos mensajes de este chat
      const msgsRes = await fetch(`${evoUrl}/message/findMessages/${instance}?key=${encodeURIComponent(remoteJid)}&offset=0&limit=5`, {
        method: "GET",
        headers: { apikey: cfg.apiKey, "Content-Type": "application/json" },
      });

      if (!msgsRes.ok) continue;

      const msgs = await msgsRes.json();
      const msgList = Array.isArray(msgs) ? msgs : [];

      for (const msg of msgList) {
        const key = msg.key?.id || msg.messageTimestamp;
        if (!key || processedIds.has(key)) continue;
        processedIds.add(key);

        // Solo mensajes entrantes (no fromMe)
        if (msg.key?.fromMe) continue;

        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        const pushName = msg.pushName || "";
        const timestamp = msg.messageTimestamp;

        // Reenviar al webhook interno (la app, no Evolution)
        await fetch("http://127.0.0.1:3100/api/webhooks/evolution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "messages.upsert",
            instance: instance,
            data: {
              messages: [{
                key: {
                  remoteJid: remoteJid,
                  fromMe: false,
                  id: msg.key?.id,
                },
                message: {
                  conversation: text,
                },
                messageTimestamp: timestamp,
                pushName: pushName,
              }],
            },
          }),
        });

        processed++;
      }
    }

    // Limpiar IDs antiguos (mantener solo los últimos 500)
    if (processedIds.size > 500) {
      const ids = Array.from(processedIds);
      processedIds.clear();
      ids.slice(-500).forEach(id => processedIds.add(id));
    }

    return NextResponse.json({ ok: true, processed, chatsChecked: chatList.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "poll_error" }, { status: 500 });
  }
}
