// Supabase Edge Function: whatsapp-send (Sekunet)
// Envía un mensaje saliente vía WhatsApp Cloud API y actualiza sek_messages.

// @ts-ignore Deno
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// @ts-ignore
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// @ts-ignore
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// @ts-ignore
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// @ts-ignore
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false }
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user?.email) return json({ error: "unauthorized" }, 401);

  const { data: agent } = await admin.from("sek_agent_config")
    .select("rol").ilike("email", user.email).maybeSingle();
  if (!agent) return json({ error: "forbidden_not_agent" }, 403);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { case_id, message_id, body } = payload || {};
  if (!case_id || !body) return json({ error: "missing_fields" }, 400);

  const { data: caseRow } = await admin
    .from("sek_cases")
    .select("*, channel:sek_channels(*)")
    .eq("id", case_id).single();
  if (!caseRow) return json({ error: "case_not_found" }, 404);
  if (caseRow.canal !== "whatsapp") return json({ error: "not_whatsapp" }, 400);

  const channel: any = caseRow.channel;
  const config = channel?.config || {};
  const phoneNumberId = config.phone_number_id;
  const accessToken = config.access_token;
  if (!phoneNumberId || !accessToken) return json({ error: "channel_misconfigured" }, 500);

  const to = caseRow.customer_phone;
  if (!to) return json({ error: "no_destination" }, 400);

  const apiUrl = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const metaRes = await fetch(apiUrl, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", recipient_type: "individual",
      to, type: "text", text: { preview_url: false, body }
    })
  });
  const metaJson = await metaRes.json();
  if (!metaRes.ok) return json({ error: "meta_error", details: metaJson }, 502);

  const wamid = metaJson?.messages?.[0]?.id;
  if (message_id && wamid) {
    await admin.from("sek_messages")
      .update({ external_id: wamid, status: "sent", updated_at: new Date().toISOString() })
      .eq("id", message_id);
  }
  return json({ ok: true, wamid });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
