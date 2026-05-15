import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();

  const { data: cases, error } = await supabase
    .from("sek_cases")
    .select("id, histcliente, histtecnico")
    .not("histcliente", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let fixed = 0;

  for (const c of cases ?? []) {
    const hc: any[] = Array.isArray(c.histcliente) ? c.histcliente : [];
    const ht: any[] = Array.isArray(c.histtecnico) ? c.histtecnico : [];

    // Clave única por time + mediaUrl para deduplicar dentro de histcliente
    const seen = new Set<string>();
    const cleanHc = hc.filter((e: any) => {
      const k = `${e.time || ""}_${e.mediaUrl || ""}_${e.role || ""}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // También eliminar de histcliente los que ya están en histtecnico (misma url y tiempo)
    const htKeys = new Set(ht.map((e: any) => `${e.time || ""}_${e.mediaUrl || ""}`));
    const finalHc = cleanHc.filter((e: any) => {
      const k = `${e.time || ""}_${e.mediaUrl || ""}`;
      if (e.role !== "user" && htKeys.has(k)) return false;
      return true;
    });

    if (finalHc.length !== hc.length) {
      await supabase.from("sek_cases").update({ histcliente: finalHc }).eq("id", c.id);
      fixed++;
    }
  }

  return NextResponse.json({ ok: true, fixed, total: cases?.length ?? 0 });
}
