import { createServiceClient } from "@/lib/supabase/service";
import { getModel } from "@/lib/ai/config";

const TEMAS_VALIDOS = [
  "Configuraciones", "Reset", "Desvinculación", "Firmware",
  "Software", "Licencias", "Otro"
];

const temaToProblema: Record<string, string> = {
  "Configuraciones": "configuracion",
  "Reset": "reset_contrasena",
  "Desvinculación": "desvinculacion_cuenta",
  "Firmware": "actualizacion_firmware",
  "Software": "software",
  "Licencias": "licencias",
  "Otro": "otro",
};

export async function performAutoExtract(id: string) {
  try {
    const supabase = createServiceClient();

    const { data: caseData, error: fetchError } = await supabase
      .from("sek_cases")
      .select("id, title, problema, marca, modelo, tags, histcliente, histtecnico, cliente")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !caseData) {
      return { ok: false, error: "Caso no encontrado" };
    }

    const cli = (caseData.cliente && typeof caseData.cliente === "object") ? caseData.cliente as Record<string, unknown> : {};
    const hasEquipmentData = caseData.problema && caseData.marca;
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

    const aiModel = await getModel("extract");

    const prompt = `Eres un analista de soporte técnico de Sekunet (Costa Rica). Analiza la siguiente conversación de WhatsApp entre un cliente y un agente de soporte, y extrae los datos técnicos y de contacto:

1. "nombre": El nombre completo del cliente (nombre y apellido).
2. "correo": El correo electrónico del cliente. Solo si contiene @. Si el cliente dijo que no tiene, pon "Sin correo".
3. "cuenta": El nombre de la empresa, negocio o cuenta afiliada a Sekunet.
   REGLA DE CUENTA AFILIADA:
   - Muchos instaladores independientes o clientes finales tienen la cuenta registrada a su propio nombre personal.
   - Si el cliente responde con su nombre dos veces (ej: "Nombre \n correo \n Nombre"), o si indica que la cuenta está a nombre propio, asigna ese mismo nombre como "cuenta". NO lo dejes vacío.
   - Si menciona una empresa (ej: "Sistemas DJC", "Coopesantos", "RIMTEC"), pon la empresa.
   - Si dice que no tiene cuenta, pon "Sin cuenta".
4. "vendedor": Nombre del vendedor o agente comercial encargado de su cuenta (si lo menciona).
5. "tema": El tema principal de la consulta. Debe ser exactamente uno de: ${TEMAS_VALIDOS.join(", ")}. Si no se planteó problema antes de cerrar, pon "Otro".
6. "marca": La marca del equipo mencionado (ej: HIKVISION, Dahua, Epcom, ZKTeco). Si no se menciona, deja vacío.
7. "modelo": El modelo del equipo (ej: DS-2CD2043G2-I, NVR-108MH, IPC-T221H). Si no se menciona, deja vacío.
8. "descripcion_problema": Un resumen breve del problema o motivo de cierre (máximo 200 caracteres).

DATOS ACTUALES DEL CLIENTE:
- nombre: ${String(cli.nombre || "")}
- correo: ${String(cli.correo || "")}
- cuenta: ${String(cli.cuenta || "")}

CONVERSACIÓN:
${conversationText}

Responde SOLO en formato JSON:
{"nombre": "...", "correo": "...", "cuenta": "...", "vendedor": "...", "tema": "...", "marca": "...", "modelo": "...", "descripcion_problema": "..."}`;

    let rawContent = "";
    const apiKey = aiModel?.apiKey || process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
          }),
          signal: AbortSignal.timeout(25000),
        });
        if (res.ok) {
          const data = await res.json();
          rawContent = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("") || "";
        }
      } catch (e: any) {
        console.warn("[auto-extract] Gemini fetch error:", e?.message);
      }
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

    // Fallback por regex si la IA no extrajo
    const fullText = allMsgs.map(m => m.content).join("\n");
    if (!extracted.correo) {
      const emailMatch = fullText.match(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) extracted.correo = emailMatch[0];
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

    if (descProblema && !caseData.problema) {
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