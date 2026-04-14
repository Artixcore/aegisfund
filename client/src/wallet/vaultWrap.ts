import { bytesToB64, b64ToBytes } from "@/p2p/encoding";

const PBKDF2_ITER = 250_000;

function payloadFromMnemonic(mnemonic: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ mnemonic }));
}

export async function wrapMnemonic(mnemonic: string, passphrase: string): Promise<{
  saltB64: string;
  iv: string;
  ciphertext: string;
}> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveBits"]);
  const aesRaw = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITER, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const aesKey = await crypto.subtle.importKey("raw", aesRaw, { name: "AES-GCM" }, false, ["encrypt"]);
  const plaintext = payloadFromMnemonic(mnemonic);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, aesKey, plaintext));
  return {
    saltB64: bytesToB64(salt),
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(ciphertext),
  };
}

export async function unwrapMnemonic(wrapped: { saltB64: string; iv: string; ciphertext: string }, passphrase: string): Promise<string> {
  const salt = b64ToBytes(wrapped.saltB64);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveBits"]);
  const aesRaw = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITER, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const aesKey = await crypto.subtle.importKey("raw", aesRaw, { name: "AES-GCM" }, false, ["decrypt"]);
  const ivBytes = b64ToBytes(wrapped.iv);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes as BufferSource },
    aesKey,
    b64ToBytes(wrapped.ciphertext) as BufferSource,
  );
  const parsed = JSON.parse(new TextDecoder().decode(plainBuf)) as { mnemonic: string };
  if (typeof parsed.mnemonic !== "string") throw new Error("Invalid vault payload");
  return parsed.mnemonic;
}
