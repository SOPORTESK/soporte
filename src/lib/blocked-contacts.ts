import { cacheGet, cacheSet, cacheDelete } from "@/lib/supabase/cache";

export const BLOCKED_CONTACTS_KEY = "blocked_contacts";
const CACHE_KEY = "blocked_contacts_list";
const CACHE_TTL_MS = 60_000;

export interface BlockedContactEntry {
  phone?: string;
  cedula?: string;
  name?: string;
  reason?: string;
  blocked_at: string;
  blocked_by?: string;
}

export function normalizePhoneDigits(raw?: string | null): string {
  if (!raw) return "";
  return String(raw).split("@")[0].replace(/[^0-9]/g, "");
}

function phonesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 8 && b.length >= 8 && a.slice(-8) === b.slice(-8)) return true;
  return false;
}

export function invalidateBlockedContactsCache() {
  cacheDelete(CACHE_KEY);
}

export async function getBlockedContacts(supabase: any): Promise<BlockedContactEntry[]> {
  const cached = cacheGet(CACHE_KEY) as BlockedContactEntry[] | undefined;
  if (cached) return cached;

  try {
    const { data: row } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", BLOCKED_CONTACTS_KEY)
      .maybeSingle();

    let list: BlockedContactEntry[] = [];
    if (row?.value) {
      const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      if (Array.isArray(parsed)) list = parsed;
    }
    cacheSet(CACHE_KEY, list);
    return list;
  } catch {
    return [];
  }
}

async function saveBlockedContacts(supabase: any, list: BlockedContactEntry[]): Promise<boolean> {
  const { error } = await supabase
    .from("sek_app_settings")
    .upsert(
      {
        key: BLOCKED_CONTACTS_KEY,
        value: JSON.stringify(list),
        iv: "none",
        tag: "none",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
  if (!error) {
    cacheSet(CACHE_KEY, list);
    return true;
  }
  invalidateBlockedContactsCache();
  return false;
}

export async function isContactBlocked(
  supabase: any,
  opts: { phone?: string | null; cedula?: string | null }
): Promise<BlockedContactEntry | null> {
  const targetPhone = normalizePhoneDigits(opts.phone);
  const targetCedula = String(opts.cedula || "").trim().toLowerCase();
  if (!targetPhone && !targetCedula) return null;

  const list = await getBlockedContacts(supabase);
  const match = list.find((item) => {
    const itemPhone = normalizePhoneDigits(item.phone);
    const itemCedula = String(item.cedula || "").trim().toLowerCase();
    if (targetPhone && itemPhone && phonesMatch(targetPhone, itemPhone)) return true;
    if (targetCedula && itemCedula && targetCedula === itemCedula) return true;
    return false;
  });
  if (match) return match;

  if (targetCedula) {
    try {
      const { data: cli } = await supabase
        .from("sek_clientes")
        .select("bloqueado, motivo_bloqueo, fecha_bloqueo")
        .eq("cedula", opts.cedula)
        .maybeSingle();
      if (cli?.bloqueado) {
        return {
          cedula: String(opts.cedula),
          reason: cli.motivo_bloqueo || "Bloqueado",
          blocked_at: cli.fecha_bloqueo || new Date().toISOString(),
        };
      }
    } catch {
      // ignorar
    }
  }
  return null;
}

export async function blockContact(
  supabase: any,
  opts: {
    phone?: string | null;
    cedula?: string | null;
    name?: string | null;
    reason?: string | null;
    blockedBy?: string | null;
  }
): Promise<BlockedContactEntry[]> {
  const targetPhone = normalizePhoneDigits(opts.phone);
  const targetCedula = String(opts.cedula || "").trim();
  const list = await getBlockedContacts(supabase);

  const filtered = list.filter((item) => {
    const itemPhone = normalizePhoneDigits(item.phone);
    const itemCedula = String(item.cedula || "").trim().toLowerCase();
    if (targetPhone && itemPhone && phonesMatch(targetPhone, itemPhone)) return false;
    if (targetCedula && itemCedula && targetCedula.toLowerCase() === itemCedula) return false;
    return true;
  });

  const entry: BlockedContactEntry = {
    ...(targetPhone ? { phone: targetPhone } : {}),
    ...(targetCedula ? { cedula: targetCedula } : {}),
    ...(opts.name ? { name: String(opts.name).trim() } : {}),
    reason: String(opts.reason || "Bloqueo manual desde el chat").trim(),
    blocked_at: new Date().toISOString(),
    ...(opts.blockedBy ? { blocked_by: opts.blockedBy } : {}),
  };

  const next = [...filtered, entry];
  await saveBlockedContacts(supabase, next);

  if (targetCedula) {
    try {
      await supabase
        .from("sek_clientes")
        .update({
          bloqueado: true,
          fecha_bloqueo: entry.blocked_at,
          motivo_bloqueo: entry.reason,
        })
        .eq("cedula", targetCedula);
    } catch {
      // ignorar si no existe en sek_clientes
    }
  }

  return next;
}

export async function unblockContact(
  supabase: any,
  opts: { phone?: string | null; cedula?: string | null }
): Promise<BlockedContactEntry[]> {
  const targetPhone = normalizePhoneDigits(opts.phone);
  const targetCedula = String(opts.cedula || "").trim();
  const list = await getBlockedContacts(supabase);

  const next = list.filter((item) => {
    const itemPhone = normalizePhoneDigits(item.phone);
    const itemCedula = String(item.cedula || "").trim().toLowerCase();
    if (targetPhone && itemPhone && phonesMatch(targetPhone, itemPhone)) return false;
    if (targetCedula && itemCedula && targetCedula.toLowerCase() === itemCedula) return false;
    return true;
  });

  await saveBlockedContacts(supabase, next);

  if (targetCedula) {
    try {
      await supabase
        .from("sek_clientes")
        .update({
          bloqueado: false,
          bloqueo_contador: 0,
          fecha_bloqueo: null,
          motivo_bloqueo: null,
        })
        .eq("cedula", targetCedula);
    } catch {
      // ignorar
    }
  }

  return next;
}
