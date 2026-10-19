import { NextRequest, NextResponse } from "next/server";
import { getEvolutionConfig } from "@/lib/evolution-config";

export const dynamic = "force-dynamic";

interface PicCacheEntry {
  url: string | null;
  checkedLive: boolean;
  expires: number;
}

const picCache = new Map<string, PicCacheEntry>();
let contactsLoadedAt = 0;
let loadingContactsPromise: Promise<void> | null = null;
const CONTACTS_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas en RAM del servidor (0 consumo en Supabase)
const SINGLE_TTL_MS = 6 * 60 * 60 * 1000;   // 6 horas por número consultado

function normalizePhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length === 8) return `506${digits}`;
  return digits;
}

async function ensureContactsLoaded(baseUrl: string, instance: string, apiKey: string) {
  const now = Date.now();
  if (now - contactsLoadedAt < CONTACTS_TTL_MS && picCache.size > 0) return;
  if (loadingContactsPromise) return loadingContactsPromise;

  loadingContactsPromise = (async () => {
    try {
      const res = await fetch(`${baseUrl}/chat/findContacts/${instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ where: {} }),
      });
      if (!res.ok) return;
      const list = await res.json().catch(() => []);
      if (!Array.isArray(list)) return;

      const exp = Date.now() + CONTACTS_TTL_MS;
      for (const item of list) {
        const jid = String(item?.remoteJid || "");
        if (!jid.endsWith("@s.whatsapp.net")) continue;
        const phone = normalizePhone(jid.split("@")[0]);
        if (!phone) continue;
        const pic = typeof item?.profilePicUrl === "string" && item.profilePicUrl.startsWith("http")
          ? item.profilePicUrl
          : null;
        if (pic || !picCache.has(phone)) {
          picCache.set(phone, { url: pic, checkedLive: Boolean(pic), expires: exp });
        }
      }
      contactsLoadedAt = Date.now();
    } catch {
      // Silencioso si Evolution no responde temporalmente
    } finally {
      loadingContactsPromise = null;
    }
  })();

  return loadingContactsPromise;
}

export async function GET(req: NextRequest) {
  try {
    const rawPhone = req.nextUrl.searchParams.get("phone") || "";
    const phone = normalizePhone(rawPhone);
    if (!phone || phone.length < 8) {
      return NextResponse.json({ url: null });
    }

    const now = Date.now();
    const cached = picCache.get(phone);
    if (cached && now < cached.expires && cached.checkedLive) {
      const res = NextResponse.json({ url: cached.url });
      res.headers.set("Cache-Control", "public, max-age=21600");
      return res;
    }

    const evoCfg = await getEvolutionConfig();
    if (!evoCfg.url || !evoCfg.apiKey || !evoCfg.instance) {
      return NextResponse.json({ url: null });
    }

    const baseUrl = evoCfg.url.replace(/\/$/, "");
    const instance = encodeURIComponent(evoCfg.instance);

    await ensureContactsLoaded(baseUrl, instance, evoCfg.apiKey);

    const afterBulk = picCache.get(phone);
    if (afterBulk?.url) {
      const res = NextResponse.json({ url: afterBulk.url });
      res.headers.set("Cache-Control", "public, max-age=21600");
      return res;
    }

    // Si no estaba en el directorio masivo o estaba en null, consultar en vivo 1 sola vez cada 6 horas
    let liveUrl: string | null = null;
    try {
      const liveRes = await fetch(`${baseUrl}/chat/fetchProfilePictureUrl/${instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evoCfg.apiKey },
        body: JSON.stringify({ number: phone }),
      });
      if (liveRes.ok) {
        const data = await liveRes.json().catch(() => ({}));
        const candidate = data?.profilePictureUrl || data?.profilePicUrl || data?.picture || null;
        if (typeof candidate === "string" && candidate.startsWith("http")) {
          liveUrl = candidate;
        }
      }
    } catch {}

    picCache.set(phone, {
      url: liveUrl,
      checkedLive: true,
      expires: Date.now() + SINGLE_TTL_MS,
    });

    const res = NextResponse.json({ url: liveUrl });
    res.headers.set("Cache-Control", "public, max-age=21600");
    return res;
  } catch {
    return NextResponse.json({ url: null });
  }
}
