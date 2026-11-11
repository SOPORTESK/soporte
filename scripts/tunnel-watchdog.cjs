require('./dns-boost.cjs');

const http = require('http');
const path = require('path');
const { execSync } = require('child_process');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kzcyxeracvfxynddyjld.supabase.co').replace(/\/$/, '');
const SUPABASE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUxMTk1NCwiZXhwIjoyMDkxMDg3OTU0fQ.GlF4Zieqqc1V1IAPshPFKb1QzKBBbO8n1RGK_wG_JuM'
).trim();

const EVO_LOCAL_URL = 'http://127.0.0.1:28080';
const EVO_KEY = (process.env.EVOLUTION_API_KEY || 'SEKUNET_EVO_KEY_123').trim();
const EVO_INSTANCE = (process.env.EVOLUTION_INSTANCE || 'sekunet').trim();
const RELAY_PORT = Number(process.env.WA_RELAY_PORT || 28082);
const WA_OUTBOX_KEY = 'wa_outbox_queue';

let supabaseClient = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  if (SUPABASE_URL && SUPABASE_KEY) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      realtime: { params: { eventsPerSecond: 4 } },
    });
  }
} catch {}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. CLOUDFLARE TUNNEL WATCHDOG + SUPABASE SYNC (con backoff offline)
// ═══════════════════════════════════════════════════════════════════════════════
let failCount = 0;
let lastRestart = 0;
let lastSyncedUrl = '';
let lastSyncTime = 0;
let supabaseOfflineBackoffMs = 0;
let nextSupabaseAttemptAt = 0;

function noteSupabaseSuccess() {
  supabaseOfflineBackoffMs = 0;
  nextSupabaseAttemptAt = 0;
}

function noteSupabaseOffline() {
  supabaseOfflineBackoffMs = supabaseOfflineBackoffMs
    ? Math.min(supabaseOfflineBackoffMs * 2, 30000)
    : 10000;
  nextSupabaseAttemptAt = Date.now() + supabaseOfflineBackoffMs;
}

