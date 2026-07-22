import crypto from "crypto";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri: string;
}

function getServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no configurado");
  return JSON.parse(raw);
}

async function getAccessToken(): Promise<string> {
  const sa = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: sa.token_uri,
    exp: now + 3600,
    iat: now,
  })).toString("base64url");

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(sa.private_key, "base64url");
  const jwt = `${header}.${payload}.${signature}`;

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google OAuth failed: ${err}`);
  }
  const data = await res.json();
  return data.access_token;
}

export async function uploadToDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ fileId: string; shareableLink: string }> {
  const accessToken = await getAccessToken();
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
    const accessToken = await getAccessToken();
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
