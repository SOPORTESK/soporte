import { NextRequest, NextResponse } from "next/server";
import { getWorkSchedule, saveWorkSchedule, getAgentSchedule, saveAgentSchedule } from "@/lib/activity-db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const agentEmail = req.nextUrl.searchParams.get("agentEmail");
    if (agentEmail) {
      const schedule = await getAgentSchedule(agentEmail);
      return NextResponse.json({ success: true, ...schedule });
    }
    const config = await getWorkSchedule();
    return NextResponse.json({ success: true, ...config });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentEmail, custom, scheduleStart, scheduleEnd, scheduleEnabled, workDays, targetDailyHours, toleranceMinutes } = body;

    if (agentEmail) {
      await saveAgentSchedule(agentEmail, {
        custom: custom !== undefined ? Boolean(custom) : true,
        scheduleStart: scheduleStart || "08:00",
        scheduleEnd: scheduleEnd || "17:00",
        scheduleEnabled: scheduleEnabled !== undefined ? Boolean(scheduleEnabled) : true,
        workDays: Array.isArray(workDays) && workDays.length > 0 ? workDays : [1, 2, 3, 4, 5],
        targetDailyHours: Number(targetDailyHours) || 8,
      });
      return NextResponse.json({ success: true });
    }

    await saveWorkSchedule({
      scheduleStart: scheduleStart || "08:00",
      scheduleEnd: scheduleEnd || "17:00",
      scheduleEnabled: scheduleEnabled !== undefined ? Boolean(scheduleEnabled) : true,
      workDays: Array.isArray(workDays) && workDays.length > 0 ? workDays : [1, 2, 3, 4, 5],
      targetDailyHours: Number(targetDailyHours) || 8,
      toleranceMinutes: Number(toleranceMinutes) || 5,
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
