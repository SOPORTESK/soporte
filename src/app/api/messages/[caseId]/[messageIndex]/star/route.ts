import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(
  req: NextRequest,
  { params }: { params: { caseId: string; messageIndex: string } }
) {
  const { historyType } = await req.json().catch(() => ({}));
  const { caseId, messageIndex } = params;
  const idx = parseInt(messageIndex, 10);

  if (!caseId || isNaN(idx) || !historyType) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  if (historyType !== "histtecnico" && historyType !== "histcliente") {
    return NextResponse.json({ error: "invalid_historyType" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: caseData, error: caseError } = await supabase
    .from("sek_cases")
    .select(`${historyType}`)
    .eq("id", caseId)
    .maybeSingle();

  if (caseError || !caseData) {
    return NextResponse.json({ error: "case_not_found" }, { status: 404 });
  }

  const history = Array.isArray(caseData[historyType]) ? caseData[historyType] : [];
  if (idx < 0 || idx >= history.length) {
    return NextResponse.json({ error: "message_not_found" }, { status: 404 });
  }

  const entry = history[idx];
  if (typeof entry !== "object" || entry === null) {
    return NextResponse.json({ error: "invalid_entry" }, { status: 400 });
  }

  const currentlyStarred = !!(entry as any).starred;
  history[idx] = {
    ...entry,
    starred: !currentlyStarred,
    starred_at: !currentlyStarred ? new Date().toISOString() : undefined,
  };

  const { error: updateError } = await supabase
    .from("sek_cases")
    .update({ [historyType]: history })
    .eq("id", caseId);

  if (updateError) {
    console.error("[STAR MSG API] Error:", updateError);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, starred: !currentlyStarred });
}
