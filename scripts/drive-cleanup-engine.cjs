const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_FOLDER_ID = "1GpDjU1Tu3n_FRF-BwwRJuMISOIjhsVht";
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
const RETENTION_HOURS = 24;

let cachedAccessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken(force = false) {
  if (!force && cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  const { data: config } = await supabase
    .from("sek_drive_config")
    .select("refresh_token")
    .eq("id", 1)
    .single();

  const refreshToken = config?.refresh_token || process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error("No hay refresh_token de Google Drive configurado en sek_drive_config.");
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google token refresh falló: ${errText}`);
  }

  const tokens = await res.json();
  cachedAccessToken = tokens.access_token;
  tokenExpiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;
  return cachedAccessToken;
}

async function deleteDriveFile(fileId, token) {
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok || res.status === 204 || res.status === 404;
  } catch (e) {
    console.error(`[DriveCleanup] Error eliminando ${fileId}:`, e.message);
    return false;
  }
}

async function runDriveCleanup() {
  try {
    const token = await getAccessToken();
    const now = new Date().toISOString();
    let deletedCount = 0;

    // 1. Limpiar registros vencidos en sek_drive_files
    const { data: expired, error: dbErr } = await supabase
      .from("sek_drive_files")
      .select("id, drive_file_id, file_name")
      .eq("deleted", false)
      .lt("expires_at", now)
      .limit(50);

    if (dbErr) {
      console.error("[DriveCleanup] Error consultando sek_drive_files:", dbErr.message);
    } else if (expired && expired.length > 0) {
      for (const f of expired) {
        const ok = await deleteDriveFile(f.drive_file_id, token);
        if (ok) {
          await supabase
            .from("sek_drive_files")
            .update({ deleted: true, deleted_at: now })
            .eq("id", f.id);
          deletedCount++;
        }
      }
    }

    // 2. Failsafe directo en la carpeta de Google Drive:
    // Elimina cualquier archivo creado hace más de RETENTION_HOURS (24 horas)
    try {
      const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000).toISOString();
      const q = encodeURIComponent(`'${FOLDER_ID}' in parents and trashed = false and createdTime < '${cutoff}'`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,createdTime)&pageSize=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (listRes.ok) {
        const listData = await listRes.json();
        for (const file of listData.files || []) {
          const ok = await deleteDriveFile(file.id, token);
          if (ok) {
            console.log(`[DriveCleanup] Archivo huérfano/vencido eliminado de Drive: ${file.name} (${file.id})`);
            deletedCount++;
            await supabase
              .from("sek_drive_files")
              .update({ deleted: true, deleted_at: now })
              .eq("drive_file_id", file.id);
          }
        }
      }
    } catch (scanErr) {
      console.warn("[DriveCleanup] Advertencia en escaneo de carpeta:", scanErr.message);
    }

    if (deletedCount > 0) {
      console.log(`[DriveCleanup] Ciclo completado. Se eliminaron ${deletedCount} archivos expirados.`);
    }
  } catch (err) {
    console.error("[DriveCleanup] Error en ciclo de limpieza:", err.message);
  }
}

function initDriveCleanupEngine() {
  console.log("[DriveCleanup] Motor de limpieza de Google Drive activo en server.js (intervalo 30m)");
  // Ejecutar primera limpieza 15 segundos después del arranque
  setTimeout(() => {
    runDriveCleanup().catch((e) => console.error("[DriveCleanup] Error inicial:", e.message));
  }, 15000);

  // Intervalo cada 30 minutos
  setInterval(() => {
    runDriveCleanup().catch((e) => console.error("[DriveCleanup] Error cíclico:", e.message));
  }, 30 * 60 * 1000);
}

module.exports = {
  runDriveCleanup,
  initDriveCleanupEngine,
};