async function syncToSupabase(url) {
  if (Date.now() < nextSupabaseAttemptAt) return false;
  const payload = JSON.stringify({ url, apiKey: EVO_KEY, instance: EVO_INSTANCE });
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/sek_app_settings?on_conflict=key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          key: 'evolution_api_config',
          value: payload,
          iv: 'none',
          tag: 'none',
          updated_at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(7000),
      });
      if (res.ok) {
        noteSupabaseSuccess();
        lastSyncedUrl = url;
        lastSyncTime = Date.now();
        console.log('[Tunnel Watchdog] URL sincronizada en Supabase con éxito:', url);
        return true;
      }
      console.warn('[Tunnel Watchdog] Supabase sync retornó:', res.status);
    } catch (e) {
      if (attempt === 2) {
        noteSupabaseOffline();
        console.warn(`[Tunnel Watchdog] Supabase inalcanzable (${e.message}), reintentando en ${Math.round(supabaseOfflineBackoffMs / 1000)}s`);
      } else {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  return false;
}

async function checkTunnel() {
  try {
    const res = await fetch('http://127.0.0.1:28081/metrics', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error('Metrics status ' + res.status);
    const text = await res.text();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (!match || !match[0]) {
      throw new Error('No active trycloudflare URL in metrics');
    }

    const currentUrl = match[0];
    // Sincronizar en Supabase únicamente cuando cambia la URL del túnel (o cada 6 horas como respaldo)
    if (currentUrl !== lastSyncedUrl || Date.now() - lastSyncTime > 6 * 60 * 60 * 1000) {
      await syncToSupabase(currentUrl);
    }

    const haMatch = text.match(/^cloudflared_tunnel_ha_connections\s+(\d+)/m);
    const haConnections = haMatch ? parseInt(haMatch[1], 10) : 1;
    if (haConnections <= 0) {
      // Verificar si hay internet antes de culpar al contenedor cloudflared.
      // Si el ISP cayó, NO reiniciar el contenedor porque eso destruye el hostname actual.
      try {
        const netCheck = await fetch('https://1.1.1.1/cdn-cgi/trace', { signal: AbortSignal.timeout(3000) });
        if (!netCheck.ok) return;
      } catch {
        return;
      }
      throw new Error('cloudflared_tunnel_ha_connections is 0 (tunnel disconnected from Cloudflare edge)');
    }

    failCount = 0;
  } catch (err) {
    failCount++;
    console.warn(`[Tunnel Watchdog] Fallo #${failCount}: ${err.message}`);

    // Solo reiniciar tras 12 fallos seguidos (6 minutos con internet activo) y cooldown de 15 min
    if (failCount >= 12 && Date.now() - lastRestart > 900000) {
      lastRestart = Date.now();
      failCount = 0;
      console.log('[Tunnel Watchdog] Reiniciando contenedor chatdeatencinsekunet-evolution-tunnel-1...');
      try {
        execSync('docker restart chatdeatencinsekunet-evolution-tunnel-1', { stdio: 'inherit' });
        console.log('[Tunnel Watchdog] Contenedor reiniciado con éxito.');
        setTimeout(checkTunnel, 8000);
      } catch (restartErr) {
        console.error('[Tunnel Watchdog] Error reiniciando contenedor:', restartErr.message);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. RELAY LOCAL DE WEBHOOKS (0.0.0.0:28082) -> 127.0.0.1:3100 (fallback Vercel)
//    Filtra eventos ruidosos en RAM antes de tocar Next.js o Supabase.
// ═══════════════════════════════════════════════════════════════════════════════
const IGNORED_EVENTS = new Set([
  'CONNECTION_UPDATE',
  'CHATS_SET',
  'CHATS_UPSERT',
  'CHATS_UPDATE',
  'CHATS_DELETE',
  'CONTACTS_SET',
  'CONTACTS_UPSERT',
  'CONTACTS_UPDATE',
  'PRESENCE_UPDATE',
  'GROUPS_UPSERT',
  'GROUP_UPDATE',
  'GROUP_PARTICIPANTS_UPDATE',
  'LABELS_EDIT',
  'LABELS_ASSOCIATION',
  'CALL',
  'SEND_MESSAGE',
  'NEW_JWT_TOKEN',
  'LOGOUT_INSTANCE',
  'REMOVE_INSTANCE',
  'APPLICATION_STARTUP',
  'TYPEBOT_START',
  'TYPEBOT_CHANGE_STATUS',
]);

const relayQueue = [];
let relayProcessing = false;

function shouldForwardWebhook(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const normalizedEvent = String(payload.event || '')
    .trim()
    .replace(/\./g, '_')
    .toUpperCase();

  if (!normalizedEvent || IGNORED_EVENTS.has(normalizedEvent)) {
    return false;
  }

  if (normalizedEvent === 'MESSAGES_UPDATE') {
    const updates = Array.isArray(payload.data) ? payload.data : (payload.data ? [payload.data] : []);
    const hasActionable = updates.some((item) => {
      if (!item) return false;
      const reactions = item.update?.reactions;
      if (Array.isArray(reactions) && reactions.length > 0) return true;
      const status = String(item.update?.status || item.status || '').toUpperCase();
      return status === 'READ' && Boolean(item.key?.fromMe || item.fromMe);
    });
    return hasActionable;
  }

  return true;
}

async function postWebhookTarget(url, rawBody) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
    signal: AbortSignal.timeout(25000),
  });
  return res.ok;
}

async function drainRelayQueue() {
  if (relayProcessing) return;
  relayProcessing = true;
  try {
    while (relayQueue.length > 0) {
      const job = relayQueue.shift();
      let ok = false;
      try {
        ok = await postWebhookTarget('http://127.0.0.1:3100/api/webhooks/evolution', job.rawBody);
      } catch (e) {
        console.warn('[WA Relay] Falló webhook local 127.0.0.1:3100:', e.message);
      }

      if (!ok) {
        try {
          ok = await postWebhookTarget('https://sekachat.vercel.app/api/webhooks/evolution', job.rawBody);
          if (ok) console.log('[WA Relay] Reenviado a Vercel fallback:', job.event);
        } catch (e2) {
          console.warn('[WA Relay] Falló Vercel fallback:', e2.message);
        }
      }
    }
  } finally {
    relayProcessing = false;
  }
}

function startWebhookRelayServer() {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  const server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    if (req.method === 'GET' && (urlPath === '/health' || urlPath === '/')) {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, relayQueue: relayQueue.length }));
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }

    const chunks = [];
    let totalBytes = 0;
    const MAX_BYTES = 20 * 1024 * 1024;
    let aborted = false;

    req.on('data', (chunk) => {
      if (aborted) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BYTES) {
        aborted = true;
        res.writeHead(413, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'payload_too_large' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', async () => {
      if (aborted) return;
      const rawBody = Buffer.concat(chunks).toString('utf8');

      if (urlPath === '/send-local') {
        try {
          const job = JSON.parse(rawBody);
          const result = await deliverJobWithDeduplication(job, 'local-direct');
          res.writeHead(result.ok ? 200 : 502, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          if (result.ok) {
            setTimeout(() => processOutboxQueue(true), 200);
          }
        } catch (err) {
          res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        return;
      }

      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end('{"ok":true}');

      let payload = null;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return;
      }

      if (!shouldForwardWebhook(payload)) {
        return;
      }

      if (relayQueue.length > 500) {
        relayQueue.shift();
      }
      relayQueue.push({
        event: String(payload.event || ''),
        rawBody,
      });
      drainRelayQueue();
    });

    req.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(400, corsHeaders);
        res.end();
      }
    });
  });

  server.on('error', (err) => {
    console.error(`[WA Relay] Error en servidor HTTP puerto ${RELAY_PORT}:`, err.message);
  });

  server.listen(RELAY_PORT, '0.0.0.0', () => {
    console.log(`[WA Relay] Escuchando webhooks y envíos locales en http://0.0.0.0:${RELAY_PORT}/webhook y /send-local`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. WORKER LOCAL DE OUTBOX (entrega directa via http://127.0.0.1:28080)
//    Sondeo ultraligero por updated_at (~50 bytes) + Realtime instantáneo + /send-local
// ═══════════════════════════════════════════════════════════════════════════════
let outboxRunning = false;
let lastOutboxUpdatedAt = null;
const deliveredJobIds = new Map(); // jobId -> { messageId, ts }
const deliveredSigMap = new Map(); // signature -> { messageId, ts }
const inFlightJobPromises = new Map(); // jobId/sig -> Promise

function getJobSignature(job) {
  const dest = String(job.case_id || job.to || '').trim();
  const body = String(job.text || job.mediaUrl || job.fileName || '').trim().slice(0, 160);
  return `${dest}|${body}`;
}

function pruneDeduplicationMaps() {
  const now = Date.now();
  for (const [k, v] of deliveredJobIds.entries()) {
    if (now - v.ts > 10 * 60 * 1000) deliveredJobIds.delete(k);
  }
  for (const [k, v] of deliveredSigMap.entries()) {
    if (now - v.ts > 25000) deliveredSigMap.delete(k);
  }
}

async function deliverJobWithDeduplication(job, sourceLabel = 'outbox') {
  pruneDeduplicationMaps();
  const jobId = String(job.id || '');
  const sig = getJobSignature(job);

  if (jobId && deliveredJobIds.has(jobId)) {
    const prev = deliveredJobIds.get(jobId);
    return { ok: true, status: 200, messageId: prev.messageId, deduplicated: true };
  }
  if (sig && deliveredSigMap.has(sig)) {
    const prev = deliveredSigMap.get(sig);
    if (jobId) deliveredJobIds.set(jobId, prev);
    return { ok: true, status: 200, messageId: prev.messageId, deduplicated: true };
  }

  const lockKey = jobId || sig;
  if (lockKey && inFlightJobPromises.has(lockKey)) {
    return inFlightJobPromises.get(lockKey);
  }

  const runPromise = (async () => {
    const result = await sendOutboxItemViaLocalEvo(job);
    if (result.ok) {
      const entry = { messageId: result.messageId, ts: Date.now() };
      if (jobId) deliveredJobIds.set(jobId, entry);
      if (sig) deliveredSigMap.set(sig, entry);
      console.log(`[WA Outbox:${sourceLabel}] Entregado con éxito ${jobId || sig} -> WhatsApp id=${result.messageId}`);
      await markCaseQueuedMessageDelivered(job, result.messageId, false);
    }
    return result;
  })();

  if (lockKey) inFlightJobPromises.set(lockKey, runPromise);
  try {
    return await runPromise;
  } finally {
    if (lockKey) inFlightJobPromises.delete(lockKey);
  }
}

function detectMediaTypeFromMime(mime, fileName) {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  const ext = String(fileName || '').split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext)) return 'video';
  if (['mp3', 'ogg', 'wav', 'aac', 'm4a', 'opus'].includes(ext)) return 'audio';
  return 'document';
}

async function sendOutboxItemViaLocalEvo(job) {
  const instance = encodeURIComponent(EVO_INSTANCE);
  let evoEndpoint;
  let evoBody;

  if (job.mediaUrl) {
    const mediatype = detectMediaTypeFromMime(job.mediaType, job.fileName);
    if (mediatype === 'audio') {
      evoEndpoint = `${EVO_LOCAL_URL}/message/sendWhatsAppAudio/${instance}`;
      evoBody = { number: job.to, audio: job.mediaUrl, ...(job.quoted ? { quoted: job.quoted } : {}) };
    } else {
      evoEndpoint = `${EVO_LOCAL_URL}/message/sendMedia/${instance}`;
      evoBody = {
        number: job.to,
        mediatype,
        mimetype: job.mediaType || undefined,
        caption: job.text || undefined,
        media: job.mediaUrl,
        fileName: job.fileName || undefined,
        ...(job.quoted ? { quoted: job.quoted } : {}),
      };
    }
  } else {
    evoEndpoint = `${EVO_LOCAL_URL}/message/sendText/${instance}`;
    evoBody = { number: job.to, text: job.text || '', ...(job.quoted ? { quoted: job.quoted } : {}) };
  }

  let res = await fetch(evoEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
    body: JSON.stringify(evoBody),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok && job.quoted && (res.status === 400 || res.status === 422 || res.status === 500)) {
    const fallbackBody = { ...evoBody };
    delete fallbackBody.quoted;
    res = await fetch(evoEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
      body: JSON.stringify(fallbackBody),
      signal: AbortSignal.timeout(15000),
    });
  }

  const data = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    status: res.status,
    messageId: data?.key?.id || data?.messageId || null,
    errorText: res.ok ? null : `evo_${res.status}: ${JSON.stringify(data).slice(0, 180)}`,
  };
}

