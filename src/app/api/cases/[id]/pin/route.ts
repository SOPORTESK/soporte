import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServiceClient();
    const rawId = decodeURIComponent(params.id || "").trim();

    if (!rawId) {
      return NextResponse.json({ error: "Missing case id" }, { status: 400 });
    }

    let targetCases: any[] = [];

    if (rawId.startsWith("tel:")) {
      const cleanPhone = rawId.replace("tel:", "").trim().replace(/[^0-9]/g, "");
      if (cleanPhone) {
        const { data } = await supabase
          .from("sek_cases")
          .select("id, tags, customer_phone")
          .or(`customer_phone.ilike.%${cleanPhone}%,cliente->>telefono.ilike.%${cleanPhone}%`)
          .order("created_at", { ascending: false });
        if (data && data.length > 0) {
          targetCases = data;
        }
      }
    } else if (rawId.startsWith("case:")) {
      const realId = rawId.replace("case:", "").trim();
      const { data } = await supabase
        .from("sek_cases")
        .select("id, tags, customer_phone")
        .eq("id", realId);
      if (data && data.length > 0) {
        targetCases = data;
      }
    } else {
      // Intentar por ID exacto primero
      const { data } = await supabase
        .from("sek_cases")
        .select("id, tags, customer_phone")
        .eq("id", rawId);

      if (data && data.length > 0) {
        targetCases = data;
      } else {
        // Fallback: buscar por teléfono si rawId contiene números
        const cleanDigits = rawId.replace(/[^0-9]/g, "");
        if (cleanDigits.length >= 7) {
          const { data: byPhone } = await supabase
            .from("sek_cases")
            .select("id, tags, customer_phone")
            .or(`customer_phone.ilike.%${cleanDigits}%,cliente->>telefono.ilike.%${cleanDigits}%`)
            .order("created_at", { ascending: false });
          if (byPhone && byPhone.length > 0) {
            targetCases = byPhone;
          }
        }
      }
    }

    if (!targetCases || targetCases.length === 0) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const primaryCase = targetCases[0];
    const currentTags: string[] = Array.isArray(primaryCase.tags) ? [...primaryCase.tags] : [];
    const isCurrentlyPinned = currentTags.some(
      t => String(t).toLowerCase() === "fijado" || String(t).toLowerCase() === "pinned"
    );

    const willBePinned = !isCurrentlyPinned;
    const allIds = targetCases.map(c => c.id);

    // Actualizar todos los casos relacionados del cliente
    for (const c of targetCases) {
      const cTags: string[] = Array.isArray(c.tags) ? [...c.tags] : [];
      let updatedTags: string[];
      if (willBePinned) {
        updatedTags = cTags.some(t => String(t).toLowerCase() === "fijado")
          ? cTags
          : [...cTags, "fijado"];
      } else {
        updatedTags = cTags.filter(
          t => String(t).toLowerCase() !== "fijado" && String(t).toLowerCase() !== "pinned"
        );
      }
      await supabase.from("sek_cases").update({ tags: updatedTags }).eq("id", c.id);
    }

    // Si tiene teléfono, sincronizar también cualquier otro caso no capturado arriba
    const phone = primaryCase.customer_phone ? String(primaryCase.customer_phone).trim().replace(/[^0-9]/g, "") : "";
    if (phone.length >= 7) {
      const { data: extraCases } = await supabase
        .from("sek_cases")
        .select("id, tags")
        .or(`customer_phone.ilike.%${phone}%,cliente->>telefono.ilike.%${phone}%`);

      if (extraCases && extraCases.length > 0) {
        for (const ec of extraCases) {
          if (!allIds.includes(ec.id)) {
            const ecTags: string[] = Array.isArray(ec.tags) ? [...ec.tags] : [];
            const newTags = willBePinned
              ? (ecTags.includes("fijado") ? ecTags : [...ecTags, "fijado"])
              : ecTags.filter(t => String(t).toLowerCase() !== "fijado" && String(t).toLowerCase() !== "pinned");
            await supabase.from("sek_cases").update({ tags: newTags }).eq("id", ec.id);
          }
        }
      }
    }

    const nextPrimaryTags = willBePinned
      ? (currentTags.includes("fijado") ? currentTags : [...currentTags, "fijado"])
      : currentTags.filter(t => String(t).toLowerCase() !== "fijado" && String(t).toLowerCase() !== "pinned");

    return NextResponse.json({ ok: true, pinned: willBePinned, tags: nextPrimaryTags });
  } catch (e: any) {
    console.error("[PIN CASE API] Exception:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
