// Supabase Edge Function: whatsapp-webhook (Sekunet)
// Recibe eventos de Meta WhatsApp Cloud API y los inserta en sek_cases / sek_messages
// Despliegue: supabase functions deploy whatsapp-webhook --no-verify-jwt

// @ts-ignore Deno
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// @ts-ignore
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// @ts-ignore
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// @ts-ignore
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const { data: channels } = await admin
      .from("sek_channels").select("*").eq("kind", "whatsapp").eq("is_active", true);
    const ok = channels?.some((c: any) => (c.config as any)?.verify_token === token);
    if (mode === "subscribe" && ok) return new Response(challenge ?? "", { status: 200 });
    return new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const payload = await req.json();
    if (payload.object !== "whatsapp_business_account") return new Response("ignored", { status: 200 });

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;
        const value = change.value;
        const phoneNumberId: string = value?.metadata?.phone_number_id;

        const { data: channels } = await admin
          .from("sek_channels").select("*").eq("kind", "whatsapp").eq("is_active", true);
        const channel = channels?.find((c: any) => (c.config as any)?.phone_number_id === phoneNumberId);
        if (!channel) continue;

        // Mensajes entrantes
        for (const msg of value.messages || []) {
          const waId: string = msg.from;
          const contactName: string =
            (value.contacts || []).find((c: any) => c.wa_id === waId)?.profile?.name || waId;

          // Buscar o crear caso abierto para este teléfono
          const { data: openCase } = await admin
            .from("sek_cases").select("*")
            .eq("customer_phone", waId)
            .eq("canal", "whatsapp")
            .not("estado", "in", "(\"resuelto\",\"cerrado\")")
            .order("created_at", { ascending: false })
            .limit(1).maybeSingle();

          let caseRow: any = openCase;
          if (!caseRow) {
            const { data: newCase, error: ce } = await admin.from("sek_cases").insert({
              title: `WhatsApp · ${contactName}`,
              cliente: contactName,
              customer_phone: waId,
              canal: "whatsapp",
              channel_id: channel.id,
              estado: "pendiente",
              prioridad: "media",
              date: new Date().toISOString().slice(0, 10)
            }).select().single();
            if (ce) { console.error("create case error", ce); continue; }
            caseRow = newCase;
          }

          // Determinar contenido + media
          let content: string | null = null;
          let media_url: string | null = null;
          if (msg.type === "text") content = msg.text?.body ?? null;
          else if (msg.type === "image") { content = msg.image?.caption ?? "[Imagen]"; }
          else if (msg.type === "document") { content = msg.document?.caption ?? `[Documento: ${msg.document?.filename || "archivo"}]`; }
          else if (msg.type === "audio") { content = "[Audio]"; }
          else if (msg.type === "video") { content = msg.video?.caption ?? "[Video]"; }
          else if (msg.type === "location") { content = `[Ubicación] ${msg.location?.latitude}, ${msg.location?.longitude}`; }
          else { content = `[${msg.type}]`; }

          await admin.from("sek_messages").insert({
            channel: "whatsapp",
            external_id: msg.id,
            from_number: waId,
            from_name: contactName,
            content,
            media_url,
            raw_payload: msg,
            status: "received",
            case_id: caseRow.id,
            agent_email: null
          });
        }

        // Status updates
        for (const st of value.statuses || []) {
          await admin.from("sek_messages")
            .update({ status: st.status, updated_at: new Date().toISOString() })
            .eq("external_id", st.id);
        }
      }
    }
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("webhook error", e);
    return new Response("error", { status: 200 });
  }
});
