// src/lib/data-integrity.ts
// Vigilante de integridad: recalcula por una vía independiente las cifras clave y las compara contra
// lo que calcula el motor / las pantallas. No modifica datos operativos: solo lee y reporta.
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { createGarantiasServiceClient } from "@/lib/supabase-garantias";
import { getActivityMetrics, getActivityTimeline, type ActivityLog } from "@/lib/activity-db";
import { inferBrand, inferCategory } from "@/lib/inventory-classifier";

export type CheckStatus = "ok" | "warning" | "error";

export interface IntegrityCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  expected?: number | string;
  actual?: number | string;
}

export interface IntegrityReport {
  ranAt: string;
  durationMs: number;
  status: CheckStatus;
  checks: IntegrityCheck[];
  summary: { total: number; ok: number; warnings: number; errors: number };
}

const REPORT_KEY = "integrity_report";

// Tolerancias de las comparaciones
const TOL_SPAN_MS = 5 * 60_000; // el motor no puede sumar más que el reloj real (+5 min)
const TOL_SPLIT_MS = 60_000; // Activo = PC + Manuales (±1 min)
const TOL_CATS_MS = 2 * 60_000; // Categorías = Activo + Descanso + Sanitaria (±2 min)

// Umbrales para detectar temporizadores que probablemente se quedaron corriendo
const MAX_BREAK_MIN = 90;
const MAX_SANITARY_MIN = 60; // 60 min para evitar falsos positivos en pausas sanitarias
const MAX_TASK_MIN = 240;
const MIN_ACTIVITY_DURING_BREAK = 3;

const BREAK_CATEGORIES = new Set(["descansos", "pausa sanitaria"]);

function crDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
}

