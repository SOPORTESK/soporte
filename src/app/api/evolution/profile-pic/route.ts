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
let contactsLoadedAt = 0;
let loadingContactsPromise: Promise<void> | null = null;
const CONTACTS_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas en RAM del servidor
const SINGLE_TTL_MS = 6 * 60 * 60 * 1000;   // 6 horas para números con foto
const NULL_TTL_MS = 2 * 60 * 60 * 1000;     // 2 horas para números sin foto pública

function normalizePhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length === 8) return `506${digits}`;
  return digits;
}

function isWhatsappUrlExpired(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    const oe = u.searchParams.get("oe");
    if (oe && /^[0-9a-fA-F]{6,10}$/.test(oe)) {
      const expSec = parseInt(oe, 16);
      if (expSec > 1_000_000_000 && expSec * 1000 < Date.now() + 60_000) {
        return true;
      }
    }
  } catch {
    return true;
  }
  return false;
}

async function resolvePicToDataUrl(rawUrl: string | null): Promise<string | null> {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  if (rawUrl.startsWith("data:image/")) return rawUrl;
  if (!rawUrl.startsWith("http")) return null;
  if (rawUrl.includes("pps.whatsapp.net") && isWhatsappUrlExpired(rawUrl)) {
    return null;
  }
  try {
    const res = await fetch(rawUrl, {
      headers: {
        "User-Agent": "WhatsApp/2.24.12.78 A",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(2200),
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!contentType.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 350 * 1024) return null;
    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function ensureContactsLoaded(candidateUrls: string[], instance: string, apiKey: string) {
  const now = Date.now();
  if (now - contactsLoadedAt < CONTACTS_TTL_MS && picCache.size > 0) return;
  if (loadingContactsPromise) return loadingContactsPromise;

  loadingContactsPromise = (async () => {
    try {
      for (const baseUrl of candidateUrls) {
        try {
          const res = await fetch(`${baseUrl}/chat/findContacts/${instance}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: apiKey,
              "User-Agent": "SekunetChat/1.0",
            },
            body: JSON.stringify({ where: {} }),
            cache: "no-store",
            signal: AbortSignal.timeout(2500),
          });
          if (!res.ok) continue;
          const list = await res.json().catch(() => []);
          if (!Array.isArray(list)) continue;

          const exp = Date.now() + CONTACTS_TTL_MS;
          for (const item of list) {
            const jid = String(item?.remoteJid || "");
            if (!jid.endsWith("@s.whatsapp.net")) continue;
            const phone = normalizePhone(jid.split("@")[0]);
            if (!phone) continue;
            const pic =
              typeof item?.profilePicUrl === "string" && item.profilePicUrl.startsWith("http")
                ? item.profilePicUrl
                : null;
            if (pic || !picCache.has(phone)) {
              picCache.set(phone, { url: pic, checkedLive: Boolean(pic), expires: exp });
            }
          }
          contactsLoadedAt = Date.now();
          break;
        } catch {}
      }
    } finally {
      loadingContactsPromise = null;
    }
  })();

  return loadingContactsPromise;
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
      if (cached && now < cached.expires && cached.checkedLive) {
        if (!cached.url || cached.url.startsWith("data:image/")) {
          const res = NextResponse.json({ url: cached.url });
          res.headers.set("Cache-Control", "public, max-age=3600");
          return res;
        }
      }
    }

    let evoCfg = await getEvolutionConfig(false);
    if (!evoCfg.url || !evoCfg.apiKey || !evoCfg.instance) {
      evoCfg = await getEvolutionConfig(true);
    }
    if (!evoCfg.url || !evoCfg.apiKey || !evoCfg.instance) {
      const res = NextResponse.json({ url: null });
      res.headers.set("Access-Control-Allow-Origin", "*");
      res.headers.set("Cache-Control", "no-cache");
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

    if (!forceRefresh) {
      await ensureContactsLoaded(candidateUrls, instance, evoCfg.apiKey);
      const afterBulk = picCache.get(phone);
      if (afterBulk?.url) {
        const verifiedDataUrl = await resolvePicToDataUrl(afterBulk.url);
        if (verifiedDataUrl) {
          picCache.set(phone, {
            url: verifiedDataUrl,
            checkedLive: true,
            expires: Date.now() + SINGLE_TTL_MS,
          });
          const res = NextResponse.json({ url: verifiedDataUrl });
          res.headers.set("Access-Control-Allow-Origin", "*");
          res.headers.set("Cache-Control", "public, max-age=3600");
          return res;
        }
        picCache.delete(phone);
      }
    }

    let liveUrl: string | null = null;
    let evoRespondedOk = false;
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
          signal: AbortSignal.timeout(2000),
        });
        lastStatus = `${liveRes.status}@${baseUrl.replace(/^https?:\/\//, "").slice(0, 24)}`;
        if (liveRes.ok) {
          evoRespondedOk = true;
          const data = await liveRes.json().catch(() => ({}));
          const candidate = data?.profilePictureUrl || data?.profilePicUrl || data?.picture || null;
          if (typeof candidate === "string" && candidate.startsWith("http")) {
            liveUrl = await resolvePicToDataUrl(candidate);
          }
          break;
        }
      } catch (err: any) {
        lastStatus = `err:${(err?.message || "fetch").slice(0, 20)}@${baseUrl.replace(/^https?:\/\//, "").slice(0, 20)}`;
      }
    }

    if (evoRespondedOk) {
      picCache.set(phone, {
        url: liveUrl,
        checkedLive: true,
        expires: Date.now() + (liveUrl ? SINGLE_TTL_MS : NULL_TTL_MS),
      });
    }

    const res = NextResponse.json({ url: liveUrl });
    res.headers.set("Access-Control-Allow-Origin", "*");
    res.headers.set("x-evo-debug", lastStatus);
    if (evoRespondedOk) {
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
