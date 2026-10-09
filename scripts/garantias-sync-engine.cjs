/**
 * Motor de Sincronización Automática Bidireccional
 * Garantías (Supabase externo) <-> Soporte (Chat sek_cases)
 *
 * Escucha cambios en tiempo real en la tabla `garantias` y mantiene
 * la tabla `sek_cases` del Chat 100% sincronizada sin modificar el proyecto de Garantías.
 */
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const GARANTIAS_URL = process.env.NEXT_PUBLIC_GARANTIAS_SUPABASE_URL || 'https://syngvbgelcfyunjggpwo.supabase.co';
const GARANTIAS_KEY = process.env.GARANTIAS_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_GARANTIAS_SUPABASE_ANON_KEY;
const CHAT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAT_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GARANTIAS_URL || !GARANTIAS_KEY || !CHAT_URL || !CHAT_SERVICE_KEY) {
  console.warn('[Sync Garantías] Variables de entorno incompletas para sincronización automática.');
}

const gClient = createClient(GARANTIAS_URL, GARANTIAS_KEY);
const chatClient = createClient(CHAT_URL, CHAT_SERVICE_KEY);

/**
 * Sincroniza un registro de Garantías hacia sek_cases en la BD de Soporte
 */
async function syncGarantiaToSoporte(rec) {
  if (!rec || !rec.id) return;

  try {
    const ticketVal = String(rec.ticket || '').trim().replace(/^#/, '');
    const clientName = String(rec.nombre || '').trim();
    const clientSerie = String(rec.numero_serie || rec.serie || '').trim();

    let matchedCases = [];

    // 1. Buscar por ticket
    if (ticketVal) {
      const { data: byTicket } = await chatClient
        .from('sek_cases')
        .select('id, cliente, marca, modelo, problema')
        .or(`cliente->>ticket.eq.${ticketVal},cliente->>ticket.eq.#${ticketVal},title.ilike.%${ticketVal}%`)
        .limit(5);
      if (byTicket && byTicket.length > 0) matchedCases = byTicket;
    }

    // 2. Buscar por número de serie
    if (matchedCases.length === 0 && clientSerie && clientSerie.length >= 4) {
      const { data: bySerie } = await chatClient
        .from('sek_cases')
        .select('id, cliente, marca, modelo, problema')
        .or(`cliente->>serie.eq.${clientSerie},cliente->>modelo.eq.${clientSerie}`)
        .limit(5);
      if (bySerie && bySerie.length > 0) matchedCases = bySerie;
    }

    // 3. Buscar por cliente (nombre o cuenta)
    if (matchedCases.length === 0 && clientName && clientName.length >= 4) {
      const { data: byName } = await chatClient
        .from('sek_cases')
        .select('id, cliente, marca, modelo, problema')
        .or(`cliente->>nombre.ilike.%${clientName}%,cliente->>cuenta.ilike.%${clientName}%`)
        .limit(5);
      if (byName && byName.length > 0) matchedCases = byName;
    }

    if (matchedCases.length > 0) {
      const now = new Date().toISOString();
      let actualUpdatesCount = 0;
      for (const c of matchedCases) {
        const cCliente = (c.cliente && typeof c.cliente === 'object') ? { ...c.cliente } : {};
        if (rec.marca) cCliente.marca = rec.marca;
        if (rec.serie) cCliente.modelo = rec.serie;
        if (rec.numero_serie) cCliente.serie = rec.numero_serie;
        if (rec.falla || rec.descripcion) {
          cCliente.descripcion = rec.falla || rec.descripcion;
        }
        if (rec.ticket) cCliente.ticket = rec.ticket;
        if (rec.boleta) cCliente.boleta = rec.boleta;
        if (rec.estatus) cCliente.estatus_garantia = rec.estatus;
        if (rec.dev) cCliente.dev = rec.dev;

        const prevClienteStr = JSON.stringify(c.cliente || {});
        const nextClienteStr = JSON.stringify(cCliente);
        const marcaChanged = Boolean(rec.marca && rec.marca !== c.marca);
        const modeloChanged = Boolean(rec.serie && rec.serie !== c.modelo);
        const problemaChanged = Boolean(rec.falla && rec.falla !== c.problema);

        // Si ya está sincronizado e idéntico, saltar update para no saturar la BD ni disparar realtime
        if (prevClienteStr === nextClienteStr && !marcaChanged && !modeloChanged && !problemaChanged) {
          continue;
        }

        const updates = {
          cliente: cCliente,
          updated_at: now
        };
        if (rec.marca) updates.marca = rec.marca;
        if (rec.serie) updates.modelo = rec.serie;
        if (rec.falla) updates.problema = rec.falla;

        await chatClient.from('sek_cases').update(updates).eq('id', c.id);
        actualUpdatesCount++;
      }
      if (actualUpdatesCount > 0) {
        console.log(`[Sync Garantías->Soporte] Sincronizado boleta ${rec.boleta} (Ticket: ${rec.ticket || '—'}) con ${actualUpdatesCount} caso(s) en Soporte.`);
      }
    }
  } catch (err) {
    console.error(`[Sync Garantías->Soporte] Error al sincronizar registro ${rec.id}:`, err.message);
  }
}

/**
 * Escaneo periódico de cambios recientes como respaldo de seguridad
 */
async function pollRecentChanges() {
  try {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: recs, error } = await gClient
      .from('garantias')
      .select('*')
      .or(`fecha_modificacion.gte.${twoMinutesAgo},fecha_creacion.gte.${twoMinutesAgo}`)
      .limit(50);

    if (error) {
      console.warn('[Sync Garantías Poll] Error al consultar cambios recientes:', error.message);
      return;
    }

    if (recs && recs.length > 0) {
      for (const r of recs) {
        await syncGarantiaToSoporte(r);
      }
    }
  } catch (e) {
    console.warn('[Sync Garantías Poll] Error en ciclo:', e.message);
  }
}

/**
 * Inicia el motor de sincronización
 */
function initGarantiasSyncEngine() {
  try {
    // 1. Suscripción Realtime
    const channel = gClient
      .channel('garantias_sync_stream')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'garantias' }, (payload) => {
        if (payload.new) {
          syncGarantiaToSoporte(payload.new);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'garantias' }, (payload) => {
        if (payload.new) {
          syncGarantiaToSoporte(payload.new);
        }
      })
      .subscribe((status) => {
        console.log(`[Sync Garantías Realtime] Estado canal: ${status}`);
      });

    // 2. Polling periódico de seguridad cada 2 minutos (Realtime atiende cambios al instante)
    setInterval(pollRecentChanges, 120000);

    console.log('[Sync Garantías] Motor autónomo de sincronización iniciado (Realtime + Polling 2m).');
  } catch (e) {
    console.error('[Sync Garantías] Fallo al inicializar motor:', e.message);
  }
}

module.exports = {
  initGarantiasSyncEngine,
  syncGarantiaToSoporte,
};
