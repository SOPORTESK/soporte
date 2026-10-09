import { NextRequest, NextResponse } from "next/server";
import {
  getStoredIntegrityReport,
  refreshIntegrityReport,
  autoSanitizeIntegrity,
  type IntegrityReport,
} from "@/lib/data-integrity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get("refresh") === "true";

    if (force) {
      const report = await refreshIntegrityReport();
      return NextResponse.json({ success: true, report });
    }

    let report = await getStoredIntegrityReport();

    // Si no hay reporte previo o tiene más de 30 minutos, refrescarlo
    const isStale =
      !report ||
      Date.now() - new Date(report.ranAt).getTime() > 30 * 60 * 1000;

    if (isStale) {
      report = await refreshIntegrityReport();
    }

    return NextResponse.json({ success: true, report });
  } catch (error: any) {
    console.error("[integrity-watchdog GET] error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Error al verificar integridad" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    let action = "refresh";
    try {
      const body = await req.json();
      if (body?.action) action = body.action;
    } catch {}

    const { searchParams } = new URL(req.url);
    if (searchParams.get("action")) {
      action = searchParams.get("action")!;
    }

    let sanitizeResult: {
      removedDuplicates: number;
      sanitizedInventoryItems: number;
      closedRunawayTimers: number;
    } | null = null;
    if (action === "sanitize" || action === "fix") {
      sanitizeResult = await autoSanitizeIntegrity();
    }

    const report = await refreshIntegrityReport();
    return NextResponse.json({
      success: true,
      report,
      sanitized: sanitizeResult,
    });
  } catch (error: any) {
    console.error("[integrity-watchdog POST] error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Error al procesar integridad" },
      { status: 500 }
    );
  }
}
