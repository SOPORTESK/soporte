/**
 * Cache en memoria para consultas a Supabase.
 * Cuando Supabase está caído, devuelve la última respuesta exitosa.
 * La caché vive durante la vida del proceso (warm requests en Vercel).
 */

const store = new Map<string, { data: any; ts: number }>();
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutos máximo de datos stale
const MAX_SIZE = 100; // máximo de entradas para no crecer infinito

function pruneOldest() {
  if (store.size <= MAX_SIZE) return;
  let oldest: { key: string; ts: number } | null = null;
  for (const [k, v] of store) {
    if (!oldest || v.ts < oldest.ts) oldest = { key: k, ts: v.ts };
  }
  if (oldest) store.delete(oldest.key);
}

export function cacheGet(key: string): any | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > MAX_AGE_MS) {
    store.delete(key);
    return undefined;
  }
  return entry.data;
}

export function cacheSet(key: string, data: any): void {
  pruneOldest();
  store.set(key, { data, ts: Date.now() });
}
