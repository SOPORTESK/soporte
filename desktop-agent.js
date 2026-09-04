/**
 * Activity Tracker Desktop Agent
 * 
 * Monitorea qué aplicación/ventana está activa a nivel del sistema operativo.
 * Registra tiempo por aplicación y envía los datos al API local del Activity Tracker.
 * 
 * Uso: node desktop-agent.js --agent=cbatista@sekunet.com --name="César Batista"
 */

const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");

async function getActiveWindow() {
  try {
    const exePath = path.join(__dirname, "scripts", "get-active-win.exe");
    if (fs.existsSync(exePath)) {
      const out = execFileSync(exePath, { encoding: "utf8", timeout: 1500, windowsHide: true });
      if (out && out.trim().startsWith("{")) {
        const parsed = JSON.parse(out.trim());
        const procName = parsed.Process || parsed.app || '';
        const procTitle = parsed.Title || parsed.title || '';
        const procPath = parsed.Path || parsed.path || '';
        const procPid = parsed.Id || parsed.pid || 0;
        if (procName && procName !== "Unknown" && procName !== "Idle" && procName !== "") {
          return {
            title: procTitle,
            owner: { name: procName.replace(/\.exe$/i, ""), path: procPath, processId: procPid }
          };
        }
      }
    }
  } catch (e) {}

  try {
    const activeWin = require("active-win");
    const w = await activeWin();
    if (w && (w.owner?.name || w.title)) return w;
  } catch (e) {}
  return null;
}

// Parse args
const args = process.argv.slice(2);
const getArg = (key) => {
  const found = args.find((a) => a.startsWith(`--${key}=`));
  return found ? found.split("=")[1] : null;
};

const AGENT_EMAIL = getArg("agent") || "unknown@sekunet.com";
const AGENT_NAME = getArg("name") || AGENT_EMAIL;
const API_URL = getArg("api") || "http://localhost:3100/api/activity/log";
const POLL_INTERVAL = 5000; // 5 segundos
const MIN_DWELL = 10000; // mínimo 10s para registrar
const IDLE_THRESHOLD = 5 * 60 * 1000; // 5 min
const HEARTBEAT_EVERY = 300; // 5 minutos en segundos

let lastApp = null;
let lastTitle = null;
let appEnterTime = Date.now();
let lastActivityTime = Date.now();
let isIdle = false;
let loggedApps = new Set();
let lastHeartbeatBucket = 0;

