import { Buffer } from "node:buffer";
import {
  getProviderConfigs,
  isModelCooledDown,
  markModelFailure,
  markModelSuccess,
  discoverProviderModels,
} from "@/lib/ai/config";

const VISION_CACHE_TTL_MS = 6 * 60 * 60_000;
const VISION_CACHE_MAX = 200;
const visionCache = new Map<string, { at: number; text: string }>();

function getCachedVision(url: string): string | null {
  const hit = visionCache.get(url);
  if (!hit) return null;
  if (Date.now() - hit.at > VISION_CACHE_TTL_MS) {
    visionCache.delete(url);
    return null;
  }
  return hit.text;
}

function setCachedVision(url: string, text: string): void {
  if (!url || !text) return;
  if (visionCache.size >= VISION_CACHE_MAX) {
    const oldest = visionCache.keys().next().value;
    if (oldest) visionCache.delete(oldest);
  }
  visionCache.set(url, { at: Date.now(), text });
}

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

function findCloudflareConfig(
  provs: Map<string, { keys: string[]; baseUrl: string; activo: boolean }>
): { id: string; keys: string[]; baseUrl: string } | null {
  for (const [id, cfg] of provs.entries()) {
    if (id === "cloudflare" || id === "67d3697263e070f885c00bb2aff07a0c" || cfg.baseUrl.includes("api.cloudflare.com")) {
      if (cfg.keys.length > 0 && cfg.baseUrl) {
        return { id, keys: cfg.keys, baseUrl: cfg.baseUrl.replace(/\/+$/, "") };
      }
    }
  }
  return null;
}

/**
 * Transcribe un archivo de audio directamente usando Groq Whisper (rotación multi-llave y modelos)
 * con fallback a Google Gemini multi-llave/multi-modelo.
 */
export async function transcribeAudio(
  mediaUrl: string,
  mediaType?: string
): Promise<string | null> {
  if (!mediaUrl || typeof mediaUrl !== "string") return null;

  try {
    const provs = await getProviderConfigs();
    const groqCfg = provs.get("groq");
    const googleCfg = provs.get("google");

    const fileRes = await fetch(mediaUrl, { signal: AbortSignal.timeout(12000) });
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

    // 1. Intento primario ultra rápido con Groq Whisper (multi-llave)
    if (groqCfg && groqCfg.keys.length > 0) {
      const whisperModels = ["whisper-large-v3-turbo", "whisper-large-v3"];
      for (let ki = 0; ki < groqCfg.keys.length; ki++) {
        const key = groqCfg.keys[ki];
        for (const wm of whisperModels) {
          const ck = `groq#${ki}/${wm}`;
          if (isModelCooledDown(ck)) continue;
          try {
            const blob = new Blob([buf], { type: mediaType || "audio/ogg" });
            const formData = new FormData();
            formData.append("file", blob, "audio.ogg");
            formData.append("model", wm);
            formData.append("language", "es");

            const t0 = Date.now();
            const res = await fetch(`${groqCfg.baseUrl.replace(/\/+$/, "")}/audio/transcriptions`, {
              method: "POST",
              headers: { Authorization: `Bearer ${key}` },
              body: formData,
              signal: AbortSignal.timeout(12000),
            });

            if (res.ok) {
              const data = await res.json();
              const text = String(data?.text || "").trim();
              if (text) {
                markModelSuccess(ck);
                console.log(`[transcribe] Groq ${wm} (#${ki}) transcribió audio en ${Date.now() - t0}ms`);
                return text;
              }
            } else {
              markModelFailure(ck, res.status);
              const errBody = await res.text().catch(() => "");
              console.warn(`[transcribe] ${ck} error:`, res.status, errBody.substring(0, 100));
            }
          } catch (err: any) {
            markModelFailure(ck);
            console.warn(`[transcribe] Excepción ${ck}:`, err?.message);
          }
        }
      }
    }

    // 2. Fallback con Google Gemini multi-llave y modelos activos
    if (googleCfg && googleCfg.keys.length > 0) {
      const mimeType = getMimeType(mediaUrl, mediaType);
      const base64Data = buf.toString("base64");
      const googleModels = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3-flash-preview"];
      const base = googleCfg.baseUrl.replace(/\/+$/, "");

      for (let ki = 0; ki < googleCfg.keys.length; ki++) {
        const key = googleCfg.keys[ki];
        for (const gm of googleModels) {
          const ck = `google#${ki}/${gm}`;
          if (isModelCooledDown(ck)) continue;
          try {
            const res = await fetch(`${base}/models/${gm}:generateContent?key=${key}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: "Transcribe literalmente este audio en español. Devuelve únicamente el texto transcrito, sin explicaciones ni introducciones." },
                    { inline_data: { mime_type: mimeType, data: base64Data } },
                  ],
                }],
                generationConfig: { maxOutputTokens: 2048, temperature: 0 },
              }),
              signal: AbortSignal.timeout(15000),
            });
            if (res.ok) {
              const d = await res.json();
              const text = (d?.candidates?.[0]?.content?.parts || [])
                .filter((p: any) => !p?.thought)
                .map((p: any) => p.text)
                .filter(Boolean)
                .join("")
                .trim();
              if (text) {
                markModelSuccess(ck);
                console.log(`[transcribe] Gemini ${gm} (#${ki}) transcribió audio`);
                return text;
              }
            } else {
              markModelFailure(ck, res.status);
            }
          } catch (err: any) {
            markModelFailure(ck);
            console.warn(`[transcribe] Excepción Gemini ${gm}:`, err?.message);
          }
        }
      }
    }

    return null;
  } catch (e: any) {
    console.error("[transcribe] Error general transcribeAudio:", e?.message);
    return null;
  }
}

