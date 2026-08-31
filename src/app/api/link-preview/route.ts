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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    const res = await fetch(targetUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 WhatsApp/2.24.1",
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

    // Extraer etiquetas OpenGraph y estándar
    const ogTitle =
      extractMeta(html, /<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i) ||
      extractMeta(html, /<meta\s+content=["'](.*?)["']\s+property=["']og:title["']/i) ||
      extractMeta(html, /<title[^>]*>(.*?)<\/title>/i);

    const ogDescription =
      extractMeta(html, /<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i) ||
      extractMeta(html, /<meta\s+name=["']description["']\s+content=["'](.*?)["']/i) ||
      extractMeta(html, /<meta\s+content=["'](.*?)["']\s+name=["']description["']/i);

    let ogImage =
      extractMeta(html, /<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i) ||
      extractMeta(html, /<meta\s+content=["'](.*?)["']\s+property=["']og:image["']/i) ||
      extractMeta(html, /<meta\s+name=["']twitter:image["']\s+content=["'](.*?)["']/i);

    const ogSiteName =
      extractMeta(html, /<meta\s+property=["']og:site_name["']\s+content=["'](.*?)["']/i) ||
      targetUrl.hostname;

    // Convertir URLs relativas de imágenes a absolutas
    if (ogImage && !ogImage.startsWith("http://") && !ogImage.startsWith("https://")) {
      try {
        ogImage = new URL(ogImage, targetUrl.origin).toString();
      } catch {
        ogImage = null;
      }
    }

    const result = {
      ok: true,
      title: ogTitle ? decodeEntities(ogTitle) : targetUrl.hostname,
      description: ogDescription ? decodeEntities(ogDescription) : null,
      image: ogImage || null,
      siteName: ogSiteName,
      domain: targetUrl.hostname,
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