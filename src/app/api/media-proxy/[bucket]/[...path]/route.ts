import "@/lib/dns-boost";
import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_MEDIA_BUCKETS } from "@/lib/media-proxy";

export const runtime = "nodejs";

const MAX_PROXY_BYTES = 4_000_000; // Stay safely under Vercel's 4.5 MB Serverless payload cap
const ONE_YEAR_IMMUTABLE = "public, max-age=31536000, s-maxage=31536000, immutable";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_CACHE_ENTRIES = 40;
const MAX_CACHE_TOTAL_BYTES = 45 * 1024 * 1024; // 45 MB cap

type MediaCacheItem = {
  buf: Buffer;
  contentType: string;
  etag?: string | null;
  contentDisposition?: string | null;
  ts: number;
};

const globalMediaCache = globalThis as unknown as {
  __sekMediaProxyCache?: Map<string, MediaCacheItem>;
};

function getMediaCache(): Map<string, MediaCacheItem> {
  if (!globalMediaCache.__sekMediaProxyCache) {
    globalMediaCache.__sekMediaProxyCache = new Map();
  }
  return globalMediaCache.__sekMediaProxyCache;
}

function getCachedMedia(key: string): MediaCacheItem | null {
  const cache = getMediaCache();
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // Refresh LRU order
  cache.delete(key);
  cache.set(key, item);
  return item;
}

function setCachedMedia(key: string, item: MediaCacheItem) {
  const cache = getMediaCache();
  if (cache.has(key)) cache.delete(key);
  cache.set(key, item);

  let totalBytes = 0;
  cache.forEach((v) => {
    totalBytes += v.buf.byteLength;
  });

  while (cache.size > MAX_CACHE_ENTRIES || totalBytes > MAX_CACHE_TOTAL_BYTES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    const evicted = cache.get(oldestKey);
    cache.delete(oldestKey);
    if (evicted) totalBytes -= evicted.buf.byteLength;
  }
}

function isVideoPath(pathJoined: string): boolean {
  return /\.(mp4|mov|webm|mkv|avi)$/i.test(pathJoined.split("?")[0] || "");
}

function buildMediaResponse(item: MediaCacheItem, rangeHeader: string | null): NextResponse {
  const total = item.buf.byteLength;
  const baseHeaders: Record<string, string> = {
    "Content-Type": item.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": ONE_YEAR_IMMUTABLE,
    "CDN-Cache-Control": "public, max-age=31536000, immutable",
    "Vercel-CDN-Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    Vary: "Accept-Encoding",
  };
  if (item.etag) baseHeaders["ETag"] = item.etag;
  if (item.contentDisposition) baseHeaders["Content-Disposition"] = item.contentDisposition;

  if (rangeHeader && total > 0) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    if (match) {
      let start = match[1] ? parseInt(match[1], 10) : 0;
      let end = match[2] ? parseInt(match[2], 10) : total - 1;
      if (!match[1] && match[2]) {
        const suffixLen = parseInt(match[2], 10);
        start = Math.max(0, total - suffixLen);
        end = total - 1;
      }
      if (!isNaN(start) && !isNaN(end) && start >= 0 && start < total) {
        end = Math.min(end, total - 1);
        const slice = item.buf.subarray(start, end + 1);
        return new NextResponse(new Uint8Array(slice), {
          status: 206,
          headers: {
            ...baseHeaders,
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Content-Length": String(slice.byteLength),
          },
        });
      }
    }
  }

  return new NextResponse(new Uint8Array(item.buf), {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Length": String(total),
    },
  });
}

function sanitizePathSegments(segments: string[] | undefined): string[] | null {
  if (!Array.isArray(segments) || segments.length === 0) return null;
  const cleaned: string[] = [];
  for (const seg of segments) {
    if (!seg || seg === "." || seg === ".." || seg.includes("\\") || seg.includes("\0")) {
      return null;
    }
    if (seg.includes("/") || seg.includes("..")) {
      return null;
    }
    cleaned.push(encodeURIComponent(seg));
  }
  return cleaned;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { bucket: string; path: string[] } }
) {
  const bucket = (params?.bucket || "").trim();
  if (!ALLOWED_MEDIA_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }

  const safeSegments = sanitizePathSegments(params?.path);
  if (!safeSegments) {
    return NextResponse.json({ error: "Invalid object path" }, { status: 400 });
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  if (!supabaseUrl) {
    return NextResponse.json({ error: "Storage URL not configured" }, { status: 500 });
  }

  const search = req.nextUrl.search || "";
  const joinedPath = safeSegments.join("/");
  const upstreamUrl = `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${joinedPath}${search}`;
  const cacheKey = `${bucket}/${joinedPath}${search}`;
  const rangeHeader = req.headers.get("range");

  const cached = getCachedMedia(cacheKey);
  if (cached) {
    return buildMediaResponse(cached, rangeHeader);
  }

  // Range requests on heavy videos redirect directly so large video streaming doesn't buffer in serverless memory
  if (rangeHeader && isVideoPath(joinedPath)) {
    return NextResponse.redirect(upstreamUrl, {
      status: 307,
      headers: {
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: "GET",
      headers: { "Accept-Encoding": "identity" },
    });

    if (!upstreamRes.ok) {
      await upstreamRes.body?.cancel?.().catch(() => {});
      return NextResponse.json(
        { error: "Upstream media error", status: upstreamRes.status },
        {
          status: upstreamRes.status,
          headers: { "Cache-Control": "public, max-age=60" },
        }
      );
    }

    const declaredLength = Number(upstreamRes.headers.get("content-length") || "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PROXY_BYTES) {
      await upstreamRes.body?.cancel?.().catch(() => {});
      return NextResponse.redirect(upstreamUrl, {
        status: 307,
        headers: {
          "Cache-Control": "public, max-age=3600",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const buf = Buffer.from(await upstreamRes.arrayBuffer());
    if (buf.byteLength > MAX_PROXY_BYTES) {
      return NextResponse.redirect(upstreamUrl, {
        status: 307,
        headers: {
          "Cache-Control": "public, max-age=3600",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    let contentType = upstreamRes.headers.get("content-type") || "application/octet-stream";
    if (contentType.toLowerCase().includes("text/html")) {
      contentType = "application/octet-stream";
    }

    const mediaItem: MediaCacheItem = {
      buf,
      contentType,
      etag: upstreamRes.headers.get("etag"),
      contentDisposition: upstreamRes.headers.get("content-disposition"),
      ts: Date.now(),
    };
    setCachedMedia(cacheKey, mediaItem);

    return buildMediaResponse(mediaItem, rangeHeader);
  } catch (err) {
    console.warn("[media-proxy] fetch failed:", err);
    return NextResponse.json(
      { error: "Media fetch failed" },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
