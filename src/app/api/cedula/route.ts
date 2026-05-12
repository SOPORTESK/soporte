import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/cedula?id=XXXXXXXXX
 * Valida una cédula costarricense contra la API de Hacienda (ATV).
 *
 * Formatos aceptados:
 *  - Física:   9 dígitos  (ej. 101230456)
 *  - Jurídica: 10 dígitos (ej. 3101234567)
 *  - DIMEX:    11-12 dígitos
 *  - NITE:     10 dígitos (empieza con 10)
 */

const HACIENDA_URL = "https://api.hacienda.go.cr/fe/ae";

/** Limpia el input: quita guiones, espacios, ceros a la izquierda innecesarios */
function sanitize(raw: string): string {
  return raw.replace(/[\s\-]/g, "").replace(/^0+/, "");
}

/** Validación de formato local antes de llamar a Hacienda */
function validateFormat(id: string): { ok: boolean; tipo?: string; error?: string } {
  if (!/^\d+$/.test(id)) {
    return { ok: false, error: "La cédula solo debe contener números" };
  }
  const len = id.length;

  // Física: 9 dígitos
  if (len === 9) return { ok: true, tipo: "fisica" };
  // Jurídica: 10 dígitos, empieza con 3
  if (len === 10 && id.startsWith("3")) return { ok: true, tipo: "juridica" };
  // NITE: 10 dígitos, empieza con 10
  if (len === 10 && id.startsWith("10")) return { ok: true, tipo: "nite" };
  // DIMEX: 11 o 12 dígitos
  if (len === 11 || len === 12) return { ok: true, tipo: "dimex" };

  return { ok: false, error: `Formato inválido (${len} dígitos). Se esperan 9 (física), 10 (jurídica/NITE), 11-12 (DIMEX).` };
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("id") ?? "";
  const id = sanitize(raw);

  if (!id) {
    return NextResponse.json({ valid: false, error: "Debe proporcionar un número de cédula" }, { status: 400 });
  }

  // 1. Validación local de formato
  const fmt = validateFormat(id);
  if (!fmt.ok) {
    return NextResponse.json({ valid: false, error: fmt.error }, { status: 400 });
  }

  // 2. Consulta a Hacienda
  try {
    const res = await fetch(`${HACIENDA_URL}?identificacion=${id}`, {
      headers: { "User-Agent": "SekunetChat/1.0" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({
          valid: false,
          error: "Cédula no encontrada en el Ministerio de Hacienda",
          tipo: fmt.tipo,
        });
      }
      return NextResponse.json({
        valid: false,
        error: `Hacienda respondió con error (${res.status})`,
        tipo: fmt.tipo,
      });
    }

    const data = await res.json();

    return NextResponse.json({
      valid: true,
      tipo: fmt.tipo,
      nombre: data.nombre ?? data.tipoIdentificacion ?? "",
      situacion: data.situacion?.estado ?? "",
      raw: {
        nombre: data.nombre,
        tipoIdentificacion: data.tipoIdentificacion,
        regimen: data.regimen,
        situacion: data.situacion,
      },
    });
  } catch (err: any) {
    console.error("[api/cedula] Hacienda fetch error:", err.message);
    return NextResponse.json({
      valid: false,
      error: "No se pudo conectar con Hacienda. Intente de nuevo.",
      tipo: fmt.tipo,
    }, { status: 502 });
  }
}
