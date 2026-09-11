import { NextRequest, NextResponse } from "next/server";
import { insertActivityLog, hasActiveManualTask } from "@/lib/activity-db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agent_email, agent_name, action, category, case_id, metadata, duration_ms } = body;

    if (!agent_email || !action || !category) {
      return NextResponse.json(
        { error: "agent_email, action and category are required" },
        { status: 400 }
      );
    }

    const actLower = String(action).toLowerCase();
    const isManualAction = Boolean(
      metadata?.manual ||
      metadata?.task ||
      metadata?.justification ||
      actLower.startsWith("inició:") ||
      actLower.startsWith("inicio:") ||
      actLower.startsWith("terminó:") ||
      actLower.startsWith("termino:") ||
      actLower.startsWith("justificación:") ||
      actLower.startsWith("justificacion:")
    );

    // Si el usuario tiene una labor manual activa en curso, SE PAUSAN TODOS LOS DEMÁS LOGS
    if (!isManualAction) {
      const activeManual = await hasActiveManualTask(agent_email);
      if (activeManual) {
        return NextResponse.json({
          success: true,
          paused: true,
          message: "Logs automáticos pausados debido a una labor manual activa en curso."
        });
      }
    }

    try {
      await insertActivityLog({
        agent_email,
        agent_name: agent_name || agent_email,
        action,
        category,
        case_id: case_id || null,
        metadata: metadata || null,
        duration_ms: duration_ms || null,
      });
    } catch (e: any) {
      console.error("[activity/log] Async insert error:", e.message);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[activity/log] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
