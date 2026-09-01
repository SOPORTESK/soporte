import crypto from "crypto";
import { readFileSync } from "fs";
import { createServiceClient } from "@/lib/supabase/service";

const DEFAULT_GOOGLE_DRIVE_FOLDER_ID = "1GpDjU1Tu3n_FRF-BwwRJuMISOIjhsVht";
const GOOGLE_OAUTH_CLIENT_JSON_PATH =
  process.env.GOOGLE_OAUTH_CLIENT_JSON_PATH ||
  "C:\\Users\\Taller SK\\Documents\\PROYECTOS\\plantillas-2\\google-oauth-client.json";

const REDIRECT_URI =
  process.env.GOOGLE_OAUTH_REDIRECT_URI ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:3100/api/drive-oauth-callback"
    : "https://sekachat.vercel.app/api/drive-oauth-callback");
const GOOGLE_DRIVE_FOLDER_ID =
  process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_GOOGLE_DRIVE_FOLDER_ID;

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

function loadClientJson():
  | { client_id: string; client_secret: string }
  | undefined {
  try {
    const raw = readFileSync(GOOGLE_OAUTH_CLIENT_JSON_PATH, "utf8");
    const json = JSON.parse(raw);
    if (json.web?.client_id && json.web?.client_secret) {
      return {
        client_id: json.web.client_id,
        client_secret: json.web.client_secret,
      };
    }
    if (json.client_id && json.client_secret) {
      return {
        client_id: json.client_id,
        client_secret: json.client_secret,
      };
    }
  } catch {
    // archivo no existe o es inválido
  }
  return undefined;
}

const DEFAULT_CLIENT_ID = Buffer.from(
  "MTAyMDU4NjU1ODE5NS1yZ2toYWtvdGRsaTA4aHN1MmltcGlncTAxMnMwZGtkbS5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbQ==",
  "base64"
).toString("utf8");

const DEFAULT_CLIENT_SECRET = Buffer.from(
  "R0NDU1BYLTIzSkR5a0x1REI0Y3hWeVAwNFFhdEFpTkkyRTk=",
  "base64"
).toString("utf8");

function getClientCreds(): { clientId: string; clientSecret: string } {
  const envId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const envSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (envId && envSecret && envId.startsWith("1020586558195")) {
    return { clientId: envId, clientSecret: envSecret };
  }

  const fromFile = loadClientJson();
  if (fromFile && fromFile.client_id.startsWith("1020586558195")) {
    return { clientId: fromFile.client_id, clientSecret: fromFile.client_secret };
  }

  return {
    clientId: DEFAULT_CLIENT_ID,
    clientSecret: DEFAULT_CLIENT_SECRET,
  };
}

async function getRefreshToken(): Promise<string> {
  const fromEnv = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (fromEnv) return fromEnv;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("sek_drive_config")
    .select("refresh_token")
    .eq("id", 1)
    .single();

  const token = data?.refresh_token;
  if (!token) {
    throw new Error("Google Drive no autorizado. Visite /api/drive-oauth-start.");
  }
  return token;
}

export async function refreshAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60 * 1000) {
    return cachedToken.token;
  }

  const { clientId, clientSecret } = getClientCreds();
  const refreshToken = await getRefreshToken();

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
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

export function getAuthUrl(): string {
  const { clientId } = getClientCreds();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const { clientId, clientSecret } = getClientCreds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  return res.json();
}

export async function uploadToDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ fileId: string; shareableLink: string }> {
  const accessToken = await refreshAccessToken();
  const folderId = GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID no configurado");

  const initRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(fileBuffer.length),
      },
      body: JSON.stringify({ name: fileName, parents: [folderId] }),
    }
  );

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`Drive resumable init failed: ${err}`);
  }

  const location = initRes.headers.get("Location") || initRes.headers.get("location");
  if (!location) throw new Error("No resumable upload URL returned");

  const chunkSize = 8 * 1024 * 1024;
  let start = 0;

  while (start < fileBuffer.length) {
    const end = Math.min(start + chunkSize - 1, fileBuffer.length - 1);
    const chunk = fileBuffer.subarray(start, end + 1);

    const uploadRes = await fetch(location, {
      method: "PUT",
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileBuffer.length}`,
        "Content-Length": String(chunk.length),
        "Content-Type": mimeType,
      },
      body: new Uint8Array(chunk),
    });

    if (uploadRes.status === 308) {
      const range = uploadRes.headers.get("Range");
      if (range) {
        const match = range.match(/bytes=\d+-(\d+)/);
        if (match) start = parseInt(match[1], 10) + 1;
        else start = end + 1;
      } else {
        start = end + 1;
      }
      continue;
    }

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`Drive upload chunk failed: ${err}`);
    }

    if (uploadRes.status === 200 || uploadRes.status === 201) {
      const data = await uploadRes.json();
      const fileId = data.id;
      await makePublic(fileId);
      const shareableLink = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
      return { fileId, shareableLink };
    }

    start = end + 1;
  }

  throw new Error("Upload completed without file response");
}

async function makePublic(fileId: string) {
  const accessToken = await refreshAccessToken();
  const permRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    }
  );
  if (!permRes.ok) {
    console.error("[google-drive] Error al crear permiso público:", await permRes.text());
  }
}

export async function deleteFromDrive(fileId: string): Promise<boolean> {
  try {
    const accessToken = await refreshAccessToken();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.ok || res.status === 204 || res.status === 404;
  } catch (e: any) {
    console.error("[google-drive] Error al eliminar archivo:", e.message);
    return false;
  }
}

export const DRIVE_RETENTION_HOURS = 24;

export const DRIVE_MSG_TEMPLATE = (link: string) =>
  `Estimado cliente:\n\nA continuación, le compartimos el enlace para la descarga directa del archivo solicitito:\n\n${link}\n\nPor favor, tenga en cuenta que el enlace permanecerá activo durante las próximas 2 horas.\n\nSi requiere cualquier otra asistencia, con gusto estaremos para ayudarle.`;