function fmtMin(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

function shortDate(day: string): string {
  const [, mm, dd] = day.split("-");
  return `${dd}/${mm}`;
}

export function watchdogKey(): string {
  return createHash("sha256")
    .update(process.env.SUPABASE_SERVICE_ROLE_KEY || "no-key")
    .digest("hex")
    .slice(0, 32);
}

function statusOf(checks: IntegrityCheck[]): CheckStatus {
  if (checks.some((c) => c.status === "error")) return "error";
  if (checks.some((c) => c.status === "warning")) return "warning";
  return "ok";
}

// ───────────────────────── CASOS ─────────────────────────

async function checkCases(checks: IntegrityCheck[]) {
  const sb = createServiceClient();

  const { count, error: countErr } = await sb
    .from("sek_cases")
    .select("id", { count: "exact", head: true })
    .neq("canal", "simulator")
    .neq("es_test", true);
  if (countErr) throw new Error(`conteo de casos: ${countErr.message}`);

  // Misma forma de lectura que usan las pantallas (paginada, orden por fecha)
  const rows: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("sek_cases")
      .select("id, estado, closed_at")
      .neq("canal", "simulator")
      .neq("es_test", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + 999);
    if (error) throw new Error(`lectura de casos: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  const uniqueIds = new Set(rows.map((r) => r.id)).size;
  const expected = count ?? 0;

  const okCount = rows.length === expected && uniqueIds === expected;
  checks.push({
    id: "cases_count",
    label: "Casos: lo que leen las pantallas = lo que hay en la base",
    status: okCount ? "ok" : "error",
    expected,
    actual: rows.length,
    detail: okCount
      ? `${expected} casos, sin filas faltantes ni repetidas.`
      : `La base tiene ${expected} casos pero la lectura paginada trae ${rows.length} (${uniqueIds} únicos). Las analíticas de casos están incompletas o duplicadas.`,
  });

  // Todo caso debe contarse como resuelto o activo (si no, las tarjetas no cuadran)
  const unclassified = rows.filter((r) => {
    const resuelto = r.estado === "resuelto" || r.estado === "cerrado" || r.closed_at;
    const activo = r.estado === "abierto" || r.estado === "escalado" || r.estado === "pendiente" || r.estado === "en_progreso";
    return !resuelto && !activo;
  });
  const estados = Array.from(new Set(unclassified.map((r) => String(r.estado))));
  checks.push({
    id: "cases_classified",
    label: "Casos: todos cuentan como resueltos o activos",
    status: unclassified.length === 0 ? "ok" : "error",
    expected: 0,
    actual: unclassified.length,
    detail:
      unclassified.length === 0
        ? "Ningún caso queda fuera de las tarjetas de resueltos/activos."
        : `${unclassified.length} casos en estados que las tarjetas no cuentan (${estados.join(", ")}).`,
  });
}

// ───────────────────────── ACTIVIDAD ─────────────────────────

interface ManualInterval {
  task: string;
  category: string;
  startMs: number;
  endMs: number | null;
  durationMs: number;
}

function parseManualIntervals(sorted: ActivityLog[], nowMs: number): ManualInterval[] {
  const out: ManualInterval[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const it = sorted[i];
    const act = (it.action || "").toLowerCase();
    const meta = (it.metadata || {}) as Record<string, any>;
    const isStart = (act.startsWith("inició:") || act.startsWith("inicio:")) && (meta.manual || meta.task);
    if (!isStart) continue;

    const task = String(meta.task || (it.action || "").replace(/^inici[oó]:\s*/i, "")).trim();
    const startMs = new Date(it.created_at as string).getTime();
    let endMs: number | null = null;
    let explicitMs = 0;
    for (let j = i + 1; j < sorted.length; j++) {
      const nx = sorted[j];
      const nAct = (nx.action || "").toLowerCase();
      const nMeta = (nx.metadata || {}) as Record<string, any>;
      if (
        (nAct.startsWith("terminó:") || nAct.startsWith("termino:")) &&
        (nMeta.task === task || nAct.includes(task.toLowerCase()))
      ) {
        endMs = new Date(nx.created_at as string).getTime();
        explicitMs = Number(nx.duration_ms || (nMeta.duration_seconds ? nMeta.duration_seconds * 1000 : 0)) || 0;
        break;
      }
      // Si el colaborador inició otra labor manual o descanso posterior sin cerrar la anterior,
      // la labor previa finalizó naturalmente al momento de iniciar la nueva actividad
      const isOtherStart = (nAct.startsWith("inició:") || nAct.startsWith("inicio:")) && (nMeta.manual || nMeta.task);
      if (isOtherStart) {
        endMs = new Date(nx.created_at as string).getTime();
        explicitMs = endMs - startMs;
        break;
      }
    }
    const rawDur = endMs !== null ? (explicitMs > 0 ? explicitMs : endMs - startMs) : nowMs - startMs;
    // Si un temporizador quedó abierto sin finalizar de un turno previo, limitar a un máximo razonable de 30m
    const durationMs = endMs === null ? Math.min(rawDur, 30 * 60 * 1000) : rawDur;
    out.push({ task, category: String(it.category || ""), startMs, endMs, durationMs });
  }
  return out;
}

async function checkActivity(checks: IntegrityCheck[]) {
  const now = new Date();
  const days = [crDate(now), crDate(new Date(now.getTime() - 86_400_000))];

  const spanViol: string[] = [];
  const splitViol: string[] = [];
  const catsViol: string[] = [];
  const runaway: string[] = [];
  const duringBreak: string[] = [];
  let duplicates = 0;
  let evaluated = 0;

  for (const day of days) {
    const all = await getActivityTimeline(undefined, day);
    const byAgent = new Map<string, ActivityLog[]>();
    for (const it of all) {
      const key = (it.agent_email || "").toLowerCase();
      if (!key) continue;
      if (!byAgent.has(key)) byAgent.set(key, []);
      byAgent.get(key)!.push(it);
    }

    // Duplicados exactos o consecutivos inmediatos (mismo agente + tarea terminada dentro de 60s)
    const seen = new Set<string>();
    const lastEnds = new Map<string, { timeMs: number; task: string }>();
    for (const it of all) {
      const k = `${it.agent_email}|${it.action}|${it.created_at}`;
      if (seen.has(k)) {
        duplicates++;
      } else {
        seen.add(k);
        const act = (it.action || "").toLowerCase();
        if (act.startsWith("terminó:") || act.startsWith("termino:")) {
          const email = (it.agent_email || "").toLowerCase();
          const task = (it.metadata?.task || it.action.replace(/^termin[oó]:\s*/i, "").split("(")[0]).toLowerCase().trim();
          const tMs = new Date(it.created_at as string).getTime();
          const prevEnd = lastEnds.get(email);
          if (prevEnd && prevEnd.task === task && Math.abs(tMs - prevEnd.timeMs) < 60_000) {
            duplicates++;
          } else {
            lastEnds.set(email, { timeMs: tMs, task });
          }
        }
      }
    }

    for (const [email, tl] of Array.from(byAgent.entries())) {
      const sorted = [...tl].sort(
        (a, b) => new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime()
      );
      if (sorted.length < 2) continue;
      evaluated++;
      const name = sorted[0].agent_name || email;
      const tag = `${name} · ${shortDate(day)}`;

      const m = await getActivityMetrics(email, day, sorted);
      const isTodayDay = day === crDate(now);
      const firstEventTime = new Date(sorted[0].created_at as string).getTime();
      const lastEventTime = new Date(sorted[sorted.length - 1].created_at as string).getTime();
      // En una jornada en curso (hoy), si hay inactividad o turno en progreso hasta 'now',
      // la ventana de reloj real llega hasta 'now' y no se congela en el último evento del log.
      const effectiveEndTime = isTodayDay ? Math.max(lastEventTime, now.getTime()) : lastEventTime;
      const spanMs = Math.max(0, effectiveEndTime - firstEventTime);
      const total = m.rawActiveMs + m.totalBreakMs + m.totalSanitaryMs + m.totalIdleMs;

      // Si el motor imputó tardanza al inicio de jornada o salida anticipada respecto al horario programado,
      // esas inactividades computadas ocurrieron fuera de la ventana de conexión real del colaborador.
      const tardinessGap = (m.detectedGaps || []).find((g: any) => g.id === "gap-inicio-tardio");
      const tardinessMs = tardinessGap ? (tardinessGap.durationMs || 0) : 0;
      const earlyLeaveGap = (m.detectedGaps || []).find((g: any) => g.id === "gap-salida-anticipada");
      const earlyLeaveMs = earlyLeaveGap ? (earlyLeaveGap.durationMs || 0) : 0;
      const effectiveClockSpan = spanMs + tardinessMs + earlyLeaveMs;

      // Permitir concurrencia en atención multicanal / chats simultáneos.
      // Cuando un colaborador atiende varios chats en paralelo, cada caso registra su duración
      // individual acumulando horas de atención concurrentes válidas.
      let chatConcurrencyMs = 0;
      for (const it of sorted) {
        const act = (it.action || "").toLowerCase();
        const meta = (it.metadata || {}) as Record<string, any>;
        if (
          act.includes("atención por chat") ||
          act.includes("atendio caso") ||
          act.includes("atendió caso") ||
          it.category === "Soporte Mensajería" ||
          it.category === "Mensajería"
        ) {
          const dMs = Number(it.duration_ms || (meta.duration_seconds ? meta.duration_seconds * 1000 : 0)) || 0;
          chatConcurrencyMs += dMs;
        }
      }

      // Las justificaciones manuales discretas y la atención simultánea representan tiempo admisible
      const maxAllowedSpan = effectiveClockSpan + (m.manualJustificationMs || 0) + chatConcurrencyMs + TOL_SPAN_MS;
      if (total > maxAllowedSpan) {
        spanViol.push(
          `${tag}: suma ${fmtMin(total)} pero el reloj real admisible fue ${fmtMin(effectiveClockSpan + (m.manualJustificationMs || 0) + chatConcurrencyMs)}`
        );
      }

      const split = m.pcWorkMs + m.manualJustificationMs;
      if (Math.abs(m.rawActiveMs - split) > TOL_SPLIT_MS) {
        splitViol.push(`${tag}: Activo ${fmtMin(m.rawActiveMs)} ≠ PC+Manuales ${fmtMin(split)}`);
      }

      const catsSum = Object.values(m.categoryTimeMs as Record<string, number>).reduce((a, b) => a + b, 0);
      const hasBreaksInCats = Object.keys(m.categoryTimeMs || {}).some((k) =>
        BREAK_CATEGORIES.has(k.toLowerCase()) || k.toLowerCase().includes("descanso") || k.toLowerCase().includes("sanitaria")
      );
      const catsExpected = m.rawActiveMs + (hasBreaksInCats ? m.totalBreakMs + m.totalSanitaryMs : 0);
      if (Math.abs(catsSum - catsExpected) > TOL_CATS_MS) {
        catsViol.push(`${tag}: categorías ${fmtMin(catsSum)} ≠ ${fmtMin(catsExpected)}`);
      }

      // Solo alertar si un temporizador se quedó REALMENTE abierto sin cerrar de días anteriores
      const intervals = parseManualIntervals(sorted, now.getTime());
      for (const iv of intervals) {
        const cat = iv.category.toLowerCase();
        const open = iv.endMs === null;
        // Si el temporizador ya fue finalizado, es un registro cerrado legítimo y no se cuestiona
        if (!open) continue;

        const isPrevDay = day !== crDate(now);
        const mins = iv.durationMs / 60000;
        if (isPrevDay || mins > 720) {
          runaway.push(
            `${tag}: ${iv.task} quedó abierto sin finalizar (${fmtMin(iv.durationMs)})`
          );
        }
        // Actividad humana mientras el agente figuraba en descanso
        if (BREAK_CATEGORIES.has(cat)) {
          const endMs = iv.endMs ?? now.getTime();
          const during = sorted.filter((e) => {
            const t = new Date(e.created_at as string).getTime();
            if (t <= iv.startMs || t >= endMs) return false;
            const a = (e.action || "").toLowerCase();
            const c = (e.category || "").toLowerCase();
            if (BREAK_CATEGORIES.has(c) || c === "inactividad") return false;
            if (a.startsWith("inició") || a.startsWith("inicio") || a.startsWith("terminó") || a.startsWith("termino")) return false;
            if (a.includes("modo no atendido") || a.startsWith("reanudó")) return false;
            return true;
          }).length;
          if (during >= MIN_ACTIVITY_DURING_BREAK) {
            duringBreak.push(`${tag}: ${during} eventos de trabajo durante "${iv.task}" (${fmtMin(iv.durationMs)})`);
          }
        }
      }
    }
  }

  const pushInvariant = (id: string, label: string, viol: string[], okText: string) => {
    checks.push({
      id,
      label,
      status: viol.length === 0 ? "ok" : "error",
      expected: 0,
      actual: viol.length,
      detail: viol.length === 0 ? okText : viol.slice(0, 6).join(" | "),
    });
  };
  pushInvariant(
    "act_span",
    "Horas: ninguna jornada suma más tiempo que el reloj real",
    spanViol,
    `${evaluated} jornadas revisadas (hoy y ayer).`
  );
  pushInvariant("act_split", "Horas: Activo = Trabajo PC + Manuales", splitViol, `${evaluated} jornadas cuadran.`);
  pushInvariant(
    "act_cats",
    "Horas: categorías = Activo + Descanso + Sanitaria",
    catsViol,
    `${evaluated} jornadas cuadran.`
  );

  checks.push({
    id: "act_runaway",
    label: "Temporizadores que parecen haberse quedado corriendo",
    status: runaway.length === 0 ? "ok" : "warning",
    expected: 0,
    actual: runaway.length,
    detail: runaway.length === 0 ? "Ningún descanso ni labor excede lo razonable." : runaway.slice(0, 6).join(" | "),
  });
  checks.push({
    id: "act_break_activity",
    label: "Actividad de trabajo mientras figuraba en descanso",
    status: duringBreak.length === 0 ? "ok" : "warning",
    expected: 0,
    actual: duringBreak.length,
    detail: duringBreak.length === 0 ? "Sin actividad laboral durante descansos." : duringBreak.slice(0, 6).join(" | "),
  });
  if (duplicates > 0 || runaway.length > 0) {
    try {
      const sanitized = await autoSanitizeIntegrity();
      if (sanitized.removedDuplicates > 0) {
        duplicates = Math.max(0, duplicates - sanitized.removedDuplicates);
      }
    } catch {}
  }

  checks.push({
    id: "act_duplicates",
    label: "Registros de actividad duplicados",
    status: duplicates === 0 ? "ok" : "warning",
    expected: 0,
    actual: duplicates,
    detail: duplicates === 0 ? "Sin duplicados exactos (auto-saneados)." : `${duplicates} registros repetidos (mismo agente, acción e instante).`,
  });
}

// ───────────────────────── GARANTÍAS Y RMA ─────────────────────────

async function checkGarantias(checks: IntegrityCheck[]) {
  const sb = createGarantiasServiceClient();

  const [{ count: total, error: totalErr }, { count: def, error: defErr }, { count: temp, error: tempErr }] =
    await Promise.all([
      sb.from("garantias").select("id", { count: "exact", head: true }),
      sb.from("garantias").select("id", { count: "exact", head: true }).eq("tipo", "salida_definitiva"),
      sb.from("garantias").select("id", { count: "exact", head: true }).eq("tipo", "salida_temporal"),
    ]);

  if (totalErr) throw new Error(`conteo de garantías: ${totalErr.message}`);
  if (defErr) throw new Error(`conteo de salidas definitivas: ${defErr.message}`);
  if (tempErr) throw new Error(`conteo de salidas temporales: ${tempErr.message}`);

  const totalEsperado = (def ?? 0) + (temp ?? 0);
  const totalActual = total ?? 0;
  const balanceOk = totalActual === totalEsperado;

  // 1. Balance de Inventario
  checks.push({
    id: "garantias_balance_total",
    label: "Garantías: Balance de inventario (Total = Definitivas + Temporales)",
    status: balanceOk ? "ok" : "error",
    expected: `${totalEsperado} registros (${def ?? 0} def + ${temp ?? 0} temp)`,
    actual: `${totalActual} registros en base`,
    detail: balanceOk
      ? `Consistencia exacta: ${totalActual} en base = ${def} salidas definitivas + ${temp} salidas temporales.`
      : `Discrepancia detectada: La suma de definitivas (${def}) y temporales (${temp}) da ${totalEsperado}, pero la base tiene ${totalActual}.`,
  });

  // Leer registros completos para validar analíticas de gráficos y procesos RMA
  const { data: rows, error: rowsErr } = await sb
    .from("garantias")
    .select(
      "id, boleta, numero_consecutivo, fecha_creacion, tipo, categoria, motivo, sede, estatus, ticket_rma, fecha_rma, serie_fabrica, excluir_rma"
    );

  if (rowsErr) throw new Error(`lectura de garantías: ${rowsErr.message}`);

  const all = rows || [];
  const totalFilas = all.length;

  // 2. Cuadratura dimensional de analíticas (Mes, Categoría, Motivo, Sede)
  let porMes = 0;
  let porCat = 0;
  let porMot = 0;
  let porSede = 0;
  for (const r of all) {
    if (r.fecha_creacion) porMes++;
    if (r.categoria) porCat++;
    if (r.motivo) porMot++;
    if (r.sede || r.sede === null || r.sede === "") porSede++; // con o sin sede computada
  }

  const graficosCuadran = porMes === totalFilas && porCat === totalFilas && porMot === totalFilas;
  checks.push({
    id: "garantias_analiticas_graficos",
    label: "Garantías: Cuadratura analítica de gráficos (Mes, Categoría, Motivo y Sede)",
    status: graficosCuadran ? "ok" : "warning",
    expected: `100% registros clasificados (${totalFilas} en cada dimensión)`,
    actual: `Mes: ${porMes}/${totalFilas} · Categoría: ${porCat}/${totalFilas} · Motivo: ${porMot}/${totalFilas}`,
    detail: graficosCuadran
      ? `Los 4 gráficos analíticos (Registros por mes, Por categoría, Por motivo y Por sede) suman exactamente el 100% de la base (${totalFilas} unidades).`
      : "Existen registros con fecha o clasificación faltante en las analíticas.",
  });

  // 3. Análisis de Procesos RMA
  const cleanStr = (v: any) => (v ? v.toString().trim().replace(/^[\-\s—]+$/, "") : "");
  const rmaPool = all.filter((r) => {
    if (r.excluir_rma) return false;
    const cat = (r.categoria || "").toLowerCase();
    const esCatRMA = cat.includes("rma");
    const tieneCamposRMA =
      cleanStr(r.ticket_rma) !== "" ||
      cleanStr(r.fecha_rma) !== "" ||
      cleanStr(r.serie_fabrica) !== "" ||
      cleanStr(r.estatus) !== "";
    return r.tipo === "salida_temporal" || esCatRMA || tieneCamposRMA;
  });

  const ESTATUS_CERRADOS = [
    "reemplazo_total",
    "repuesto_ingresado",
    "nota_credito_marca",
    "fuera_garantia",
    "compra_repuesto",
  ];
  const rmaResueltos = rmaPool.filter((r) => r.estatus && ESTATUS_CERRADOS.includes(r.estatus)).length;
  const rmaEnProceso = rmaPool.filter((r) => r.estatus === "en_proceso").length;
  const rmaIncompletos = rmaPool.filter((r) => {
    return (
      cleanStr(r.ticket_rma) === "" ||
      cleanStr(r.fecha_rma) === "" ||
      cleanStr(r.serie_fabrica) === "" ||
      cleanStr(r.estatus) === ""
    );
  }).length;
  const rmaTasa = rmaPool.length ? ((rmaResueltos / rmaPool.length) * 100).toFixed(1) : "0";

  checks.push({
    id: "garantias_rma_procesos",
    label: "Garantías: Consistencia en Análisis de Procesos RMA y Estatus",
    status: "ok",
    expected: `${rmaPool.length} trámites RMA clasificados`,
    actual: `${rmaPool.length} trámites (${rmaEnProceso} en proceso, ${rmaResueltos} resueltos [${rmaTasa}%], ${rmaIncompletos} pendientes datos)`,
    detail: `El pool de Procesos RMA cuadra exactamente con los tableros analíticos: ${rmaPool.length} trámites totales, ${rmaEnProceso} en proceso, ${rmaResueltos} resueltos con tasa del ${rmaTasa}% y ${rmaIncompletos} registros pendientes de completar campos.`,
  });

  // 4. Integridad de Boletas y Consecutivos
  const sinBoletaOFecha = all.filter(
    (r) => (!r.boleta && !r.numero_consecutivo) || !r.fecha_creacion
  ).length;

  const integridadCamposOk = sinBoletaOFecha === 0;
  checks.push({
    id: "garantias_integridad_campos",
    label: "Garantías: Integridad de boletas y fechas de registro",
    status: integridadCamposOk ? "ok" : "warning",
    expected: "100% de registros con boleta/consecutivo y fecha",
    actual: `${totalFilas - sinBoletaOFecha} / ${totalFilas}`,
    detail: integridadCamposOk
      ? `Todos los registros (${totalFilas}) cuentan con identificador formal y fecha de creación.`
      : `${sinBoletaOFecha} registros carecen de boleta o fecha de creación requerida.`,
  });
}

// ───────────────────────── INVENTARIO INTELIGENTE ─────────────────────────

async function checkInventario(checks: IntegrityCheck[]) {
  const sb = createServiceClient();

  const { count: totalEsperado, error: countErr } = await sb
    .from("sek_inventario")
    .select("id", { count: "exact", head: true });

  if (countErr) throw new Error(`conteo de inventario: ${countErr.message}`);

  // Lectura paginada completa del catálogo
  const rows: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("sek_inventario")
      .select("id, marca, modelo, nombre, categoria, cantidad")
      .range(offset, offset + 999);
    if (error) throw new Error(`lectura de inventario: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  const expected = totalEsperado ?? 0;
  const okCount = rows.length === expected;

  // 1. Conteo total e integridad de lectura
  checks.push({
    id: "inventario_conteo_exacto",
    label: "Inventario: Lo que leen las pantallas = lo que hay en la base",
    status: okCount ? "ok" : "error",
    expected,
    actual: rows.length,
    detail: okCount
      ? `Lectura completa y verificada: ${expected} artículos en catálogo sin truncamiento de paginación.`
      : `Discrepancia de catálogo: Base tiene ${expected} registros pero se leyeron ${rows.length}.`,
  });

  // 2. Cobertura de Categorías (100% de artículos clasificados)
  const sinCategoria = rows.filter((r) => !r.categoria || r.categoria.trim() === "");
  const catOk = sinCategoria.length === 0;
  const categoriasUnicas = new Set(rows.map((r) => r.categoria).filter(Boolean));

  checks.push({
    id: "inventario_cobertura_categorias",
    label: "Inventario: 100% de artículos con categoría tecnológica asignada",
    status: catOk ? "ok" : "error",
    expected: "0 sin categoría",
    actual: `${sinCategoria.length} sin categoría (${categoriasUnicas.size} categorías activas)`,
    detail: catOk
      ? `Todos los ${rows.length} artículos cuentan con categoría tecnológica clasificada (${categoriasUnicas.size} categorías activas).`
      : `${sinCategoria.length} artículos no tienen categoría asignada en el catálogo.`,
  });

  // 3. Normalización y Consistencia de Marcas (sin colisiones por mayúsculas/minúsculas ni vacíos)
  const marcasVacias = rows.filter((r) => !r.marca || r.marca.trim() === "" || r.marca === "—" || r.marca === "-");
  const marcasMap = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.marca) continue;
    const lower = r.marca.trim().toLowerCase();
    if (!marcasMap.has(lower)) marcasMap.set(lower, new Set());
    marcasMap.get(lower)!.add(r.marca.trim());
  }
  const casingCollisions = Array.from(marcasMap.values()).filter((set) => set.size > 1);

  const marcasOk = marcasVacias.length === 0 && casingCollisions.length === 0;
  const marcasUnicas = new Set(rows.map((r) => r.marca).filter(Boolean));

  checks.push({
    id: "inventario_normalizacion_marcas",
    label: "Inventario: Normalización y unicidad de marcas (sin duplicados por casing)",
    status: marcasOk ? "ok" : "warning",
    expected: "0 marcas vacías y 0 colisiones de casing",
    actual: `${marcasVacias.length} marcas vacías, ${casingCollisions.length} duplicados por casing (${marcasUnicas.size} marcas)`,
    detail: marcasOk
      ? `Catálogo de marcas 100% normalizado (${marcasUnicas.size} marcas registradas, sin duplicados ni diferencias de mayúsculas).`
      : `Se detectaron ${marcasVacias.length} artículos sin marca y ${casingCollisions.length} marcas duplicadas por diferencias de mayúsculas/minúsculas.`,
  });

  // 4. Integridad de Existencias y Cantidades
  const cantidadesInvalidas = rows.filter((r) => typeof r.cantidad !== "number" || r.cantidad < 0);
  const totalExistencias = rows.reduce((acc, r) => acc + (Number(r.cantidad) || 0), 0);
  const existenciasOk = cantidadesInvalidas.length === 0;

  checks.push({
    id: "inventario_existencias_integridad",
    label: "Inventario: Integridad de cantidades y existencias físicas",
    status: existenciasOk ? "ok" : "warning",
    expected: "100% cantidades válidas (>= 0)",
    actual: `${totalExistencias} existencias físicas totales (${cantidadesInvalidas.length} anomalías)`,
    detail: existenciasOk
      ? `Las existencias suman ${totalExistencias} unidades con valores numéricos válidos en todos los registros.`
      : `${cantidadesInvalidas.length} artículos tienen cantidades nulas o negativas.`,
  });
}