async function callOpenAiCompatibleVision(params: {
  ck: string;
  endpoint: string;
  apiKey: string;
  model: string;
  prompt: string;
  mimeType: string;
  base64Data: string;
  label: string;
  byteLength: number;
  timeoutMs?: number;
}): Promise<string | null> {
  if (isModelCooledDown(params.ck)) return null;
  try {
    const res = await fetch(params.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: params.prompt },
              { type: "image_url", image_url: { url: `data:${params.mimeType};base64,${params.base64Data}` } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(params.timeoutMs ?? 15000),
    });

    if (res.ok) {
      const data = await res.json();
      const msg = data.choices?.[0]?.message;
      let text = String(msg?.content || msg?.reasoning || msg?.reasoning_content || "").trim();
      if (text) text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      if (text) {
        markModelSuccess(params.ck);
        console.log(`[vision] ✅ ${params.label} (${params.model}, ${(params.byteLength / 1024).toFixed(1)} KB)`);
        return text;
      }
      markModelFailure(params.ck);
      return null;
    }

    markModelFailure(params.ck, res.status);
    const errTxt = await res.text().catch(() => "");
    console.warn(`[vision] ${params.label} (${params.model}) error ${res.status}:`, errTxt.substring(0, 120));
    return null;
  } catch (e: any) {
    markModelFailure(params.ck);
    console.warn(`[vision] Excepción ${params.label} (${params.model}):`, e?.message);
    return null;
  }
}

/**
 * Analiza cualquier archivo multimedia (imagen, video, audio, PDF, texto)
 * usando una cascada de 5 capas: Google multi-llave -> Cloudflare Vision -> OpenRouter :free -> NVIDIA NIM -> OCR local Tesseract.
 */
