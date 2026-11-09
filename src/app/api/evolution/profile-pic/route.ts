import { NextRequest, NextResponse } from "next/server";
import { getEvolutionConfig } from "@/lib/evolution-config";

export const dynamic = "force-dynamic";

interface PicCacheEntry {
  url: string | null;
  checkedLive: boolean;
  expires: number;
}

const picCache = new Map<string, PicCacheEntry>();
const SINGLE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas por número consultado en vivo

function normalizePhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length === 8) return `506${digits}`;
  return digits;
}

export async function GET(req: NextRequest) {
  try {
    const rawPhone = req.nextUrl.searchParams.get("phone") || "";
    const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";
    const phone = normalizePhone(rawPhone);
    if (!phone || phone.length < 8) {
      return NextResponse.json({ url: null });
    }

    const now = Date.now();
    if (!forceRefresh) {
      const cached = picCache.get(phone);
      if (cached && now < cached.expires && cached.checkedLive && cached.url) {
        const res = NextResponse.json({ url: cached.url });
        res.headers.set("Cache-Control", "public, max-age=3600");
        return res;
      }
    }

    const evoCfg = await getEvolutionConfig();
    if (!evoCfg.url || !evoCfg.apiKey || !evoCfg.instance) {
      return NextResponse.json({ url: null });
    }

    const baseUrl = evoCfg.url.replace(/\/$/, "");
    const instance = encodeURIComponent(evoCfg.instance);

    // Consultar siempre en vivo a WhatsApp vía fetchProfilePictureUrl
    // porque las URLs guardadas en findContacts caducan en el CDN de WhatsApp (403 URL signature expired)
    let liveUrl: string | null = null;
    try {
      const liveRes = await fetch(`${baseUrl}/chat/fetchProfilePictureUrl/${instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evoCfg.apiKey },
        body: JSON.stringify({ number: phone }),
        signal: AbortSignal.timeout(5000),
      });
      if (liveRes.ok) {
        const data = await liveRes.json().catch(() => ({}));
        const candidate = data?.profilePictureUrl || data?.profilePicUrl || data?.picture || null;
        if (typeof candidate === "string" && candidate.startsWith("http")) {
          liveUrl = candidate;
        }
      }
    } catch {}

    const ttl = liveUrl ? SINGLE_TTL_MS : 30 * 1000;
    picCache.set(phone, {
      url: liveUrl,
      checkedLive: Boolean(liveUrl),
      expires: Date.now() + ttl,
    });

    const res = NextResponse.json({ url: liveUrl });
    if (liveUrl) {
      res.headers.set("Cache-Control", "public, max-age=3600");
    } else {
      res.headers.set("Cache-Control", "no-cache");
    }
    return res;
  } catch {
    return NextResponse.json({ url: null });
  }
}
