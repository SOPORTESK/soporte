import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import crypto from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri: string;
}

function getServiceAccount(): ServiceAccount {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no configurado");
  return JSON.parse(raw);
}

async function getAccessToken(): Promise<string> {
  const sa = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })).replace(/=/g, "");
  const payload = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: sa.token_uri,
    exp: now + 3600,
    iat: now,
  })).replace(/=/g, "");

  const keyData = sa.private_key.replace(/\\n/g, "\n");
  // Use Web Crypto API
  const pemContents = keyData
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const data = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, data);
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "");

  const jwt = `${header}.${payload}.${sigB64}`;

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`Google OAuth failed: ${await res.text()}`);
  const data2 = await res.json();
  return data2.access_token;
}

async function deleteFromDrive(fileId: string): Promise<boolean> {
  try {
    const accessToken = await getAccessToken();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.ok || res.status === 204;
  } catch (e: any) {
    console.error("[drive-cleanup] Error al eliminar:", e.message);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date().toISOString();
    const { data: expired, error } = await supabase
      .from("sek_drive_files")
      .select("id, drive_file_id, file_name")
      .eq("deleted", false)
      .lt("expires_at", now)
      .limit(50);

    if (error) throw error;

    let deleted = 0;
    let failed = 0;

    for (const file of expired || []) {
      const ok = await deleteFromDrive(file.drive_file_id);
      if (ok) {
        await supabase
          .from("sek_drive_files")
          .update({ deleted: true, deleted_at: now })
          .eq("id", file.id);
        deleted++;
      } else {
        failed++;
      }
    }

    const result = {
      ok: true,
      checked: expired?.length || 0,
      deleted,
      failed,
      timestamp: now,
    };
    console.log("[drive-cleanup]", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[drive-cleanup] Error:", e);
    return new Response(JSON.stringify({ error: e?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
