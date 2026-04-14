/**
 * Browser AES-GCM for message relay payloads. Server stores ciphertext only.
 * Replace shared `encryptionKey` with X25519 session keys per docs/E2E_CRYPTO_SPEC.md.
 */

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function deriveAesKey(secretUtf8: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secretUtf8));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export type CiphertextEnvelopeV1 = {
  v: 1;
  iv: string;
  ciphertext: string;
  tag?: string;
};

export async function encryptUtf8ToEnvelope(plaintext: string, secretUtf8: string): Promise<CiphertextEnvelopeV1> {
  const key = await deriveAesKey(secretUtf8);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const combined = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  return {
    v: 1,
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(combined),
  };
}

export async function decryptEnvelopeToUtf8(envelope: CiphertextEnvelopeV1, secretUtf8: string): Promise<string> {
  const key = await deriveAesKey(secretUtf8);
  const iv = b64ToBytes(envelope.iv);
  const combined = b64ToBytes(envelope.ciphertext);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    combined as BufferSource,
  );
  return new TextDecoder().decode(plain);
}
