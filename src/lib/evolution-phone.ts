/**
 * Utilidades compartidas para Evolution API.
 * Normalización de teléfonos y resolución de JID.
 *
 * IMPORTANTE: Tanto /api/evolution/send como /api/messages/.../delete DEBEN
 * usar estas funciones para que el teléfono del receptor sea idéntico al
 * momento de enviar y al momento de revocar. Si se divergen, la revocación
 * falla silenciosamente.
 */

/** Remover todo lo que no sea dígito. Agregar prefijo 506 para Costa Rica (8 dígitos sin prefijo). */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 8 && !digits.startsWith("506")) return `506${digits}`;
  return digits;
}

/**
 * Resolver el JID de WhatsApp del receptor a partir de los datos del caso.
 * Prioridad: cliente.telefono_real > customer_phone > cliente.telefono.
 * Siempre retorna el JID completo (xxx@s.whatsapp.net) o null.
 */
export function pickPhone(c: any): string | null {
  if (typeof c?.cliente === "object") {
    const telReal = String(c.cliente?.telefono_real || "").trim();
    if (telReal) return telReal.includes("@") ? telReal : `${normalizePhone(telReal)}@s.whatsapp.net`;
  }
  const cust = String(c?.customer_phone || "").trim();
  if (cust) {
    if (cust.includes("@")) return cust;
    return `${normalizePhone(cust)}@s.whatsapp.net`;
  }
  if (typeof c?.cliente === "object") {
    const tel = String(c.cliente?.telefono || "").trim();
    if (tel) return tel.includes("@") ? tel : `${normalizePhone(tel)}@s.whatsapp.net`;
  }
  return null;
}

/** Lista ordenada de posibles JIDs del caso (@lid, @s.whatsapp.net, etc.) para evitar errores de RemoteJid. */
export function getCandidateJids(c: any, primary?: string | null): string[] {
  const out: string[] = [];
  const pushJid = (raw: unknown) => {
    const s = String(raw || "").trim();
    if (!s) return;
    if (s.includes("@")) {
      if (!out.includes(s)) out.push(s);
      return;
    }
    const norm = normalizePhone(s);
    if (norm) {
      const full = `${norm}@s.whatsapp.net`;
      if (!out.includes(full)) out.push(full);
    }
  };

  pushJid(primary);
  if (typeof c?.cliente === "object" && c?.cliente) {
    pushJid(c.cliente.lid);
    pushJid(c.cliente.telefono_real);
    pushJid(c.cliente.telefono);
  }
  pushJid(c?.customer_phone);
  return out;
}

/** Consulta en Evolution API el key.remoteJid exacto guardado para un messageId. */
export async function findEvolutionMessageKey(
  baseUrl: string,
  apiKey: string,
  instance: string,
  messageId: string
): Promise<{ remoteJid?: string; fromMe?: boolean; participant?: string } | null> {
  if (!baseUrl || !apiKey || !instance || !messageId) return null;
  try {
    const res = await fetch(`${baseUrl}/chat/findMessages/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ where: { key: { id: messageId } }, limit: 1 }),
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const records = data?.messages?.records;
    const rec = Array.isArray(records) ? records[0] : null;
    if (rec?.key?.remoteJid) {
      return {
        remoteJid: String(rec.key.remoteJid),
        fromMe: typeof rec.key.fromMe === "boolean" ? rec.key.fromMe : undefined,
        participant: rec.key.participant ? String(rec.key.participant) : undefined,
      };
    }
  } catch {
    /* silencioso */
  }
  return null;
}
