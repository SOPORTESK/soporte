import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServiceClient();
    const id = params.id;

    if (!id) {
      return NextResponse.json({ error: "Missing case id" }, { status: 400 });
    }

    const { data: caseData, error: fetchError } = await supabase
      .from("sek_cases")
      .select("id, tags, customer_phone")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !caseData) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const currentTags: string[] = Array.isArray(caseData.tags) ? [...caseData.tags] : [];
    const isCurrentlyPinned = currentTags.some(
      t => String(t).toLowerCase() === "fijado" || String(t).toLowerCase() === "pinned"
    );

    let nextTags: string[];
    if (isCurrentlyPinned) {
      nextTags = currentTags.filter(
        t => String(t).toLowerCase() !== "fijado" && String(t).toLowerCase() !== "pinned"
      );
    } else {
      nextTags = [...currentTags, "fijado"];
    }

    const { error: updateError } = await supabase
      .from("sek_cases")
      .update({ tags: nextTags })
      .eq("id", id);

    if (updateError) {
      console.error("[PIN CASE API] Error:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (caseData.customer_phone) {
      const cleanPhone = String(caseData.customer_phone).trim();
      if (cleanPhone) {
        const { data: relatedCases } = await supabase
          .from("sek_cases")
          .select("id, tags")
          .eq("customer_phone", cleanPhone)
          .neq("id", id);

        if (relatedCases && relatedCases.length > 0) {
          for (const rc of relatedCases) {
            const rTags: string[] = Array.isArray(rc.tags) ? [...rc.tags] : [];
            const rPinned = rTags.some(
              t => String(t).toLowerCase() === "fijado" || String(t).toLowerCase() === "pinned"
            );
            if (isCurrentlyPinned && rPinned) {
              const filtered = rTags.filter(
                t => String(t).toLowerCase() !== "fijado" && String(t).toLowerCase() !== "pinned"
              );
              await supabase.from("sek_cases").update({ tags: filtered }).eq("id", rc.id);
            } else if (!isCurrentlyPinned && !rPinned) {
              await supabase.from("sek_cases").update({ tags: [...rTags, "fijado"] }).eq("id", rc.id);
            }
          }
        }
      }
    }

    return NextResponse.json({ ok: true, pinned: !isCurrentlyPinned, tags: nextTags });
  } catch (e: any) {
    console.error("[PIN CASE API] Exception:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
