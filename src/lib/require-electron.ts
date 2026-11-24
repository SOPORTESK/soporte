import { createServiceClient } from "@/lib/supabase/service";
import { cacheGet, cacheSet } from "@/lib/supabase/cache";

const SETTING_KEY = "require_electron_desktop_app";

/**
 * Reads the live `require_electron_desktop_app` setting directly from Supabase
 * with a short timeout and falls back to the last known cached boolean only on error.
 */
export async function getRequireElectronSetting(): Promise<boolean> {
  try {
    const svc = createServiceClient();
    const result = await Promise.race([
      svc
        .from("sek_app_settings")
        .select("value")
        .eq("key", SETTING_KEY)
        .maybeSingle(),
      new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: "timeout" } }), 5000)
      ),
    ]);

    if (result.error) throw new Error(result.error.message);

    let enabled = false;
    if (result.data?.value) {
      try {
        enabled = Boolean(JSON.parse(result.data.value).enabled);
      } catch {
        enabled = result.data.value === "true";
      }
    }

    cacheSet(SETTING_KEY, enabled);
    return enabled;
  } catch {
    const cached = cacheGet(SETTING_KEY);
    return typeof cached === "boolean" ? cached : false;
  }
}
