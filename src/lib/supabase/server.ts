import "@/lib/dns-boost";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceClient } from "./service";
import dns from "node:dns";

if (typeof window === "undefined" && dns?.setDefaultResultOrder) {
  try {
    dns.setDefaultResultOrder("ipv4first");
  } catch {}
}

function getCookieUserFromStore(cookieStore: ReturnType<typeof cookies>): any | null {
  try {
    const all = cookieStore.getAll();
    const chunks = all
      .filter((c) => c.name.includes("auth-token") && c.value)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (chunks.length === 0) return null;

    let cleaned = chunks.map((c) => c.value).join("");
    if (cleaned.startsWith("base64-")) {
      cleaned = Buffer.from(cleaned.slice(7), "base64").toString("utf8");
    } else {
      try {
        cleaned = decodeURIComponent(cleaned);
      } catch {}
    }

    let accessToken = "";
    if (cleaned.startsWith("{")) {
      const parsed = JSON.parse(cleaned);
      accessToken = parsed.access_token || "";
    } else if (cleaned.startsWith("[")) {
      const parsed = JSON.parse(cleaned);
      accessToken = parsed[0] || "";
    } else if (cleaned.split(".").length === 3) {
      accessToken = cleaned;
    }

    if (!accessToken) return null;
    const parts = accessToken.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (payload && payload.email) {
      return {
        id: payload.sub || "cookie-user",
        email: payload.email,
        user_metadata: payload.user_metadata || {},
        app_metadata: payload.app_metadata || {},
      };
    }
  } catch {}
  return null;
}

export function createClient() {
  const cookieStore = cookies();
  const cookieUser = getCookieUserFromStore(cookieStore);

  if (cookieUser && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const serviceClient = createServiceClient();
    const authProxy = new Proxy(serviceClient.auth, {
      get(target, prop, receiver) {
        if (prop === "getUser") {
          return async () => ({ data: { user: cookieUser }, error: null });
        }
        if (prop === "getSession") {
          return async () => ({ data: { session: { user: cookieUser } }, error: null });
        }
        if (prop === "updateUser") {
          return async (attributes: any) => {
            if (cookieUser.id && cookieUser.id !== "cookie-user") {
              return await target.admin.updateUserById(cookieUser.id, attributes);
            }
            return { data: { user: cookieUser }, error: null };
          };
        }
        const val = Reflect.get(target, prop, receiver);
        return typeof val === "function" ? val.bind(target) : val;
      },
    });

    return new Proxy(serviceClient, {
      get(target, prop, receiver) {
        if (prop === "auth") return authProxy;
        const val = Reflect.get(target, prop, receiver);
        return typeof val === "function" ? val.bind(target) : val;
      },
    });
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: "", ...options }); } catch {}
        }
      }
    }
  );
}
