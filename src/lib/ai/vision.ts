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
const VISION_ERROR_COOLDOWN_MS = 300_000; // 5 min en visión ante 503/timeout/error
const visionCache = new Map<string, { at: number; text: string }>();
const inflightVision = new Map<string, Promise<string | null>>();
const visionCooldownUntil = new Map<string, number>();

type VisionWinner = {
  provider: "google" | "cloudflare" | "openrouter" | "nvidia";
  keyIdx: number;
  model: string;
};
let lastWinningVision: VisionWinner | null = null;

function isVisionHealthy(ck: string): boolean {
  if ((visionCooldownUntil.get(ck) ?? 0) > Date.now()) return false;
  return !isModelCooledDown(ck);
}

function markVisionFailure(ck: string, status?: number): void {
  markModelFailure(ck, status);
  if (!status || status >= 500 || status === 403 || status === 408) {
    visionCooldownUntil.set(ck, Date.now() + VISION_ERROR_COOLDOWN_MS);
  }
  if (lastWinningVision) {
    const winCk = `${lastWinningVision.provider}#${lastWinningVision.keyIdx}/${lastWinningVision.model}`;
    if (winCk === ck) lastWinningVision = null;
  }
}

function markVisionSuccess(winner: VisionWinner): void {
  const ck = `${winner.provider}#${winner.keyIdx}/${winner.model}`;
  markModelSuccess(ck);
  visionCooldownUntil.delete(ck);
  lastWinningVision = winner;
}

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

function createLinkedAbortSignal(outerSignal: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    try { ctrl.abort(); } catch {}
  }, Math.max(500, timeoutMs));
  const onOuterAbort = () => {
    try { ctrl.abort(); } catch {}
  };
  if (outerSignal) {
    if (outerSignal.aborted) {
      onOuterAbort();
    } else {
      outerSignal.addEventListener("abort", onOuterAbort, { once: true });
    }
  }
  return {
    signal: ctrl.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (outerSignal) outerSignal.removeEventListener("abort", onOuterAbort);
    },
  };
}

/**
 * Ejecuta candidatos de visión en paralelo; resuelve en cuanto el primero devuelva texto válido
 * y aborta de inmediato las demás llamadas en vuelo.
 */
function raceFirstVisionResult(
  tasks: Array<(signal: AbortSignal) => Promise<string | null>>,
  timeoutMs: number
): Promise<string | null> {
  if (tasks.length === 0 || timeoutMs <= 0) return Promise.resolve(null);
  const controller = new AbortController();
  return new Promise((resolve) => {
    let settled = false;
    let remaining = tasks.length;
    const finish = (val: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { controller.abort(); } catch {}
      resolve(val);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    for (const task of tasks) {
      Promise.resolve()
        .then(() => task(controller.signal))
        .then((res) => {
          if (res && !settled) {
            finish(res);
            return;
          }
          remaining--;
          if (remaining <= 0 && !settled) finish(null);
        })
        .catch(() => {
          remaining--;
          if (remaining <= 0 && !settled) finish(null);
        });
    }
  });
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
                generationConfig: { maxOutputTokens: 1500, temperature: 0 },
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

async function callGoogleVisionCandidate(params: {
  keyIdx: number;
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  mimeType: string;
  base64Data: string;
  byteLength: number;
  timeoutMs: number;
  outerSignal?: AbortSignal;
}): Promise<string | null> {
  const ck = `google#${params.keyIdx}/${params.model}`;
  if (!isVisionHealthy(ck)) return null;
  const { signal, cleanup } = createLinkedAbortSignal(params.outerSignal, params.timeoutMs);
  try {
    const res = await fetch(
      `${params.baseUrl.replace(/\/+$/, "")}/models/${params.model}:generateContent?key=${params.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: params.prompt },
              { inline_data: { mime_type: params.mimeType, data: params.base64Data } },
            ],
          }],
          generationConfig: { maxOutputTokens: 1100, temperature: 0.1 },
        }),
        signal,
      }
    );
    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts
        ?.filter((p: any) => !p?.thought)
        .map((p: any) => p.text)
        .filter(Boolean)
        .join("")
        .trim();
      if (text) {
        markVisionSuccess({ provider: "google", keyIdx: params.keyIdx, model: params.model });
        console.log(`[vision] ✅ Google ${params.model} (#${params.keyIdx}, ${(params.byteLength / 1024).toFixed(1)} KB)`);
        return text;
      }
      if (!params.outerSignal?.aborted) markVisionFailure(ck);
      return null;
    }
    if (!params.outerSignal?.aborted) {
      markVisionFailure(ck, res.status);
      const errTxt = await res.text().catch(() => "");
      console.warn(`[vision] Google ${params.model} (#${params.keyIdx}) error ${res.status}:`, errTxt.substring(0, 120));
    }
    return null;
  } catch (e: any) {
    if (!params.outerSignal?.aborted) {
      markVisionFailure(ck);
      console.warn(`[vision] Fetch error Google ${params.model} (#${params.keyIdx}):`, e?.message);
    }
    return null;
  } finally {
    cleanup();
  }
}

async function callOpenAiCompatibleVision(params: {
  provider: "cloudflare" | "openrouter" | "nvidia";
  keyIdx: number;
  endpoint: string;
  apiKey: string;
  model: string;
  prompt: string;
  mimeType: string;
  base64Data: string;
  label: string;
  byteLength: number;
  timeoutMs: number;
  outerSignal?: AbortSignal;
}): Promise<string | null> {
  const ck = `${params.provider}#${params.keyIdx}/${params.model}`;
  if (!isVisionHealthy(ck)) return null;
  const { signal, cleanup } = createLinkedAbortSignal(params.outerSignal, params.timeoutMs);
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
        max_tokens: 1200,
      }),
      signal,
    });

    if (res.ok) {
      const data = await res.json();
      const msg = data.choices?.[0]?.message;
      let text = String(msg?.content || "").trim();
      if (text) text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      const isReasoningLeak =
        /^(?:we need to analyze|the user wants a technical analysis|let'?s (?:analyze|look|re-read)|okay,?\s*let'?s look at)\b/i.test(
          text
        );
      if (text && !isReasoningLeak) {
        markVisionSuccess({ provider: params.provider, keyIdx: params.keyIdx, model: params.model });
        console.log(`[vision] ✅ ${params.label} (${params.model}, ${(params.byteLength / 1024).toFixed(1)} KB)`);
        return text;
      }
      if (!params.outerSignal?.aborted) markVisionFailure(ck);
      return null;
    }

    if (!params.outerSignal?.aborted) {
      markVisionFailure(ck, res.status);
      const errTxt = await res.text().catch(() => "");
      console.warn(`[vision] ${params.label} (${params.model}) error ${res.status}:`, errTxt.substring(0, 120));
    }
    return null;
  } catch (e: any) {
    if (!params.outerSignal?.aborted) {
      markVisionFailure(ck);
      console.warn(`[vision] Excepción ${params.label} (${params.model}):`, e?.message);
    }
    return null;
  } finally {
    cleanup();
  }
}

