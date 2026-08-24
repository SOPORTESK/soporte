import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getModel } from "@/lib/ai/config";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServiceClient();
    const id = params.id;

    // Ya no saltamos cuando el bot está ON: los casos escalados igual necesitan
    // extracción de tema/marca/modelo y normalización de datos del cliente.

    // Obtener el caso con historial
    const { data: caseData, error: fetchError } = await supabase
      .from("sek_cases")
      .select("id, title, problema, marca, modelo, tags, histcliente, histtecnico, cliente")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !caseData) {
      return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
    }

    // Si ya tiene tema/marca/modelo Y datos del cliente completos, no hacer nada
    const cli = (caseData.cliente && typeof caseData.cliente === "object") ? caseData.cliente as Record<string, unknown> : {};
    const hasEquipmentData = caseData.problema && caseData.marca;
    const hasClientData = !!(cli.nombre && (cli.correo || cli.cuenta));
    if (hasEquipmentData && hasClientData) {
      return NextResponse.json({ ok: true, skipped: true, reason: "already_has_data" });
    }

    // Construir texto del historial para analizar
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
      return NextResponse.json({ ok: true, skipped: true, reason: "no_history" });
    }

    const conversationText = allMsgs
      .map(m => `${m.role === "user" ? "Cliente" : "Agente/IA"}: ${m.content.slice(0, 500)}`)
      .join("\n")
      .slice(0, 4000);

    // Modelo configurable desde /admin/agente-ia (rol "extract")
    const aiModel = await getModel("extract");

    const TEMAS_VALIDOS = [
      "Reset", "Desvinculación", "Configuración", "Visualización",
      "Cobros", "Garantía", "Asistencia Remota", "Otro"
    ];

    // ── Fallback sin modelo de IA: extracción por regex de datos del cliente ──
    if (!aiModel) {
      console.warn("[auto-extract] sin modelo configurado para el rol 'extract' — usando extracción por regex");
      
      const fullText = allMsgs.map(m => m.content).join("\n");
      const extracted: { nombre?: string; correo?: string; cuenta?: string; tema?: string; marca?: string; modelo?: string; descripcion_problema?: string } = {};

      // Correo: patrón estándar
      const emailMatch = fullText.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (emailMatch) extracted.correo = emailMatch[0];

      // Nombre: buscar líneas que parezcan "Nombre Apellido" (2-4 palabras, sin números, sin @)
      const lines = fullText.split(/\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        // Patrón: 2-5 palabras, solo letras y espacios, sin números ni símbolos
        if (/^[A-Za-zÀ-ÿ]{2,}(\s+[A-Za-zÀ-ÿ]{2,}){1,4}$/.test(trimmed) && !trimmed.includes("@")) {
          // Evitar que sea un nombre de agente (buscar en histtecnico)
          const isAgentName = histTecnico.some((m: any) => {
            const c = typeof m.content === "string" ? m.content : "";
            return c.includes(trimmed);
          });
          if (!isAgentName) {
            extracted.nombre = trimmed;
            break;
          }
        }
      }

      // Tema por palabras clave
      const lowerText = fullText.toLowerCase();
      if (lowerText.includes("reset") || lowerText.includes("contrase")) extracted.tema = "Reset";
      else if (lowerText.includes("desvincul") || lowerText.includes("desvinculac")) extracted.tema = "Desvinculación";
      else if (lowerText.includes("configur")) extracted.tema = "Configuración";
      else if (lowerText.includes("visual") || lowerText.includes("ver") || lowerText.includes("imagen")) extracted.tema = "Visualización";
      else if (lowerText.includes("cobr") || lowerText.includes("pago") || lowerText.includes("factur")) extracted.tema = "Cobros";
      else if (lowerText.includes("garant")) extracted.tema = "Garantía";
      else if (lowerText.includes("remot") || lowerText.includes("asistenc")) extracted.tema = "Asistencia Remota";
      else extracted.tema = "Otro";

      // Marca por palabras clave
      const marcas = ["hikvision", "dahua", "epcom", "zkteco", "hilook", "tenda"];
      for (const m of marcas) {
        if (lowerText.includes(m)) { extracted.marca = m.charAt(0).toUpperCase() + m.slice(1); break; }
      }

      // Aplicar extracción al caso
      const extractNombre = extracted.nombre?.trim() || "";
      const extractCorreo = extracted.correo?.trim() || "";
      const extractCuenta = extracted.cuenta?.trim() || "";
      const tema = extracted.tema?.trim() || "";
      const marca = extracted.marca?.trim() || "";

      const updatedCliente: Record<string, unknown> = { ...cli };
      let clienteChanged = false;
      if (extractNombre && !cli.nombre) { updatedCliente.nombre = extractNombre; clienteChanged = true; }
      if (extractCorreo && !cli.correo) { updatedCliente.correo = extractCorreo; clienteChanged = true; }

      const updates: Record<string, unknown> = {};
      if (clienteChanged) updates.cliente = updatedCliente;
      
      const temaToProblema: Record<string, string> = {
        "Reset": "reset", "Desvinculación": "desvinculacion", "Configuración": "configuracion",
        "Visualización": "visualizacion", "Cobros": "cobros", "Garantía": "garantia",
        "Asistencia Remota": "asistencia_remota", "Otro": "otro",
      };
      if (tema && TEMAS_VALIDOS.includes(tema)) updates.problema = temaToProblema[tema];
      if (marca) updates.marca = marca;

      if (Object.keys(updates).length === 0) {
        console.log("[auto-extract] Regex fallback: no se extrajeron datos");
        return NextResponse.json({ ok: true, skipped: true, reason: "no_data_extracted_regex" });
      }

      const { error: updateError } = await supabase.from("sek_cases").update(updates).eq("id", id);
      if (updateError) {
        console.error("[auto-extract] Regex update error:", updateError.message);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      console.log(`[auto-extract] Regex fallback OK: nombre=${extractNombre || "N/A"}, correo=${extractCorreo || "N/A"}, tema=${tema || "N/A"}, marca=${marca || "N/A"}`);
      return NextResponse.json({ ok: true, extracted: { nombre: extractNombre, correo: extractCorreo, tema, marca }, method: "regex" });
    }

    const prompt = `Eres un analista de soporte técnico de Sekunet (Costa Rica). Analiza la siguiente conversación de WhatsApp entre un cliente y un agente de soporte, y extrae:

1. "nombre": El nombre completo del cliente (nombre y apellido). Solo si el cliente lo dijo explícitamente. Si no, deja vacío.
2. "correo": El correo electrónico del cliente. Solo si contiene @. Si el cliente dijo que no tiene, pon "Sin correo". Si no se menciona, deja vacío.
3. "cuenta": El nombre de la empresa o cuenta afiliada a Sekunet. Solo si el cliente lo dijo explícitamente. Si dijo que no tiene, pon "Sin cuenta". Si no se menciona, deja vacío.
4. "tema": El tema principal de la consulta. Debe ser uno de: ${TEMAS_VALIDOS.join(", ")}. Si no puedes determinarlo, deja vacío.
5. "marca": La marca del equipo mencionado (ej: HIKVISION, Dahua, Epcom, ZKTeco). Si no se menciona, deja vacío.
6. "modelo": El modelo del equipo (ej: DS-2CD2043G2-I, NVR-108MH, IPC-T221H). Si no se menciona, deja vacío.
7. "descripcion_problema": Un resumen breve del problema o consulta (máximo 200 caracteres).

Reglas:
- Si el cliente envió un código como "DS-3E0505P-E-M", "NVR-108MH", "IPC-T221H", eso es un MODELO, no una marca.
- Si el cliente envió una sola palabra como "Hikvision", "Dahua", "Epcom", "ZKTeco", eso es una MARCA.
- NO inventes datos. Solo extrae lo que esté explícito en la conversación.
- NO extraigas el nombre de un correo o cuenta a partir del texto de otro campo.
- Si un campo ya tiene valor en los DATOS ACTUALES y la conversación no aporta uno nuevo, mantén el valor existente.

DATOS ACTUALES DEL CLIENTE:
- nombre: ${String(cli.nombre || "")}
- correo: ${String(cli.correo || "")}
- cuenta: ${String(cli.cuenta || "")}

CONVERSACIÓN:
${conversationText}

Responde SOLO en formato JSON:
{"nombre": "...", "correo": "...", "cuenta": "...", "tema": "...", "marca": "...", "modelo": "...", "descripcion_problema": "..."}`;

    // El proveedor puede ser Gemini (formato propio) u OpenAI-compatible
    let rawContent = "";
    try {
      if (aiModel.provider === "google") {
        const res = await fetch(`${aiModel.baseUrl}/models/${aiModel.modelo}:generateContent?key=${aiModel.apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
          }),
          signal: AbortSignal.timeout(25000),
        });
        if (!res.ok) {
          console.error("[auto-extract] error de IA:", (await res.text()).slice(0, 300));
          return NextResponse.json({ error: "AI extraction failed" }, { status: 500 });
        }
        const data = await res.json();
        rawContent = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("") || "";
      } else {
        const res = await fetch(`${aiModel.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${aiModel.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: aiModel.modelo,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1,
            max_tokens: 500,
          }),
          signal: AbortSignal.timeout(25000),
        });
        if (!res.ok) {
          console.error("[auto-extract] error de IA:", (await res.text()).slice(0, 300));
          return NextResponse.json({ error: "AI extraction failed" }, { status: 500 });
        }
        const data = await res.json();
        rawContent = data.choices?.[0]?.message?.content || "";
      }
    } catch (e: any) {
      console.error("[auto-extract] fetch error:", e?.message);
      return NextResponse.json({ error: "AI extraction failed" }, { status: 500 });
    }

    // Parsear la respuesta JSON
    let extracted: { nombre?: string; correo?: string; cuenta?: string; tema?: string; marca?: string; modelo?: string; descripcion_problema?: string } = {};
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      console.error("[auto-extract] Failed to parse AI response:", rawContent);
      return NextResponse.json({ error: "Parse failed" }, { status: 500 });
    }

    // Mapear tema a problema key
    const temaToProblema: Record<string, string> = {
      "Reset": "reset",
      "Desvinculación": "desvinculacion",
      "Configuración": "configuracion",
      "Visualización": "visualizacion",
      "Cobros": "cobros",
      "Garantía": "garantia",
      "Asistencia Remota": "asistencia_remota",
      "Otro": "otro",
    };

    // Construir updates
    const updates: Record<string, unknown> = {};
    const tema = extracted.tema?.trim() || "";
    const marca = extracted.marca?.trim() || "";
    const modelo = extracted.modelo?.trim() || "";
    const descProblema = extracted.descripcion_problema?.trim() || "";
    const extractNombre = extracted.nombre?.trim() || "";
    const extractCorreo = extracted.correo?.trim() || "";
    const extractCuenta = extracted.cuenta?.trim() || "";

    // Actualizar datos del cliente (sin pisar los que ya existen)
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
    if (descProblema && !currentCliente.descripcion) {
      updatedCliente.descripcion = descProblema;
      clienteChanged = true;
    }

    if (clienteChanged) {
      updates.cliente = updatedCliente;
    }

    if (tema && TEMAS_VALIDOS.includes(tema)) {
      updates.problema = temaToProblema[tema] || tema.toLowerCase();
    }
    if (marca) {
      updates.marca = marca;
    }
    if (modelo) {
      updates.modelo = modelo;
    }

    // Actualizar título si tenemos tema y/o marca+modelo
    const titleParts: string[] = [];
    if (tema) titleParts.push(tema);
    if (marca && modelo) titleParts.push(`${marca} ${modelo}`);
    else if (marca) titleParts.push(marca);
    if (titleParts.length > 0) {
      updates.title = titleParts.join(" — ").substring(0, 120);
    }

    // Tags basados en tema
    if (tema) {
      const existingTags = Array.isArray(caseData.tags) ? caseData.tags : [];
      const temaTag = temaToProblema[tema] || tema.toLowerCase();
      if (!existingTags.includes(temaTag)) {
        updates.tags = [...existingTags, temaTag];
      }
    }

    // Descripción del problema como resolucion si no hay
    if (descProblema && !caseData.problema) {
      updates.resolucion = descProblema;
    }

    if (Object.keys(updates).length === 0) {
      console.log("[auto-extract] No se extrajeron datos útiles");
      return NextResponse.json({ ok: true, skipped: true, reason: "no_data_extracted" });
    }

    const { error: updateError } = await supabase
      .from("sek_cases")
      .update(updates)
      .eq("id", id);

    if (updateError) {
      console.error("[auto-extract] Update error:", updateError.message);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    console.log(`[auto-extract] Caso ${id} actualizado: tema=${tema || "N/A"}, marca=${marca || "N/A"}, modelo=${modelo || "N/A"}, nombre=${extractNombre || "N/A"}, correo=${extractCorreo || "N/A"}, cuenta=${extractCuenta || "N/A"}`);
    return NextResponse.json({ ok: true, extracted: { tema, marca, modelo, descripcion_problema: descProblema, nombre: extractNombre, correo: extractCorreo, cuenta: extractCuenta } });

  } catch (e: any) {
    console.error("[auto-extract] Exception:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
