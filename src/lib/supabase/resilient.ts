/**
 * Wrapper para consultas a Supabase con timeout, cache y fallback.
 * - Si Supabase responde a tiempo → guarda en cache y devuelve.
 * - Si Supabase falla o timeout → devuelve del cache.
 * - Si no hay cache → devuelve fallback vacío.
 */

import { cacheGet, cacheSet } from "./cache";

const AUTH_TIMEOUT_MS = 8000;
const DATA_TIMEOUT_MS = 15000;

export async function getUserWithTimeout(supabase: any): Promise<{ user: any }> {
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<{ data: { user: null } }>((_, reject) =>
        setTimeout(() => reject(new Error("auth_timeout")), AUTH_TIMEOUT_MS)
      ),
    ]);
    return result.data;
  } catch (e) {
    console.warn("[resilient] getUser timeout/error:", (e as Error).message);
    return { user: null };
  }
}

export async function queryWithFallback<T>(
  cacheKey: string,
  queryFn: () => PromiseLike<{ data: T | null; error: any }>,
  fallback: T
): Promise<{ data: T; error: string | null; fromCache: boolean }> {
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
