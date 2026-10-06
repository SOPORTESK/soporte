import { createClient } from "@/lib/supabase/server";
import { Users, TrendingUp, CheckCircle, Star, ArrowUpRight, Repeat2, BarChart3, TrendingDown, Minus, ExternalLink, Clock, Activity, Globe, UserPlus, ShieldAlert, ShieldBan, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { AnalyticsClientView } from "@/components/admin/analytics-client-view";
import type { PerfilClienteDTO } from "@/components/admin/client-profile-panel";
import { normalizePhone, parseCliente, getClientKey, getCalificacion, unifyClients, type ContactoPersona } from "@/lib/client-analytics";

export const dynamic = "force-dynamic";

export default async function EstadisticasClientePage() {
  const supabase = createClient();

  // Cargar todos los casos paginados sin el tope de 1000 de PostgREST
  const loadedCasos: any[] = [];
  let pageOffset = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    let { data, error } = await supabase
      .from("sek_cases")
      .select("id, estado, cliente, customer_phone, created_at, updated_at, closed_at, canal, title, tags, prioridad, assigned_to, marca, modelo, resolucion, problema")
      .order("created_at", { ascending: false })
      .range(pageOffset, pageOffset + PAGE_SIZE - 1);

    if (error) {
      const { data: fbData } = await supabase
        .from("sek_cases")
        .select("id, estado, cliente, customer_phone, created_at, updated_at, closed_at, canal, title, tags, prioridad, assigned_to")
        .order("created_at", { ascending: false })
        .range(pageOffset, pageOffset + PAGE_SIZE - 1);
      data = fbData as any;
    }
    if (!data || data.length === 0) break;
    loadedCasos.push(...data);
    if (data.length < PAGE_SIZE) break;
    pageOffset += PAGE_SIZE;
  }
  let casos = loadedCasos;

  // Cargar marcas del inventario para validar títulos de casos (RLS staff)
  const { data: inventario } = await supabase.from("sek_inventario").select("marca").limit(1000);
  const marcasInventario = new Set(
    (inventario || [])
      .map((r: any) => String(r.marca).trim().toLowerCase())
      .filter(Boolean)
  );

  // ── Fechas
  const hoy = new Date(); hoy.setHours(0,0,0,0);

  // ── Agrupar por cliente unificado (mismo motor centralizado que el resto del sistema)
  const topClientes = unifyClients(casos || []);

  // ── Normalización canónica de marcas
  const normalizeBrand = (b: string): string => {
    if (!b) return "";
    const lower = b.trim().toLowerCase();
    if (lower.includes("hikvision") || lower === "hik") return "Hikvision";
    if (lower.includes("zkteco") || lower === "zk") return "ZKTeco";
    if (lower.includes("dahua") || lower === "dah") return "Dahua";
    if (lower.includes("cisco")) return "Cisco";
    if (lower.includes("ezviz")) return "EZVIZ";
    if (lower.includes("epcom")) return "Epcom";
    if (lower.includes("hilook")) return "HiLook";
    if (lower.includes("paradox")) return "Paradox";
    if (lower.includes("ubiquiti") || lower.includes("unifi")) return "Ubiquiti";
    if (lower.includes("tp-link") || lower === "tplink") return "TP-Link";
    if (lower.includes("western digital") || lower === "wd") return "Western Digital";
    if (lower.includes("seagate")) return "Seagate";
    return b.trim().charAt(0).toUpperCase() + b.trim().slice(1).toLowerCase();
  };

  // ── Limpiador y estandarizador de modelos
  const normalizeModel = (m: string | null | undefined): string | null => {
    if (!m) return null;
    let s = String(m).trim();
    if (!s || s.toLowerCase() === "sin modelo" || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") return null;
    // Eliminar corchetes, comillas y prefijos SKU como [HIK-, HIK-, DAH-, ZK-
    s = s.replace(/^\[?(?:HIK|DAH|ZK|EZ)-?/i, "").replace(/[\])"']+$/, "").replace(/^["'(\[]+/, "").trim();
    // Eliminar especificaciones de lentes entre paréntesis como (2.8mm) o (3.6mm)
    s = s.replace(/\s*\(\d+(?:\.\d+)?mm\)/i, "").trim();
    // Unificar espacios dentro del código alfanumérico: "ds 2cd1347g0" -> "DS-2CD1347G0"
    if (/^[a-zA-Z]{1,4}\s+\d/i.test(s)) {
      s = s.replace(/^([a-zA-Z]{1,4})\s+/i, "$1-");
    }
    // Normalizar a mayúsculas si parece código de modelo alfanumérico
    if (/^[a-zA-Z0-9_-]+$/i.test(s) || /^[a-zA-Z0-9\s_-]+$/i.test(s)) {
      s = s.toUpperCase().replace(/\s+/g, "-");
    }
    return s.length >= 2 ? s : null;
  };

  // ── Derivar equipo (marca + modelo opcional) solo si hay valores válidos
  const deriveEquipo = (c: any): { marca: string; modelo: string | null } | null => {
    const esMarcaValida = (s: string) => {
      const w = s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      return w.length > 1 && marcasInventario.has(w);
    };
    const esModeloValido = (s: string) => {
      const w = s.replace(/[^a-zA-Z0-9]/g, "");
      return w.length >= 3;
    };

    // 1. Columnas directas (las escribe ia-agent o backfill)
    if (c.marca) {
      const marca = String(c.marca).trim();
      if (esMarcaValida(marca)) {
        const modelo = c.modelo ? String(c.modelo).trim() : "";
        if (modelo && esModeloValido(modelo)) {
          return { marca: normalizeBrand(marca), modelo: normalizeModel(modelo) };
        }
        return { marca: normalizeBrand(marca), modelo: null };
      }
    }

    // 2. cliente.marca / cliente.modelo (editados manualmente en modal) o cliente.equipo_match
    const cli = typeof c.cliente === "string" ? (() => { try { return JSON.parse(c.cliente); } catch { return {}; } })() : (c.cliente || {});
    if (cli.marca && String(cli.marca).trim()) {
      const marca = String(cli.marca).trim();
      const modelo = cli.modelo ? String(cli.modelo).trim() : null;
      return { marca: normalizeBrand(marca), modelo: normalizeModel(modelo) };
    }
    const raw = String(cli.equipo_match || cli.equipo || "").trim();
    if (raw && raw.length > 3) {
      const sinCodigo = raw.split("(")[0].trim();
      const partes = sinCodigo.split(/\s+/).filter(Boolean);
      if (partes.length >= 1 && esMarcaValida(partes[0])) {
        const modelo = partes.slice(1).join(" ");
        return { marca: normalizeBrand(partes[0]), modelo: modelo && esModeloValido(modelo) ? normalizeModel(modelo) : null };
      }
    }

    // 3. title con formato "Tema — Marca Modelo" validado contra marcas de inventario
    const title = String(c.title || "").trim();
    const dashParts = title.split("\u2014");
    if (dashParts.length < 2) return null;
    const equipoPart = dashParts.slice(1).join("\u2014").trim();
    const limpio = equipoPart.replace(/^en\s+cartera[:：]?\s*/i, "").trim();
    const eqWords = limpio.split(/\s+/).filter(Boolean);
    for (let i = 0; i < eqWords.length; i++) {
      if (esMarcaValida(eqWords[i])) {
        const resto = limpio.substring(limpio.indexOf(eqWords[i]) + eqWords[i].length).trim();
        return { marca: normalizeBrand(eqWords[i]), modelo: resto && esModeloValido(resto) ? normalizeModel(resto.replace(/\s*[:：]\s*$/, "").trim()) : null };
      }
    }
    return null;
  };

  // ── Equipos más reportados (agrupación inteligente por marca canónica y modelo normalizado)
  const equipoMap: Record<string, {
    marca: string; modelo: string | null; cat: string;
    total: number; resueltos: number;
    clientes: Set<string>; ultimoCasoId: string | number; ultimoCasoAt: string;
  }> = {};
  (casos || []).forEach(c => {
    const eq = deriveEquipo(c);
    if (!eq || !eq.marca) return;
    const canMarca = normalizeBrand(eq.marca);
    const canModelo = normalizeModel(eq.modelo);
    const key = `${canMarca.toLowerCase()}||${canModelo ? canModelo.toLowerCase() : ""}`;
    if (!equipoMap[key]) {
      equipoMap[key] = { marca: canMarca, modelo: canModelo, cat: (c as any).cat || "", total: 0, resueltos: 0, clientes: new Set(), ultimoCasoId: c.id, ultimoCasoAt: c.created_at };
    }
    const e = equipoMap[key];
    e.total++;
    if (c.estado === "resuelto" || c.estado === "cerrado" || (c as any).closed_at) e.resueltos++;
    const parsed = parseCliente(c.cliente, c.customer_phone);
    const clienteKey = getClientKey(parsed, c.id);
    e.clientes.add(clienteKey);
    if (c.created_at > e.ultimoCasoAt) { e.ultimoCasoAt = c.created_at; e.ultimoCasoId = c.id; }
  });
  const topEquipos = Object.values(equipoMap)
    .map(e => ({ ...e, clientesCount: e.clientes.size }))
    .sort((a, b) => b.total - a.total);

  // ── Las 7 categorías oficiales del menú
  const canonicalCategory = (raw: unknown): { key: string; label: string } => {
    if (!raw) return { key: "otro", label: "Otro" };
    let s = String(raw).toLowerCase().trim();
    // Ignorar si es únicamente la palabra del canal (ej: "WhatsApp")
    if (s === "whatsapp" || s.startsWith("whatsapp")) return { key: "otro", label: "Otro" };

    if (s.includes("reparac") || s.includes("taller") || s.includes("diagnost")) {
      return { key: "reparacion_diagnostico", label: "Reparación / Diagnóstico" };
    }
    if (s.includes("consult")) {
      return { key: "consulta", label: "Consulta" };
    }
    if (s.includes("reset") || s.includes("clave") || s.includes("contrase") || s.includes("xml") || s.includes("guid") || s.includes("desbloque")) {
      return { key: "reset", label: "Reset" };
    }
    if (s.includes("desvincul") || s.includes("desvinc")) {
      return { key: "desvinculacion", label: "Desvinculación" };
    }
    if (s.includes("firmware") || s.includes("flashe") || s.includes("actualiz")) {
      return { key: "firmware", label: "Firmware" };
    }
    if (s.includes("licencia") || s.includes("biotime") || s.includes("hikcentral") || s.includes("activac")) {
      return { key: "licencias", label: "Licencias" };
    }
    if (s.includes("software") || s.includes("ivms") || s.includes("hik-connect") || s.includes("hik connect") || s.includes("smartpss") || s.includes("toolbox") || s.includes("sadp") || s.includes("driver") || s.includes("programa")) {
      return { key: "software", label: "Software" };
    }
    if (s.includes("configur") || s.includes("imagen") || s.includes("grabaci") || s.includes("remoto") || s.includes("red") || s.includes("energia") || s.includes("acceso") || s.includes("alarma") || s.includes("incendio") || s.includes("instalaci")) {
      return { key: "configuraciones", label: "Configuraciones" };
    }
    return { key: "otro", label: "Otro" };
  };

  // Tags que NO son problemas (deben ignorarse)
  const tagsNoProblema = new Set(["saliente", "entrante", "urgente", "vip"]);

  // ── Derivar clave de problema con motivo detallado y origen
  const deriveProblema = (c: any): { key: string; label: string; razon: string; tipoOrigen: "ia" | "manual" | "tag" | "titulo" | "general" } => {
    const cli = (c.cliente && typeof c.cliente === "object") ? (c.cliente as any) : {};
    const manualTipo = cli.tipo_consulta;
    if (manualTipo) {
      const cat = canonicalCategory(manualTipo);
      return { ...cat, razon: `Técnico seleccionó "${manualTipo}" en la ficha del cliente`, tipoOrigen: "manual" };
    }
    if (c.problema) {
      const cat = canonicalCategory(c.problema);
      return { ...cat, razon: `Clasificado por IA / sistema como "${c.problema}"`, tipoOrigen: "ia" };
    }
    const tags: string[] = Array.isArray(c.tags) ? c.tags : [];
    for (const t of tags) {
      const tl = String(t).toLowerCase().trim();
      if (tagsNoProblema.has(tl)) continue;
      const mapped = canonicalCategory(tl);
      if (mapped.key !== "otro") {
        return { ...mapped, razon: `Detectado por etiqueta de flujo "${t}"`, tipoOrigen: "tag" };
      }
    }
    const title = String(c.title || "").trim();
    if (title.includes("—")) {
      const tema = title.split("—")[0].trim();
      const mapped = canonicalCategory(tema);
      if (mapped.key !== "otro") {
        return { ...mapped, razon: `Extraído del título de la consulta "${tema}"`, tipoOrigen: "titulo" };
      }
    }
    return { key: "otro", label: "Otro", razon: "Consulta general / Sin categoría específica asignada", tipoOrigen: "general" };
  };

  const problemaMap: Record<string, {
    key: string;
    label: string;
    total: number;
    resueltos: number;
    ultimoCasoId: string | number;
    casos: {
      id: string;
      title: string;
      clienteNombre: string;
      clienteCuenta: string;
      clienteTelefono: string;
      marca?: string | null;
      modelo?: string | null;
      estado: string;
      createdAt: string;
      razonClasificacion: string;
      tipoOrigen: "ia" | "manual" | "tag" | "titulo" | "general";
      descripcion?: string | null;
    }[];
  }> = {};

  (casos || []).forEach(c => {
    const p = deriveProblema(c);
    if (!p) return;
    if (!problemaMap[p.key]) {
      problemaMap[p.key] = { key: p.key, label: p.label, total: 0, resueltos: 0, ultimoCasoId: c.id, casos: [] };
    }
    const entry = problemaMap[p.key];
    entry.total++;
    if (c.estado === "resuelto" || c.estado === "cerrado" || (c as any).closed_at) entry.resueltos++;

    const parsed = parseCliente(c.cliente, c.customer_phone);
    const cli = (c.cliente && typeof c.cliente === "object") ? (c.cliente as any) : {};

    entry.casos.push({
      id: String(c.id),
      title: String(c.title || "Consulta de Soporte"),
      clienteNombre: parsed.nombre || (cli.whatsapp_name || "Cliente"),
      clienteCuenta: parsed.cuenta || (cli.cuenta || ""),
      clienteTelefono: parsed.telefono !== "—" ? parsed.telefono : "",
      marca: c.marca || cli.marca || null,
      modelo: c.modelo || cli.modelo || null,
      estado: c.estado || "abierto",
      createdAt: c.created_at || "",
      razonClasificacion: p.razon,
      tipoOrigen: p.tipoOrigen,
      descripcion: cli.descripcion || null,
    });
  });
  const topProblemas = Object.values(problemaMap).sort((a, b) => b.total - a.total);
  const maxProblema = topProblemas[0]?.total || 1;

  // ── KPIs globales de clientes
  const totalClientes = topClientes.length;
  const clientesRecurrentes = topClientes.filter(c => c.total > 1).length;
  const pctRecurrencia = totalClientes > 0 ? Math.round((clientesRecurrentes / totalClientes) * 100) : 0;
  const clientesActivos = topClientes.filter(c => c.abiertos > 0).length;

  const totalCasos = (casos || []).length;

  // ── Distribución por canal
  const canalCount: Record<string, number> = {};
  (casos || []).forEach(c => {
    const canal = c.canal || "web";
    canalCount[canal] = (canalCount[canal] || 0) + 1;
  });
  const canalesOrdenados = Object.entries(canalCount).sort(([,a], [,b]) => b - a);
  const canalTotal = Object.values(canalCount).reduce((a, b) => a + b, 0);

  // ── Nuevos vs Recurrentes por mes (últimos 6 meses) — comparar en UTC
  const hoyUtc = new Date();
  const meses6: { label: string; nuevos: number; recurrentes: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const desde = new Date(Date.UTC(hoyUtc.getUTCFullYear(), hoyUtc.getUTCMonth() - i, 1));
    const hasta = new Date(Date.UTC(hoyUtc.getUTCFullYear(), hoyUtc.getUTCMonth() - i + 1, 1));
    const clientesEseMes = new Set<string>();
    const clientesAntes = new Set<string>();
    (casos || []).forEach(c => {
      if (!c.created_at) return;
      const d = new Date(c.created_at);
      const parsed = parseCliente(c.cliente, c.customer_phone);
      const k = getClientKey(parsed, c.id);
      if (d < desde) clientesAntes.add(k);
      if (d >= desde && d < hasta) clientesEseMes.add(k);
    });
    let nuevos = 0; let recurrentes = 0;
    clientesEseMes.forEach(k => { if (clientesAntes.has(k)) recurrentes++; else nuevos++; });
    meses6.push({ label: desde.toLocaleDateString("es-CR", { month: "short", year: "2-digit", timeZone: "UTC" }), nuevos, recurrentes });
  }
  const meses6Max = Math.max(...meses6.map(m => m.nuevos + m.recurrentes), 1);
  const meses6Total = meses6.reduce((s, m) => s + m.nuevos + m.recurrentes, 0);

  // ── Histograma: distribución de clientes por número de casos
  const histogramaMap: Record<string, number> = { "1": 0, "2": 0, "3-5": 0, "6-10": 0, "11+": 0 };
  topClientes.forEach(c => {
    if (c.total === 1) histogramaMap["1"]++;
    else if (c.total === 2) histogramaMap["2"]++;
    else if (c.total <= 5) histogramaMap["3-5"]++;
    else if (c.total <= 10) histogramaMap["6-10"]++;
    else histogramaMap["11+"]++;
  });
  const histMax = Math.max(...Object.values(histogramaMap), 1);

  // ── Clientes bloqueados
  const { data: clientesBloqueados } = await supabase
    .from("sek_clientes")
    .select("id, cedula, nombre, correo, telefono, bloqueo_contador, fecha_bloqueo, motivo_bloqueo")
    .eq("bloqueado", true)
    .order("fecha_bloqueo", { ascending: false });

  // ── Clientes en riesgo: casos abiertos hace más de 3 días sin actualización
  const hace3 = new Date(hoy); hace3.setDate(hoy.getDate() - 3);
  const clientesRiesgo = topClientes
    .filter(c => c.abiertos > 0 && new Date(c.ultimoCaso) < hace3)
    .sort((a, b) => new Date(a.ultimoCaso).getTime() - new Date(b.ultimoCaso).getTime());

  // ══════════════════════════════════════════════════════════════════
  // PERFIL DEL CLIENTE — cálculos enriquecidos
  // ══════════════════════════════════════════════════════════════════

  type PerfilCliente = {
    nombre: string; telefono: string; correo: string; cedula: string;
    cuenta?: string; esEmpresa?: boolean; contactos?: ContactoPersona[];
    total: number; resueltos: number; abiertos: number;
    primerCaso: string; ultimoCaso: string; ultimoCasoId: string | number;
    canales: Record<string, number>; cats: string[]; calificaciones: number[];
    // Nuevos campos de perfil
    antiguedadDias: number;          // días desde el primer caso
    diasSinContacto: number;         // días desde último caso
    frecuenciaMes: number;           // casos/mes promedio
    tipo: "nuevo" | "ocasional" | "recurrente" | "frecuente";
    tendencia: "subiendo" | "estable" | "bajando";
    healthScore: number;             // 0-100
    salud: "saludable" | "atencion" | "riesgo";
    avgCal: number | null;
    canalPreferido: string;
  };

  const hace30b = new Date(hoy); hace30b.setDate(hoy.getDate() - 30);
  const hace60b = new Date(hoy); hace60b.setDate(hoy.getDate() - 60);

  // Mapa key → casos del cliente para tendencia
  const casosPorCliente: Record<string, any[]> = {};
  (casos || []).forEach(c => {
    const parsed = parseCliente(c.cliente, c.customer_phone);
    const key = getClientKey(parsed, c.id);
    if (!casosPorCliente[key]) casosPorCliente[key] = [];
    casosPorCliente[key].push(c);
  });

  const perfiles: PerfilCliente[] = topClientes.map(c => {
    const key = c.key;
    const casosCliente = casosPorCliente[key] || [];

    const antiguedadDias = Math.max(1, Math.floor((hoy.getTime() - new Date(c.primerCaso).getTime()) / 86400000));
    const diasSinContacto = Math.floor((hoy.getTime() - new Date(c.ultimoCaso).getTime()) / 86400000);
    const meses = Math.max(1, antiguedadDias / 30);
    const frecuenciaMes = +(c.total / meses).toFixed(2);

    // Tipo de cliente
    let tipo: PerfilCliente["tipo"] = "nuevo";
    if (c.total >= 10) tipo = "frecuente";
    else if (c.total >= 4) tipo = "recurrente";
    else if (c.total >= 2) tipo = "ocasional";

    // Tendencia: comparar últimos 30d vs 30-60d
    const casos30 = casosCliente.filter(x => new Date(x.created_at) >= hace30b).length;
    const casos60 = casosCliente.filter(x => new Date(x.created_at) >= hace60b && new Date(x.created_at) < hace30b).length;
    let tendencia: PerfilCliente["tendencia"] = "estable";
    if (casos30 > casos60 && casos30 >= 2) tendencia = "subiendo";
    else if (casos30 < casos60 && casos60 >= 2) tendencia = "bajando";

    // Calificación promedio
    const avgCal = c.calificaciones.length > 0 ? c.calificaciones.reduce((a, b) => a + b, 0) / c.calificaciones.length : null;

    // Canal preferido
    const canalPreferido = Object.entries(c.canales).sort(([, a], [, b]) => b - a)[0]?.[0] || "web";

    // Health score (0-100)
    let score = 50;
    // Resolución: hasta +25
    const tasaRes = c.total > 0 ? c.resueltos / c.total : 0;
    score += tasaRes * 25;
    // Calificación: hasta +15 / -15
    if (avgCal !== null) score += (avgCal - 3) * 7.5;
    // Casos abiertos: -5 por cada uno (max -20)
    score -= Math.min(c.abiertos * 5, 20);
    // Días sin contacto: penalizar si > 90 días tras tener problema
    if (diasSinContacto > 90 && c.total > 0) score -= 15;
    // Tendencia subiendo es buena para engagement, mala si abiertos crecen
    if (tendencia === "subiendo" && c.abiertos > 0) score -= 10;
    // Bonus por antigüedad
    if (antiguedadDias > 180) score += 5;
    score = Math.max(0, Math.min(100, Math.round(score)));

    let salud: PerfilCliente["salud"] = "saludable";
    if (score < 40) salud = "riesgo";
    else if (score < 70) salud = "atencion";

    return { ...c, antiguedadDias, diasSinContacto, frecuenciaMes, tipo, tendencia, healthScore: score, salud, avgCal, canalPreferido };
  });

  // KPIs de perfil global
  const saludables = perfiles.filter(p => p.salud === "saludable").length;
  const enAtencion = perfiles.filter(p => p.salud === "atencion").length;
  const enRiesgoSalud = perfiles.filter(p => p.salud === "riesgo").length;
  const antiguedadProm = perfiles.length > 0 ? Math.round(perfiles.reduce((a, b) => a + b.antiguedadDias, 0) / perfiles.length) : 0;
  const frecuenciaProm = perfiles.length > 0 ? +(perfiles.reduce((a, b) => a + b.frecuenciaMes, 0) / perfiles.length).toFixed(2) : 0;

  // Heatmap horarios × días (de todos los casos)
  // 7 filas (Dom..Sáb) × 4 franjas (madrugada, mañana, tarde, noche)
  const franjas = ["Madrugada", "Mañana", "Tarde", "Noche"]; // 0-5, 6-11, 12-17, 18-23
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(4).fill(0));
  (casos || []).forEach(c => {
    const d = new Date(c.created_at);
    const dia = d.getDay();
    const h = d.getHours();
    const fr = h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3;
    heatmap[dia][fr]++;
  });
  const heatmapMax = Math.max(...heatmap.flat(), 1);

  const nowStr = new Date().toLocaleString("es-CR", { timeZone: "America/Costa_Rica", dateStyle: "long", timeStyle: "short" });

  const canalBadge: Record<string, string> = {
    widget: "bg-brand-500/10 text-brand-500",
    whatsapp: "bg-emerald-500/10 text-emerald-500",
    messenger: "bg-blue-500/10 text-blue-500",
    web: "bg-violet-500/10 text-violet-500",
    email: "bg-amber-500/10 text-amber-500",
  };
  const canalColors: Record<string, string> = {
    widget: "from-brand-500 to-brand-400",
    whatsapp: "from-emerald-500 to-emerald-400",
    messenger: "from-blue-500 to-blue-400",
    web: "from-violet-500 to-violet-400",
    email: "from-amber-500 to-amber-400",
  };
  const canalLabels: Record<string, string> = {
    widget: "Widget", whatsapp: "WhatsApp", messenger: "Messenger", web: "Web", email: "Email",
  };

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 xl:p-8 space-y-6">

      {/* ══════════════════════════════════════════════════════════════════
          HEADER — Ultra-premium glassmorphism
      ══════════════════════════════════════════════════════════════════ */}
      <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/20 p-6 lg:p-8">
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-brand-500/8 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-violet-500/5 rounded-full blur-[80px] pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 text-white grid place-items-center shadow-lg shadow-brand-500/25">
                <Activity className="h-3.5 w-3.5" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-500">Centro de Analítica</p>
            </div>
            <h1 className="text-3xl lg:text-4xl font-black tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              Analítica de Clientes
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <span className="text-xs text-muted-foreground">{nowStr}</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
              <span className="text-xs font-bold text-brand-500">{totalClientes} clientes</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
              <span className="text-xs font-bold text-violet-500">{totalCasos} casos</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[11px] font-bold shadow-sm">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Integridad 100% Auditada</span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <Link href="/admin/estadisticas/atencion"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white text-xs font-black transition-all shadow-lg shadow-brand-600/30 hover:shadow-xl hover:shadow-brand-600/40 hover:-translate-y-0.5">
              Desempeño Agentes <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <Link href="/admin"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border/80 bg-card/80 backdrop-blur-sm text-xs font-black hover:bg-muted/80 transition-all hover:-translate-y-0.5">
              Panel <ArrowUpRight className="h-3.5 w-3.5 opacity-40" />
            </Link>
          </div>
        </div>
      </header>

      <AnalyticsClientView
        totalClientes={totalClientes}
        totalCasos={totalCasos}
        clientesActivos={clientesActivos}
        clientesRecurrentes={clientesRecurrentes}
        pctRecurrencia={pctRecurrencia}
        frecuenciaProm={frecuenciaProm}
        antiguedadProm={antiguedadProm}
        saludables={saludables}
        enAtencion={enAtencion}
        enRiesgoSalud={enRiesgoSalud}
        meses6={meses6}
        meses6Max={meses6Max}
        meses6Total={meses6Total}
        histogramaMap={histogramaMap}
        histMax={histMax}
        canalesOrdenados={canalesOrdenados}
        canalTotal={canalTotal}
        canalBadge={canalBadge}
        canalColors={canalColors}
        canalLabels={canalLabels}
        clientesRiesgo={clientesRiesgo}
        heatmap={heatmap}
        heatmapMax={heatmapMax}
        franjas={franjas}
        dias={dias}
        topEquipos={topEquipos}
        topProblemas={topProblemas}
        maxProblema={maxProblema}
        perfiles={perfiles.map(p => ({
          nombre: p.nombre,
          telefono: p.telefono,
          correo: p.correo,
          cedula: p.cedula,
          cuenta: p.cuenta,
          esEmpresa: p.esEmpresa,
          contactos: p.contactos,
          total: p.total,
          resueltos: p.resueltos,
          abiertos: p.abiertos,
          primerCaso: p.primerCaso,
          ultimoCaso: p.ultimoCaso,
          ultimoCasoId: p.ultimoCasoId,
          cats: p.cats,
          antiguedadDias: p.antiguedadDias,
          diasSinContacto: p.diasSinContacto,
          frecuenciaMes: p.frecuenciaMes,
          tipo: p.tipo,
          tendencia: p.tendencia,
          healthScore: p.healthScore,
          salud: p.salud,
          avgCal: p.avgCal,
          canalPreferido: p.canalPreferido,
        }))}
        clientesBloqueados={clientesBloqueados || []}
      />

    </div>
  );
}
