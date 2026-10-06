// src/lib/client-analytics.ts
// Motor unificado de normalización, deduplicación y auditoría de clientes para Sekunet
// Jerarquía comercial: Empresa / Cuenta > Cédula > Teléfono > Correo > ID

export interface ParsedCliente {
  nombre: string;
  nombrePersonal: string;
  whatsappName: string;
  telefono: string;
  correo: string;
  cedula: string;
  cuenta: string;
}

export interface ContactoPersona {
  nombre: string;
  telefono: string;
  whatsappName?: string;
  totalCasos: number;
}

export interface UnifiedClient {
  key: string;
  normPhone: string | null;
  nombre: string;
  telefono: string;
  correo: string;
  cedula: string;
  cuenta: string;
  esEmpresa: boolean;
  contactos: ContactoPersona[];
  nombres: Set<string>;
  cuentas: Set<string>;
  whatsappNames: Set<string>;
  total: number;
  resueltos: number;
  abiertos: number;
  calificaciones: number[];
  canales: Record<string, number>;
  primerCaso: string;
  ultimoCaso: string;
  ultimoCasoId: string | number;
  cats: string[];
}

export interface AnalyticsAuditResult {
  totalCasosBD: number;
  totalCasosValidos: number;
  totalClientesUnicos: number;
  totalEmpresas: number;
  totalParticulares: number;
  discrepanciasDetectadas: number;
  scoreIntegridad: number;
  timestamp: string;
}

/**
 * Normaliza teléfonos al estándar de Costa Rica (8 dígitos o 506 + 8 dígitos).
 */
