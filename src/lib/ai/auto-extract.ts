import { createServiceClient } from "@/lib/supabase/service";
import { generateText } from "@/lib/ai/config";
import { isInvalidVendorStr } from "@/lib/utils";

export const KNOWN_SEKUNET_VENDORS = [
  "fabiana perozo", "fabiana peroza", "fabiana p", "fabiana",
  "carolina chavarria", "carolina chavarría", "carolina", "karolina",
  "luis fallas", "luis fallas chaves", "luis gomez", "luis",
  "sharon del sid", "sharon del cid", "sharon",
  "joaquin sanchez", "joaquín sánchez", "joaquin", "joaquín", "juakin",
  "nicol espinoza", "nicole espinoza", "nicol", "nicole",
  "bryan anchia", "bryan anchía", "brayan", "bryan",
  "mariano castro", "mariano",
  "henry ramirez", "henry ramírez", "henry",
  "josseph bolsios", "josseph",
  "cristofer alvarado", "christopher alvarado", "cristofer", "christopher",
  "matthew", "isaac", "roberto"
];

const TEMAS_VALIDOS = [
  "Configuraciones", "Reset", "Desvinculación", "Firmware",
  "Software", "Licencias", "Reparación / Diagnóstico", "Consulta", "Otro"
];

const temaToProblema: Record<string, string> = {
  "Configuraciones": "configuracion",
  "Reset": "reset_contrasena",
  "Desvinculación": "desvinculacion_cuenta",
  "Firmware": "actualizacion_firmware",
  "Software": "software",
  "Licencias": "licencias",
  "Reparación / Diagnóstico": "reparacion_diagnostico",
  "Consulta": "consulta",
  "Otro": "otro",
};

