import { NextRequest, NextResponse } from "next/server";
import { getOvertimeRequests, requestOvertime, updateOvertimeStatus } from "@/lib/activity-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || undefined;
    const agent = searchParams.get("agent") || undefined;

    const requests = await getOvertimeRequests(date, agent);
    return NextResponse.json({ success: true, requests });
  } catch (err: any) {
    console.error("[api/activity/overtime] GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "request") {
      const { agentEmail, agentName, date, overtimeMinutes, totalActiveMinutes } = body;
      if (!agentEmail || !date) {
        return NextResponse.json({ error: "Faltan datos obligatorios" }, { status: 400 });
      }
      const item = await requestOvertime({
        agentEmail,
        agentName: agentName || agentEmail,
        date,
        overtimeMinutes: Number(overtimeMinutes) || 0,
        totalActiveMinutes: Number(totalActiveMinutes) || 0,
      });
      return NextResponse.json({ success: true, request: item });
    }

    if (action === "review") {
      const { id, status, reviewedBy, notes } = body;
      if (!id || !status || !["approved", "rejected"].includes(status)) {
        return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
      }
      const updated = await updateOvertimeStatus(id, status, reviewedBy || "admin@sekunet.com", notes);
      if (!updated) {
        return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
      }
      return NextResponse.json({ success: true, request: updated });
    }

    return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
  } catch (err: any) {
    console.error("[api/activity/overtime] POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