export function normalizePhone(rawPhone: string | null | undefined): string | null {
  if (!rawPhone || rawPhone === "—") return null;
  const digits = String(rawPhone).replace(/@s\.whatsapp\.net/gi, "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 8) return "506" + digits;
  if (digits.length === 11 && digits.startsWith("506")) return digits;
  if (digits.length >= 8) return digits;
  return digits;
}

/**
 * Limpia y normaliza cadenas eliminando tildes, signos de puntuación y espacios duplicados.
 */
export function cleanString(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // sin acentos
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const JUNK_CUENTAS = new Set([
  "sin cuenta",
  "buenos dias",
  "buen dia",
  "buenas tardes",
  "buenas noches",
  "esta a nombre mio",
  "esta a nombre",
  "anonimo",
  "anónimo",
  "cliente",
  "otro",
  "ninguna",
  "particular",
]);

/**
 * Detecta frases de chat o textos vacíos escritos por error en la casilla de cuenta.
 */
export function isJunkCuenta(s: string | null | undefined): boolean {
  if (!s) return true;
  const clean = cleanString(s);
  if (!clean || clean.length < 3) return true;
  if (JUNK_CUENTAS.has(clean)) return true;
  if (
    clean.startsWith("me ayuda") ||
    clean.startsWith("esta a nombre") ||
    clean.startsWith("esta nombre") ||
    clean.startsWith("buenas") ||
    clean.startsWith("buenos")
  ) {
    return true;
  }
  return false;
}

/**
 * Parsea el campo cliente (JSON string u Object) de sek_cases de forma segura.
 */
export function parseCliente(raw: unknown, fallbackPhone?: string | null): ParsedCliente {
  let cuenta = "";
  let nombrePersonal = "";
  let whatsappName = "";
  let telefono = fallbackPhone && fallbackPhone !== "—" ? String(fallbackPhone).trim() : "—";
  let correo = "";
  let cedula = "";

  if (raw) {
    try {
      const c = typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, any>);
      cuenta = String(c.cuenta || c.empresa || c.account || c.company || "").trim();
      nombrePersonal = String(c.nombre || c.name || "").trim();
      whatsappName = String(c.whatsapp_name || "").trim();
      const t = String(c.telefono || c.phone || "").trim();
      if (t && t !== "—") telefono = t;
      correo = String(c.correo || c.email || "").trim();
      cedula = String(c.cedula || "").trim();
    } catch {
      // ignore
    }
  }

  const nombre = cuenta || nombrePersonal || whatsappName || "";
  return {
    nombre,
    nombrePersonal,
    whatsappName,
    telefono,
    correo,
    cedula,
    cuenta,
  };
}

/**
 * Obtiene la clave única de identidad con prioridad comercial y limpieza de ruido.
 */
export function getClientKey(
  parsed: ParsedCliente,
  caseId: string | number,
  phoneBestCuenta?: Record<string, string>
): string {
  const normPhone = normalizePhone(parsed.telefono);

  // 1. Empresa / Cuenta legítima (del caso o asociada previamente al teléfono del contacto)
  let cleanCuenta = !isJunkCuenta(parsed.cuenta) ? cleanString(parsed.cuenta) : "";
  if (normPhone && phoneBestCuenta?.[normPhone]) {
    cleanCuenta = phoneBestCuenta[normPhone];
  }

  if (cleanCuenta) {
    return `acc_${cleanCuenta}`;
  }

  // 2. Cédula
  if (parsed.cedula) return `ced_${cleanString(parsed.cedula)}`;

  // 3. Teléfono WhatsApp normalizado
  if (normPhone) return `tel_${normPhone}`;

  // 4. Correo electrónico
  if (parsed.correo && !parsed.correo.toLowerCase().includes("sin correo")) {
    return `mail_${cleanString(parsed.correo)}`;
  }

  // 5. Fallback por caso aislado
  return `_id_${caseId}`;
}

/**
 * Lee la calificación numérica (1 a 5) de un caso.
 */
export function getCalificacion(raw: unknown): number | null {
  if (!raw) return null;
  try {
    const c = typeof raw === "string" ? JSON.parse(raw) : (raw as any);
    const v = c?.calificacion_cliente ?? c?.calificacion_agente;
    const n = Number(v);
    return v != null && !isNaN(n) && n >= 1 && n <= 5 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Procesa y unifica una lista de casos en clientes/empresas únicas consolidadas.
 * Aplica deduplicación fonética, filtrado de frases de chat y consolidación de contactos.
 */
export function unifyClients(casos: any[]): UnifiedClient[] {
  // Pase 1: Determinar la mejor empresa por teléfono y el nombre de display más completo
  const phoneToCuentas: Record<string, Record<string, number>> = {};
  const cleanToOriginalDisplay: Record<string, string> = {};

  (casos || []).forEach(c => {
    const parsed = parseCliente(c.cliente, c.customer_phone);
    const normP = normalizePhone(parsed.telefono);

    if (parsed.cuenta && !isJunkCuenta(parsed.cuenta)) {
      const cl = cleanString(parsed.cuenta);
      if (!cleanToOriginalDisplay[cl] || parsed.cuenta.length > cleanToOriginalDisplay[cl].length) {
        cleanToOriginalDisplay[cl] = parsed.cuenta;
      }
      if (normP) {
        if (!phoneToCuentas[normP]) phoneToCuentas[normP] = {};
        phoneToCuentas[normP][cl] = (phoneToCuentas[normP][cl] || 0) + 1;
      }
    }
  });

  const phoneBestCuenta: Record<string, string> = {};
  Object.entries(phoneToCuentas).forEach(([p, counts]) => {
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    phoneBestCuenta[p] = best;
  });

  // Pase 2: Agrupación canónica con clave única
  const mapa: Record<string, {
    client: UnifiedClient;
    contactosMap: Record<string, ContactoPersona>;
  }> = {};

  (casos || []).forEach(c => {
    const parsed = parseCliente(c.cliente, c.customer_phone);
    const normPhone = normalizePhone(parsed.telefono);
    const key = getClientKey(parsed, c.id, phoneBestCuenta);

    if (!mapa[key]) {
      mapa[key] = {
        client: {
          key,
          normPhone,
          nombre: "",
          telefono: parsed.telefono !== "—" ? parsed.telefono : (normPhone ? `+${normPhone}` : "—"),
          correo: "",
          cedula: "",
          cuenta: "",
          esEmpresa: false,
          contactos: [],
          nombres: new Set<string>(),
          cuentas: new Set<string>(),
          whatsappNames: new Set<string>(),
          total: 0,
          resueltos: 0,
          abiertos: 0,
          calificaciones: [],
          canales: {},
          primerCaso: c.created_at || new Date().toISOString(),
          ultimoCaso: c.created_at || new Date().toISOString(),
          ultimoCasoId: c.id,
          cats: [],
        },
        contactosMap: {},
      };
    }

    const { client: m, contactosMap } = mapa[key];
    m.total++;
    const isClosed = c.estado === "resuelto" || c.estado === "cerrado" || !!c.closed_at;
    if (isClosed) m.resueltos++;
    else m.abiertos++;

    const cal = getCalificacion(c.cliente);
    if (cal !== null) m.calificaciones.push(cal);

    const canal = c.canal || "whatsapp";
    m.canales[canal] = (m.canales[canal] || 0) + 1;

    if (c.created_at && c.created_at < m.primerCaso) m.primerCaso = c.created_at;
    if (c.created_at && c.created_at > m.ultimoCaso) {
      m.ultimoCaso = c.created_at;
      m.ultimoCasoId = c.id;
    }

    const cat = (c as any).cat as string | undefined;
    if (cat && !m.cats.includes(cat)) m.cats.push(cat);

    // Resolver nombre canónico de la empresa
    let cleanAcc = !isJunkCuenta(parsed.cuenta) ? cleanString(parsed.cuenta) : "";
    if (normPhone && phoneBestCuenta[normPhone]) {
      cleanAcc = phoneBestCuenta[normPhone];
    }
    if (cleanAcc && cleanToOriginalDisplay[cleanAcc]) {
      const bestDisplayName = cleanToOriginalDisplay[cleanAcc];
      m.cuentas.add(bestDisplayName);
      if (!m.cuenta) m.cuenta = bestDisplayName;
    }

    if (parsed.nombre && parsed.nombre.toLowerCase() !== "anónimo") {
      m.nombres.add(parsed.nombre);
    }
    if (parsed.whatsappName) {
      m.whatsappNames.add(parsed.whatsappName);
    }
    if (parsed.correo && !parsed.correo.toLowerCase().includes("sin correo") && !m.correo) {
      m.correo = parsed.correo;
    }
    if (parsed.cedula && !m.cedula) {
      m.cedula = parsed.cedula;
    }
    if (parsed.telefono !== "—" && m.telefono === "—") {
      m.telefono = parsed.telefono;
    }

    // Agregar / consolidar contacto individual dentro de esta cuenta/empresa
    const contactNormPhone = normalizePhone(parsed.telefono);
    const contactKey = contactNormPhone
      ? `tel_${contactNormPhone}`
      : (parsed.nombrePersonal || parsed.whatsappName || `c_${c.id}`);

    const rawContactName = parsed.nombrePersonal || parsed.whatsappName || (contactNormPhone ? `+${contactNormPhone}` : "Contacto");
    const rawContactPhone = parsed.telefono !== "—" ? parsed.telefono : (contactNormPhone ? `+${contactNormPhone}` : "—");

    if (!contactosMap[contactKey]) {
      contactosMap[contactKey] = {
        nombre: rawContactName,
        telefono: rawContactPhone,
        whatsappName: parsed.whatsappName || undefined,
        totalCasos: 0,
      };
    }
    const contacto = contactosMap[contactKey];
    contacto.totalCasos++;

    // Conservar el nombre más largo / formal
    if (rawContactName.length > contacto.nombre.length && !rawContactName.startsWith("+")) {
      contacto.nombre = rawContactName;
    }
    if (parsed.whatsappName && !contacto.whatsappName) {
      contacto.whatsappName = parsed.whatsappName;
    }
  });

  return Object.values(mapa)
    .map(({ client: m, contactosMap }) => {
      const bestCuenta = Array.from(m.cuentas)[0];
      const bestNombre = Array.from(m.nombres)[0];
      const bestWa = Array.from(m.whatsappNames)[0];

      const esEmpresa = Boolean(bestCuenta && bestCuenta.length > 2);
      const displayName =
        bestCuenta ||
        bestNombre ||
        bestWa ||
        (m.normPhone ? `Cliente (+${m.normPhone})` : "Cliente");

      const contactos = Object.values(contactosMap).sort((a, b) => b.totalCasos - a.totalCasos);

      return {
        ...m,
        nombre: displayName,
        cuenta: bestCuenta || m.cuenta,
        esEmpresa,
        contactos,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/**
 * Ejecuta una auditoría matemática de consistencia e integridad sobre los casos y clientes.
 */
export function runAnalyticsAudit(casos: any[]): AnalyticsAuditResult {
  const clients = unifyClients(casos || []);
  const totalCasosValidos = (casos || []).filter(c => c && c.id).length;
  const totalEmpresas = clients.filter(c => c.esEmpresa).length;
  const totalParticulares = clients.length - totalEmpresas;

  // Verificación de integridad: la suma de casos en todos los clientes DEBE ser igual al total de casos en BD
  const sumaCasosClientes = clients.reduce((acc, c) => acc + c.total, 0);
  const discrepanciaCasos = Math.abs(totalCasosValidos - sumaCasosClientes);

  const scoreIntegridad = discrepanciaCasos === 0 ? 100 : Math.max(0, 100 - discrepanciaCasos * 5);

  return {
    totalCasosBD: (casos || []).length,
    totalCasosValidos,
    totalClientesUnicos: clients.length,
    totalEmpresas,
    totalParticulares,
    discrepanciasDetectadas: discrepanciaCasos,
    scoreIntegridad,
    timestamp: new Date().toISOString(),
  };
}
