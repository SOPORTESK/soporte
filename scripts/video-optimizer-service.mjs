import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const PORT = process.env.PORT || 8095;
const AUTH_SECRET = process.env.OPTIMIZER_SECRET || "sekunet_video_opt_2026_secure_key_x99";

const MEDIA_HKDF_INFO = {
  image: "WhatsApp Image Keys",
  video: "WhatsApp Video Keys",
  audio: "WhatsApp Audio Keys",
  document: "WhatsApp Document Keys",
};

function mediaKeyToBuffer(mediaKey) {
  if (!mediaKey) return null;
  if (Buffer.isBuffer(mediaKey)) return mediaKey;
  if (typeof mediaKey === "string") {
    try { return Buffer.from(mediaKey, "base64"); } catch { return null; }
  }
  if (mediaKey?.data && Array.isArray(mediaKey.data)) {
    return Buffer.from(mediaKey.data);
  }
  if (typeof mediaKey === "object") {
    try {
      const vals = Object.values(mediaKey);
      if (vals.length > 0 && typeof vals[0] === "number") {
        return Buffer.from(vals);
      }
    } catch {}
  }
  return null;
}

function hkdfExpand(keyBuf, length, info) {
  const ab = crypto.hkdfSync("sha256", keyBuf, Buffer.alloc(0), Buffer.from(info, "utf8"), length);
  return Buffer.from(ab);
}

async function decryptWhatsAppMedia(encUrl, mediaKey, type = "video") {
  const keyBuf = mediaKeyToBuffer(mediaKey);
  if (!keyBuf) throw new Error("Invalid or missing mediaKey buffer");

  const info = MEDIA_HKDF_INFO[type] || MEDIA_HKDF_INFO.video;
  const expanded = hkdfExpand(keyBuf, 112, info);
  const iv = expanded.subarray(0, 16);
  const cipherKey = expanded.subarray(16, 48);

  console.log(`[optimizer] Descargando media encriptada desde WhatsApp CDN...`);
  const res = await fetch(encUrl, {
    headers: {
      "User-Agent": "WhatsApp/2.24.12.78 i",
      "Accept": "*/*",
    },
  });

  if (!res.ok) {
    throw new Error(`Fallo descarga WhatsApp CDN: HTTP ${res.status}`);
  }

  const enc = Buffer.from(await res.arrayBuffer());
  if (enc.length <= 10) throw new Error("Payload encriptado demasiado pequeño");

  // Los últimos 10 bytes son el MAC; el resto es el ciphertext
  const cipherText = enc.subarray(0, enc.length - 10);
  const decipher = crypto.createDecipheriv("aes-256-cbc", cipherKey, iv);
  const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  console.log(`[optimizer] Desencriptación exitosa: ${decrypted.length} bytes`);
  return decrypted;
}

async function transcodeMedia(inputPath, outputPath, mediaCategory = "video") {
  console.log(`[optimizer] Procesando ${mediaCategory} con ffmpeg: ${inputPath} -> ${outputPath}`);
  const startTime = Date.now();
  let cmd = "";

  if (mediaCategory === "video") {
    // Escala a max 720p (1280 ancho), H.264 CRF 26, AAC 128k, faststart para streaming instantáneo
    cmd = `ffmpeg -y -i "${inputPath}" -vf "scale='min(1280,iw)':-2" -c:v libx264 -crf 26 -preset veryfast -c:a aac -b:a 128k -movflags +faststart "${outputPath}"`;
  } else if (mediaCategory === "audio") {
    // Optimiza audio a AAC 128k estéreo
    cmd = `ffmpeg -y -i "${inputPath}" -c:a aac -b:a 128k "${outputPath}"`;
  } else if (mediaCategory === "image") {
    // Escala imágenes gigantes a max 2560px de ancho con alta calidad
    cmd = `ffmpeg -y -i "${inputPath}" -vf "scale='min(2560,iw)':-2" -q:v 2 "${outputPath}"`;
  } else {
    // Documento u otro: copia directa sin transcodificación
    fs.copyFileSync(inputPath, outputPath);
    return;
  }

  const { stdout, stderr } = await execAsync(cmd, { timeout: 120000 });
  const durationMs = Date.now() - startTime;
  console.log(`[optimizer] ffmpeg finalizado en ${durationMs}ms para ${mediaCategory}`);
}

