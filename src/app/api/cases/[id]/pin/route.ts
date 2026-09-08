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

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body vacío o no enviado
    }

    const containerType = String(body.containerType || "").toLowerCase().trim();
    const agentEmail = String(body.agentEmail || "").toLowerCase().trim();

    // Determinar etiqueta específica del ámbito
    let targetTag = "fijado";
    if (containerType === "mi-gestion" && agentEmail) {
      targetTag = `fijado:${agentEmail}`;
    } else if (containerType === "soporte-avanzado") {
      targetTag = "fijado:soporte-avanzado";
    } else if (containerType === "inbox") {
      targetTag = "fijado:inbox";
    } else if (containerType === "smart-inbox") {
      targetTag = "fijado:smart-inbox";
    }

    if (!targetCases || targetCases.length === 0) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const primaryCase = targetCases[0];
    const currentTags: string[] = Array.isArray(primaryCase.tags) ? [...primaryCase.tags] : [];
    
    // Verificar si ya está fijado con la etiqueta de este ámbito (o etiqueta legacy en caso general)
    const isCurrentlyPinned = currentTags.some(t => {
      const lower = String(t).toLowerCase();
      if (lower === targetTag) return true;
      if (targetTag === "fijado" && (lower === "fijado" || lower === "pinned")) return true;
      return false;
    });

    const willBePinned = !isCurrentlyPinned;
    const allIds = targetCases.map(c => c.id);

    // Función auxiliar para calcular nuevos tags
    const computeNewTags = (existingTags: string[]) => {
      const tagsList = Array.isArray(existingTags) ? [...existingTags] : [];
      if (willBePinned) {
        return tagsList.some(t => String(t).toLowerCase() === targetTag)
          ? tagsList
          : [...tagsList, targetTag];
      } else {
        return tagsList.filter(t => {
          const lower = String(t).toLowerCase();
          if (lower === targetTag) return false;
          if (targetTag === "fijado" && (lower === "fijado" || lower === "pinned")) return false;
          return true;
        });
      }
    };

    // Actualizar todos los casos relacionados del cliente
    for (const c of targetCases) {
      const updatedTags = computeNewTags(c.tags);
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
            const newTags = computeNewTags(ec.tags);
            await supabase.from("sek_cases").update({ tags: newTags }).eq("id", ec.id);
          }
        }
      }
    }

    const nextPrimaryTags = computeNewTags(currentTags);

    return NextResponse.json({
      ok: true,
      pinned: willBePinned,
      targetTag,
      containerType: containerType || "default",
      tags: nextPrimaryTags
    });
  } catch (e: any) {
    console.error("[PIN CASE API] Exception:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