export async function analyzeMedia(
  mediaUrl: string,
  mediaType?: string,
  userText = "",
  fileName = ""
): Promise<string | null> {
  if (!mediaUrl || typeof mediaUrl !== "string") return null;

  const cached = getCachedVision(mediaUrl);
  if (cached) return cached;

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
        const wrapped = `Transcripción de nota de voz: "${transcription}"`;
        setCachedVision(mediaUrl, wrapped);
        return wrapped;
      }
      return null;
    }

    const provs = await getProviderConfigs();
    const googleCfg = provs.get("google");
    const cfCfg = findCloudflareConfig(provs);
    const openrouterCfg = provs.get("openrouter");
    const nvidiaCfg = provs.get("nvidia");

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

    const fileRes = await fetch(mediaUrl, { signal: AbortSignal.timeout(12000) });
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

    // 1. Nivel 1: Google Gemini directo (multi-llave + modelos prioritarios + autodescubiertos)
    if (googleCfg && googleCfg.keys.length > 0) {
      const staticGoogle = [
        "gemini-3.5-flash-lite",
        "gemini-3.8-flash",
        "gemini-3.5-flash",
        "gemini-3.7-flash",
        "gemini-3.6-flash",
        "gemini-3.1-flash-lite",
        "gemini-3-flash-preview",
      ];
      const discovered = await discoverProviderModels("google", googleCfg.keys[0], googleCfg.baseUrl, "vision");
      const googleModels = Array.from(new Set([...staticGoogle, ...discovered])).slice(0, 10);
      const base = googleCfg.baseUrl.replace(/\/+$/, "");

      for (let ki = 0; ki < googleCfg.keys.length; ki++) {
        const key = googleCfg.keys[ki];
        for (const m of googleModels) {
          const ck = `google#${ki}/${m}`;
          if (isModelCooledDown(ck)) continue;
          try {
            const gRes = await fetch(`${base}/models/${m}:generateContent?key=${key}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: prompt },
                    { inline_data: { mime_type: mimeType, data: base64Data } },
                  ],
                }],
                generationConfig: { maxOutputTokens: 2048, temperature: 0.1 },
              }),
              signal: AbortSignal.timeout(12000),
            });
            if (gRes.ok) {
              const data = await gRes.json();
              const text = data.candidates?.[0]?.content?.parts
                ?.filter((p: any) => !p?.thought)
                .map((p: any) => p.text)
                .filter(Boolean)
                .join("")
                .trim();
              if (text) {
                markModelSuccess(ck);
                console.log(`[vision] ✅ Google ${m} (#${ki}, ${(buf.byteLength / 1024).toFixed(1)} KB)`);
                setCachedVision(mediaUrl, text);
                return text;
              }
              markModelFailure(ck);
            } else {
              markModelFailure(ck, gRes.status);
              const errTxt = await gRes.text().catch(() => "");
              console.warn(`[vision] Google ${m} (#${ki}) error:`, gRes.status, errTxt.substring(0, 120));
            }
          } catch (e: any) {
            markModelFailure(ck);
            console.warn(`[vision] Fetch error Google ${m} (#${ki}):`, e?.message);
          }
        }
      }
    }

    // 2. Nivel 2: Cloudflare Workers AI Vision (10,000 neuronas gratis/día)
    if (isImage && cfCfg && buf.byteLength <= 8 * 1024 * 1024) {
      const cfModels = [
        "@cf/mistralai/mistral-small-3.1-24b-instruct",
        "@cf/meta/llama-4-scout-17b-16e-instruct",
        "@cf/qwen/qwen3.8-27b",
        "@cf/meta/llama-3.2-11b-vision-instruct",
      ];
      for (let ki = 0; ki < cfCfg.keys.length; ki++) {
        const key = cfCfg.keys[ki];
        for (const cfModel of cfModels) {
          const text = await callOpenAiCompatibleVision({
            ck: `cloudflare#${ki}/${cfModel}`,
            endpoint: `${cfCfg.baseUrl}/chat/completions`,
            apiKey: key,
            model: cfModel,
            prompt,
            mimeType,
            base64Data,
            label: `Cloudflare #${ki}`,
            byteLength: buf.byteLength,
            timeoutMs: 15000,
          });
          if (text) {
            setCachedVision(mediaUrl, text);
            return text;
          }
        }
      }
    }

    // 3. Nivel 3: OpenRouter Vision (:free estáticos + autodescubiertos)
    if (isImage && openrouterCfg && openrouterCfg.keys.length > 0 && buf.byteLength <= 8 * 1024 * 1024) {
      const staticOrModels = [
        "nvidia/nemotron-3.5-super-vl:free",
        "inclusionai/ling-3.2-flash:free",
        "google/gemma-4-31b-it:free",
      ];
      const discoveredOr = await discoverProviderModels("openrouter", openrouterCfg.keys[0], openrouterCfg.baseUrl, "vision");
      const orModels = Array.from(new Set([...staticOrModels, ...discoveredOr, "qwen/qwen2.5-vl-72b-instruct"])).slice(0, 8);
      const endpoint = `${openrouterCfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;

      for (let ki = 0; ki < openrouterCfg.keys.length; ki++) {
        const key = openrouterCfg.keys[ki];
        for (const orModel of orModels) {
          const text = await callOpenAiCompatibleVision({
            ck: `openrouter#${ki}/${orModel}`,
            endpoint,
            apiKey: key,
            model: orModel,
            prompt,
            mimeType,
            base64Data,
            label: `OpenRouter #${ki}`,
            byteLength: buf.byteLength,
            timeoutMs: 15000,
          });
          if (text) {
            setCachedVision(mediaUrl, text);
            return text;
          }
        }
      }
    }

    // 4. Nivel 4: NVIDIA NIM Direct Vision
    if (isImage && nvidiaCfg && nvidiaCfg.keys.length > 0 && buf.byteLength <= 8 * 1024 * 1024) {
      const discoveredNv = await discoverProviderModels("nvidia", nvidiaCfg.keys[0], nvidiaCfg.baseUrl, "vision");
      const nvModels = Array.from(new Set(["nvidia/nemotron-3.5-super-vl-120b-a12b", ...discoveredNv])).slice(0, 4);
      const endpoint = `${nvidiaCfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;

      for (let ki = 0; ki < nvidiaCfg.keys.length; ki++) {
        const key = nvidiaCfg.keys[ki];
        for (const nvModel of nvModels) {
          const text = await callOpenAiCompatibleVision({
            ck: `nvidia#${ki}/${nvModel}`,
            endpoint,
            apiKey: key,
            model: nvModel,
            prompt,
            mimeType,
            base64Data,
            label: `NVIDIA #${ki}`,
            byteLength: buf.byteLength,
            timeoutMs: 15000,
          });
          if (text) {
            setCachedVision(mediaUrl, text);
            return text;
          }
        }
      }
    }

    // 5. Nivel 5: OCR Local Offline (tesseract.js v7) — red de seguridad gratuita que nunca caduca
    if (isImage && buf.byteLength <= 8 * 1024 * 1024) {
      try {
        const Tesseract = await import("tesseract.js");
        const ocrRes = await Promise.race([
          Tesseract.recognize(buf, "spa+eng"),
          new Promise<null>((r) => setTimeout(() => r(null), 14000)),
        ]);
        const cleanOcr = String((ocrRes as any)?.data?.text || "")
          .replace(/\r/g, "")
          .replace(/[ \t]+/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        if (cleanOcr.length >= 12) {
          const result = `[LECTURA OCR LOCAL DE CAPTURA (respaldo automático sin nube)]\nTexto literal visible en la imagen:\n${cleanOcr.slice(0, 2200)}\n\nNota técnica: usar los modelos, puertos, IPs, códigos de error y menús leídos literalmente arriba para diagnosticar.`;
          console.log(`[vision] ✅ OCR Local Tesseract extrajo ${cleanOcr.length} chars`);
          setCachedVision(mediaUrl, result);
          return result;
        }
      } catch (ocrErr: any) {
        console.warn("[vision] Error en OCR local Tesseract:", ocrErr?.message);
      }
    }

    return null;
  } catch (err: any) {
    console.error("[vision] analyzeMedia exception:", err?.message);
    return null;
  }
}