async function markCaseQueuedMessageDelivered(job, realMsgId, failed) {
  if (!job.case_id) return;
  try {
    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sek_cases?id=eq.${encodeURIComponent(job.case_id)}&select=histtecnico`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: 'Bearer ' + SUPABASE_KEY,
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!getRes.ok) return;
    const rows = await getRes.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || !Array.isArray(row.histtecnico)) return;

    const hist = [...row.histtecnico];
    let idx = hist.findIndex((m) => m && m.messageId === job.id);
    if (idx < 0 && job.matchContent) {
      for (let i = hist.length - 1; i >= 0; i--) {
        const m = hist[i];
        if (m && m.role === 'tecnico' && m.content === job.matchContent && (!m.messageId || String(m.messageId).startsWith('queued-'))) {
          idx = i;
          break;
        }
      }
    }
    if (idx < 0) return;

    const updatedEntry = {
      ...hist[idx],
      queued: false,
      fromMe: true,
      ...(realMsgId ? { messageId: realMsgId } : {}),
      ...(failed ? { sendError: true } : {}),
    };
    hist[idx] = updatedEntry;

    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/sek_cases?id=eq.${encodeURIComponent(job.case_id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
      },
      body: JSON.stringify({ histtecnico: hist }),
      signal: AbortSignal.timeout(8000),
    });
    if (patchRes.ok && SUPABASE_URL && SUPABASE_KEY) {
      fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_KEY,
          Authorization: 'Bearer ' + SUPABASE_KEY,
        },
        body: JSON.stringify({
          messages: [{
            topic: 'sek_cases_live',
            event: 'case_event',
            payload: {
              eventType: 'UPDATE',
              action: 'refresh_history',
              caseId: String(job.case_id),
              new: { id: job.case_id, updated_at: new Date().toISOString() },
              ts: Date.now(),
            },
          }],
        }),
        signal: AbortSignal.timeout(2500),
      }).catch(() => {});
    }
  } catch (e) {
    console.warn('[WA Outbox] Error actualizando histtecnico en Supabase:', e.message);
  }
}

async function processOutboxQueue(forceRead = false) {
  if (outboxRunning) return;
  if (Date.now() < nextSupabaseAttemptAt) return;
  outboxRunning = true;
  try {
    // Chequeo ligero (~50 bytes) salvo cuando forceRead es true (ej. notificación Realtime)
    if (!forceRead) {
      const metaRes = await fetch(
        `${SUPABASE_URL}/rest/v1/sek_app_settings?key=eq.${WA_OUTBOX_KEY}&select=updated_at`,
        {
          headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
          signal: AbortSignal.timeout(6000),
        }
      );
      if (!metaRes.ok) return;
      noteSupabaseSuccess();
      const metaRows = await metaRes.json().catch(() => []);
      const rowUpdatedAt = Array.isArray(metaRows) && metaRows[0] ? metaRows[0].updated_at : null;
      if (!rowUpdatedAt || (lastOutboxUpdatedAt && rowUpdatedAt === lastOutboxUpdatedAt)) {
        return;
      }
      lastOutboxUpdatedAt = rowUpdatedAt;
    }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/sek_app_settings?key=eq.${WA_OUTBOX_KEY}&select=value,updated_at`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
        signal: AbortSignal.timeout(7000),
      }
    );
    if (!res.ok) return;
    noteSupabaseSuccess();
    const rows = await res.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.value) return;
    if (row.updated_at) lastOutboxUpdatedAt = row.updated_at;

    let queue = [];
    try {
      queue = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    } catch {
      queue = [];
    }
    if (!Array.isArray(queue) || queue.length === 0) return;

    const pendingJobs = queue.filter((j) => j && j.status === 'pending' && (j.attempts || 0) < 8);
    if (pendingJobs.length === 0) return;

    console.log(`[WA Outbox] Procesando ${pendingJobs.length} mensaje(s) pendiente(s) por Evolution local...`);
    let queueModified = false;
    const deliveredIds = new Set();

    for (const job of pendingJobs) {
      try {
        const result = await deliverJobWithDeduplication(job, 'queue');
        if (result.ok) {
          deliveredIds.add(job.id);
          queueModified = true;
        } else {
          job.attempts = (job.attempts || 0) + 1;
          job.last_error = result.errorText;
          if (result.status === 400 || job.attempts >= 8) {
            job.status = 'failed';
            await markCaseQueuedMessageDelivered(job, null, true);
          }
          queueModified = true;
          console.warn(`[WA Outbox] Falló entrega ${job.id} (intento ${job.attempts}): ${result.errorText}`);
        }
      } catch (err) {
        job.attempts = (job.attempts || 0) + 1;
        job.last_error = err.message;
        if (job.attempts >= 8) {
          job.status = 'failed';
          await markCaseQueuedMessageDelivered(job, null, true);
        }
        queueModified = true;
        console.warn(`[WA Outbox] Excepción enviando ${job.id}: ${err.message}`);
      }
    }

    if (queueModified) {
      // Re-leer la cola actual para no perder elementos encolados durante el envío
      let latestQueue = queue;
      try {
        const latestRes = await fetch(
          `${SUPABASE_URL}/rest/v1/sek_app_settings?key=eq.${WA_OUTBOX_KEY}&select=value`,
          {
            headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (latestRes.ok) {
          const latestRows = await latestRes.json().catch(() => []);
          const latestRaw = Array.isArray(latestRows) && latestRows[0] ? latestRows[0].value : null;
          if (latestRaw) {
            const parsedLatest = typeof latestRaw === 'string' ? JSON.parse(latestRaw) : latestRaw;
            if (Array.isArray(parsedLatest)) latestQueue = parsedLatest;
          }
        }
      } catch {}

      const updatedMap = new Map(queue.map((j) => [j && j.id, j]));
      const remaining = latestQueue
        .filter((j) => j && !deliveredIds.has(j.id))
        .map((j) => updatedMap.get(j.id) || j);
      const newUpdatedAt = new Date().toISOString();
      const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/sek_app_settings?on_conflict=key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_KEY,
          Authorization: 'Bearer ' + SUPABASE_KEY,
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          key: WA_OUTBOX_KEY,
          value: JSON.stringify(remaining),
          iv: 'none',
          tag: 'none',
          updated_at: newUpdatedAt,
        }),
        signal: AbortSignal.timeout(7000),
      });
      if (saveRes.ok) {
        lastOutboxUpdatedAt = newUpdatedAt;
      }
    }
  } catch (e) {
    noteSupabaseOffline();
  } finally {
    outboxRunning = false;
  }
}

function startOutboxRealtime() {
  if (!supabaseClient) return;
  try {
    supabaseClient
      .channel('wa-outbox-watch')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sek_app_settings', filter: `key=eq.${WA_OUTBOX_KEY}` },
        () => {
          lastOutboxUpdatedAt = null;
          processOutboxQueue(true);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[WA Outbox] Realtime suscrito a wa_outbox_queue');
          processOutboxQueue(true);
        }
      });
  } catch (e) {
    console.warn('[WA Outbox] No se pudo iniciar Realtime:', e.message);
  }
}

console.log('[Tunnel Watchdog] Iniciado con Webhook Relay (28082), Outbox Worker local y Tunnel Sync.');
startWebhookRelayServer();
startOutboxRealtime();
setInterval(checkTunnel, 30000);
setInterval(() => processOutboxQueue(false), 15000);
checkTunnel();
processOutboxQueue(true);
