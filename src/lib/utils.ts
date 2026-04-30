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
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";
  return d.toLocaleDateString();
}

/** Extrae info del campo cliente (que puede ser objeto, string o null) */
export function clienteInfo(cliente: unknown): {
  nombre: string; telefono: string; correo: string; cuenta: string;
} {
  if (!cliente || typeof cliente !== "object") {
    return { nombre: typeof cliente === "string" ? cliente : "", telefono: "", correo: "", cuenta: "" };
  }
  const c = cliente as Record<string, unknown>;
  const s = (v: unknown) => typeof v === "string" ? v : v == null ? "" : String(v);
  return {
    nombre: s(c.nombre ?? c.name ?? c.full_name),
    telefono: s(c.telefono ?? c.phone ?? c.tel),
    correo: s(c.correo ?? c.email ?? c.mail),
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

export function initials(name: unknown): string {
  const s = String(name ?? "").trim();
  if (!s) return "?";
  return s
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}
