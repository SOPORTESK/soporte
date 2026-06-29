import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Ayer ${d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  return d.toLocaleDateString("es-CR");
}

/** Extrae info del campo cliente (que puede ser objeto, string o null) */
export function clienteInfo(cliente: unknown): {
  nombre: string; telefono: string; correo: string; cedula: string; cuenta: string;
} {
  if (!cliente || typeof cliente !== "object") {
    return { nombre: typeof cliente === "string" ? cliente : "", telefono: "", correo: "", cedula: "", cuenta: "" };
  }
  const c = cliente as Record<string, unknown>;
  const s = (v: unknown) => typeof v === "string" ? v : v == null ? "" : String(v);
  return {
    nombre: s(c.nombre ?? c.name ?? c.full_name),
    telefono: s(c.telefono ?? c.phone ?? c.tel),
    correo: s(c.correo ?? c.email ?? c.mail),
    cedula: s(c.cedula ?? c.identificacion ?? c.id_fiscal),
    cuenta: s(c.cuenta ?? c.account ?? c.empresa ?? c.company)
  };
}

/** Convierte cualquier valor (objeto, número, null) en un string seguro para React. */
export function asText(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    // Heurística: campos comunes que suelen contener el nombre/teléfono
    const pick = o.nombre ?? o.name ?? o.full_name ?? o.telefono ?? o.phone ?? o.email;
    if (pick != null) return asText(pick, fallback);
    try { return JSON.stringify(value); } catch { return fallback; }
  }
  return fallback;
}

const INVALID_ACCOUNT_KEYS = /^(sin\s+cuenta|no\s+tengo(?:\s+cuenta)?|no\s+tengo\s+empresa|no\s+la\s+recuerdo|no\s+lo\s+recuerdo|no\s+recuerdo|no\s+me\s+acuerdo|no\s+la\s+tengo|no\s+lo\s+tengo|no\s+lo\s+s[eé]|no\s+s[eé]|no\s+se|dije\s+que\s+no(?:\s+(?:la|lo|me))?(?:\s+(?:s[eé]|recuerdo|recuerda|acuerdo|acuerda))?|cliente\s+final|ninguna|no\s+tiene|no\s+tiene\s+cuenta)$/i;

export function customerKey(c: {
  cliente?: unknown;
  customer_phone?: string | null;
  id?: string | number | null;
  canal?: string | null;
}): string {
  const ci = clienteInfo(c.cliente);

  // 1. El teléfono es el identificador más estable: agrupar primero por teléfono
  //    (la cuenta puede variar entre casos del mismo cliente: personal vs. empresa).
  const tel = (ci.telefono || c.customer_phone || "").trim();
  if (tel) return `tel:${tel}`;

  // 2. Si no hay teléfono, agrupar por Cuenta Afiliada a Sekunet (solo si es un nombre válido)
  const cuenta = (ci.cuenta || "").trim().toLowerCase();
  if (cuenta && !INVALID_ACCOUNT_KEYS.test(cuenta)) return `cuenta:${cuenta}`;

  // 3. Si no hay ni teléfono ni cuenta válida, no agrupar (cada caso es independiente)
  return `case:${c.id ?? Math.random().toString(36).slice(2)}`;
}

export function initials(name: unknown): string {
  const s = String(name ?? "").trim();
  if (!s) return "?";
  return s
    .split(/\s+/)
    .slice(0, 2)
    .map(part => Array.from(part)[0]?.toUpperCase() ?? "")
    .join("") || "?";
}
