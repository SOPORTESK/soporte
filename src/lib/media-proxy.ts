export const ALLOWED_MEDIA_BUCKETS = new Set([
  "attachments",
  "avatars",
  "sek-attachments",
]);

const SUPABASE_ORIGIN = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  try {
    return raw ? new URL(raw).origin : "";
  } catch {
    return "";
  }
})();

const PUBLIC_STORAGE_PREFIX = "/storage/v1/object/public/";

/**
 * Checks whether a URL points to an allowed public bucket in this project's Supabase Storage.
 */
export function isSupabaseStoragePublicUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    if (SUPABASE_ORIGIN && parsed.origin !== SUPABASE_ORIGIN) {
      return false;
    }
    if (!SUPABASE_ORIGIN && !parsed.hostname.endsWith(".supabase.co")) {
      return false;
    }
    if (!parsed.pathname.startsWith(PUBLIC_STORAGE_PREFIX)) {
      return false;
    }
    const rest = parsed.pathname.slice(PUBLIC_STORAGE_PREFIX.length);
    const slashIdx = rest.indexOf("/");
    if (slashIdx <= 0) return false;
    const bucket = rest.slice(0, slashIdx);
    const objectPath = rest.slice(slashIdx + 1);
    return Boolean(objectPath) && ALLOWED_MEDIA_BUCKETS.has(bucket);
  } catch {
    return false;
  }
}

/**
 * Rewrites Supabase Storage public URLs into local CDN-cacheable `/api/media-proxy/...` URLs.
 * Leaves non-Storage URLs (data:, blob:, Google Drive, external URLs, empty values) untouched.
 */
export function toCachedMediaUrl<T extends string | null | undefined>(url: T): T {
  if (!url || typeof url !== "string") return url;
  const trimmed = url.trim();
  if (!isSupabaseStoragePublicUrl(trimmed)) return url;

  try {
    const parsed = new URL(trimmed);
    const rest = parsed.pathname.slice(PUBLIC_STORAGE_PREFIX.length);
    const slashIdx = rest.indexOf("/");
    const bucket = rest.slice(0, slashIdx);
    const objectPath = rest.slice(slashIdx + 1);
    return `/api/media-proxy/${bucket}/${objectPath}${parsed.search}` as T;
  } catch {
    return url;
  }
}