// Categorización de aplicaciones
function categorizeApp(appName, title) {
  const app = (appName || "").toLowerCase();
  const t = (title || "").toLowerCase();

  // Correo
  if (app.includes("outlook") || app.includes("thunderbird") || app.includes("mail") || t.includes("correo") || t.includes("inbox") || t.includes("- outlook"))
    return { category: "Gestión de correos", label: "Correo electrónico" };

  // WhatsApp
  if (app.includes("whatsapp") || t.includes("whatsapp"))
    return { category: "Mensajería", label: "WhatsApp" };

  // Linkus (Grandstream softphone) - Atención telefónica
  if (app.includes("linkus") || t.includes("linkus") || app.includes("grandstream")) {
    let label = "Linkus (Softphone)";
    let category = "Atención telefónica";
    if (t.includes("calling") || t.includes("llamando") || t.includes("dialing")) {
      label = "Linkus - Llamada saliente";
    } else if (t.includes("incoming") || t.includes("entrante") || t.includes("ringing") || t.includes("timbrando")) {
      label = "Linkus - Llamada entrante";
    } else if (t.includes("connected") || t.includes("conectado") || t.includes("talking") || t.includes("hablando") || t.includes("in call") || t.includes("en llamada")) {
      label = "Linkus - En llamada";
    } else if (t.includes("missed") || t.includes("perdida")) {
      label = "Linkus - Llamada perdida";
      category = "Escalado";
    }
    return { category, label };
  }

  // Navegadores - detectar sitio por título
  if (app.includes("chrome") || app.includes("firefox") || app.includes("edge") || app.includes("brave") || app.includes("opera") || app.includes("browser")) {
    // Odoo - Atención de tickets
    if (t.includes("odoo")) return { category: "Atención de tickets", label: "Odoo" };

    // Trámites de garantías
    if (t.includes("tienda 3d") || t.includes("tienda3d") || t.includes("rma") || t.includes("garantía") || t.includes("garantia") || t.includes("warranty"))
      return { category: "Trámites de garantías", label: `Garantías - ${extractSiteFromTitle(title)}` };

    // Sekunet / Seka Chat - Navegación (Mensajería se loguea al enviar mensaje)
    if (t.includes("sekunet") || t.includes("seka chat") || t.includes("localhost:3100"))
      return { category: "Navegación", label: "Seka Chat" };

    // Investigación y desarrollo
    if (t.includes("github") || t.includes("stackoverflow") || t.includes("docs.") || t.includes("developer") || t.includes("npmjs") || t.includes("vercel") || t.includes("supabase"))
      return { category: "Investigación y desarrollo", label: `Investigación - ${extractSiteFromTitle(title)}` };

    if (t.includes("linkedin")) return { category: "Navegación", label: "LinkedIn" };
    if (t.includes("youtube")) return { category: "Navegación", label: "YouTube" };
    if (t.includes("google") && t.includes("docs")) return { category: "Navegación", label: "Google Docs" };
    return { category: "Navegación", label: `Navegador web: ${extractSiteFromTitle(title)}` };
  }

  // Sekunet / Seka Chat fuera de navegador - Navegación
  if (t.includes("sekunet") || t.includes("seka chat") || t.includes("localhost:3100"))
    return { category: "Navegación", label: "Seka Chat" };

  // Odoo fuera de navegador (app de escritorio)
  if (t.includes("odoo"))
    return { category: "Atención de tickets", label: "Odoo" };

  // Investigación y desarrollo - IDEs y herramientas de desarrollo
  if (app.includes("windsurf") || app.includes("cursor") || app.includes("code") || app.includes("devenv") || app.includes("webstorm") || app.includes("devin") || app.includes("intellij") || app.includes("eclipse") || app.includes("netbeans") || app.includes("vim") || app.includes("neovim") || app.includes("emacs"))
    return { category: "Investigación y desarrollo", label: `Desarrollo - ${appName}` };

  // Terminal
  if (app.includes("terminal") || app.includes("cmd") || app.includes("powershell") || app.includes("windowsterminal"))
    return { category: "Investigación y desarrollo", label: "Terminal" };

  // Comunicación
  if (app.includes("teams") || app.includes("slack") || app.includes("discord") || app.includes("zoom") || app.includes("meet"))
    return { category: "Navegación", label: `Comunicación (${appName})` };

  // Office
  if (app.includes("excel") || app.includes("word") || app.includes("powerpoint") || app.includes("office"))
    return { category: "Gestión de correos", label: `Office (${appName})` };

  // Spotify/media
  if (app.includes("spotify") || app.includes("vlc") || app.includes("media"))
    return { category: "Inactividad", label: `Media (${appName})` };

  return { category: "Otros", label: appName || "Aplicación desconocida" };
}

function extractSiteFromTitle(title) {
  if (!title) return "sitio web";
  // Los títulos de navegador suelen ser "Título - Google Chrome" etc.
  const parts = title.split(" - ");
  if (parts.length >= 2) return parts[parts.length - 2] || parts[0];
  return title.substring(0, 40);
}

async function sendLog(action, category, metadata) {
  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_email: AGENT_EMAIL,
        agent_name: AGENT_NAME,
        action,
        category,
        metadata,
        duration_ms: metadata?.duration_ms || null,
      }),
    });
  } catch (e) {
    // Silencioso - no romper si el API no está disponible
  }
}

