interface CacheEntry {
  data: any;
  expires: number;
}

export const timelineCache = new Map<string, CacheEntry>();
export const CACHE_TTL_MS = 20000; // 20s TTL para navegación instantánea y ahorro de cuota de Supabase

export function clearTimelineCache(agentEmail?: string) {
  if (!agentEmail) {
    timelineCache.clear();
    return;
  }
  const norm = agentEmail.toLowerCase().trim();
  for (const k of Array.from(timelineCache.keys())) {
    if (k.toLowerCase().includes(norm)) {
      timelineCache.delete(k);
    }
  }
}
