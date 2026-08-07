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
