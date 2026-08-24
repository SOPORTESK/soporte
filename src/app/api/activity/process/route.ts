import { NextRequest, NextResponse } from "next/server";
import { getActivityTimeline, insertActivitySummary, type ActivityLog } from "@/lib/activity-db";
import { getChain, type ResolvedModel } from "@/lib/ai/config";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { agent_email, agent_name, date } = await req.json();
    const targetDate = date || new Date().toISOString().split("T")[0];

    if (!agent_email) {
      return NextResponse.json({ error: "agent_email is required" }, { status: 400 });
    }

    const timeline = await getActivityTimeline(agent_email, targetDate);
    if (timeline.length === 0) {
      return NextResponse.json({ message: "No hay eventos para procesar", summaries: 0 });
    }

    // Construir texto detallado de todos los eventos
    const eventsText = timeline
      .slice()
      .reverse()
      .map((e: ActivityLog) => {
        const time = formatTime(e.created_at || "");
        let line = `[${time}] ${e.category}: ${e.action}`;
        if (e.duration_ms) line += ` (${Math.round(e.duration_ms / 1000)}s)`;
        if (e.metadata) {
          const m = e.metadata as Record<string, any>;
          const metaParts: string[] = [];
          if (m.dwell_seconds) metaParts.push(`tiempo_en_página=${m.dwell_seconds}s`);
          if (m.clicks) metaParts.push(`clicks=${m.clicks}`);
          if (m.key_presses) metaParts.push(`teclas=${m.key_presses}`);
          if (m.scrolls) metaParts.push(`scrolls=${m.scrolls}`);
          if (m.total_interactions) metaParts.push(`interacciones=${m.total_interactions}`);
          if (m.page) metaParts.push(`página=${m.page}`);
          if (m.from) metaParts.push(`desde=${m.from}`);
          if (m.app) metaParts.push(`app=${m.app}`);
          if (m.title) metaParts.push(`titulo=${String(m.title).substring(0, 50)}`);
          if (m.channel) metaParts.push(`canal=${m.channel}`);
          if (m.message_length) metaParts.push(`longitud_msg=${m.message_length}`);
          if (metaParts.length) line += ` {${metaParts.join(", ")}}`;
        }
        return line;
      })
      .join("\n");

    const prompt = `Eres un analista de productividad laboral para un taller de servicio y soporte técnico. Analiza el siguiente registro de actividad del técnico ${agent_name} durante el día ${targetDate}.

CATEGORÍAS DE ACTIVIDAD DEL TALLER:
- Atención telefónica: llamadas entrantes/salientes vía Linkus (softphone)
- Mensajería: atención por chat (Seka Chat / WhatsApp)
- Atención de tickets: gestión en Odoo
- Trámites de garantías: Tienda 3D, RMA, trámites de warranty
- Investigación y desarrollo: programación, IDEs, GitHub, documentación técnica
- Labores manuales: bodega, demostradores, tareas físicas (registradas manualmente)
- Gestión de correos: Outlook, correo electrónico
- Escalado: llamadas perdidas, tickets escalados
- Inactividad: ausencia, almuerzo, pausas
- Navegación: navegación web general

REGISTRO DE ACTIVIDAD (orden cronológico):
${eventsText}

Genera un REPORTE NARRATIVO INTELIGENTE en español que incluya:

1. **Resumen ejecutivo** (2-3 oraciones): Qué hizo el técnico durante el día, cuál fue su enfoque principal, cuánto tiempo estuvo activo vs inactivo.

2. **Línea de tiempo narrativa** (4-6 oraciones): Recorrido cronológico describiendo qué hizo, cuánto tiempo dedicó a cada categoría (llamadas, tickets, garantías, desarrollo, etc.), qué aplicaciones usó, acciones específicas relevantes.

3. **Métricas observadas**: Tiempo total activo, tiempo inactivo, tiempo por categoría, aplicaciones usadas, llamadas atendidas, tickets gestionados, garantías tramitadas, interacciones totales.

4. **Interpretación de productividad**: Qué tan productivo fue el día, si hubo períodos de inactividad significativos, si se enfocó en atención al cliente o tareas administrativas/desarrollo, recomendaciones.

Responde SOLO en formato JSON:
{
  "categoria_principal": "categoría dominante del día",
  "resumen_ejecutivo": "...",
  "linea_tiempo": "...",
  "metricas": "...",
  "interpretacion": "..."
}`;

    let reportData: any = null;
    let providerUsed = "";

    // La cadena de modelos se configura en /admin/agente-ia (rol "activity").
    // Se recorre en orden hasta que uno devuelva un JSON válido.
    const chain = await getChain("activity");
    for (const m of chain) {
      try {
        console.log(`[activity/process] Intentando ${m.provider}/${m.modelo}...`);
        const raw = m.provider === "google"
          ? await callGeminiModel(prompt, m)
          : await callOpenAiCompatible(prompt, m);
        if (raw) {
          reportData = JSON.parse(raw);
          providerUsed = `${m.provider}/${m.modelo}`;
          console.log(`[activity/process] ✓ ${providerUsed} OK`);
          break;
        }
      } catch (e: any) {
        console.warn(`[activity/process] ${m.provider}/${m.modelo} falló:`, e.message);
      }
    }

    // Si toda la cadena falla, se genera un reporte básico sin IA
    if (!reportData) {
      console.log("[activity/process] Sin IA disponible, generando reporte básico...");
      reportData = generateBasicReport(timeline, agent_name);
      providerUsed = "Reporte básico (sin IA)";
    }

    // Guardar reporte consolidado del día
    const fullSummary = [
      reportData.resumen_ejecutivo || "",
      "\n\n--- Línea de tiempo ---\n",
      reportData.linea_tiempo || "",
      "\n\n--- Métricas ---\n",
      reportData.metricas || "",
      "\n\n--- Interpretación ---\n",
      reportData.interpretacion || "",
    ].join("");

    await insertActivitySummary({
      agent_email,
      date: targetDate,
      summary: fullSummary,
      category: reportData.categoria_principal || "Actividad general",
      time_block: "Día completo",
    });

    // Resúmenes por bloques de 30 min
    const blocks = groupIntoBlocks(timeline, 30);
    for (const block of blocks) {
      const blockEventsText = block.events
        .map((e: ActivityLog) => `[${formatTime(e.created_at || "")}] ${e.action}`)
        .join("; ");

      const blockSummary =
        block.events.length > 3
          ? `${block.label}: ${block.dominantCategory}. ${block.events.length} eventos: ${blockEventsText.substring(0, 200)}...`
          : `${block.label}: ${blockEventsText}`;

      await insertActivitySummary({
        agent_email,
        date: targetDate,
        summary: blockSummary,
        category: block.dominantCategory,
        time_block: block.label,
      });
    }

    return NextResponse.json({
      message: "Reporte generado",
      report: reportData,
      provider: providerUsed,
      blocks: blocks.length,
    });
  } catch (error: any) {
    console.error("[activity/process] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── Llamadas genéricas: el modelo y la key vienen del panel de admin ──

function extractJson(text: string | undefined): string | null {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

async function callGeminiModel(prompt: string, m: ResolvedModel): Promise<string | null> {
  try {
    const res = await fetch(`${m.baseUrl}/models/${m.modelo}:generateContent?key=${m.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 800 },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.warn(`[activity/process] ${m.modelo} error ${res.status}:`, (await res.text()).substring(0, 200));
      return null;
    }
    const data = await res.json();
    return extractJson(data?.candidates?.[0]?.content?.parts?.[0]?.text);
  } catch (e: any) {
    console.warn(`[activity/process] ${m.modelo} fetch error:`, e.message);
    return null;
  }
}

async function callOpenAiCompatible(prompt: string, m: ResolvedModel): Promise<string | null> {
  try {
    const res = await fetch(`${m.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${m.apiKey}` },
      body: JSON.stringify({
        model: m.modelo,
        messages: [
          { role: "system", content: "Eres un analista de productividad laboral. Respondes solo en JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 800,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.warn(`[activity/process] ${m.provider}/${m.modelo} error ${res.status}:`, (await res.text()).substring(0, 200));
      return null;
    }
    const data = await res.json();
    return extractJson(data?.choices?.[0]?.message?.content);
  } catch (e: any) {
    console.warn(`[activity/process] ${m.provider}/${m.modelo} fetch error:`, e.message);
    return null;
  }
}

// ─── Reporte básico sin IA ─────────────────────────────────────────────

function generateBasicReport(timeline: ActivityLog[], agentName: string) {
  const active = timeline.filter((e) => e.category !== "Inactividad");
  const idle = timeline.filter((e) => e.category === "Inactividad");

  // Contar por categoría
  const catCounts: Record<string, number> = {};
  const catDuration: Record<string, number> = {};
  timeline.forEach((e) => {
    catCounts[e.category] = (catCounts[e.category] || 0) + 1;
    catDuration[e.category] = (catDuration[e.category] || 0) + (e.duration_ms || 0);
  });

  const topCategory = Object.entries(catCounts)
    .filter(([c]) => c !== "Inactividad")
    .sort((a, b) => b[1] - a[1])[0]?.[0] || "Actividad general";

  const apps = new Set<string>();
  timeline.forEach((e) => {
    const meta = e.metadata as Record<string, any>;
    if (meta?.app) apps.add(meta.app);
  });

  const totalActiveMs = active.reduce((s, e) => s + (e.duration_ms || 0), 0);
  const totalIdleMs = idle.reduce((s, e) => s + (e.duration_ms || 0), 0);

  const catSummary = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => `${cat}: ${count} eventos`)
    .join(". ");

  return {
    categoria_principal: topCategory,
    resumen_ejecutivo: `${agentName} registró ${active.length} eventos activos y ${idle.length} de inactividad. Categoría principal: ${topCategory}. Usó ${apps.size} aplicaciones diferentes.`,
    linea_tiempo: `Distribución de actividad: ${catSummary}. Aplicaciones usadas: ${Array.from(apps).join(", ") || "sin datos"}.`,
    metricas: `Eventos activos: ${active.length}. Inactividad: ${idle.length}. Tiempo activo: ${formatDuration(totalActiveMs)}. Tiempo inactivo: ${formatDuration(totalIdleMs)}. Aplicaciones: ${apps.size}. ${catSummary}.`,
    interpretacion: `Productividad del día: ${Math.round((active.length / (active.length + idle.length)) * 100)}% de actividad. ${idle.length > 5 ? "Se detectaron períodos significativos de inactividad." : "El técnico mantuvo actividad constante."} Enfoque principal: ${topCategory}.`,
  };
}

// ─── Utilidades ────────────────────────────────────────────────────────

interface Block {
  label: string;
  start: Date;
  end: Date;
  events: ActivityLog[];
  dominantCategory: string;
}

function groupIntoBlocks(timeline: ActivityLog[], blockMinutes: number): Block[] {
  if (timeline.length === 0) return [];

  const sorted = [...timeline].sort(
    (a, b) => new Date(a.created_at || "").getTime() - new Date(b.created_at || "").getTime()
  );

  const blocks: Block[] = [];
  let currentBlock: ActivityLog[] = [];
  let blockStart = new Date(sorted[0].created_at || "");
  let lastTime = blockStart;

  for (const event of sorted) {
    const eventTime = new Date(event.created_at || "");
    const diffMin = (eventTime.getTime() - lastTime.getTime()) / 60000;

    if (diffMin > blockMinutes && currentBlock.length > 0) {
      blocks.push(createBlock(currentBlock, blockStart, lastTime));
      currentBlock = [];
      blockStart = eventTime;
    }

    currentBlock.push(event);
    lastTime = eventTime;
  }

  if (currentBlock.length > 0) {
    blocks.push(createBlock(currentBlock, blockStart, lastTime));
  }

  return blocks;
}

function createBlock(events: ActivityLog[], start: Date, end: Date): Block {
  const categories: Record<string, number> = {};
  for (const e of events) {
    if (e.category === "Inactividad") continue;
    categories[e.category] = (categories[e.category] || 0) + 1;
  }
  const dominantCategory =
    Object.entries(categories).sort((a, b) => b[1] - a[1])[0]?.[0] || "Actividad general";

  return {
    label: `${formatTime(start.toISOString())} - ${formatTime(end.toISOString())}`,
    start,
    end,
    events,
    dominantCategory,
  };
}

function formatTime(ts: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function pathnameToLabel(path: string): string {
  if (path === "/inbox") return "Bandeja de entrada";
  if (path === "/smart-inbox") return "Smart Inbox";
  if (path === "/soporte-avanzado") return "Soporte Avanzado";
  if (path === "/mi-gestion") return "Mi Gestión";
  if (path === "/admin") return "Admin Resumen";
  if (path === "/admin/actividad") return "Activity Tracker";
  return path;
}