export async function performAutoExtract(id: string) {
  try {
    const supabase = createServiceClient();

    const { data: caseData, error: fetchError } = await supabase
      .from("sek_cases")
      .select("id, title, problema, marca, modelo, tags, histcliente, histtecnico, cliente, resolucion")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !caseData) {
      return { ok: false, error: "Caso no encontrado" };
    }

    const cli = (caseData.cliente && typeof caseData.cliente === "object") ? caseData.cliente as Record<string, unknown> : {};
    const hasEquipmentData = caseData.problema && caseData.marca && caseData.modelo;
    const hasClientData = !!(cli.nombre && (cli.correo || cli.cuenta));
    if (hasEquipmentData && hasClientData) {
      return { ok: true, skipped: true, reason: "already_has_data" };
    }

    const histCliente = Array.isArray(caseData.histcliente) ? caseData.histcliente : [];
    const histTecnico = Array.isArray(caseData.histtecnico) ? caseData.histtecnico : [];

    const allMsgs = [
      ...histCliente.map((m: any) => ({
        role: m.role || "user",
        content: typeof m.content === "string" ? m.content : (m.content?.text || JSON.stringify(m.content || "")),
      })),
      ...histTecnico.map((m: any) => ({
        role: m.role || "assistant",
        content: typeof m.content === "string" ? m.content : (m.content?.text || JSON.stringify(m.content || "")),
      })),
    ].filter(m => m.content && m.content.trim());

    if (allMsgs.length === 0) {
      return { ok: true, skipped: true, reason: "no_history" };
    }

    const conversationText = allMsgs
      .map(m => `${m.role === "user" ? "Cliente" : "Agente/IA"}: ${m.content.slice(0, 500)}`)
      .join("\n")
      .slice(0, 4000);

    const prompt = `Eres un analista de soporte técnico de Sekunet (Costa Rica). Analiza la siguiente conversación de soporte técnico y extrae con máxima precisión los datos técnicos del equipo y del cliente:

1. "nombre": Nombre completo de la persona que escribe (cliente). NUNCA uses el nombre del vendedor ni el de ejecutivos de ventas de Sekunet aquí. Si el cliente aún no ha dicho su nombre personal, déjalo vacío (""). NUNCA uses el nombre de perfil de WhatsApp.
2. "correo": Correo electrónico (si aparece).
3. "cuenta": Empresa o cuenta comercial afiliada a Sekunet (si la menciona expresamente). NUNCA pongas el nombre de una persona física aquí. Si no menciona empresa o negocio, déjalo vacío (""). NUNCA dupliques el "nombre" en "cuenta".
4. "vendedor": Nombre del ejecutivo o ejecutiva de ventas de Sekunet que atiende su cuenta (ej: Fabiana Perozo, Carolina Chavarría, Luis Fallas, Sharon Del Cid, Joaquín Sánchez, Nicol Espinoza, Bryan Anchía, etc., si el cliente lo indica, si responde a la pregunta de vendedor, o si viene precedido por "vendedor:", "mi vendedor es", etc.). NUNCA extraigas fragmentos de saludos institucionales o mensajes del bot ("uno de", "uno de nuestros agentes", "agente", etc.). Si el cliente no indicó un vendedor de ventas de Sekunet, déjalo estrictamente vacío (""). NUNCA pongas al vendedor como "nombre".
REGLAS ESTRICTAS DE VENDEDOR VS CLIENTE:
- Los vendedores de Sekunet son personal de ventas de la empresa, NUNCA son el cliente.
- NUNCA pongas como vendedor palabras genéricas como "uno de", "agente", "soporte" o "sekunet".
- Si en la conversación solo se menciona a un vendedor (o el cliente responde a quién es su vendedor), ese nombre va estrictamente en "vendedor", JAMÁS en "nombre".
- "nombre" y "vendedor" NUNCA pueden ser la misma persona.
5. "ticket": Número de ticket abierto o boleta de taller (si el cliente lo menciona).
6. "tema": Tema de la consulta. Debe ser exactamente uno de: ${TEMAS_VALIDOS.join(", ")}.
7. "marca": Marca exacta del equipo (ej: HIKVISION, DAHUA, ZKTECO, EPCOM, HILOOK, EZVIZ, IMOU, MIKROTIK, UBIQUITI). Si no se menciona explícitamente pero se deduce, indícala.
8. "modelo": Modelo alfanumérico exacto del equipo (ej: DS-2CD2043G2-I, DS-7208HQHI-K1, K40, XVR5108, IPC-B120H).
9. "descripcion_problema": Resumen conciso de la falla y solución técnica aplicada (máximo 250 caracteres).

DATOS ACTUALES DEL CLIENTE:
- nombre: ${String(cli.nombre || "")}
- correo: ${String(cli.correo || "")}
- cuenta: ${String(cli.cuenta || "")}
- vendedor: ${String(cli.vendedor || "")}

CONVERSACIÓN:
${conversationText}

Responde ÚNICAMENTE en formato JSON:
{"nombre": "...", "correo": "...", "cuenta": "...", "vendedor": "...", "ticket": "...", "tema": "...", "marca": "...", "modelo": "...", "descripcion_problema": "..."}`;

    let rawContent = "";
    try {
      const aiGen = await generateText("extract", {
        system: "Eres un analista técnico de soporte que extrae marcas, modelos y datos de equipos de seguridad electrónica. Devuelve estrictamente JSON válido.",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        maxTokens: 500,
        timeoutMs: 8_000,
      });
      if (aiGen?.text) {
        rawContent = aiGen.text;
      }
    } catch (e: any) {
      console.warn("[auto-extract] generateText error:", e?.message);
    }

    let extracted: { nombre?: string; correo?: string; cuenta?: string; vendedor?: string; ticket?: string; tema?: string; marca?: string; modelo?: string; descripcion_problema?: string } = {};
    if (rawContent) {
      try {
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      } catch (e) {
        console.warn("[auto-extract] JSON parse error:", e);
      }
    }

    // ── Fallbacks deterministas por reglas y regex si la IA no extrajo o falló ──
    const fullText = allMsgs.map(m => m.content).join("\n");

    // 1. Marca
    if (!extracted.marca) {
      const KNOWN_BRANDS: [string, string][] = [
        ["hikvision", "HIKVISION"],
        ["hilook", "HILOOK"],
        ["ezviz", "EZVIZ"],
        ["dahua", "DAHUA"],
        ["imou", "IMOU"],
        ["zkteco", "ZKTECO"],
        ["zk", "ZKTECO"],
        ["epcom", "EPCOM"],
        ["ubiquiti", "UBIQUITI"],
        ["unifi", "UBIQUITI"],
        ["mikrotik", "MIKROTIK"],
        ["dsc", "DSC"],
        ["paradox", "PARADOX"],
        ["axis", "AXIS"],
        ["uniview", "UNIVIEW"],
        ["honeywell", "HONEYWELL"],
      ];
      for (const [kw, brandName] of KNOWN_BRANDS) {
        const regex = new RegExp(`\\b${kw}\\b`, "i");
        if (regex.test(fullText)) {
          extracted.marca = brandName;
          break;
        }
      }
    }

    // 2. Modelo
    if (!extracted.modelo) {
      if (/hikcentral/i.test(fullText)) {
        extracted.modelo = "HikCentral";
        if (!extracted.marca) extracted.marca = "HIKVISION";
        if (!extracted.tema) extracted.tema = "Software";
      } else if (/ivms-?4200|ivms/i.test(fullText)) {
        extracted.modelo = "iVMS-4200";
        if (!extracted.marca) extracted.marca = "HIKVISION";
        if (!extracted.tema) extracted.tema = "Software";
      } else if (/smartpss/i.test(fullText)) {
        extracted.modelo = "SmartPSS";
        if (!extracted.marca) extracted.marca = "DAHUA";
        if (!extracted.tema) extracted.tema = "Software";
      } else if (/biotime/i.test(fullText)) {
        extracted.modelo = "BioTime";
        if (!extracted.marca) extracted.marca = "ZKTECO";
        if (!extracted.tema) extracted.tema = "Software";
      } else if (/configtool/i.test(fullText)) {
        extracted.modelo = "ConfigTool";
        if (!extracted.marca) extracted.marca = "DAHUA";
        if (!extracted.tema) extracted.tema = "Software";
      } else if (/sadp/i.test(fullText)) {
        extracted.modelo = "SADP Tool";
        if (!extracted.marca) extracted.marca = "HIKVISION";
        if (!extracted.tema) extracted.tema = "Software";
      } else {
        const isLikelyModel = (str: string) => {
          if (!str || str.length < 3 || str.length > 25) return false;
          if (/^(nota|voz|audio|image|video|photo|file|http|https|jpeg|webm|png|wifi|case|auto|json|hora|min|react|whatsapp|guia|manual|hik-connect|smartpss|sadp)/i.test(str)) return false;
          if (/^[0-9a-f]{4,8}-[0-9a-f]{4}/i.test(str)) return false;
          if (!/\d/.test(str)) return false;
          return true;
        };

        const modelMatches = fullText.match(/\b([A-Z0-9]{1,4}[-][A-Z0-9\/-]+|[A-Z]{1,3}\d{2,5}[A-Z0-9-]*)\b/gi) || [];
        const cleanModels = [...new Set(modelMatches.map(m => m.trim()))].filter(isLikelyModel);
        if (cleanModels.length > 0) {
          extracted.modelo = cleanModels[0].toUpperCase();
        }
      }
    }

    // 2.1 Deducción de marca por prefijo de modelo
    if (!extracted.marca && extracted.modelo) {
      if (/^(DS-|HWI-|HIK-|HS-|IVMS|HIKCENTRAL)/i.test(extracted.modelo)) extracted.marca = "HIKVISION";
      else if (/^(DH-|XVR|DHI-|SMARTPSS|CONFIGTOOL)/i.test(extracted.modelo)) extracted.marca = "DAHUA";
      else if (/^(K\d|MB\d|INBIO|F\d|SF\d|ZK|BIOTIME)/i.test(extracted.modelo)) extracted.marca = "ZKTECO";
    }

    // 3. Correo
    if (!extracted.correo) {
      const emailMatch = fullText.match(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) extracted.correo = emailMatch[0];
    }

    // 4. Tema si está vacío
    if (!extracted.tema) {
      if (/contraseñ|clave|password|reset/i.test(fullText)) extracted.tema = "Reset";
      else if (/desvincul/i.test(fullText)) extracted.tema = "Desvinculación";
      else if (/firmware/i.test(fullText)) extracted.tema = "Firmware";
      else if (/licencia/i.test(fullText)) extracted.tema = "Licencias";
      else if (/repara|garant|dañ|quemad|taller/i.test(fullText)) extracted.tema = "Reparación / Diagnóstico";
      else if (/hikcentral|ivms|smartpss|biotime|configtool|sadp|software/i.test(fullText)) extracted.tema = "Software";
      else if (/nvr|dvr|camara|cámara|grabador|poe|ip|red|subred/i.test(fullText)) extracted.tema = "Configuraciones";
    }

    // 5. Vendedor por regex y catálogo de ejecutivos comerciales Sekunet
    if (extracted.vendedor && isInvalidVendorStr(extracted.vendedor)) {
      extracted.vendedor = "";
    }

    const KNOWN_SEKUNET_VENDEDORES: [RegExp, string][] = [
      [/\b(luis\s+fallas(?:\s+chaves)?)\b/i, "Luis Fallas"],
      [/\b(sharon(?:\s+del\s+cid)?)\b/i, "Sharon Del Cid"],
      [/\b(carolina(?:\s+chavarr[ií]a)?|karolina)\b/i, "Carolina Chavarría"],
      [/\b(fabiana(?:\s+perozo|\s+peroza|\s+p\.?)?)\b/i, "Fabiana Perozo"],
      [/\b(nicole(?:\s+espinoza)?|nicol\s+espinoza)\b/i, "Nicole Espinoza"],
      [/\b(bryan\s+anch[ií]a|brayan\s+anch[ií]a)\b/i, "Bryan Anchía"],
      [/\b(joaqu[ií]n(?:\s+s[aá]nchez)?|juakin)\b/i, "Joaquín Sánchez"],
      [/\b(roberto\s+d[ií]az|roverto)\b/i, "Roberto Díaz"],
      [/\b(cristofer(?:\s+alvarado)?|christopher(?:\s+alvarado)?)\b/i, "Christopher Alvarado"],
      [/\b(henry(?:\s+ram[ií]rez)?)\b/i, "Henry Ramírez"],
      [/\b(mariano(?:\s+castro)?)\b/i, "Mariano Castro"],
    ];

    // Primero: buscar si el cliente escribió directamente el nombre de un vendedor de Sekunet en sus mensajes
    const clientText = allMsgs
      .filter(m => m.role === "user")
      .map(m => m.content)
      .join("\n");

    for (const [rx, canonName] of KNOWN_SEKUNET_VENDEDORES) {
      if (rx.test(clientText)) {
        extracted.vendedor = canonName;
        break;
      }
    }

    // Segundo: si aún no hay vendedor o es inválido, buscar regexes explícitas de vendedor
    if (!extracted.vendedor || isInvalidVendorStr(extracted.vendedor)) {
      const vendedorRegexes = [
        /(?:vendedor|vendedora|ejecutivo|ejecutiva)(?:\s+(?:de\s+ventas|encargado|asignado|responsable))?[:\s-]+([A-Za-záéíóúÁÉÍÓÚñÑ]{2,25}(?:\s+[A-Za-záéíóúÁÉÍÓÚñÑ]{2,25})?)/i,
        /(?:mi|el|la)\s+(?:vendedor|vendedora|ejecutivo|ejecutiva)\s+es\s+([A-Za-záéíóúÁÉÍÓÚñÑ]{2,25}(?:\s+[A-Za-záéíóúÁÉÍÓÚñÑ]{2,25})?)/i,
        /(?:atendido|atendida)\s+por\s+el\s+vendedor\s+([A-Za-záéíóúÁÉÍÓÚñÑ]{2,25}(?:\s+[A-Za-záéíóúÁÉÍÓÚñÑ]{2,25})?)/i,
      ];
      for (const rx of vendedorRegexes) {
        const m = fullText.match(rx);
        if (m && m[1]) {
          const cand = m[1].trim();
          if (!isInvalidVendorStr(cand)) {
            extracted.vendedor = cand;
            break;
          }
        }
      }
    }

    // Tercero: si aún no hay vendedor, buscar en todo el historial contra la lista de vendedores conocidos
    if (!extracted.vendedor || isInvalidVendorStr(extracted.vendedor)) {
      for (const [rx, canonName] of KNOWN_SEKUNET_VENDEDORES) {
        if (rx.test(fullText)) {
          extracted.vendedor = canonName;
          break;
        }
      }
    }

    // 6. Ticket si el cliente menciona un ticket o boleta abierto
    if (!extracted.ticket) {
      const ticketMatch = fullText.match(/\b(?:ticket|boleta|caso\s*#?)\s*[:#]?\s*([0-9]{3,8})\b/i);
      if (ticketMatch && ticketMatch[1]) {
        extracted.ticket = ticketMatch[1].trim();
      }
    }

    const updates: Record<string, unknown> = {};
    const tema = extracted.tema?.trim() || "";
    const marca = extracted.marca?.trim() || "";
    const modelo = extracted.modelo?.trim() || "";
    const descProblema = extracted.descripcion_problema?.trim() || "";
    let extractNombre = extracted.nombre?.trim() || "";
    const extractCorreo = extracted.correo?.trim() || "";
    let extractCuenta = extracted.cuenta?.trim() || "";
    let extractVendedor = extracted.vendedor?.trim() || "";
    const extractTicket = extracted.ticket?.trim() || "";

    const currentCliente = (caseData.cliente && typeof caseData.cliente === "object") ? caseData.cliente as Record<string, unknown> : {};
    const updatedCliente: Record<string, unknown> = { ...currentCliente };
    let clienteChanged = false;

    const whatsappName = String((currentCliente as any).whatsapp_name || (caseData.cliente as any)?.whatsapp_name || "").trim();

    // ── Validaciones cruzadas para evitar confundir al vendedor con el cliente ──

    // 1. Si extractNombre coincide con un vendedor conocido de Sekunet, moverlo a vendedor y anular como cliente
    if (extractNombre) {
      const normN = extractNombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const isKnownVendor = KNOWN_SEKUNET_VENDORS.some(v => {
        const normV = v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        return normN === normV || normN.startsWith(normV + " ") || normN.endsWith(" " + normV);
      });
      if (isKnownVendor) {
        console.log(`[auto-extract] Nombre '${extractNombre}' coincide con ejecutiva/vendedor de Sekunet. Reasignando a vendedor.`);
        if (!extractVendedor) {
          extractVendedor = extractNombre;
        }
        extractNombre = ""; // Descartar como cliente
      }
    }

    // 2. Si extractNombre coincide con extractVendedor o con el vendedor actual de la cuenta, anularlo
    if (extractNombre) {
      const normN = extractNombre.toLowerCase().trim();
      const normV = (extractVendedor || currentCliente.vendedor || "").toString().toLowerCase().trim();
      if (normV && (normN === normV || normN.includes(normV) || normV.includes(normN))) {
        console.log(`[auto-extract] Nombre '${extractNombre}' descartado porque coincide con el vendedor '${normV}'`);
        extractNombre = "";
      }
    }

    // 3. Comparación con WhatsApp Profile Name como árbitro de apoyo (SIN autocompletar si el cliente no escribió)
    if (extractNombre && whatsappName) {
      const normN = extractNombre.toLowerCase().trim();
      const normW = whatsappName.toLowerCase().trim();
      // Si el nombre extraído es totalmente ajeno al nombre de perfil de WhatsApp pero coincide con patrones de vendedor, descartar
      if (normN !== normW && !normW.includes(normN) && !normN.includes(normW)) {
        const isVendorWord = KNOWN_SEKUNET_VENDORS.some(v => normN.includes(v));
        if (isVendorWord) {
          extractNombre = "";
        }
      }
    }

    // Solo actualizar nombre si la IA extrajo un nombre real del texto que no sea el vendedor
    if (extractNombre && !currentCliente.nombre) {
      updatedCliente.nombre = extractNombre;
      clienteChanged = true;
    }

    // Si el caso guardado previamente tenía por error el nombre del cliente idéntico al vendedor, sanearlo
    if (updatedCliente.nombre && (updatedCliente.vendedor || extractVendedor)) {
      const n = String(updatedCliente.nombre).toLowerCase().trim();
      const v = String(updatedCliente.vendedor || extractVendedor).toLowerCase().trim();
      if (n && v && (n === v || n.includes(v) || v.includes(n))) {
        console.log(`[auto-extract] Saneando caso: removiendo nombre de cliente '${updatedCliente.nombre}' porque coincide con el vendedor`);
        delete updatedCliente.nombre;
        clienteChanged = true;
      }
    }

    if (extractCorreo && !currentCliente.correo) {
      updatedCliente.correo = extractCorreo;
      clienteChanged = true;
    }

    // Solo actualizar cuenta si es una empresa real extraída de la conversación
    // NUNCA usar whatsapp_name y NUNCA permitir que sea igual al nombre personal
    const effectiveNombre = String(updatedCliente.nombre || currentCliente.nombre || "").trim().toLowerCase();
    if (extractCuenta) {
      const cuentaLower = extractCuenta.toLowerCase();
      if (effectiveNombre && cuentaLower === effectiveNombre) {
        extractCuenta = "";
      }
    }

    if (extractCuenta && !currentCliente.cuenta) {
      updatedCliente.cuenta = extractCuenta;
      clienteChanged = true;
    }

    // Si la cuenta guardada previamente era idéntica al nombre personal, sanearla y removerla
    if (updatedCliente.cuenta && effectiveNombre && String(updatedCliente.cuenta).trim().toLowerCase() === effectiveNombre) {
      delete updatedCliente.cuenta;
      clienteChanged = true;
    }

    // Sanear vendedor actual si contiene basura previa ("uno de", etc.)
    if (updatedCliente.vendedor && isInvalidVendorStr(updatedCliente.vendedor)) {
      console.log(`[auto-extract] Saneando vendedor inválido existente en caso ${id}: '${updatedCliente.vendedor}'`);
      delete updatedCliente.vendedor;
      clienteChanged = true;
    }

    if (extractVendedor && !isInvalidVendorStr(extractVendedor)) {
      // Solo asignar si el caso no tiene ya un vendedor válido
      if (!updatedCliente.vendedor || isInvalidVendorStr(updatedCliente.vendedor)) {
        updatedCliente.vendedor = extractVendedor;
        clienteChanged = true;
      }
    }

    // Auto-recuperar vendedor desde la memoria de la cuenta si aún no está asignado o era inválido
    const targetCuenta = String(updatedCliente.cuenta || currentCliente.cuenta || extractCuenta || "").trim();
    if ((!updatedCliente.vendedor || isInvalidVendorStr(updatedCliente.vendedor)) && targetCuenta && !/^(sin\s+cuenta|no\s+tengo|ninguna|cliente\s+final)$/i.test(targetCuenta)) {
      try {
        const { data: pastAc } = await supabase
          .from("sek_cases")
          .select("cliente")
          .filter("cliente->>cuenta", "ilike", targetCuenta)
          .not("cliente->>vendedor", "is", null)
          .limit(1)
          .maybeSingle();

        if (pastAc?.cliente && typeof pastAc.cliente === "object") {
          const pastV = (pastAc.cliente as any).vendedor;
          if (pastV && typeof pastV === "string" && !isInvalidVendorStr(pastV.trim())) {
            updatedCliente.vendedor = pastV.trim();
            clienteChanged = true;
            console.log(`[auto-extract] Vendedor auto-asignado por cuenta (${targetCuenta}): ${pastV.trim()}`);
          }
        }
      } catch (err) {
        console.warn("[auto-extract] Error buscando vendedor de la cuenta:", err);
      }
    }

    if (extractTicket && !currentCliente.ticket) {
      updatedCliente.ticket = extractTicket;
      clienteChanged = true;
    }

    if (descProblema && !currentCliente.descripcion) {
      updatedCliente.descripcion = descProblema;
      clienteChanged = true;
    }
    if (tema) {
      updatedCliente.tipo_consulta = tema;
      clienteChanged = true;
    }
    if (marca && !currentCliente.marca) {
      updatedCliente.marca = marca;
      clienteChanged = true;
    }
    if (modelo && !currentCliente.modelo) {
      updatedCliente.modelo = modelo;
      clienteChanged = true;
    }

    if (clienteChanged) {
      updates.cliente = updatedCliente;
    }

    if (tema && TEMAS_VALIDOS.includes(tema)) {
      updates.problema = temaToProblema[tema] || tema.toLowerCase();
    }
    if (marca) updates.marca = marca;
    if (modelo) updates.modelo = modelo;

    const titleParts: string[] = [];
    if (tema) titleParts.push(tema);
    if (marca && modelo) titleParts.push(`${marca} ${modelo}`);
    else if (marca) titleParts.push(marca);
    if (titleParts.length > 0) {
      updates.title = titleParts.join(" — ").substring(0, 120);
    }

    if (descProblema && !caseData.resolucion) {
      updates.resolucion = descProblema;
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("sek_cases").update(updates).eq("id", id);
      console.log(`[auto-extract] Caso ${id} enriquecido automáticamente en segundo plano:`, updates);
    }

    return {
      ok: true,
      extracted: {
        tema: tema || caseData.problema,
        marca: marca || caseData.marca || (updatedCliente.marca as string),
        modelo: modelo || caseData.modelo || (updatedCliente.modelo as string),
        descripcion_problema: descProblema || caseData.resolucion,
        nombre: (updatedCliente.nombre as string) || extractNombre,
        correo: (updatedCliente.correo as string) || extractCorreo,
        cuenta: (updatedCliente.cuenta as string) || extractCuenta,
        vendedor: (updatedCliente.vendedor as string) || extractVendedor,
        ticket: (updatedCliente.ticket as string) || extractTicket,
      }
    };
  } catch (err: any) {
    console.error(`[auto-extract] Error inesperado en caso ${id}:`, err?.message);
    return { ok: false, error: err?.message };
  }
}