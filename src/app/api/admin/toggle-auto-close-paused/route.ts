import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const { caseId, paused } = await req.json();

    if (!caseId) {
      return NextResponse.json({ error: "caseId es obligatorio" }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { error } = await supabaseAdmin
      .from("sek_cases")
      .update({ auto_close_paused: paused })
      .eq("id", caseId);

    if (error) throw error;

    return NextResponse.json({ success: true, paused });
  } catch (error: any) {
    console.error("Toggle auto-close paused error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
