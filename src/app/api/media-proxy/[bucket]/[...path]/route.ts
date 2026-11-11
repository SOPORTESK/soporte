import "@/lib/dns-boost";
import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_MEDIA_BUCKETS } from "@/lib/media-proxy";

export const runtime = "nodejs";

const MAX_PROXY_BYTES = 4_000_000; // Stay safely under Vercel's 4.5 MB Serverless payload cap
const ONE_YEAR_IMMUTABLE = "public, max-age=31536000, s-maxage=31536000, immutable";

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
  const upstreamUrl = `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${safeSegments.join("/")}${search}`;

  // Range requests (e.g. HTML5 video seeking) redirect directly so partial range streaming stays fast and zero-buffering
  if (req.headers.get("range")) {
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
      cache: "no-store",
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

    const headers = new Headers({
      "Content-Type": contentType,
      "Content-Length": String(buf.byteLength),
      "Cache-Control": ONE_YEAR_IMMUTABLE,
      "CDN-Cache-Control": "public, max-age=31536000, immutable",
      "Vercel-CDN-Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      Vary: "Accept-Encoding",
    });

    const etag = upstreamRes.headers.get("etag");
    if (etag) headers.set("ETag", etag);

    const contentDisposition = upstreamRes.headers.get("content-disposition");
    if (contentDisposition) headers.set("Content-Disposition", contentDisposition);

    return new NextResponse(buf, { status: 200, headers });
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
