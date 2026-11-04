const { execSync } = require('child_process');

let failCount = 0;
let lastRestart = 0;

async function checkTunnel() {
  try {
    const res = await fetch('http://127.0.0.1:28081/metrics', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error('Metrics status ' + res.status);
    const text = await res.text();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (!match || !match[0]) {
      throw new Error('No active trycloudflare URL in metrics');
    }
    
    // Probar conectividad al túnel
    const pingRes = await fetch(match[0], { signal: AbortSignal.timeout(8000) });
    if (pingRes.status >= 500) {
      throw new Error('Tunnel returned HTTP ' + pingRes.status);
    }
    
    // Si responde ok, resetear contador de fallos
    failCount = 0;
  } catch (err) {
    failCount++;
    console.warn(`[Tunnel Watchdog] Fallo #${failCount}: ${err.message}`);
    
    // Si falla 3 veces consecutivas (aprox 1.5 minutos) y no se ha reiniciado en los últimos 3 minutos
    if (failCount >= 3 && Date.now() - lastRestart > 180000) {
      lastRestart = Date.now();
      failCount = 0;
      console.log('[Tunnel Watchdog] Reiniciando contenedor chatdeatencinsekunet-evolution-tunnel-1...');
      try {
        execSync('docker restart chatdeatencinsekunet-evolution-tunnel-1', { stdio: 'inherit' });
        console.log('[Tunnel Watchdog] Contenedor reiniciado con éxito.');
      } catch (restartErr) {
        console.error('[Tunnel Watchdog] Error reiniciando contenedor:', restartErr.message);
      }
    }
  }
}

console.log('[Tunnel Watchdog] Iniciado. Monitoreando túnel cada 30 segundos.');
setInterval(checkTunnel, 30000);
checkTunnel();
