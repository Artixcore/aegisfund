import { bytesToB64, b64ToBytes } from "./encoding";
import type { P2pIdentityRecord } from "./types";

const EXPORT_PBKDF2_ITER = 250_000;
const EXPORT_V = 1;

export type P2pIdentityExportV1 = {
  v: typeof EXPORT_V;
  saltB64: string;
  iv: string;
  ciphertext: string;
  /** Public fields only (for display before decrypt). */
  hint: { userId: string; signingPubB64: string; x25519PubB64: string; displayName?: string; createdAt: number };
};

function exportPlainJson(id: P2pIdentityRecord): string {
  return JSON.stringify({
    userId: id.userId,
    signingPubB64: id.signingPubB64,
    x25519PubB64: id.x25519PubB64,
    signingSecretB64: id.signingSecretB64,
    x25519SecretB64: id.x25519SecretB64,
    displayName: id.displayName,
    createdAt: id.createdAt,
    wrappedSecrets: id.wrappedSecrets,
  });
}

/** Full identity encrypted with a user-chosen password (distinct from screen-lock wrap). */
export async function exportIdentityEncrypted(id: P2pIdentityRecord, password: string): Promise<P2pIdentityExportV1> {
  if (!id.signingSecretB64 || !id.x25519SecretB64) {
    throw new Error("Unlock identity before export, or export locked bundle is not supported in v1");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const aesRaw = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new Uint8Array(salt) as BufferSource, iterations: EXPORT_PBKDF2_ITER, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const aesKey = await crypto.subtle.importKey("raw", aesRaw, { name: "AES-GCM" }, false, ["encrypt"]);
  const plaintext = enc.encode(exportPlainJson(id));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, aesKey, plaintext),
  );
  return {
    v: EXPORT_V,
    saltB64: bytesToB64(salt),
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(ciphertext),
    hint: {
      userId: id.userId,
      signingPubB64: id.signingPubB64,
      x25519PubB64: id.x25519PubB64,
      displayName: id.displayName,
      createdAt: id.createdAt,
    },
  };
}

export async function importIdentityEncrypted(bundle: P2pIdentityExportV1, password: string): Promise<P2pIdentityRecord> {
  if (bundle.v !== EXPORT_V || !bundle.saltB64 || !bundle.iv || !bundle.ciphertext) {
    throw new Error("Invalid export bundle");
  }
  const salt = b64ToBytes(bundle.saltB64);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const aesRaw = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new Uint8Array(salt) as BufferSource, iterations: EXPORT_PBKDF2_ITER, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const aesKey = await crypto.subtle.importKey("raw", aesRaw, { name: "AES-GCM" }, false, ["decrypt"]);
  const ivBytes = b64ToBytes(bundle.iv);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(ivBytes) as BufferSource },
    aesKey,
    new Uint8Array(b64ToBytes(bundle.ciphertext)) as BufferSource,
  );
  const o = JSON.parse(new TextDecoder().decode(plainBuf)) as P2pIdentityRecord;
  if (!o.userId || !o.signingPubB64 || !o.x25519PubB64) throw new Error("Invalid decrypted identity");
  return {
    userId: o.userId,
    signingPubB64: o.signingPubB64,
    x25519PubB64: o.x25519PubB64,
    signingSecretB64: o.signingSecretB64 ?? "",
    x25519SecretB64: o.x25519SecretB64 ?? "",
    displayName: o.displayName,
    createdAt: o.createdAt ?? Date.now(),
    wrappedSecrets: o.wrappedSecrets,
  };
}
