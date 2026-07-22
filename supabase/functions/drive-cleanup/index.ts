import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function refreshAccessToken(): Promise<string> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data } = await supabase
    .from("sek_drive_config")
    .select("refresh_token")
    .eq("id", 1)
    .single();
  const refreshToken = data?.refresh_token;
  if (!refreshToken) throw new Error("Google Drive no autorizado");

  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const tokens = await res.json();
  return tokens.access_token;
}

async function deleteFromDrive(fileId: string): Promise<boolean> {
  try {
    const accessToken = await refreshAccessToken();
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