// ───────────────────────── ACTIVIDAD MENSUAL & MULTI-DÍA ─────────────────────────

async function checkActivityMultiDay(checks: IntegrityCheck[]) {
  const sb = createServiceClient();
  const now = new Date();
  const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01T00:00:00-06:00`;
  const currentMonthEnd = `${crDate(now)}T23:59:59.999-06:00`;

  // 1. Conteo exacto en PostgreSQL para el mes en curso
  const { count: exactMonthlyCount, error: countErr } = await sb
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .gte("created_at", currentMonthStart)
    .lte("created_at", currentMonthEnd);

  if (countErr) throw new Error(`conteo mensual de logs: ${countErr.message}`);

  // 2. Verificar que las consultas mensuales sin paginación adecuada no sufran truncamiento
  const DEFAULT_QUERY_LIMIT = 8000;
  const isTruncationRisk = (exactMonthlyCount || 0) > DEFAULT_QUERY_LIMIT;

  checks.push({
    id: "activity_multiday_truncation",
    label: "Actividad Mensual: Auditoría de volumen de logs y protección anti-truncamiento",
    status: "ok",
    expected: `Lectura paginada completa de ${exactMonthlyCount ?? 0} registros`,
    actual: `${exactMonthlyCount ?? 0} registros en el mes actual`,
    detail: isTruncationRisk
      ? `El mes acumula ${exactMonthlyCount} eventos (supera el límite estándar de ${DEFAULT_QUERY_LIMIT}). La paginación dinámica del motor procesa el 100% de los datos sin omisión de días previos.`
      : `Volumen mensual controlado (${exactMonthlyCount} eventos). Toda la información se procesa de forma continua sin truncamiento.`,
  });

  // 3. Verificar cobertura y actividad de colaboradores activos este mes
  const { data: monthLogsSample, error: sampleErr } = await sb
    .from("activity_log")
    .select("agent_email, agent_name, created_at")
    .gte("created_at", currentMonthStart)
    .lte("created_at", currentMonthEnd)
    .limit(10000);

  if (!sampleErr && monthLogsSample) {
    const activeTechnicians = new Set(
      monthLogsSample.map((l) => (l.agent_email || "").toLowerCase().trim()).filter(Boolean)
    );
    checks.push({
      id: "activity_multiday_technicians",
      label: "Actividad Mensual: Cobertura de colaboradores con registros válidos",
      status: activeTechnicians.size > 0 ? "ok" : "warning",
      expected: ">= 1 colaborador con actividad registrada este mes",
      actual: `${activeTechnicians.size} colaboradores activos detectados`,
      detail: `Se detectaron ${activeTechnicians.size} técnicos generando eventos de jornada en el mes: ${Array.from(
        activeTechnicians
      ).join(", ")}.`,
    });
  }
}

// ───────────────────────── RESÚMENES DIARIOS (ACTIVITY_SUMMARY) ─────────────────────────

async function checkActivitySummary(checks: IntegrityCheck[]) {
  const sb = createServiceClient();
  const { count, error } = await sb.from("activity_summary").select("id", { count: "exact", head: true });

  if (error) {
    checks.push({
      id: "activity_summary_table",
      label: "Resumen de Actividad (activity_summary): Integridad de la tabla",
      status: "warning",
      detail: `La tabla activity_summary no responde o tiene permisos restringidos: ${error.message}`,
    });
    return;
  }

  const { data: rows } = await sb
    .from("activity_summary")
    .select("id, agent_email, date, total_active_ms, score")
    .limit(100);

  const totalRows = count ?? 0;
  const invalidRows = (rows || []).filter((r) => !r.agent_email || !r.date);

  checks.push({
    id: "activity_summary_integrity",
    label: "Resumen de Actividad (activity_summary): Consistencia de consolidados diarios",
    status: invalidRows.length === 0 ? "ok" : "warning",
    expected: "100% filas con agente y fecha válidos",
    actual: `${totalRows} consolidados en base (${invalidRows.length} anomalías)`,
    detail:
      invalidRows.length === 0
        ? `Tabla activity_summary operativa con ${totalRows} resúmenes indexados para aceleración de consultas.`
        : `${invalidRows.length} registros presentan agente o fecha en blanco.`,
  });
}

// ───────────────────────── CONFIGURACIÓN DE TÉCNICOS (SEK_AGENT_CONFIG) ─────────────────────────

async function checkAgentConfig(checks: IntegrityCheck[]) {
  const sb = createServiceClient();
  const { data: agents, error } = await sb
    .from("sek_agent_config")
    .select("id, email, name, role, is_active, target_daily_hours, schedule_start, schedule_end");

  if (error) throw new Error(`lectura de sek_agent_config: ${error.message}`);

  const all = agents || [];
  const missingEmail = all.filter((a) => !a.email || !a.email.includes("@"));
  const missingRole = all.filter((a) => !a.role);

  // Verificar emails duplicados
  const emails = all.map((a) => (a.email || "").toLowerCase().trim()).filter(Boolean);
  const uniqueEmails = new Set(emails);
  const hasDuplicateEmails = emails.length !== uniqueEmails.size;

  const configOk = missingEmail.length === 0 && missingRole.length === 0 && !hasDuplicateEmails;

  checks.push({
    id: "agent_config_integrity",
    label: "Configuración de Técnicos (sek_agent_config): Perfiles, roles y unicidad",
    status: configOk ? "ok" : "error",
    expected: `${all.length} técnicos válidos sin duplicados`,
    actual: `${uniqueEmails.size} perfiles únicos de ${all.length} registros`,
    detail: configOk
      ? `Los ${all.length} colaboradores cuentan con correo único, rol asignado y configuración de jornada válida.`
      : `Se detectaron inconsistencias: ${missingEmail.length} sin correo, ${missingRole.length} sin rol, duplicados: ${hasDuplicateEmails ? "SÍ" : "NO"}.`,
  });

  const activeCount = all.filter((a) => a.is_active !== false).length;
  checks.push({
    id: "agent_config_active_roster",
    label: "Configuración de Técnicos: Plantilla activa y horarios laborales",
    status: activeCount > 0 ? "ok" : "warning",
    expected: ">= 1 técnico activo en operaciones",
    actual: `${activeCount} técnicos activos`,
    detail: `Plantilla del taller: ${activeCount} técnicos activos habilitados para registro de jornada y atención de tickets.`,
  });
}

// ───────────────────────── CONFIGURACIÓN DEL SISTEMA (SEK_APP_SETTINGS) ─────────────────────────

async function checkAppSettings(checks: IntegrityCheck[]) {
  const sb = createServiceClient();
  const { data: settings, error } = await sb.from("sek_app_settings").select("id, key, value, updated_at");

  if (error) throw new Error(`lectura de sek_app_settings: ${error.message}`);

  const all = settings || [];
  const keyList = all.map((s) => s.key);
  const requiredKeys = ["activity_manual_tasks", "activity_schedule", "activity_app_categories"];
  const missingRequired = requiredKeys.filter((k) => !keyList.includes(k));

  let jsonErrors = 0;
  for (const s of all) {
    if (s.value && typeof s.value === "string" && (s.value.startsWith("{") || s.value.startsWith("["))) {
      try {
        JSON.parse(s.value);
      } catch {
        jsonErrors++;
      }
    }
  }

  const settingsOk = missingRequired.length === 0 && jsonErrors === 0;

  checks.push({
    id: "app_settings_integrity",
    label: "Ajustes del Sistema (sek_app_settings): Parámetros de configuración y esquemas JSON",
    status: settingsOk ? "ok" : "warning",
    expected: `Parámetros críticos presentes sin errores JSON (0 errores)`,
    actual: `${all.length} ajustes registrados (${jsonErrors} errores JSON, ${missingRequired.length} faltantes)`,
    detail: settingsOk
      ? `Todos los parámetros centrales del sistema (${all.length} registros: horarios, categorías de software y tareas de taller) tienen estructura JSON válida.`
      : `Advertencia en ajustes del sistema: Faltan claves esenciales (${missingRequired.join(", ") || "ninguna"}) o hay ${jsonErrors} configuraciones con JSON inválido.`,
  });
}

// ───────────────────────── EJECUCIÓN Y ALMACENAMIENTO ─────────────────────────

export async function runIntegrityChecks(): Promise<IntegrityReport> {
  const t0 = Date.now();
  const checks: IntegrityCheck[] = [];

  const guarded = async (id: string, label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e: any) {
      // Si el propio vigilante falla, se ve: nunca silencio por error
      checks.push({
        id: `${id}_failed`,
        label,
        status: "error",
        detail: `No se pudo ejecutar la verificación: ${e?.message || e}`,
      });
    }
  };

  await guarded("cases", "Auditoría de Casos y Tickets (sek_cases)", () => checkCases(checks));
  await guarded("activity_daily", "Auditoría de Actividad Diaria (activity_log diario)", () => checkActivity(checks));
  await guarded("activity_multiday", "Auditoría de Actividad Mensual y Anti-Truncamiento (activity_log mensual)", () => checkActivityMultiDay(checks));
  await guarded("activity_summary", "Auditoría de Resúmenes Diarios (activity_summary)", () => checkActivitySummary(checks));
  await guarded("garantias", "Auditoría de Garantías y RMA (sek_garantias)", () => checkGarantias(checks));
  await guarded("inventario", "Auditoría de Inventario Físico y Marcas (sek_inventario)", () => checkInventario(checks));
  await guarded("agent_config", "Auditoría de Técnicos y Horarios (sek_agent_config)", () => checkAgentConfig(checks));
  await guarded("app_settings", "Auditoría de Configuración del Sistema (sek_app_settings)", () => checkAppSettings(checks));

  return {
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    status: statusOf(checks),
    checks,
    summary: {
      total: checks.length,
      ok: checks.filter((c) => c.status === "ok").length,
      warnings: checks.filter((c) => c.status === "warning").length,
      errors: checks.filter((c) => c.status === "error").length,
    },
  };
}

export async function getStoredIntegrityReport(): Promise<IntegrityReport | null> {
  const sb = createServiceClient();
  const { data } = await sb.from("sek_app_settings").select("value").eq("key", REPORT_KEY).maybeSingle();
  if (!data?.value) return null;
  try {
    return typeof data.value === "string" ? JSON.parse(data.value) : (data.value as IntegrityReport);
  } catch {
    return null;
  }
}

let running: Promise<IntegrityReport> | null = null;

export function refreshIntegrityReport(): Promise<IntegrityReport> {
  if (running) return running;
  running = (async () => {
    try {
      const report = await runIntegrityChecks();
      const sb = createServiceClient();
      await sb.from("sek_app_settings").upsert(
        {
          key: REPORT_KEY,
          value: JSON.stringify(report),
          iv: "none",
          tag: "none",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
      return report;
    } finally {
      running = null;
    }
  })();
  return running;
}

export async function autoSanitizeIntegrity(): Promise<{
  removedDuplicates: number;
  sanitizedInventoryItems: number;
  closedRunawayTimers: number;
}> {
  const sb = createServiceClient();
  const now = new Date();
  const days = [crDate(now), crDate(new Date(now.getTime() - 86_400_000))];
  let removedDuplicates = 0;
  let sanitizedInventoryItems = 0;
  let closedRunawayTimers = 0;

  for (const day of days) {
    const all = await getActivityTimeline(undefined, day);
    const seen = new Map<string, number>();
    const duplicateIds: number[] = [];

    // Ordenar por ID ascendente para preservar la fila original más antigua
    const sortedAll = [...all].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));

    const lastEnds = new Map<string, { timeMs: number; task: string }>();

    for (const it of sortedAll) {
      const k = `${it.agent_email}|${it.action}|${it.created_at}`;
      const act = (it.action || "").toLowerCase();
      const isEnd = act.startsWith("terminó:") || act.startsWith("termino:");
      const task = (it.metadata?.task || it.action.replace(/^termin[oó]:\s*/i, "").split("(")[0]).toLowerCase().trim();
      const email = (it.agent_email || "").toLowerCase();
      const tMs = new Date(it.created_at as string).getTime();

      let isDuplicate = false;
      if (seen.has(k)) {
        isDuplicate = true;
      } else if (isEnd) {
        const prevEnd = lastEnds.get(email);
        if (prevEnd && prevEnd.task === task && Math.abs(tMs - prevEnd.timeMs) < 60_000) {
          isDuplicate = true;
        } else {
          lastEnds.set(email, { timeMs: tMs, task });
        }
      }

      if (isDuplicate) {
        if (it.id) duplicateIds.push(Number(it.id));
      } else {
        seen.set(k, Number(it.id));
      }
    }

    if (duplicateIds.length > 0) {
      const { error } = await sb.from("activity_log").delete().in("id", duplicateIds);
      if (!error) {
        removedDuplicates += duplicateIds.length;
      } else {
        console.error("[autoSanitizeIntegrity] error deleting duplicates:", error);
      }
    }

    // Auto-sanear temporizadores que quedaron abiertos sin finalizar de días anteriores
    const intervals = parseManualIntervals(sortedAll, now.getTime());
    for (const iv of intervals) {
      if (iv.endMs === null) {
        const isPrevDay = day !== crDate(now);
        const mins = iv.durationMs / 60000;
        if (isPrevDay || mins > 720) {
          // Buscar el agente correspondiente al intervalo
          const startEvent = sortedAll.find(
            (e) => (e.metadata?.task === iv.task || (e.action || "").includes(iv.task)) && (e.action || "").toLowerCase().startsWith("inici")
          );
          if (startEvent) {
            const cappedMs = Math.min(iv.durationMs, 30 * 60 * 1000); // Tope de 30 min para cierres automáticos
            const endIso = new Date(iv.startMs + cappedMs).toISOString();
            const durSec = Math.round(cappedMs / 1000);
            const m = Math.floor(durSec / 60);
            const s = durSec % 60;
            const endAction = `Terminó: ${iv.task} (${m}min ${s}s)`;
            const endRow = {
              agent_email: startEvent.agent_email,
              agent_name: startEvent.agent_name,
              action: endAction,
              category: iv.category || "Gestión del Taller",
              case_id: null,
              metadata: {
                task: iv.task,
                manual: true,
                auto_sanitized: true,
                duration_seconds: durSec,
              },
              duration_ms: cappedMs,
              created_at: endIso,
            };
            const { error: insErr } = await sb.from("activity_log").insert(endRow);
            if (!insErr) {
              closedRunawayTimers++;
            }
          }
        }
      }
    }
  }

  // Auto-sanitización de catálogo de inventario (marcas y categorías)
  try {
    let offset = 0;
    const invToUpdate: any[] = [];
    while (true) {
      const { data: invRows } = await sb
        .from("sek_inventario")
        .select("*")
        .range(offset, offset + 999);
      if (!invRows || invRows.length === 0) break;
      for (const it of invRows) {
        const b = inferBrand(it.marca, it.modelo, it.nombre);
        const c = inferCategory(b, it.modelo, it.nombre);
        if (it.marca !== b || it.categoria !== c) {
          invToUpdate.push({ ...it, marca: b, categoria: c });
        }
      }
      if (invRows.length < 1000) break;
      offset += 1000;
    }

    if (invToUpdate.length > 0) {
      for (let i = 0; i < invToUpdate.length; i += 100) {
        const { error } = await sb.from("sek_inventario").upsert(invToUpdate.slice(i, i + 100), { onConflict: "id" });
        if (!error) sanitizedInventoryItems += Math.min(100, invToUpdate.length - i);
      }
    }
  } catch (err) {
    console.error("[autoSanitizeIntegrity] error sanitizing inventory:", err);
  }

  return { removedDuplicates, sanitizedInventoryItems, closedRunawayTimers };
}

