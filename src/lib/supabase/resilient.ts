/**
 * Wrapper para consultas a Supabase con timeout, cache y fallback.
 * - Si Supabase responde a tiempo → guarda en cache y devuelve.
 * - Si Supabase falla o timeout → devuelve del cache.
 * - Si no hay cache → devuelve fallback vacío.
 */

import { cacheGet, cacheGetFresh, cacheSet } from "./cache";
import { cookies } from "next/headers";

const AUTH_TIMEOUT_MS = 3500;
const DATA_TIMEOUT_MS = 6000;
const USER_CACHE_TTL_MS = 60000; // 60s de caché en memoria por token

const userMemoryCache = new Map<string, { user: any; ts: number }>();

function getAuthTokenFromCookies(): string | null {
  try {
    const cookieStore = cookies();
    const all = cookieStore.getAll();
    const chunks = all
      .filter((c) => c.name.includes("auth-token") && c.value)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (chunks.length > 0) {
      return chunks.map((c) => c.value).join("");
    }
  } catch {}
  return null;
}

function decodeUserFromCookieToken(rawCookie: string | null): any | null {
  if (!rawCookie) return null;
  try {
    let cleaned = rawCookie;
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

export async function getUserWithTimeout(supabase: any): Promise<{ user: any; timedOut: boolean }> {
  const token = getAuthTokenFromCookies();
  if (token) {
    const cached = userMemoryCache.get(token);
    if (cached && Date.now() - cached.ts < USER_CACHE_TTL_MS) {
      return { user: cached.user, timedOut: false };
    }
  }

  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<{ data: { user: null }; error: { message: string } }>((_, reject) =>
        setTimeout(() => reject(new Error("auth_timeout")), AUTH_TIMEOUT_MS)
      ),
    ]);

    const user = result?.data?.user || null;
    if (user && token) {
      if (userMemoryCache.size > 100) userMemoryCache.clear();
      userMemoryCache.set(token, { user, ts: Date.now() });
      return { user, timedOut: false };
    }

    // Si Supabase devolvió error de red / 521 pero la cookie contiene un JWT válido, usar el usuario del JWT
    const cookieUser = decodeUserFromCookieToken(token);
    if (cookieUser) {
      if (token) userMemoryCache.set(token, { user: cookieUser, ts: Date.now() });
      return { user: cookieUser, timedOut: false };
    }

    return { user: null, timedOut: false };
  } catch (e) {
    console.warn("[resilient] getUser timeout/error:", (e as Error).message);
    if (token) {
      const fallbackCached = userMemoryCache.get(token);
      if (fallbackCached?.user) {
        return { user: fallbackCached.user, timedOut: false };
      }
      const cookieUser = decodeUserFromCookieToken(token);
      if (cookieUser) {
        userMemoryCache.set(token, { user: cookieUser, ts: Date.now() });
        return { user: cookieUser, timedOut: false };
      }
    }
    return { user: null, timedOut: true };
  }
}

export async function queryWithFallback<T>(
  cacheKey: string,
  queryFn: () => PromiseLike<{ data: T | null; error: any }>,
  fallback: T,
  freshTtlMs?: number
): Promise<{ data: T; error: string | null; fromCache: boolean }> {
  // 0. Si hay caché reciente y aún dentro de su TTL, devolver de inmediato (0ms)
  if (freshTtlMs && freshTtlMs > 0) {
    const fresh = cacheGetFresh(cacheKey, freshTtlMs);
    if (fresh !== undefined) {
      return { data: fresh as T, error: null, fromCache: true };
    }
  }

  // 1. Intentar Supabase con timeout
  try {
    const result = await Promise.race([
      queryFn(),
      new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(
          () => resolve({ data: null, error: { message: "timeout" } }),
          DATA_TIMEOUT_MS
        )
      ),
    ]);

    if (result.error) {
      console.warn(`[resilient] ${cacheKey} error:`, result.error.message);
      // 2. Fallback a cache
      const cached = cacheGet(cacheKey);
      if (cached !== undefined) {
        console.log(`[resilient] ${cacheKey} → sirviendo de cache (${JSON.stringify(cached).length} bytes)`);
        return { data: cached as T, error: result.error.message, fromCache: true };
      }
      return { data: fallback, error: result.error.message, fromCache: false };
    }

    // 3. Éxito → guardar en cache
    const finalData = (result.data ?? fallback) as T;
    cacheSet(cacheKey, finalData);
    return { data: finalData, error: null, fromCache: false };
  } catch (e: any) {
    console.warn(`[resilient] ${cacheKey} exception:`, e.message);
    // 4. Excepción → cache
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) {
      return { data: cached as T, error: e.message, fromCache: true };
    }
    return { data: fallback, error: e.message, fromCache: false };
  }
}
