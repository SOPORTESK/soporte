import { createClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";

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
    opus: "audio/ogg",
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
 * Transcribe un archivo de audio directamente usando Groq Whisper (ultra rápido y preciso en español).
 * Con fallback a Google Gemini en caso de contingencia.
 */
export async function transcribeAudio(
  mediaUrl: string,
  mediaType?: string
): Promise<string | null> {
  if (!mediaUrl || typeof mediaUrl !== "string") return null;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    let groqKey = process.env.GROQ_API_KEY || "";
    let googleKey = process.env.GEMINI_API_KEY || "";

    if (supabaseUrl && serviceKey) {
      try {
        const supabase = createClient(supabaseUrl, serviceKey);
        const { data: provs } = await supabase
          .from("sek_ai_providers")
          .select("id, api_key")
          .in("id", ["groq", "google"]);
        if (provs) {
          for (const p of provs) {
            if (p.id === "groq" && p.api_key) groqKey = p.api_key;
            if (p.id === "google" && p.api_key) googleKey = p.api_key;
          }
        }
      } catch {}
    }

    const fileRes = await fetch(mediaUrl);
    if (!fileRes.ok) {
      console.warn("[transcribe] Error descargando audio:", fileRes.status, mediaUrl);
      return null;
    }

    const arrayBuf = await fileRes.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    if (buf.byteLength > 25 * 1024 * 1024) {
      console.warn("[transcribe] Audio supera 25MB:", buf.byteLength);
      return null;
    }

    // 1. Intento primario ultra rápido con Groq Whisper
    if (groqKey) {
      try {
        const blob = new Blob([buf], { type: mediaType || "audio/ogg" });
        const formData = new FormData();
        formData.append("file", blob, "audio.ogg");
        formData.append("model", "whisper-large-v3");
        formData.append("language", "es");

        const t0 = Date.now();
        const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}` },
          body: formData,
          signal: AbortSignal.timeout(12000),
        });

        if (res.ok) {
          const data = await res.json();
          const text = String(data?.text || "").trim();
          if (text) {
            console.log(`[transcribe] Groq Whisper transcribió audio en ${Date.now() - t0}ms: "${text.substring(0, 60)}..."`);
            return text;
          }
        } else {
          const errBody = await res.text().catch(() => "");
          console.warn("[transcribe] Groq Whisper error:", res.status, errBody.substring(0, 100));
        }
      } catch (err: any) {
        console.warn("[transcribe] Excepción Groq Whisper:", err?.message);
      }
    }

    // 2. Fallback con Google Gemini
    if (googleKey) {
      try {
        const mimeType = getMimeType(mediaUrl, mediaType);
        const base64Data = buf.toString("base64");
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${googleKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: "Transcribe literalmente este audio en español. Devuelve únicamente el texto transcrito, sin explicaciones ni introducciones." },
                  { inline_data: { mime_type: mimeType, data: base64Data } }
                ]
              }],
              generationConfig: { maxOutputTokens: 2048, temperature: 0 }
            }),
            signal: AbortSignal.timeout(15000),
          }
        );
        if (res.ok) {
          const d = await res.json();
          const text = String(d?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
          if (text) {
            console.log(`[transcribe] Gemini transcribió audio: "${text.substring(0, 60)}..."`);
            return text;
          }
        }
      } catch (err: any) {
        console.warn("[transcribe] Excepción Gemini transcribe:", err?.message);
      }
    }

    return null;
  } catch (e: any) {
    console.error("[transcribe] Error general transcribeAudio:", e?.message);
    return null;
  }
}

/**
 * Analiza cualquier archivo multimedia (imagen, video, audio, PDF, texto)
 * usando Groq Whisper para audio o Gemini Vision para imágenes/video.
 */
export async function analyzeMedia(
  mediaUrl: string,
  mediaType?: string,
  userText = "",
  fileName = ""
): Promise<string | null> {
  if (!mediaUrl || typeof mediaUrl !== "string") return null;

  try {
    const mimeType = getMimeType(mediaUrl, mediaType);
    const isImage = mimeType.startsWith("image/");
    const isAudio = mimeType.startsWith("audio/");
    const isVideo = mimeType.startsWith("video/");
    const isPdf = mimeType === "application/pdf";

    // Si es audio, transcribirlo directamente con Groq Whisper / Gemini
    if (isAudio) {
      const transcription = await transcribeAudio(mediaUrl, mimeType);
      if (transcription) {
        return `Transcripción de nota de voz: "${transcription}"`;
      }
      return null;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    let googleKey = process.env.GEMINI_API_KEY || "";
    let groqKey = process.env.GROQ_API_KEY || "";
    let openrouterKey = process.env.OPENROUTER_API_KEY || "";

    if (supabaseUrl && serviceKey) {
      try {
        const supabase = createClient(supabaseUrl, serviceKey);
        const { data: provs } = await supabase
          .from("sek_ai_providers")
          .select("id, api_key")
          .in("id", ["google", "groq", "openrouter"]);
        if (provs) {
          for (const p of provs) {
            if (p.id === "google" && p.api_key) googleKey = p.api_key;
            if (p.id === "groq" && p.api_key) groqKey = p.api_key;
            if (p.id === "openrouter" && p.api_key) openrouterKey = p.api_key;
          }
        }
      } catch {
        // Fallback a variables de entorno
      }
    }

    if (!googleKey && !groqKey && !openrouterKey) {
      console.warn("[vision] No se encontró ninguna API key disponible para análisis visual");
      return null;
    }

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

    // 1. Intentar con modelos de Google Gemini (soportan imagen, video y PDF)
    if (googleKey) {
      const candidateModels = ["gemini-3-flash-preview", "gemini-flash-latest", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
      for (const m of candidateModels) {
        try {
          const gRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${googleKey}`,
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
              }),
              signal: AbortSignal.timeout(15000),
            }
          );
          if (gRes.ok) {
            const data = await gRes.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (text) {
              console.log(`[vision] Análisis exitoso con Google ${m} (${(buf.byteLength / 1024).toFixed(1)} KB)`);
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
    }

    // 2. Respaldo de Visión con Groq (Llama 4 Scout Vision) para imágenes si Google falla
    if (isImage && groqKey && buf.byteLength <= 4 * 1024 * 1024) {
      try {
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: "llama-3.2-11b-vision-preview",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } },
                ],
              },
            ],
            temperature: 0.1,
            max_tokens: 1500,
          }),
          signal: AbortSignal.timeout(12000),
        });
        if (groqRes.ok) {
          const data = await groqRes.json();
          const text = data.choices?.[0]?.message?.content?.trim();
          if (text) {
            console.log(`[vision] Análisis exitoso con Groq Llama-4-Scout (${(buf.byteLength / 1024).toFixed(1)} KB)`);
            return text;
          }
        } else {
          const errTxt = await groqRes.text().catch(() => "");
          console.warn("[vision] Groq Vision error:", groqRes.status, errTxt.substring(0, 120));
        }
      } catch (e: any) {
        console.warn("[vision] Excepción Groq Vision:", e?.message);
      }
    }

    // 3. Tercer respaldo con OpenRouter Vision (Gemma 3 27B Free)
    if (isImage && openrouterKey && buf.byteLength <= 8 * 1024 * 1024) {
      try {
        const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openrouterKey}`,
          },
          body: JSON.stringify({
            model: "google/gemma-3-27b-it:free",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } },
                ],
              },
            ],
            temperature: 0.1,
            max_tokens: 1500,
          }),
          signal: AbortSignal.timeout(12000),
        });
        if (orRes.ok) {
          const data = await orRes.json();
          const text = data.choices?.[0]?.message?.content?.trim();
          if (text) {
            console.log(`[vision] Análisis exitoso con OpenRouter Gemma-3-27B (${(buf.byteLength / 1024).toFixed(1)} KB)`);
            return text;
          }
        }
      } catch (e: any) {
        console.warn("[vision] Excepción OpenRouter Vision:", e?.message);
      }
    }
    return null;
  } catch (err: any) {
    console.error("[vision] analyzeMedia exception:", err?.message);
    return null;
  }
}
