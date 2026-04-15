import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ENV } from "./_core/env";

const PREFIX = "aegis1:";

function loadRawKey(): Buffer | null {
  const raw = ENV.databaseFieldEncryptionKey;
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  try {
    const b = Buffer.from(raw, "base64");
    if (b.length === 32) return b;
  } catch {
    /* ignore */
  }
  return null;
}

export function isFieldEncryptionConfigured(): boolean {
  return loadRawKey() !== null;
}

/** Call before persisting sensitive columns in production. */
export function assertFieldEncryptionForWrites(): void {
  if (ENV.isProduction && !isFieldEncryptionConfigured()) {
    throw new Error(
      "DATABASE_FIELD_ENCRYPTION_KEY is required in production to persist sensitive user data (KYC, MFA, profile PII).",
    );
  }
}

export function encryptUtf8Field(plaintext: string | null | undefined, aad: string): string | null {
  if (plaintext == null || plaintext === "") return plaintext ?? null;
  const key = loadRawKey();
  if (!key) {
    if (ENV.isProduction) {
      throw new Error("DATABASE_FIELD_ENCRYPTION_KEY is missing but production requires encrypted storage.");
    }
    return plaintext;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, tag, enc]);
  return PREFIX + combined.toString("base64");
}

export function decryptUtf8Field(stored: string | null | undefined, aad: string): string | null {
  if (stored == null || stored === "") return stored ?? null;
  if (!stored.startsWith(PREFIX)) return stored;
  const key = loadRawKey();
  if (!key) return stored;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return stored;
  }
}
