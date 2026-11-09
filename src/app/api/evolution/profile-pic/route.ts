import { NextRequest, NextResponse } from "next/server";
import { getEvolutionConfig } from "@/lib/evolution-config";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

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

    const evoCfg = await getEvolutionConfig(forceRefresh);
    if (!evoCfg.url || !evoCfg.apiKey || !evoCfg.instance) {
      const res = NextResponse.json({ url: null });
      res.headers.set("Access-Control-Allow-Origin", "*");
      res.headers.set("Cache-Control", "no-cache");
      res.headers.set("x-evo-debug", "missing-config");
      return res;
    }

    const candidateUrls = Array.from(
      new Set(
        [evoCfg.url, ...(evoCfg.candidates || [])]
          .map((u) => (u || "").replace(/\/$/, ""))
          .filter(Boolean)
      )
    );
    const instance = encodeURIComponent(evoCfg.instance);

    // Consultar siempre en vivo a WhatsApp vía fetchProfilePictureUrl
    // porque las URLs guardadas en findContacts caducan en el CDN de WhatsApp (403 URL signature expired)
    let liveUrl: string | null = null;
    let lastStatus = "none";
    for (const baseUrl of candidateUrls) {
      try {
        const liveRes = await fetch(`${baseUrl}/chat/fetchProfilePictureUrl/${instance}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: evoCfg.apiKey,
            "User-Agent": "SekunetChat/1.0",
          },
          body: JSON.stringify({ number: phone }),
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });
        lastStatus = `${liveRes.status}@${baseUrl.replace(/^https?:\/\//, "").slice(0, 24)}`;
        if (liveRes.ok) {
          const data = await liveRes.json().catch(() => ({}));
          const candidate = data?.profilePictureUrl || data?.profilePicUrl || data?.picture || null;
          if (typeof candidate === "string" && candidate.startsWith("http")) {
            liveUrl = candidate;
            break;
          }
        }
      } catch (err: any) {
        lastStatus = `err:${(err?.message || "fetch").slice(0, 20)}@${baseUrl.replace(/^https?:\/\//, "").slice(0, 20)}`;
      }
    }

    const ttl = liveUrl ? SINGLE_TTL_MS : 15 * 1000;
    picCache.set(phone, {
      url: liveUrl,
      checkedLive: Boolean(liveUrl),
      expires: Date.now() + ttl,
    });

    const res = NextResponse.json({ url: liveUrl });
    res.headers.set("Access-Control-Allow-Origin", "*");
    res.headers.set("x-evo-debug", lastStatus);
    if (liveUrl) {
      res.headers.set("Cache-Control", "public, max-age=3600");
    } else {
      res.headers.set("Cache-Control", "no-cache");
    }
    return res;
  } catch {
    const res = NextResponse.json({ url: null });
    res.headers.set("Access-Control-Allow-Origin", "*");
    res.headers.set("Cache-Control", "no-cache");
    return res;
  }
}
