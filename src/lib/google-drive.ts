import crypto from "crypto";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
const REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI || "https://sekachat.vercel.app/api/drive-oauth-callback";

export function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
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

async function refreshAccessToken(): Promise<string> {
  let refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (!refreshToken) {
    const { createServiceClient } = await import("@/lib/supabase/service");
    const sb = createServiceClient();
    const { data } = await sb.from("sek_drive_config").select("refresh_token").eq("id", 1).single();
    refreshToken = data?.refresh_token;
  }
  if (!refreshToken) throw new Error("Google Drive no autorizado. Visite /api/drive-oauth-start para autorizar.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }
  const data = await res.json();
  return data.access_token;
}

export async function uploadToDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ fileId: string; shareableLink: string }> {
  const accessToken = await refreshAccessToken();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID no configurado");

  const boundary = "-------sekunet" + crypto.randomBytes(8).toString("hex");
  const metadata = JSON.stringify({
    name: fileName,
    parents: [folderId],
  });

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    Buffer.from(metadata),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive upload failed: ${err}`);
  }

  const fileData = await res.json();
  const fileId = fileData.id;

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

  const shareableLink = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
  return { fileId, shareableLink };
}

export async function deleteFromDrive(fileId: string): Promise<boolean> {
  try {
    const accessToken = await refreshAccessToken();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.ok || res.status === 204;
  } catch (e: any) {
    console.error("[google-drive] Error al eliminar archivo:", e.message);
    return false;
  }
}

export const DRIVE_RETENTION_HOURS = 24;

export const DRIVE_MSG_TEMPLATE = (link: string) =>
  `Estimado cliente:\n\nA continuación, le compartimos el enlace para la descarga directa del archivo solicitido:\n\n${link}\n\nPor favor, tenga en cuenta que el enlace permanecerá activo durante las próximas 2 horas.\n\nSi requiere cualquier otra asistencia, con gusto estaremos para ayudarle.`;