async function runAnalyzeMediaInternal(
  mediaUrl: string,
  mediaType?: string,
  userText = "",
  fileName = "",
  maxTotalMs = 20000
): Promise<string | null> {
  const totalDeadline = Date.now() + maxTotalMs;
  const cloudDeadline = Date.now() + Math.max(8000, maxTotalMs - 7000);

  try {
    const mimeType = getMimeType(mediaUrl, mediaType);
    const isImage = mimeType.startsWith("image/");
    const isAudio = mimeType.startsWith("audio/");
    const isVideo = mimeType.startsWith("video/");
    const isPdf = mimeType === "application/pdf";

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
      prompt = `Eres ingeniero senior en seguridad electrónica (CCTV, NVR/DVR, control de acceso, redes, alarmas). ${userText ? `Consulta: "${userText}".` : ""}

Responde EXCLUSIVAMENTE en español, directo al grano y sin preámbulos ni razonamiento interno. Si es una factura, etiqueta o pantalla de software, escribe primero MARCA, MODELO EXACTO y TIPO DE EQUIPO (DVR/NVR/Cámara análoga o IP), seguido de textos/errores/menús literales visibles.

1. EQUIPO: marca, modelo exacto, tipo de equipo (DVR/NVR/Cámara análoga/IP) y serie/MAC/firmware visibles.
2. PANTALLA / ERRORES: transcribe texto literal, códigos de error, IPs, puertos, estado de cámaras/LEDs o menús visibles.
3. DIAGNÓSTICO Y PASOS: causa probable y pasos técnicos puntuales por prioridad.`;
    } else if (isVideo) {
      prompt = `Eres ingeniero senior en videovigilancia. ${userText ? `Consulta: "${userText}".` : ""} Analiza este video: equipos visibles, fallas, textos o errores en pantalla, diagnóstico técnico y solución.`;
    } else if (isPdf) {
      prompt = `Eres experto técnico de Sekunet. ${userText ? `Consulta: "${userText}".` : ""} Extrae marcas, modelos, series, fallas y configuraciones críticas de este PDF.`;
    } else {
      prompt = `Eres experto técnico de Sekunet. ${userText ? `Consulta: "${userText}".` : ""} Extrae equipos, errores, configuraciones y diagnóstico de este archivo (${fileName || mimeType}).`;
    }

    const dlTimeout = Math.min(8000, Math.max(3000, cloudDeadline - Date.now()));
    const fileRes = await fetch(mediaUrl, { signal: AbortSignal.timeout(dlTimeout) });
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

    type CandidateTask = {
      ck: string;
      run: (timeoutMs: number, signal?: AbortSignal) => Promise<string | null>;
    };

    const googleTasks: CandidateTask[] = [];
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
      const googleModels = Array.from(new Set([...staticGoogle, ...discovered])).slice(0, 8);
      for (let ki = 0; ki < googleCfg.keys.length; ki++) {
        for (const m of googleModels) {
          const ck = `google#${ki}/${m}`;
          if (!isVisionHealthy(ck)) continue;
          const apiKey = googleCfg.keys[ki];
          const baseUrl = googleCfg.baseUrl;
          googleTasks.push({
            ck,
            run: (timeoutMs, outerSignal) =>
              callGoogleVisionCandidate({
                keyIdx: ki,
                apiKey,
                baseUrl,
                model: m,
                prompt,
                mimeType,
                base64Data,
                byteLength: buf.byteLength,
                timeoutMs,
                outerSignal,
              }),
          });
        }
      }
    }

    // Video y PDF solo van por Google Gemini
    if (!isImage) {
      for (const gt of googleTasks.slice(0, 4)) {
        const rem = totalDeadline - Date.now();
        if (rem < 2500) break;
        const txt = await gt.run(Math.min(14000, rem));
        if (txt) {
          setCachedVision(mediaUrl, txt);
          return txt;
        }
      }
      return null;
    }

    const canInlineUpload = buf.byteLength <= 8 * 1024 * 1024;
    const orTasks: CandidateTask[] = [];
    if (canInlineUpload && openrouterCfg && openrouterCfg.keys.length > 0) {
      const staticOrModels = [
        "google/gemma-4-31b-it:free",
        "google/gemma-4-26b-a4b-it:free",
        "inclusionai/ling-3.2-flash:free",
        "nvidia/nemotron-3.5-super-vl:free",
      ];
      const discoveredOr = (
        await discoverProviderModels("openrouter", openrouterCfg.keys[0], openrouterCfg.baseUrl, "vision")
      ).filter((id) => !/-reasoning(?::|$)/i.test(id));
      const orModels = Array.from(new Set([...staticOrModels, ...discoveredOr]))
        .filter((id) => !/-reasoning(?::|$)/i.test(id))
        .slice(0, 8);
      const endpoint = `${openrouterCfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;
      for (let ki = 0; ki < openrouterCfg.keys.length; ki++) {
        for (const orModel of orModels) {
          const ck = `openrouter#${ki}/${orModel}`;
          if (!isVisionHealthy(ck)) continue;
          const apiKey = openrouterCfg.keys[ki];
          orTasks.push({
            ck,
            run: (timeoutMs, outerSignal) =>
              callOpenAiCompatibleVision({
                provider: "openrouter",
                keyIdx: ki,
                endpoint,
                apiKey,
                model: orModel,
                prompt,
                mimeType,
                base64Data,
                label: `OpenRouter #${ki}`,
                byteLength: buf.byteLength,
                timeoutMs,
                outerSignal,
              }),
          });
        }
      }
    }

    const cfTasks: CandidateTask[] = [];
    if (canInlineUpload && cfCfg) {
      const cfModels = [
        "@cf/mistralai/mistral-small-3.1-24b-instruct",
        "@cf/meta/llama-4-scout-17b-16e-instruct",
        "@cf/qwen/qwen3.8-27b",
      ];
      for (let ki = 0; ki < cfCfg.keys.length; ki++) {
        for (const cfModel of cfModels) {
          const ck = `cloudflare#${ki}/${cfModel}`;
          if (!isVisionHealthy(ck)) continue;
          const apiKey = cfCfg.keys[ki];
          cfTasks.push({
            ck,
            run: (timeoutMs, outerSignal) =>
              callOpenAiCompatibleVision({
                provider: "cloudflare",
                keyIdx: ki,
                endpoint: `${cfCfg.baseUrl}/chat/completions`,
                apiKey,
                model: cfModel,
                prompt,
                mimeType,
                base64Data,
                label: `Cloudflare #${ki}`,
                byteLength: buf.byteLength,
                timeoutMs,
                outerSignal,
              }),
          });
        }
      }
    }

    const nvTasks: CandidateTask[] = [];
    if (canInlineUpload && nvidiaCfg && nvidiaCfg.keys.length > 0) {
      const discoveredNv = await discoverProviderModels("nvidia", nvidiaCfg.keys[0], nvidiaCfg.baseUrl, "vision");
      const nvModels = Array.from(new Set(["nvidia/nemotron-3.5-super-vl-120b-a12b", ...discoveredNv])).slice(0, 4);
      const endpoint = `${nvidiaCfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;
      for (let ki = 0; ki < nvidiaCfg.keys.length; ki++) {
        for (const nvModel of nvModels) {
          const ck = `nvidia#${ki}/${nvModel}`;
          if (!isVisionHealthy(ck)) continue;
          const apiKey = nvidiaCfg.keys[ki];
          nvTasks.push({
            ck,
            run: (timeoutMs, outerSignal) =>
              callOpenAiCompatibleVision({
                provider: "nvidia",
                keyIdx: ki,
                endpoint,
                apiKey,
                model: nvModel,
                prompt,
                mimeType,
                base64Data,
                label: `NVIDIA #${ki}`,
                byteLength: buf.byteLength,
                timeoutMs,
                outerSignal,
              }),
          });
        }
      }
    }

    const attempted = new Set<string>();
    const allByCk = new Map<string, CandidateTask>();
    for (const t of [...googleTasks, ...orTasks, ...cfTasks, ...nvTasks]) {
      allByCk.set(t.ck, t);
    }

    // Paso rápido: último modelo ganador sano (si respondió bien recientemente, ahorra llamadas paralelas)
    if (lastWinningVision) {
      const winCk = `${lastWinningVision.provider}#${lastWinningVision.keyIdx}/${lastWinningVision.model}`;
      const winTask = allByCk.get(winCk);
      const cloudRem = cloudDeadline - Date.now();
      if (winTask && isVisionHealthy(winCk) && cloudRem >= 2500) {
        attempted.add(winCk);
        const fastRes = await winTask.run(Math.min(7500, cloudRem));
        if (fastRes) {
          setCachedVision(mediaUrl, fastRes);
          return fastRes;
        }
      }
    }

    const nextUntried = (list: CandidateTask[]) => list.find((t) => !attempted.has(t.ck) && isVisionHealthy(t.ck));

    // Ola 1 en paralelo: 1er sano de Cloudflare + 1er sano de Google + 1er sano de OpenRouter :free (sin modelos reasoning)
    const cloudRem1 = cloudDeadline - Date.now();
    if (cloudRem1 >= 2000) {
      const wave1Candidates = [nextUntried(cfTasks), nextUntried(googleTasks), nextUntried(orTasks)].filter(
        (c): c is CandidateTask => Boolean(c)
      );
      wave1Candidates.forEach((c) => attempted.add(c.ck));
      const wave1Budget = Math.min(7500, cloudRem1);
      const w1Res = await raceFirstVisionResult(
        wave1Candidates.map((c) => (sig) => c.run(wave1Budget, sig)),
        wave1Budget
      );
      if (w1Res) {
        setCachedVision(mediaUrl, w1Res);
        return w1Res;
      }
    }

    // Ola 2 en paralelo: siguientes candidatos de OpenRouter :free, Cloudflare, NVIDIA NIM y Google
    const cloudRem2 = cloudDeadline - Date.now();
    if (cloudRem2 >= 2500) {
      const wave2Candidates = [
        nextUntried(orTasks),
        nextUntried(cfTasks),
        nextUntried(nvTasks),
        nextUntried(googleTasks),
      ].filter((c): c is CandidateTask => Boolean(c));
      wave2Candidates.forEach((c) => attempted.add(c.ck));
      const wave2Budget = Math.min(7500, cloudRem2);
      const w2Res = await raceFirstVisionResult(
        wave2Candidates.map((c) => (sig) => c.run(wave2Budget, sig)),
        wave2Budget
      );
      if (w2Res) {
        setCachedVision(mediaUrl, w2Res);
        return w2Res;
      }
    }

    // Red de seguridad garantizada: OCR Local Offline solo en servidor local PM2 (nunca quema CPU en Vercel)
    if (canInlineUpload && !process.env.VERCEL) {
      try {
        const ocrBudget = Math.max(6000, totalDeadline - Date.now());
        const Tesseract = await import("tesseract.js");
        const ocrRes = await Promise.race([
          Tesseract.recognize(buf, "spa+eng"),
          new Promise<null>((r) => setTimeout(() => r(null), ocrBudget)),
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

/**
 * Analiza cualquier archivo multimedia con deduplicación en vuelo, carrera paralela de proveedores
 * y presupuesto garantizado para respaldo OCR local.
 */
export async function analyzeMedia(
  mediaUrl: string,
  mediaType?: string,
  userText = "",
  fileName = "",
  maxTotalMs = 20000
): Promise<string | null> {
  if (!mediaUrl || typeof mediaUrl !== "string") return null;

  const cached = getCachedVision(mediaUrl);
  if (cached) return cached;

  const existing = inflightVision.get(mediaUrl);
  if (existing) return existing;

  const p = runAnalyzeMediaInternal(mediaUrl, mediaType, userText, fileName, maxTotalMs).finally(() => {
    inflightVision.delete(mediaUrl);
  });
  inflightVision.set(mediaUrl, p);
  return p;
}
