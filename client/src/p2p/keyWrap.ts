import { bytesToB64, b64ToBytes } from "./encoding";
import type { P2pIdentityRecord } from "./types";

const PBKDF2_ITER = 250_000;

function secretsPayload(id: P2pIdentityRecord): string {
  return JSON.stringify({
    signingSecretB64: id.signingSecretB64,
    x25519SecretB64: id.x25519SecretB64,
  });
}

export async function wrapIdentitySecrets(id: P2pIdentityRecord, passphrase: string): Promise<P2pIdentityRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveBits"]);
  const aesRaw = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new Uint8Array(salt) as BufferSource, iterations: PBKDF2_ITER, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const aesKey = await crypto.subtle.importKey("raw", aesRaw, { name: "AES-GCM" }, false, ["encrypt"]);
  const plaintext = enc.encode(secretsPayload(id));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, aesKey, plaintext),
  );
  return {
    ...id,
    signingSecretB64: "",
    x25519SecretB64: "",
    wrappedSecrets: {
      saltB64: bytesToB64(salt),
      iv: bytesToB64(iv),
      ciphertext: bytesToB64(ciphertext),
    },
  };
}

export async function unwrapIdentitySecrets(id: P2pIdentityRecord, passphrase: string): Promise<P2pIdentityRecord> {
  if (!id.wrappedSecrets) throw new Error("Identity is not locked");
  const { saltB64, iv, ciphertext } = id.wrappedSecrets;
  const salt = b64ToBytes(saltB64);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveBits"]);
  const aesRaw = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new Uint8Array(salt) as BufferSource, iterations: PBKDF2_ITER, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const aesKey = await crypto.subtle.importKey("raw", aesRaw, { name: "AES-GCM" }, false, ["decrypt"]);
  const ivBytes = b64ToBytes(iv);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(ivBytes) as BufferSource },
    aesKey,
    new Uint8Array(b64ToBytes(ciphertext)) as BufferSource,
  );
  const parsed = JSON.parse(new TextDecoder().decode(plainBuf)) as {
    signingSecretB64: string;
    x25519SecretB64: string;
  };
  return {
    ...id,
    signingSecretB64: parsed.signingSecretB64,
    x25519SecretB64: parsed.x25519SecretB64,
    wrappedSecrets: undefined,
  };
}
