import { createClient } from "@supabase/supabase-js";

function getMimeType(url: string, declaredType?: string): string {
  const clean = url.split("?")[0].toLowerCase();
  const ext = clean.split(".").pop() || "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    aac: "audio/aac",
    pdf: "application/pdf",
    txt: "text/plain",
    json: "application/json",
    xml: "text/xml",
    csv: "text/csv",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  if (map[ext]) return map[ext];
  if (declaredType && declaredType !== "application/octet-stream") return declaredType;
  return "image/jpeg";
}

/**
 * Analiza cualquier archivo multimedia (imagen, video, audio, PDF, texto)
 * usando Gemini Vision con Node.js Buffer nativo (sin desbordamiento de pila).
 */
export async function analyzeMedia(
  mediaUrl: string,
  mediaType?: string,
  userText = "",
  fileName = ""
): Promise<string | null> {
  if (!mediaUrl || typeof mediaUrl !== "string") return null;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    let apiKey = process.env.GEMINI_API_KEY || "";

    if (supabaseUrl && serviceKey) {
      try {
        const supabase = createClient(supabaseUrl, serviceKey);
        const { data: prov } = await supabase
          .from("sek_ai_providers")
          .select("api_key")
          .eq("id", "google")
          .maybeSingle();
        if (prov?.api_key) apiKey = prov.api_key;
      } catch {
        // Fallback a variable de entorno
      }
    }

    if (!apiKey) {
      console.warn("[vision] No se encontró API key para Google Gemini");
      return null;
    }

    const mimeType = getMimeType(mediaUrl, mediaType);
    const isImage = mimeType.startsWith("image/");
    const isAudio = mimeType.startsWith("audio/");
    const isVideo = mimeType.startsWith("video/");
    const isPdf = mimeType === "application/pdf";

    let prompt = "";
    if (isImage) {
      prompt = `Eres un ingeniero senior especializado en sistemas de seguridad electrónica (CCTV, cámaras IP, DVR/NVR, control de acceso, redes, alarmas). ${userText ? `Mensaje o consulta adjunta: "${userText}".` : ""}

Realiza un análisis técnico exhaustivo de esta imagen:

## IDENTIFICACIÓN DE EQUIPOS
- Marca visible (Hikvision, Dahua, Uniview, Ezviz, TP-Link, Ubiquiti, etc.)
- Modelo completo, número de parte o serigrafía visible
- Número de serie, MAC o firmware si aparece en pantalla o etiquetas

## ANÁLISIS VISUAL DEL PROBLEMA
- Describe EXACTAMENTE lo que se observa: pantalla, interfaz gráfica, cámaras en pantalla
- Mensajes de error literales (ej. "Unsupported stream type", "Offline", "No video", "Error de red")
- Estado de indicadores LED (color, encendido, apagado, parpadeo)
- Cableado, puertos, terminales o conexiones visibles
- Daños físicos visibles o condiciones ambientales de instalación

## DIAGNÓSTICO TÉCNICO
- Causa raíz más probable del problema
- Causas secundarias posibles
- Nivel de urgencia: CRÍTICO / ALTO / MEDIO / BAJO

## RECOMENDACIONES TÉCNICAS
- Pasos específicos ordenados por prioridad que el técnico debe verificar o realizar para resolver el problema.

Sé sumamente detallado, preciso y profesional. Transcribe cualquier texto o código relevante de la imagen.`;
    } else if (isAudio) {
      prompt = `Eres un experto técnico de Sekunet. ${userText ? `Mensaje o consulta adjunta: "${userText}".` : ""}

Transcribe COMPLETAMENTE este audio y analiza los síntomas reportados, equipos mencionados (marcas/modelos), causa probable y diagnóstico preliminar sugerido.`;
    } else if (isVideo) {
      prompt = `Eres un ingeniero senior en videovigilancia y sistemas de seguridad. ${userText ? `Mensaje o consulta adjunta: "${userText}".` : ""}

Analiza este video minuciosamente: describe la escena, equipos visibles, fallas en reproducción o transmisión, comportamiento anómalo observable, diagnóstico técnico y pasos de solución.`;
    } else if (isPdf) {
      prompt = `Eres un experto técnico de Sekunet. ${userText ? `Mensaje o consulta adjunta: "${userText}".` : ""}

Analiza este documento PDF: extrae marcas, modelos, números de serie, reportes de fallas, configuraciones técnicas y datos críticos para el soporte técnico.`;
    } else {
      prompt = `Eres un experto técnico de Sekunet. ${userText ? `Mensaje o consulta adjunta: "${userText}".` : ""}

Analiza el contenido de este archivo técnico (${fileName || mimeType}): extrae toda la información relevante de hardware, errores, configuraciones y diagnóstico para soporte.`;
    }

    const fileRes = await fetch(mediaUrl);
    if (!fileRes.ok) {
      console.warn("[vision] Error descargando archivo:", fileRes.status, mediaUrl);
      return null;
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    if (buf.byteLength > 20 * 1024 * 1024) {
      console.warn("[vision] Archivo supera 20MB:", buf.byteLength);
      return null;
    }
    const base64Data = buf.toString("base64");

    const candidateModels = ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.5-flash"];
    for (const m of candidateModels) {
      try {
        const gRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: prompt },
                  { inline_data: { mime_type: mimeType, data: base64Data } }
                ]
              }],
              generationConfig: { maxOutputTokens: 2048, temperature: 0.1 }
            })
          }
        );
        if (gRes.ok) {
          const data = await gRes.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) {
            console.log(`[vision] Análisis exitoso con modelo ${m} (${(buf.byteLength / 1024).toFixed(1)} KB)`);
            return text;
          }
        } else {
          const errTxt = await gRes.text();
          console.warn(`[vision] Gemini ${m} error:`, gRes.status, errTxt.substring(0, 120));
        }
      } catch (e: any) {
        console.warn(`[vision] Fetch error ${m}:`, e?.message);
      }
    }
    return null;
  } catch (err: any) {
    console.error("[vision] analyzeMedia exception:", err?.message);
    return null;
  }
}
