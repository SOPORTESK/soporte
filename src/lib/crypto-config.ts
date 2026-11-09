import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, "sekunet-salt-v1", 32);
}

function getCandidateSecrets(): string[] {
  const candidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.APP_ENCRYPTION_KEY,
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUxMTk1NCwiZXhwIjoyMDkxMDg3OTU0fQ.GlF4Zieqqc1V1IAPshPFKb1QzKBBbO8n1RGK_wG_JuM",
    "default-secret-do-not-use-in-prod",
  ].filter((s): s is string => Boolean(s && s.trim()));
  return Array.from(new Set(candidates.map((s) => s.trim())));
}

export function encrypt(text: string): { encrypted: string; iv: string; tag: string } {
  const secrets = getCandidateSecrets();
  const key = deriveKey(secrets[0] || "default-secret-do-not-use-in-prod");
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGO, key, iv);
  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");
  return {
    encrypted,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decrypt(encrypted: string, ivBase64: string, tagBase64: string): string {
  if (!encrypted) return "";
  if (
    encrypted.trim().startsWith("{") ||
    !ivBase64 ||
    ivBase64 === "none" ||
    !tagBase64 ||
    tagBase64 === "none"
  ) {
    return encrypted;
  }
  const iv = Buffer.from(ivBase64, "base64");
  const tag = Buffer.from(tagBase64, "base64");
  let lastError: unknown = null;

  for (const secret of getCandidateSecrets()) {
    try {
      const decipher = createDecipheriv(ALGO, deriveKey(secret), iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(encrypted, "base64", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Unable to decrypt value with any candidate key");
}
