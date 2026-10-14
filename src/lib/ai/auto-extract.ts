import { createServiceClient } from "@/lib/supabase/service";
import { generateText } from "@/lib/ai/config";

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

1. "nombre": Nombre del cliente (si aparece).
2. "correo": Correo electrónico (si aparece).
3. "cuenta": Empresa o cuenta afiliada a Sekunet.
4. "vendedor": Vendedor mencionado (si aplica).
5. "tema": Tema de la consulta. Debe ser exactamente uno de: ${TEMAS_VALIDOS.join(", ")}.
6. "marca": Marca exacta del equipo (ej: HIKVISION, DAHUA, ZKTECO, EPCOM, HILOOK, EZVIZ, IMOU, MIKROTIK, UBIQUITI). Si no se menciona explícitamente pero se deduce, indícala.
7. "modelo": Modelo alfanumérico exacto del equipo (ej: DS-2CD2043G2-I, DS-7208HQHI-K1, K40, XVR5108, IPC-B120H).
8. "descripcion_problema": Resumen conciso de la falla y solución técnica aplicada (máximo 250 caracteres).

DATOS ACTUALES DEL CLIENTE:
- nombre: ${String(cli.nombre || "")}
- correo: ${String(cli.correo || "")}
- cuenta: ${String(cli.cuenta || "")}

CONVERSACIÓN:
${conversationText}

Responde ÚNICAMENTE en formato JSON:
{"nombre": "...", "correo": "...", "cuenta": "...", "vendedor": "...", "tema": "...", "marca": "...", "modelo": "...", "descripcion_problema": "..."}`;

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

    let extracted: { nombre?: string; correo?: string; cuenta?: string; vendedor?: string; tema?: string; marca?: string; modelo?: string; descripcion_problema?: string } = {};
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

    // 2.1 Deducción de marca por prefijo de modelo
    if (!extracted.marca && extracted.modelo) {
      if (/^(DS-|HWI-|HIK-|HS-)/i.test(extracted.modelo)) extracted.marca = "HIKVISION";
      else if (/^(DH-|XVR|DHI-)/i.test(extracted.modelo)) extracted.marca = "DAHUA";
      else if (/^(K\d|MB\d|INBIO|F\d|SF\d|ZK)/i.test(extracted.modelo)) extracted.marca = "ZKTECO";
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
      else if (/nvr|dvr|camara|cámara|grabador|poe|ip|red|subred|sadp|configtool|smartpss|ivms|biotime/i.test(fullText)) extracted.tema = "Configuraciones";
    }

    const updates: Record<string, unknown> = {};
    const tema = extracted.tema?.trim() || "";
    const marca = extracted.marca?.trim() || "";
    const modelo = extracted.modelo?.trim() || "";
    const descProblema = extracted.descripcion_problema?.trim() || "";
    const extractNombre = extracted.nombre?.trim() || "";
    const extractCorreo = extracted.correo?.trim() || "";
    const extractCuenta = extracted.cuenta?.trim() || "";
    const extractVendedor = extracted.vendedor?.trim() || "";

    const currentCliente = (caseData.cliente && typeof caseData.cliente === "object") ? caseData.cliente as Record<string, unknown> : {};
    const updatedCliente: Record<string, unknown> = { ...currentCliente };
    let clienteChanged = false;

    if (extractNombre && !currentCliente.nombre) {
      updatedCliente.nombre = extractNombre;
      clienteChanged = true;
    }
    if (extractCorreo && !currentCliente.correo) {
      updatedCliente.correo = extractCorreo;
      clienteChanged = true;
    }
    if (extractCuenta && !currentCliente.cuenta) {
      updatedCliente.cuenta = extractCuenta;
      clienteChanged = true;
    }
    if (extractVendedor && !currentCliente.vendedor) {
      updatedCliente.vendedor = extractVendedor;
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

    return { ok: true, extracted: { tema, marca, modelo, descripcion_problema: descProblema, nombre: extractNombre, correo: extractCorreo, cuenta: extractCuenta } };
  } catch (err: any) {
    console.error(`[auto-extract] Error inesperado en caso ${id}:`, err?.message);
    return { ok: false, error: err?.message };
  }
}