async function uploadToSupabaseStorage(supabaseUrl, supabaseKey, fileName, filePath, contentType = "application/octet-stream") {
  console.log(`[optimizer] Subiendo archivo a Supabase Storage: cases/evolution/${fileName} (${contentType})`);
  const fileStream = fs.createReadStream(filePath);
  const stats = fs.statSync(filePath);
  const uploadUrl = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/attachments/cases/evolution/${fileName}`;

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${supabaseKey}`,
      "apikey": supabaseKey,
      "Content-Type": contentType,
      "x-upsert": "true",
      "Content-Length": String(stats.size),
    },
    body: fileStream,
    duplex: "half",
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Error subiendo a Supabase Storage: HTTP ${res.status} - ${errText}`);
  }

  const publicUrl = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/attachments/cases/evolution/${fileName}`;
  console.log(`[optimizer] Subida exitosa a Supabase Storage: ${publicUrl} (${stats.size} bytes)`);
  return { publicUrl, size: stats.size };
}

async function updateCaseInSupabase(supabaseUrl, supabaseKey, caseId, messageId, publicUrl, fileName, targetMime = "video/mp4") {
  console.log(`[optimizer] Actualizando sek_cases para caseId: ${caseId}, messageId: ${messageId} (${targetMime})`);
  // 1. Obtener el caso actual
  const getUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/sek_cases?id=eq.${encodeURIComponent(caseId)}&select=id,histcliente,histtecnico`;
  const getRes = await fetch(getUrl, {
    headers: {
      "Authorization": `Bearer ${supabaseKey}`,
      "apikey": supabaseKey,
      "Accept": "application/json",
    },
  });

  if (!getRes.ok) {
    throw new Error(`Error obteniendo caso de Supabase: HTTP ${getRes.status}`);
  }

  const cases = await getRes.json();
  if (!cases || cases.length === 0) {
    throw new Error(`Caso no encontrado en Supabase: ${caseId}`);
  }

  const currentCase = cases[0];
  let updatedHistCliente = Array.isArray(currentCase.histcliente) ? [...currentCase.histcliente] : [];
  let updatedHistTecnico = Array.isArray(currentCase.histtecnico) ? [...currentCase.histtecnico] : [];
  let foundInCliente = false;
  let foundInTecnico = false;

  const updateArray = (arr) => {
    let found = false;
    for (let i = arr.length - 1; i >= 0; i--) {
      const msg = arr[i];
      if (messageId && (msg.messageId === messageId || msg.id === messageId)) {
        msg.mediaUrl = publicUrl;
        msg.mediaType = targetMime;
        msg.fileName = fileName;
        if (msg.content && (msg.content.startsWith("[Archivo adjunto:") || msg.content.startsWith("[Procesando") || msg.content === "[Video en optimización...]")) {
          msg.content = "";
        }
        found = true;
        break;
      }
    }
    if (!found) {
      for (let i = arr.length - 1; i >= 0; i--) {
        const msg = arr[i];
        if ((msg.content && (msg.content.startsWith("[Archivo adjunto:") || msg.content.startsWith("[Procesando") || msg.content === "[Video en optimización...]") || !msg.content) && !msg.mediaUrl) {
          msg.mediaUrl = publicUrl;
          msg.mediaType = targetMime;
          msg.fileName = fileName;
          msg.content = "";
          found = true;
          break;
        }
      }
    }
    return found;
  };

  foundInCliente = updateArray(updatedHistCliente);
  foundInTecnico = updateArray(updatedHistTecnico);

  if (!foundInCliente && !foundInTecnico) {
    console.warn(`[optimizer] No se encontró mensaje específico en historiales, agregando a histcliente`);
    updatedHistCliente.push({
      role: "user",
      time: new Date().toISOString(),
      content: "",
      mediaUrl: publicUrl,
      mediaType: targetMime,
      fileName: fileName,
      messageId: messageId,
      fromMe: false,
    });
  }

  // 2. Guardar cambios en sek_cases
  const patchUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/sek_cases?id=eq.${encodeURIComponent(caseId)}`;
  const lastPreview = ((currentCase.last_message_preview || "").startsWith("[Procesando") || (currentCase.last_message_preview || "").startsWith("[Archivo adjunto:"))
    ? (mediaCategory === "video" ? "📹 Video" : mediaCategory === "audio" ? "🎵 Audio" : mediaCategory === "image" ? "📷 Imagen" : "📎 Archivo")
    : currentCase.last_message_preview;

  const patchRes = await fetch(patchUrl, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${supabaseKey}`,
      "apikey": supabaseKey,
      "Content-Type": "application/json",
      "Prefer": "return=minimal",
    },
    body: JSON.stringify({
      histcliente: updatedHistCliente,
      histtecnico: updatedHistTecnico,
      ...(lastPreview ? { last_message_preview: lastPreview } : {}),
      updated_at: new Date().toISOString(),
    }),
  });

  if (!patchRes.ok) {
    const errText = await patchRes.text().catch(() => "");
    throw new Error(`Error actualizando sek_cases: HTTP ${patchRes.status} - ${errText}`);
  }

  console.log(`[optimizer] sek_cases actualizado con éxito (${targetMime}). Supabase Realtime notificará a los clientes.`);
}

async function processOptimizationJob(job) {
  const { jobId, encUrl, mediaKey, videoBase64, mediaType, fileName, caseId, messageId, supabaseUrl, supabaseKey } = job;
  
  const isVideo = mediaType === "video" || fileName.endsWith(".mp4") || fileName.endsWith(".mov");
  const isAudio = mediaType === "audio" || fileName.endsWith(".ogg") || fileName.endsWith(".mp3") || fileName.endsWith(".m4a");
  const isImage = mediaType === "image" || fileName.endsWith(".jpg") || fileName.endsWith(".jpeg") || fileName.endsWith(".png");

  let mediaCategory = "document";
  let targetMime = "application/octet-stream";
  let ext = fileName.includes(".") ? fileName.split(".").pop() : "bin";

  if (isVideo) { mediaCategory = "video"; targetMime = "video/mp4"; ext = "mp4"; }
  else if (isAudio) { mediaCategory = "audio"; targetMime = "audio/ogg"; ext = "ogg"; }
  else if (isImage) { mediaCategory = "image"; targetMime = "image/jpeg"; ext = "jpg"; }
  else if (fileName.endsWith(".pdf")) targetMime = "application/pdf";

  const tmpRaw = path.join(os.tmpdir(), `raw_${jobId}.${ext}`);
  const tmpOpt = path.join(os.tmpdir(), `opt_${jobId}.${ext}`);

  try {
    console.log(`[optimizer][${jobId}] Procesando ${mediaCategory} (${targetMime}) para ${fileName}...`);
    
    // 1. Obtener buffer sin comprimir
    let rawBuffer = null;
    if (encUrl && mediaKey) {
      rawBuffer = await decryptWhatsAppMedia(encUrl, mediaKey, mediaType || mediaCategory);
    } else if (videoBase64) {
      rawBuffer = Buffer.from(videoBase64, "base64");
    } else {
      throw new Error("No se proporcionó encUrl+mediaKey ni videoBase64");
    }

    fs.writeFileSync(tmpRaw, rawBuffer);
    console.log(`[optimizer][${jobId}] Archivo temporal guardado: ${tmpRaw} (${rawBuffer.length} bytes)`);

    // 2. Procesar con ffmpeg si es multimedia
    await transcodeMedia(tmpRaw, tmpOpt, mediaCategory);

    // 3. Subir a Supabase Storage
    const { publicUrl, size } = await uploadToSupabaseStorage(supabaseUrl, supabaseKey, fileName, tmpOpt, targetMime);

    // 4. Actualizar registro en Supabase Database
    if (caseId) {
      await updateCaseInSupabase(supabaseUrl, supabaseKey, caseId, messageId, publicUrl, fileName, targetMime);
    }

    console.log(`[optimizer][${jobId}] TRABAJO COMPLETADO CON ÉXITO: ${publicUrl}`);
  } catch (err) {
    console.error(`[optimizer][${jobId}] ERROR procesando archivo:`, err.message, err.stack);
  } finally {
    try { if (fs.existsSync(tmpRaw)) fs.unlinkSync(tmpRaw); } catch {}
    try { if (fs.existsSync(tmpOpt)) fs.unlinkSync(tmpOpt); } catch {}
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  console.log(`[optimizer] ${req.method} ${url.pathname}`);

  // Health check
  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/" || url.pathname === "/video-optimizer/health" || url.pathname === "/video-optimizer/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      service: "sekunet-video-optimizer",
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  // Webhook Ingress Proxy endpoint: intercepta el webhook de Evolution, protege a Vercel de 413, y reenvía
  if (req.method === "POST" && (url.pathname === "/webhook" || url.pathname === "/api/webhook" || url.pathname === "/video-optimizer/webhook")) {
    let bodyRaw = "";
    req.on("data", chunk => { bodyRaw += chunk; });
    req.on("end", async () => {
      try {
        const body = JSON.parse(bodyRaw || "{}");
        const VERCEL_WEBHOOK_URL = process.env.VERCEL_WEBHOOK_URL || "https://sekachat.vercel.app/api/webhooks/evolution";

        // Detectar si Evolution incluyó base64 pesado
        const msg = body.data?.message || body.data?.messages?.[0]?.message;
        const base64Data = msg?.base64 || body.data?.base64;

        if (base64Data && typeof base64Data === "string" && base64Data.length > 500 * 1024) {
          console.log(`[optimizer-proxy] Base64 pesado detectado (${Math.round(base64Data.length / 1024 / 1024)} MB). Removiendo del payload antes de enviar a Vercel para prevenir HTTP 413...`);
          if (msg?.base64) delete msg.base64;
          if (body.data?.base64) delete body.data.base64;
        }

        const cleanPayload = JSON.stringify(body);
        console.log(`[optimizer-proxy] Reenviando webhook a Vercel (${Buffer.byteLength(cleanPayload)} bytes)...`);

        let forwardStatus = 200;
        let forwardBody = "{}";

        try {
          const vRes = await fetch(VERCEL_WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": req.headers["apikey"] || "B6D711FCDE4D4FD5936544120E713976",
            },
            body: cleanPayload,
            signal: AbortSignal.timeout(20000),
          });
          forwardStatus = vRes.status;
          forwardBody = await vRes.text();
          console.log(`[optimizer-proxy] Vercel respondió HTTP ${forwardStatus}`);
        } catch (fwdErr) {
          console.error("[optimizer-proxy] Error reenviando a Vercel:", fwdErr.message);
        }

        res.writeHead(forwardStatus, { "Content-Type": "application/json" });
        res.end(forwardBody);
      } catch (err) {
        console.error("[optimizer-proxy] Error procesando webhook ingress:", err.message);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, proxied: true }));
      }
    });
    return;
  }

  // Optimize endpoint
  if (req.method === "POST" && (url.pathname === "/optimize" || url.pathname === "/api/optimize" || url.pathname === "/video-optimizer/optimize")) {
    const authHeader = req.headers["authorization"] || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();

    let bodyRaw = "";
    req.on("data", chunk => { bodyRaw += chunk; });
    req.on("end", async () => {
      try {
        const body = JSON.parse(bodyRaw || "{}");
        const token = bearer || body.secret;

        if (token !== AUTH_SECRET) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }

        if (!body.fileName || (!body.encUrl && !body.videoBase64)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing required fields: fileName and (encUrl or videoBase64)" }));
          return;
        }

        const jobId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const job = {
          jobId,
          encUrl: body.encUrl,
          mediaKey: body.mediaKey,
          videoBase64: body.videoBase64,
          mediaType: body.mediaType || "video",
          fileName: body.fileName,
          caseId: body.caseId,
          messageId: body.messageId,
          supabaseUrl: body.supabaseUrl,
          supabaseKey: body.supabaseKey,
        };

        // Responde de inmediato para liberar al cliente (Vercel / webhook)
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "queued",
          jobId,
          fileName: body.fileName,
          message: "Video optimization started in background",
        }));

        // Ejecuta en segundo plano en la VPS
        setImmediate(() => {
          processOptimizationJob(job).catch(err => {
            console.error(`[optimizer] Error no capturado en job ${jobId}:`, err);
          });
        });
      } catch (err) {
        console.error("[optimizer] Error procesando request:", err.message);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body", details: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`=============================================`);
  console.log(`Sekunet Video Optimizer Sidecar corriendo en puerto ${PORT}`);
  console.log(`PID: ${process.pid}`);
  console.log(`Node version: ${process.version}`);
  console.log(`=============================================`);
});
