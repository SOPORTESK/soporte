import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 10;

// Cache en memoria para respuestas rápidas
const memoryCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 horas

function extractMeta(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match && match[1] ? match[1].trim() : null;
}

function extractYouTubeVideoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && /^[\w-]{6,15}$/.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const v = url.searchParams.get("v");
    if (v && /^[\w-]{6,15}$/.test(v)) return v;
    const parts = url.pathname.split("/").filter(Boolean);
    if ((parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live" || parts[0] === "v") && parts[1]) {
      return /^[\w-]{6,15}$/.test(parts[1]) ? parts[1] : null;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const urlStr = req.nextUrl.searchParams.get("url");
    if (!urlStr) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(urlStr);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    const cacheKey = targetUrl.toString();
    const cached = memoryCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return NextResponse.json(cached.data);
    }

    // 1. Caso especial: enlaces de YouTube (usar API oficial oEmbed + miniatura HD de i.ytimg.com)
    const ytId = extractYouTubeVideoId(targetUrl);
    if (ytId) {
      const canonicalWatchUrl = `https://www.youtube.com/watch?v=${ytId}`;
      const fallbackThumb = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalWatchUrl)}&format=json`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (oembedRes.ok) {
          const oembed = await oembedRes.json();
          const result = {
            ok: true,
            title: oembed.title || "YouTube Video",
            description: oembed.author_name ? `${oembed.author_name} • YouTube` : "YouTube",
            image: oembed.thumbnail_url || fallbackThumb,
            siteName: "YouTube",
            domain: "youtube.com",
            url: targetUrl.toString(),
            isVideo: true,
          };
          memoryCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
          return NextResponse.json(result, {
            headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200" },
          });
        }
      } catch {
        // Si falla oEmbed, devolver miniatura directa de i.ytimg.com
      }

      const fallbackResult = {
        ok: true,
        title: "Video de YouTube",
        description: "youtube.com",
        image: fallbackThumb,
        siteName: "YouTube",
        domain: "youtube.com",
        url: targetUrl.toString(),
        isVideo: true,
      };
      memoryCache.set(cacheKey, { data: fallbackResult, expiresAt: Date.now() + CACHE_TTL_MS });
      return NextResponse.json(fallbackResult);
    }

    // 2. Otros proveedores de video (Vimeo, TikTok, Dailymotion, Loom) vía noembed
    if (/(vimeo\.com|tiktok\.com|dailymotion\.com|loom\.com)/i.test(targetUrl.hostname)) {
      try {
        const noembedRes = await fetch(
          `https://noembed.com/embed?url=${encodeURIComponent(targetUrl.toString())}`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (noembedRes.ok) {
          const oe = await noembedRes.json();
          if (oe && oe.title && !oe.error) {
            const result = {
              ok: true,
              title: oe.title,
              description: oe.author_name ? `${oe.author_name} • ${oe.provider_name || targetUrl.hostname}` : oe.provider_name || targetUrl.hostname,
              image: oe.thumbnail_url || null,
              siteName: oe.provider_name || targetUrl.hostname,
              domain: targetUrl.hostname.replace(/^www\./i, ""),
              url: targetUrl.toString(),
              isVideo: true,
            };
            memoryCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
            return NextResponse.json(result, {
              headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200" },
            });
          }
        }
      } catch {
        // Continuar con scraping estándar
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    const res = await fetch(targetUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html) WhatsApp/2.24.1",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        domain: targetUrl.hostname,
        url: targetUrl.toString(),
      });
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return NextResponse.json({
        ok: true,
        title: targetUrl.pathname.split("/").pop() || targetUrl.hostname,
        domain: targetUrl.hostname,
        url: targetUrl.toString(),
      });
    }

    const html = await res.text();

    // Extraer título
    const ogTitle =
      extractMeta(html, /<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i) ||
      extractMeta(html, /<meta\s+content=["'](.*?)["']\s+property=["']og:title["']/i) ||
      extractMeta(html, /<meta\s+name=["']twitter:title["']\s+content=["'](.*?)["']/i) ||
      extractMeta(html, /<title[^>]*>(.*?)<\/title>/i);

    // Extraer descripción
    const ogDescription =
      extractMeta(html, /<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i) ||
      extractMeta(html, /<meta\s+content=["'](.*?)["']\s+property=["']og:description["']/i) ||
      extractMeta(html, /<meta\s+name=["']description["']\s+content=["'](.*?)["']/i) ||
      extractMeta(html, /<meta\s+content=["'](.*?)["']\s+name=["']description["']/i);

    // Extraer imagen principal (solo og:image / twitter:image o imagen grande real, NUNCA favicon pequeño que se pixela)
    let rawImage =
      extractMeta(html, /<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i) ||
      extractMeta(html, /<meta\s+content=["'](.*?)["']\s+property=["']og:image["']/i) ||
      extractMeta(html, /<meta\s+name=["']twitter:image["']\s+content=["'](.*?)["']/i) ||
      extractMeta(html, /<meta\s+content=["'](.*?)["']\s+name=["']twitter:image["']/i);

    if (!rawImage) {
      const allImgs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
      const validImg = allImgs.find(
        (src) =>
          !src.includes("icon") &&
          !src.includes("favicon") &&
          !src.includes("logo") &&
          !src.includes("avatar") &&
          !src.includes("pixel") &&
          !src.includes("sprite") &&
          !src.endsWith(".svg") &&
          !src.startsWith("data:")
      );
      rawImage = validImg || null;
    }

    let ogImage: string | null = null;
    if (rawImage) {
      try {
        ogImage = new URL(rawImage, targetUrl.href).toString();
      } catch {
        ogImage = null;
      }
    }

    const ogSiteName =
      extractMeta(html, /<meta\s+property=["']og:site_name["']\s+content=["'](.*?)["']/i) ||
      targetUrl.hostname.replace(/^www\./i, "");

    const cleanTitle = ogTitle ? decodeEntities(ogTitle).trim() : "";
    const result = {
      ok: true,
      title: cleanTitle && cleanTitle !== "- YouTube" ? cleanTitle : targetUrl.hostname.replace(/^www\./i, ""),
      description: ogDescription ? decodeEntities(ogDescription) : null,
      image: ogImage,
      siteName: ogSiteName,
      domain: targetUrl.hostname.replace(/^www\./i, ""),
      url: targetUrl.toString(),
    };

    memoryCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to fetch preview" },
      { status: 200 }
    );
  }
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}
