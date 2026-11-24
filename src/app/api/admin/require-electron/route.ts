import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cacheDelete, cacheSet } from "@/lib/supabase/cache";

export const dynamic = "force-dynamic";

const SETTING_KEY = "require_electron_desktop_app";
let cachedSetting: boolean | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 5000; // 5 segundos

export async function GET(req: NextRequest) {
  try {
    const fresh = req.nextUrl.searchParams.get("fresh") === "1";
    const now = Date.now();
    if (!fresh && cachedSetting !== null && now - lastCacheTime < CACHE_TTL_MS) {
      return NextResponse.json(
        { require_electron: cachedSetting },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const supabase = createServiceClient();
    const { data } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", SETTING_KEY)
      .maybeSingle();

    let enabled = false;
    if (data?.value) {
      try {
        const parsed = JSON.parse(data.value);
        enabled = Boolean(parsed.enabled);
      } catch {
        enabled = data.value === "true";
      }
    }

    cachedSetting = enabled;
    lastCacheTime = now;
    cacheSet(SETTING_KEY, enabled);

    return NextResponse.json(
      { require_electron: enabled },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { require_electron: cachedSetting ?? false },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { data: agentRow } = await supabase
      .from("sek_agent_config")
      .select("rol")
      .ilike("email", user.email!)
      .maybeSingle();

    if (!["admin", "superadmin"].includes(agentRow?.rol || "")) {
      return NextResponse.json({ error: "Solo administradores pueden cambiar este ajuste." }, { status: 403 });
    }

    const { require_electron } = await req.json();
    if (typeof require_electron !== "boolean") {
      return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
    }

    const svc = createServiceClient();
    const payload = JSON.stringify({ enabled: require_electron, updated_at: new Date().toISOString(), updated_by: user.email });

    const { error } = await svc
      .from("sek_app_settings")
      .upsert(
        {
          key: SETTING_KEY,
          value: payload,
          iv: "none",
          tag: "none",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );

    if (error) throw error;

    cachedSetting = require_electron;
    lastCacheTime = Date.now();
    cacheDelete(SETTING_KEY);
    cacheSet(SETTING_KEY, require_electron);

    return NextResponse.json({ success: true, require_electron });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
