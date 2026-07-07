import { createClient } from "@/lib/supabase/server";
import { Users, TrendingUp, CheckCircle, Star, ArrowUpRight, Repeat2, BarChart3, TrendingDown, Minus, ExternalLink, Cpu, Wrench, Clock, Activity, Globe, UserPlus, ShieldAlert, ShieldBan, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { StatsExportButton } from "@/components/admin/stats-export-button";
import { ClientProfilePanel } from "@/components/admin/client-profile-panel";
import type { PerfilClienteDTO } from "@/components/admin/client-profile-panel";

export const dynamic = "force-dynamic";

export default async function EstadisticasClientePage() {
  const supabase = createClient();

  // Intentar con columnas nuevas; si fallan (aún no migradas), usar columnas base
  let { data: casos, error: casosErr } = await supabase
    .from("sek_cases")
    .select("id, estado, cliente, created_at, updated_at, canal, title, tags, prioridad, assigned_to, marca, modelo, resolucion, problema")
    .order("created_at", { ascending: false });
  if (casosErr) {
    console.error("[estadisticas] Error consulta completa:", casosErr.message);
    const { data: casosFallback, error: fallbackErr } = await supabase
      .from("sek_cases")
      .select("id, estado, cliente, created_at, updated_at, canal, title, tags, prioridad, assigned_to")
      .order("created_at", { ascending: false });
    if (fallbackErr) console.error("[estadisticas] Error fallback:", fallbackErr.message);
    casos = casosFallback as any;
  }

  // Cargar marcas del inventario para validar títulos de casos (RLS staff)
  const { data: inventario } = await supabase.from("sek_inventario").select("marca").limit(1000);
  const marcasInventario = new Set(
    (inventario || [])
      .map((r: any) => String(r.marca).trim().toLowerCase())
      .filter(Boolean)
  );

  // ── Fechas
  const hoy = new Date(); hoy.setHours(0,0,0,0);

  // ── Parsear cliente helper
  const parseCliente = (raw: unknown): { nombre: string; telefono: string; correo: string; cedula: string; cuenta: string } => {
    if (!raw) return { nombre: "Anónimo", telefono: "—", correo: "", cedula: "", cuenta: "" };
    try {
      const c = typeof raw === "string" ? JSON.parse(raw) : raw as Record<string, string>;
      const cuenta = c.cuenta || c.empresa || c.account || c.company || "";
      const nombrePersonal = c.nombre || c.name || "Anónimo";
      
      // Si hay cuenta inscrita, ese es el nombre principal (B2B). Si no, el nombre físico.
      const nombre = cuenta ? cuenta : nombrePersonal;

      return {
        nombre,
        telefono: c.telefono || c.phone || "—",
        correo: c.correo || c.email || "",
        cedula: c.cedula || "",
        cuenta
      };
    } catch { return { nombre: "Anónimo", telefono: "—", correo: "", cedula: "", cuenta: "" }; }
  };

  // ── Leer calificación del cliente desde objeto cliente
  const getCal = (raw: unknown): number | null => {
    if (!raw) return null;
    const c = typeof raw === "string" ? JSON.parse(raw) : raw as any;
    const v = c?.calificacion_cliente ?? c?.calificacion_agente;
    const n = Number(v);
    return v != null && !isNaN(n) && n >= 1 && n <= 5 ? n : null;
  };

  // ── Agrupar por cliente — clave: cuenta > cédula > correo > teléfono > nombre+primerCasoId
  const mapa: Record<string, {
    nombre: string; telefono: string; correo: string; cedula: string; cuenta: string;
    total: number; resueltos: number; abiertos: number;
    calificaciones: number[]; canales: Record<string, number>;
    primerCaso: string; ultimoCaso: string; ultimoCasoId: string | number;
    cats: string[];
  }> = {};

  (casos || []).forEach(c => {
    const { nombre, telefono, correo, cedula, cuenta } = parseCliente(c.cliente);
    // Clave única: prioridad cuenta > cedula > correo > telefono; si ninguno, cada caso es su propio cliente
    const key = cuenta || cedula || correo || (telefono !== "—" ? telefono : `_id_${c.id}`);
    if (!mapa[key]) {
      mapa[key] = { nombre, telefono, correo, cedula, cuenta, total: 0, resueltos: 0, abiertos: 0, calificaciones: [], canales: {}, primerCaso: c.created_at, ultimoCaso: c.created_at, ultimoCasoId: c.id, cats: [] };
    }
    const m = mapa[key];
    m.total++;
    if (c.estado === "resuelto" || c.estado === "cerrado") m.resueltos++; else m.abiertos++;
    const cal = getCal(c.cliente); if (cal !== null) m.calificaciones.push(cal);
    const canal = c.canal || "web";
    m.canales[canal] = (m.canales[canal] || 0) + 1;
    if (c.created_at < m.primerCaso) m.primerCaso = c.created_at;
    if (c.created_at > m.ultimoCaso) { m.ultimoCaso = c.created_at; m.ultimoCasoId = c.id; }
    const cat = (c as any).cat as string | undefined;
    if (cat && !m.cats.includes(cat)) m.cats.push(cat);
  });

  const topClientes = Object.values(mapa).sort((a, b) => b.total - a.total);

  // ── Derivar equipo (marca+modelo+descripción) solo si hay valores válidos
  const deriveEquipo = (c: any): { marca: string; modelo: string } | null => {
    const esMarcaValida = (s: string) => {
      const w = s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      return w.length > 1 && marcasInventario.has(w);
    };
    const esModeloValido = (s: string) => {
      const w = s.replace(/[^a-zA-Z0-9]/g, "");
      return w.length >= 2; // al menos 2 caracteres alfanuméricos reales
    };

    // 1. Columnas directas (las escribe ia-agent)
    if (c.marca && c.modelo) {
      const marca = String(c.marca).trim();
      const modelo = String(c.modelo).trim();
      if (esMarcaValida(marca) && esModeloValido(modelo)) {
        return { marca, modelo };
      }
    }

    // 2. cliente.equipo_match "Marca Modelo (codigo)" o cliente.equipo "Marca Modelo"
    const cli = typeof c.cliente === "string" ? (() => { try { return JSON.parse(c.cliente); } catch { return {}; } })() : (c.cliente || {});
    const raw = String(cli.equipo_match || cli.equipo || "").trim();
    if (raw && raw.length > 3) {
      const sinCodigo = raw.split("(")[0].trim();
      const partes = sinCodigo.split(/\s+/).filter(Boolean);
      if (partes.length >= 2 && esMarcaValida(partes[0]) && esModeloValido(partes.slice(1).join(" "))) {
        return { marca: partes[0], modelo: partes.slice(1).join(" ") };
      }
    }

    // 3. title con formato "Tema — Marca Modelo [— Descripción]" validado contra marcas de inventario
    const title = String(c.title || "").trim();
    const dashParts = title.split("\u2014"); // em-dash "—"
    if (dashParts.length < 2) return null;
    const equipoPart = dashParts.slice(1).join("\u2014").trim();
    // Normalizar: quitar prefijos como "en cartera:"
    const limpio = equipoPart.replace(/^en\s+cartera[:：]?\s*/i, "").trim();
    const eqWords = limpio.split(/\s+/).filter(Boolean);
    // Buscar la primera palabra que sea una marca conocida del inventario
    for (let i = 0; i < eqWords.length; i++) {
      if (esMarcaValida(eqWords[i])) {
        // Todo lo que sigue a la marca es modelo + descripción
        const resto = limpio.substring(limpio.indexOf(eqWords[i]) + eqWords[i].length).trim();
        if (esModeloValido(resto)) {
          return { marca: eqWords[i], modelo: resto.replace(/\s*[:：]\s*$/, "").trim() };
        }
      }
    }
    return null;
  };

  // ── Equipos más reportados (deriva de columnas o de cliente.equipo)
  const equipoMap: Record<string, {
    marca: string; modelo: string; cat: string;
    total: number; resueltos: number;
    clientes: Set<string>; ultimoCasoId: string | number; ultimoCasoAt: string;
  }> = {};
  (casos || []).forEach(c => {
    const eq = deriveEquipo(c);
    if (!eq) return;
    const key = `${eq.marca}||${eq.modelo}`;
    if (!equipoMap[key]) {
      equipoMap[key] = { marca: eq.marca, modelo: eq.modelo, cat: (c as any).cat || "", total: 0, resueltos: 0, clientes: new Set(), ultimoCasoId: c.id, ultimoCasoAt: c.created_at };
    }
    const e = equipoMap[key];
    e.total++;
    if (c.estado === "resuelto" || c.estado === "cerrado") e.resueltos++;
    const { cedula, correo, telefono, nombre } = parseCliente(c.cliente);
    const clienteKey = cedula || correo || (telefono !== "—" ? telefono : nombre);
    e.clientes.add(clienteKey);
    if (c.created_at > e.ultimoCasoAt) { e.ultimoCasoAt = c.created_at; e.ultimoCasoId = c.id; }
  });
  const topEquipos = Object.values(equipoMap)
    .map(e => ({ ...e, clientesCount: e.clientes.size }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  // ── Solicitudes / problemas más frecuentes
  const labels: Record<string, string> = {
    sin_imagen: "Sin imagen", sin_grabacion: "Sin grabación", sin_acceso_remoto: "Sin acceso remoto",
    sin_energia: "Sin energía", error_configuracion: "Error de configuración", conectividad_red: "Conectividad / red",
    reset_contrasena: "Reset contraseña", desvinculacion_cuenta: "Desvinculación cuenta",
    dano_fisico: "Daño físico", actualizacion_firmware: "Actualización firmware",
    instalacion_nueva: "Instalación nueva", deteccion_incendio: "Detección incendio",
    control_acceso: "Control de acceso", intrusion_alarma: "Intrusión / alarma", otro: "Otro",
  };
  const normalizeKey = (s: string) =>
    s.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  // Mapeo de tags a etiquetas de problema. Los sub-estados de reset/desvinculacion
  // se agrupan bajo el problema principal para no hacer un reguero de categorías.
  const tagAProblema: Record<string, string> = {
    reset: "Reset contraseña",
    reset_contrasena: "Reset contraseña",
    verificacion_pendiente: "Reset contraseña",
    imagen_pendiente: "Reset contraseña",
    xml_pendiente: "Reset contraseña",
    modelo_pendiente: "Reset contraseña",
    modelo_no_validado: "Reset contraseña",
    desvinculacion: "Desvinculación cuenta",
    desvinculacion_cuenta: "Desvinculación cuenta",
    sin_imagen: "Sin imagen",
    sin_grabacion: "Sin grabación",
    sin_acceso_remoto: "Sin acceso remoto",
    sin_energia: "Sin energía",
    error_configuracion: "Error de configuración",
    conectividad_red: "Conectividad / red",
    dano_fisico: "Daño físico",
    actualizacion_firmware: "Actualización firmware",
    instalacion_nueva: "Instalación nueva",
    deteccion_incendio: "Detección incendio",
    control_acceso: "Control de acceso",
    intrusion_alarma: "Intrusión / alarma",
    otro: "Otro",
  };
  // Tags que NO son problemas (deben ignorarse)
  const tagsNoProblema = new Set(["saliente", "entrante", "urgente", "vip"]);

  // Mapeo de temas del title a etiquetas (fallback cuando no hay tags)
  const temaAProblema: Record<string, string> = {
    reset: "Reset contraseña",
    desvinculacion: "Desvinculación cuenta",
    configuraciones: "Configuraciones",
    software: "Software",
    soporte: "Soporte general",
    acceso: "Control de acceso",
    camara: "Cámaras",
    nvr: "NVR / Grabador",
    dvr: "DVR / Grabador",
    alarma: "Alarma / Intrusión",
    incendio: "Detección incendio",
    red: "Conectividad / red",
    firmware: "Actualización firmware",
  };

  // ── Derivar clave de problema: columna, tags, o tema del title
  const deriveProblema = (c: any): { key: string; label: string } | null => {
    if (c.problema) return { key: c.problema, label: labels[c.problema] || c.problema };
    const tags: string[] = Array.isArray(c.tags) ? c.tags : [];
    for (const t of tags) {
      const tl = String(t).toLowerCase().trim();
      if (tagsNoProblema.has(tl)) continue;
      if (tagAProblema[tl]) return { key: normalizeKey(tagAProblema[tl]), label: tagAProblema[tl] };
      if (labels[tl]) return { key: tl, label: labels[tl] };
    }
    // Fallback: tema del title (antes del em-dash)
    const title = String(c.title || "").trim();
    const tema = title.split("\u2014")[0].trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (tema && temaAProblema[tema]) {
      return { key: tema, label: temaAProblema[tema] };
    }
    return null;
  };

  const problemaMap: Record<string, { label: string; total: number; resueltos: number; ultimoCasoId: string | number }> = {};
  (casos || []).forEach(c => {
    const p = deriveProblema(c);
    if (!p) return;
    if (!problemaMap[p.key]) {
      problemaMap[p.key] = { label: p.label, total: 0, resueltos: 0, ultimoCasoId: c.id };
    }
    problemaMap[p.key].total++;
    if (c.estado === "resuelto" || c.estado === "cerrado") problemaMap[p.key].resueltos++;
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
      const parsed = parseCliente(c.cliente);
      const k = parsed.cedula || parsed.correo || (parsed.telefono !== "—" ? parsed.telefono : `_id_${c.id}`);
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
    const { cuenta, cedula, correo, telefono } = parseCliente(c.cliente);
    const key = cuenta || cedula || correo || (telefono !== "—" ? telefono : `_id_${c.id}`);
    if (!casosPorCliente[key]) casosPorCliente[key] = [];
    casosPorCliente[key].push(c);
  });

  const perfiles: PerfilCliente[] = topClientes.map(c => {
    const key = c.cuenta || c.cedula || c.correo || (c.telefono !== "—" ? c.telefono : "");
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

      {/* ══════════════════════════════════════════════════════════════════
          KPI ROW — 6 cards in bento style
      ══════════════════════════════════════════════════════════════════ */}
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "Clientes", value: totalClientes.toString(), icon: Users, color: "text-brand-500", gradient: "from-brand-500/15 to-brand-500/5", sub: `${clientesActivos} activos` },
          { label: "Recurrencia", value: `${pctRecurrencia}%`, icon: Repeat2, color: "text-violet-500", gradient: "from-violet-500/15 to-violet-500/5", sub: `${clientesRecurrentes} repiten` },
          { label: "Frecuencia", value: frecuenciaProm.toString(), icon: Activity, color: "text-amber-400", gradient: "from-amber-400/15 to-amber-400/5", sub: "casos / mes" },
          { label: "Antigüedad", value: antiguedadProm > 365 ? `${(antiguedadProm/365).toFixed(1)}a` : antiguedadProm > 30 ? `${Math.round(antiguedadProm/30)}m` : `${antiguedadProm}d`, icon: Clock, color: "text-sky-500", gradient: "from-sky-500/15 to-sky-500/5", sub: "promedio cartera" },
          { label: "Saludables", value: totalClientes > 0 ? `${Math.round((saludables / totalClientes) * 100)}%` : "—", icon: ShieldCheck, color: "text-sky-500", gradient: "from-sky-500/15 to-sky-500/5", sub: `${saludables} de ${totalClientes}` },
          { label: "En Riesgo", value: enRiesgoSalud.toString(), icon: ShieldAlert, color: enRiesgoSalud > 0 ? "text-rose-500" : "text-muted-foreground", gradient: enRiesgoSalud > 0 ? "from-rose-500/15 to-rose-500/5" : "from-muted/15 to-muted/5", sub: `${enAtencion} en atención` },
        ].map((k, i) => (
          <div key={i} className="group relative rounded-2xl border border-border/60 bg-gradient-to-br from-card to-card/80 p-4 overflow-hidden hover:border-border hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
            <div className={`absolute inset-0 bg-gradient-to-br ${k.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
            <div className="relative">
              <div className={`inline-flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br ${k.gradient} ${k.color} mb-2`}>
                <k.icon className="h-4 w-4" />
              </div>
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">{k.label}</p>
              <p className={`text-2xl xl:text-3xl font-black mt-0.5 tracking-tight tabular-nums ${k.color}`}>{k.value}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{k.sub}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          BENTO GRID — Main analytics area
      ══════════════════════════════════════════════════════════════════ */}
      <section className="grid gap-4 lg:grid-cols-12">

        {/* ── Nuevos vs Recurrentes por mes ── */}
        <div className="lg:col-span-8 rounded-2xl border border-border/60 bg-card p-5 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-brand-500/10 text-brand-500 grid place-items-center">
                <UserPlus className="h-3.5 w-3.5" />
              </div>
              <div>
                <h3 className="text-sm font-black">Nuevos vs Recurrentes</h3>
                <p className="text-[10px] text-muted-foreground">Clientes por mes · últimos 6 meses</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-[10px] font-bold text-brand-500"><span className="h-2 w-2 rounded-sm bg-brand-500"/>Nuevos</span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-violet-500"><span className="h-2 w-2 rounded-sm bg-violet-500"/>Recurrentes</span>
            </div>
          </div>
          {meses6Total === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/60 gap-2">
              <BarChart3 className="h-8 w-8 opacity-30" />
              <span className="text-xs font-medium">Sin datos en los últimos 6 meses</span>
            </div>
          ) : (
            <div className="flex items-end gap-3 h-32">
              {meses6.map((m, i) => (
                <div key={i} className="flex-1 h-full flex flex-col justify-end items-center gap-0.5 group/m relative">
                  <div className="w-full flex flex-col-reverse gap-px justify-end">
                    <div
                      className="w-full bg-gradient-to-t from-violet-600/80 to-violet-400/60 rounded-t-none hover:opacity-90 transition-opacity cursor-default"
                      style={{ height: `${Math.round((m.recurrentes / meses6Max) * 128)}px` }}
                    />
                    <div
                      className="w-full bg-gradient-to-t from-brand-600/80 to-brand-400/60 rounded-t-sm hover:opacity-90 transition-opacity cursor-default"
                      style={{ height: `${Math.round((m.nuevos / meses6Max) * 128)}px` }}
                    />
                  </div>
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover/m:flex flex-col items-center bg-foreground text-background text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                    <span className="text-brand-300">{m.nuevos} nuevos</span>
                    <span className="text-violet-300">{m.recurrentes} recurrentes</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between mt-2">
            {meses6.map((m, i) => (
              <span key={i} className="flex-1 text-center text-[9px] text-muted-foreground/50">{m.label}</span>
            ))}
          </div>
        </div>

        {/* ── Salud de Clientes (donut visual) ── */}
        <div className="lg:col-span-4 rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="h-7 w-7 rounded-lg bg-sky-500/10 text-sky-500 grid place-items-center">
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-black">Salud de Clientes</h3>
              <p className="text-[10px] text-muted-foreground">Score basado en comportamiento</p>
            </div>
          </div>
          <div className="flex items-center justify-center my-4">
            <div className="relative h-28 w-28">
              <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="3.5" />
                {/* Saludable (azul) */}
                <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" className="text-sky-500"
                  strokeWidth="3.5"
                  strokeDasharray={`${totalClientes > 0 ? (saludables / totalClientes) * 88 : 0} 88`}
                  strokeDashoffset="0"
                  strokeLinecap="butt" />
                {/* Atención (ámbar) */}
                <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" className="text-amber-400"
                  strokeWidth="3.5"
                  strokeDasharray={`${totalClientes > 0 ? (enAtencion / totalClientes) * 88 : 0} 88`}
                  strokeDashoffset={`${totalClientes > 0 ? -((saludables / totalClientes) * 88) : 0}`}
                  strokeLinecap="butt" />
                {/* Riesgo (fucsia) */}
                <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" className="text-rose-500"
                  strokeWidth="3.5"
                  strokeDasharray={`${totalClientes > 0 ? (enRiesgoSalud / totalClientes) * 88 : 0} 88`}
                  strokeDashoffset={`${totalClientes > 0 ? -(((saludables + enAtencion) / totalClientes) * 88) : 0}`}
                  strokeLinecap="butt" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-sky-500 tabular-nums">
                  {totalClientes > 0 ? Math.round((saludables / totalClientes) * 100) : 0}%
                </span>
                <span className="text-[9px] text-muted-foreground font-bold">saludables</span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { label: "Saludable", count: saludables, color: "bg-sky-500", text: "text-sky-500", hash: "clientes-saludable" },
              { label: "Atención", count: enAtencion, color: "bg-amber-400", text: "text-amber-400", hash: "clientes-atencion" },
              { label: "Riesgo", count: enRiesgoSalud, color: "bg-rose-500", text: "text-rose-500", hash: "clientes-riesgo" },
            ].map(row => (
              <a key={row.label} href={`#${row.hash}`} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer group">
                <span className={`h-2.5 w-2.5 rounded-full ${row.color} shrink-0`} />
                <span className="text-xs text-muted-foreground flex-1 group-hover:text-foreground transition-colors">{row.label}</span>
                <span className={`text-xs font-black tabular-nums ${row.text}`}>{row.count}</span>
              </a>
            ))}
          </div>
        </div>

        {/* ── Histograma: distribución de casos por cliente ── */}
        <div className="lg:col-span-5 rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="h-7 w-7 rounded-lg bg-sky-500/10 text-sky-500 grid place-items-center">
              <BarChart3 className="h-3.5 w-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-black">Casos por Cliente</h3>
              <p className="text-[10px] text-muted-foreground">Distribución de frecuencia</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {Object.entries(histogramaMap).map(([rango, count]) => {
              const pct = Math.round((count / histMax) * 100);
              return (
                <div key={rango}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold">{rango} caso{rango === "1" ? "" : "s"}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black tabular-nums text-sky-500">{count}</span>
                      <span className="text-[9px] text-muted-foreground">clientes</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-sky-600 to-sky-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Canales ── */}
        <div className="lg:col-span-3 rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="h-7 w-7 rounded-lg bg-brand-500/10 text-brand-500 grid place-items-center">
              <Globe className="h-3.5 w-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-black">Canales</h3>
              <p className="text-[10px] text-muted-foreground">Origen de casos</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {canalesOrdenados.map(([canal, count]) => {
              const pct = canalTotal > 0 ? Math.round((count / canalTotal) * 100) : 0;
              return (
                <div key={canal}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold">{canalLabels[canal] || canal}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black tabular-nums">{count}</span>
                      <span className="text-[9px] text-muted-foreground">({pct}%)</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-muted/50 rounded-full overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${canalColors[canal] || "from-gray-500 to-gray-400"} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Clientes en riesgo (abiertos > 3 días) + Clientes activos ── */}
        <div className="lg:col-span-4 rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-rose-500/10 text-rose-500 grid place-items-center">
                <ShieldAlert className="h-3.5 w-3.5" />
              </div>
              <div>
                <h3 className="text-sm font-black">Clientes en Riesgo</h3>
                <p className="text-[10px] text-muted-foreground">Casos abiertos sin mover &gt;3 días</p>
              </div>
            </div>
            <span className="text-xl font-black text-rose-500 tabular-nums">{clientesRiesgo.length}</span>
          </div>
          <div className="space-y-2">
            {clientesRiesgo.slice(0, 5).map((c, i) => {
              const diasSinMover = Math.floor((hoy.getTime() - new Date(c.ultimoCaso).getTime()) / 86400000);
              return (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-rose-500/5 border border-rose-500/10 hover:border-rose-500/30 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-rose-500/20 to-rose-600/20 text-rose-500 text-[9px] font-black grid place-items-center shrink-0">
                      {c.nombre[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold truncate block">{c.nombre}</span>
                      <span className="text-[9px] text-muted-foreground">{c.abiertos} abierto{c.abiertos > 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full ml-2 shrink-0">{diasSinMover}d</span>
                </div>
              );
            })}
            {clientesRiesgo.length === 0 && (
              <div className="flex items-center justify-center gap-2 p-6 text-emerald-500">
                <CheckCircle className="h-4 w-4" />
                <span className="text-xs font-bold">Sin clientes en riesgo</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          HEATMAP — Patrones de contacto (día × franja horaria)
      ══════════════════════════════════════════════════════════════════ */}
      <section className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-violet-500/10 text-violet-500 grid place-items-center">
              <Activity className="h-3.5 w-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-black">Patrones de Contacto</h3>
              <p className="text-[10px] text-muted-foreground">Cuándo escriben sus clientes — día × franja horaria</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
            <span>Menor</span>
            <div className="flex gap-0.5">
              {[0.1, 0.25, 0.5, 0.75, 1].map((o, i) => (
                <span key={i} className="h-3 w-3 rounded-sm bg-violet-500" style={{ opacity: o }} />
              ))}
            </div>
            <span>Mayor</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="px-2 py-1.5 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 w-16"></th>
                {franjas.map(f => (
                  <th key={f} className="px-2 py-1.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">{f}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dias.map((dia, i) => (
                <tr key={dia}>
                  <td className="px-2 py-1.5 text-[10px] font-black text-muted-foreground/70 uppercase">{dia}</td>
                  {heatmap[i].map((count, j) => {
                    const intensity = count / heatmapMax;
                    const opacity = count === 0 ? 0.04 : Math.max(0.15, intensity);
                    return (
                      <td key={j} className="px-1 py-1">
                        <div
                          className="h-9 rounded-md flex items-center justify-center text-[10px] font-bold transition-all hover:ring-2 hover:ring-violet-500/40"
                          style={{ backgroundColor: `rgba(139, 92, 246, ${opacity})` }}
                          title={`${dia} ${franjas[j]}: ${count} casos`}
                        >
                          <span className={count > 0 ? "text-white" : "text-muted-foreground/30"}>
                            {count > 0 ? count : "·"}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[9px] text-muted-foreground/60 mt-3">
          Madrugada: 0–6h · Mañana: 6–12h · Tarde: 12–18h · Noche: 18–24h
        </p>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          EQUIPOS + SOLICITUDES — Side by side premium tables
      ══════════════════════════════════════════════════════════════════ */}
      <section className="grid gap-4 lg:grid-cols-2">

        {/* Equipos más reportados */}
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-gradient-to-r from-sky-500/5 to-transparent">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-sky-500/10 text-sky-500 grid place-items-center"><Cpu className="h-3.5 w-3.5" /></div>
              <h3 className="font-black text-sm">Equipos Más Reportados</h3>
            </div>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-500">{topEquipos.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="px-4 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Equipo</th>
                  <th className="px-3 py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Casos</th>
                  <th className="px-3 py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Tasa</th>
                  <th className="px-3 py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {topEquipos.slice(0, 8).map((e, i) => {
                  const tasa = e.total > 0 ? Math.round((e.resueltos / e.total) * 100) : 0;
                  return (
                    <tr key={i} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-md bg-sky-500/10 text-sky-500 grid place-items-center shrink-0">
                            <Cpu className="h-3 w-3" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-xs truncate">{e.marca}</p>
                            <p className="text-[9px] text-muted-foreground truncate">{e.modelo}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="font-black text-sm tabular-nums text-sky-500">{e.total}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="inline-flex items-center gap-1">
                          <div className="h-1 w-8 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${tasa}%` }} />
                          </div>
                          <span className="text-[9px] font-bold text-emerald-500">{tasa}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Link href={`/inbox?case=${e.ultimoCasoId}`} className="text-brand-500 hover:text-brand-600">
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Solicitudes más frecuentes */}
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-gradient-to-r from-violet-500/5 to-transparent">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-violet-500/10 text-violet-500 grid place-items-center"><Wrench className="h-3.5 w-3.5" /></div>
              <h3 className="font-black text-sm">Problemas Frecuentes</h3>
            </div>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-500">{topProblemas.length}</span>
          </div>
          <div className="p-5 space-y-3">
            {topProblemas.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <div className="h-10 w-10 rounded-xl bg-violet-500/10 text-violet-500/40 grid place-items-center"><Wrench className="h-5 w-5" /></div>
                <p className="text-xs font-bold text-muted-foreground/50">Sin clasificaciones aún</p>
                <p className="text-[10px] text-muted-foreground/30">Se clasifican automáticamente</p>
              </div>
            )}
            {topProblemas.slice(0, 8).map((p, i) => {
              const pct = Math.round((p.total / maxProblema) * 100);
              const resPct = p.total > 0 ? Math.round((p.resueltos / p.total) * 100) : 0;
              return (
                <div key={i} className="group/p">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[9px] font-black text-muted-foreground/40 w-4 tabular-nums shrink-0">{i+1}</span>
                      <span className="text-xs font-bold truncate">{p.label}</span>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0 ml-2">
                      <span className="text-[9px] text-emerald-500 font-bold">{resPct}%</span>
                      <span className="text-xs font-black tabular-nums text-violet-500">{p.total}</span>
                      <Link href={`/inbox?case=${p.ultimoCasoId}`} className="text-brand-500 hover:text-brand-600 opacity-0 group-hover/p:opacity-100 transition-opacity">
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          PERFIL DE CLIENTES — Tabla interactiva con filtros y perfil expandible
      ══════════════════════════════════════════════════════════════════ */}
      <div className="flex justify-end">
        <StatsExportButton
          data={perfiles.map(p => ({
            Cliente: p.nombre, Telefono: p.telefono, Cedula: p.cedula,
            Tipo: p.tipo, Salud: p.salud, Score: p.healthScore, Tendencia: p.tendencia,
            Total_Casos: p.total, Resueltos: p.resueltos, Abiertos: p.abiertos,
            Antiguedad_Dias: p.antiguedadDias, Dias_Sin_Contacto: p.diasSinContacto,
            Frecuencia_Mes: p.frecuenciaMes,
            Calificacion_Avg: p.avgCal !== null ? p.avgCal.toFixed(1) : "N/A",
            Canal_Preferido: p.canalPreferido,
            Primer_Caso: new Date(p.primerCaso).toLocaleDateString("es-CR"),
            Ultimo_Caso: new Date(p.ultimoCaso).toLocaleDateString("es-CR"),
          }))}
          fileName="Perfil_Clientes_Sekunet"
        />
      </div>
      <ClientProfilePanel perfiles={perfiles.map(p => ({
        nombre: p.nombre, telefono: p.telefono, correo: p.correo, cedula: p.cedula,
        total: p.total, resueltos: p.resueltos, abiertos: p.abiertos,
        primerCaso: p.primerCaso, ultimoCaso: p.ultimoCaso, ultimoCasoId: p.ultimoCasoId,
        cats: p.cats,
        antiguedadDias: p.antiguedadDias, diasSinContacto: p.diasSinContacto,
        frecuenciaMes: p.frecuenciaMes, tipo: p.tipo, tendencia: p.tendencia,
        healthScore: p.healthScore, salud: p.salud, avgCal: p.avgCal, canalPreferido: p.canalPreferido,
      }))} />

      {/* ══ CLIENTES BLOQUEADOS ══ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2"><ShieldBan className="h-5 w-5 text-red-500" /> Clientes Bloqueados</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Bloqueo automático por 5 calificaciones menores a 2 estrellas</p>
          </div>
        </div>
        {!clientesBloqueados || clientesBloqueados.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-border/60 rounded-2xl text-muted-foreground">
            <ShieldCheck className="h-6 w-6 mx-auto mb-2 text-emerald-500/40" />
            <p className="text-xs">No hay clientes bloqueados actualmente.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Cédula</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Calif. negativas</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Fecha bloqueo</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Desbloquear</th>
                </tr>
              </thead>
              <tbody>
                {clientesBloqueados.map((c: any) => (
                  <tr key={c.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{c.nombre}</p>
                      {c.correo && <p className="text-xs text-muted-foreground">{c.correo}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{c.cedula}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 px-2.5 py-1 text-xs font-bold">
                        <ShieldBan className="h-3 w-3" /> {c.bloqueo_contador}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                      {c.fecha_bloqueo ? new Date(c.fecha_bloqueo).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href="/admin/clientes" className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-1 text-xs font-semibold transition-colors">
                        <ShieldCheck className="h-3 w-3" /> Gestionar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  );
}
