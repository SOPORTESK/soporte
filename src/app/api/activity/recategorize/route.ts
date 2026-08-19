import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { date } = await req.json();
    const targetDate = date || new Date().toISOString().split("T")[0];

    const supabase = createServiceClient();

    // Paginar: Supabase trae max 1000 por query
    let allLogs: any[] = [];
    let offset = 0;
    while (true) {
      const { data: batch, error: fetchError } = await supabase
        .from("activity_log")
        .select("id, action, category, metadata")
        .gte("created_at", `${targetDate}T00:00:00`)
        .lte("created_at", `${targetDate}T23:59:59`)
        .range(offset, offset + 999);
      if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
      if (!batch || batch.length === 0) break;
      allLogs = allLogs.concat(batch);
      if (batch.length < 1000) break;
      offset += 1000;
    }

    const logs = allLogs;
    if (logs.length === 0) return NextResponse.json({ message: "No hay logs", updated: 0 });

    const updatesByCategory: Record<string, string[]> = {};

    for (const log of logs) {
      const action = (log.action || "").toLowerCase();
      const category = log.category || "";
      const meta = (log.metadata as Record<string, any>) || {};
      const app = (meta.app || "").toLowerCase();
      const title = (meta.title || "").toLowerCase();
      const page = (meta.page || "").toLowerCase();
      const hasKeyboard = (meta.key_presses || 0) > 0;
      const hasInteractions = (meta.total_interactions || 0) > 0;
      const isWebTracker = !!page && page.length > 0;
      let newCategory = category;

      // Recategorizar TODO
      // Regla: Mensajería SOLO si hubo interacción en un buzón del web tracker
      if (app.includes("linkus") || app.includes("grandstream") || action.includes("linkus")) {
        newCategory = action.includes("perdida") ? "Escalado" : "Atención telefónica";
      } else if (title.includes("odoo") || action.includes("odoo")) {
        newCategory = "Atención de tickets";
      } else if (title.includes("tienda 3d") || title.includes("tienda3d") || title.includes("rma") || title.includes("garant") || action.includes("rma") || action.includes("garant")) {
        newCategory = "Trámites de garantías";
      } else if (app.includes("code") || app.includes("windsurf") || app.includes("cursor") || app.includes("devenv") || app.includes("webstorm") || app.includes("devin") || app.includes("terminal") || app.includes("cmd") || app.includes("powershell")) {
        newCategory = "Investigación y desarrollo";
      } else if (title.includes("github") || title.includes("stackoverflow") || title.includes("docs.") || title.includes("developer") || title.includes("npmjs") || title.includes("vercel") || title.includes("supabase")) {
        newCategory = "Investigación y desarrollo";
      } else if (app.includes("outlook") || app.includes("thunderbird") || app.includes("mail") || title.includes("correo") || title.includes("outlook")) {
        newCategory = "Gestión de correos";
      } else if (app.includes("anydesk") || app.includes("teamviewer") || app.includes("vnc")) {
        newCategory = "Soporte técnico remoto";
      } else if (action.includes("bodega") || action.includes("demostrador") || action.includes("manual") || meta.manual === true) {
        newCategory = "Labores manuales";
      } else if (isWebTracker && (page === "/inbox" || page === "/smart-inbox" || page === "/mi-gestion" || page === "/soporte-avanzado")) {
        // Web tracker en buzón = Navegación (Mensajería se loguea al enviar)
        newCategory = "Navegación";
      } else if (title.includes("sekunet") || title.includes("seka chat") || title.includes("localhost:3100") || app.includes("soporte sekunet") || action.includes("seka chat") || action.includes("sekunet")) {
        // Seka Chat = Navegación (Mensajería solo cuando se envía mensaje)
        newCategory = "Navegación";
      } else if (app.includes("whatsapp") || title.includes("whatsapp") || action.includes("whatsapp")) {
        newCategory = "Navegación";
      } else if (action.includes("mensaje a cliente") || action.includes("envió mensaje")) {
        // Logs de envío de mensaje = Mensajería
        newCategory = "Mensajería";
      } else {
        newCategory = "Navegación";
      }

      if (newCategory !== category) {
        // Agrupar IDs por categoría nueva para hacer batch updates
        if (!updatesByCategory[newCategory]) updatesByCategory[newCategory] = [];
        updatesByCategory[newCategory].push(log.id);
      }
    }

    // Batch: un UPDATE por categoría con todos los IDs
    let updated = 0;
    for (const [cat, ids] of Object.entries(updatesByCategory) as [string, string[]][]) {
      // Supabase max IN clause ~1000, hacer chunks si es necesario
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const { error: updateError } = await supabase
          .from("activity_log")
          .update({ category: cat })
          .in("id", chunk);
        if (!updateError) updated += chunk.length;
      }
    }

    return NextResponse.json({ message: `Recategorizados ${updated} logs`, updated, total: logs.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