async function poll() {
  try {
    const win = await getActiveWindow();

    if (!win) {
      // Sin ventana activa - posible bloqueo de pantalla
      if (!isIdle) {
        isIdle = true;
        const dwellSec = Math.round((Date.now() - appEnterTime) / 1000);
        if (Date.now() - appEnterTime >= MIN_DWELL && lastApp) {
          const { category, label } = categorizeApp(lastApp, lastTitle);
          await sendLog(
            `Dejó de usar "${label}" (pantalla bloqueada o sin ventana activa) después de ${formatDwell(dwellSec)}`,
            category,
            { app: lastApp, title: lastTitle, dwell_seconds: dwellSec, reason: "no_window" }
          );
        }
        lastApp = null;
        lastTitle = null;
      }
      return;
    }

    const appName = win.owner.name || "Unknown";
    const title = win.title || "";
    const now = Date.now();

    // Detectar cambio de aplicación (solo por app, no por título)
    if (appName !== lastApp) {
      const dwellMs = now - appEnterTime;

      // Registrar tiempo en la app anterior si fue significativo
      if (lastApp && dwellMs >= MIN_DWELL) {
        const dwellSec = Math.round(dwellMs / 1000);
        const { category, label } = categorizeApp(lastApp, lastTitle);
        await sendLog(
          `Usó "${label}" durante ${formatDwell(dwellSec)}${lastTitle ? ` (${lastTitle.substring(0, 60)})` : ""}`,
          category,
          { app: lastApp, title: lastTitle, dwell_seconds: dwellSec, duration_ms: dwellMs }
        );
      }

      // Registrar nueva app
      const { category, label } = categorizeApp(appName, title);
      const isNewApp = !loggedApps.has(appName);
      loggedApps.add(appName);

      await sendLog(
        isNewApp
          ? `Abrió "${label}"${title ? ` — ${title.substring(0, 60)}` : ""}`
          : `Cambió a "${label}"${title ? ` — ${title.substring(0, 60)}` : ""}`,
        category,
        { app: appName, title: title.substring(0, 100), first_use: isNewApp }
      );

      lastApp = appName;
      lastTitle = title;
      appEnterTime = now;
      lastActivityTime = now;
      isIdle = false;
      lastHeartbeatBucket = 0;
    } else if (title !== lastTitle) {
      // Solo cambió el título, no loguear evento
      lastTitle = title;
      lastActivityTime = now;
    } else {
      // Misma app - actualizar tiempo de actividad
      lastActivityTime = now;

      // Heartbeat cada ~5min en la misma app (sin duplicados)
      const dwellSec = Math.round((now - appEnterTime) / 1000);
      const bucket = Math.floor(dwellSec / HEARTBEAT_EVERY);
      if (bucket > lastHeartbeatBucket && dwellSec >= HEARTBEAT_EVERY) {
        lastHeartbeatBucket = bucket;
        const { category, label } = categorizeApp(appName, title);
        await sendLog(
          `Sigue usando "${label}" (lleva ${formatDwell(dwellSec)})${title ? ` — ${title.substring(0, 60)}` : ""}`,
          category,
          { app: appName, title: title.substring(0, 100), dwell_seconds: dwellSec, duration_ms: 60000 }
        );
      }
    }

    // Detectar inactividad (sin cambio de app ni interacción por 5 min)
    if (now - lastActivityTime > IDLE_THRESHOLD && !isIdle) {
      isIdle = true;
      const { category, label } = categorizeApp(appName, title);
      const idleSec = Math.round((now - lastActivityTime) / 1000);
      await sendLog(
        `Sin actividad detectada por 5 minutos mientras "${label}" estaba abierta`,
        "Inactividad",
        { app: appName, title: title.substring(0, 100), idle_seconds: idleSec }
      );
    }
  } catch (e) {
    // Error silencioso
  }
}

function formatDwell(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  if (min < 60) return `${min}min ${sec}s`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}min`;
}

// Inicio
console.log(`\n🟢 Activity Tracker Desktop Agent`);
console.log(`   Agente: ${AGENT_NAME} (${AGENT_EMAIL})`);
console.log(`   API: ${API_URL}`);
console.log(`   Monitoreando actividad del sistema cada ${POLL_INTERVAL / 1000}s...\n`);

setInterval(poll, POLL_INTERVAL);
poll(); // primera ejecución inmediata

// Cierre limpio
process.on("SIGINT", async () => {
  if (lastApp && Date.now() - appEnterTime >= MIN_DWELL) {
    const dwellSec = Math.round((Date.now() - appEnterTime) / 1000);
    const { category, label } = categorizeApp(lastApp, lastTitle);
    await sendLog(
      `Cerró el agente de escritorio. Última app: "${label}" (${formatDwell(dwellSec)})`,
      category,
      { app: lastApp, title: lastTitle, dwell_seconds: dwellSec }
    );
  }
  console.log("\n🔴 Agente detenido.");
  process.exit(0);
});
