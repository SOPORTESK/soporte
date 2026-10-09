const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const path = require('path');

const dev = false;
const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(3100, '0.0.0.0', (err) => {
    if (err) throw err;
    console.log('> Ready on http://localhost:3100 (Production)');

    // Motor autónomo de auto-cierre del backend (revisa cada 30 segundos según configuración del panel)
    try {
      const { runAutoClose } = require('./scripts/auto-close-engine.cjs');
      runAutoClose().catch((e) => console.error('[AutoClose Backend] Error inicial:', e.message));
      setInterval(() => {
        runAutoClose().catch((e) => console.error('[AutoClose Backend] Error cíclico:', e.message));
      }, 30000);
      console.log('[AutoClose Backend] Motor de auto-cierre activo en server.js (intervalo 30s)');
    } catch (e) {
      console.error('[AutoClose Backend] Error cargando motor:', e.message);
    }

    // Motor autónomo de sincronización bidireccional de Garantías con Soporte
    try {
      const { initGarantiasSyncEngine } = require('./scripts/garantias-sync-engine.cjs');
      initGarantiasSyncEngine();
    } catch (e) {
      console.error('[Sync Garantías] Error cargando motor de sincronización:', e.message);
    }
  });
});
