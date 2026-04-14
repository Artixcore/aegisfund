import { bytesToB64, b64ToBytes } from "./encoding";

/** AES-256-GCM file blob: 12-byte IV || ciphertext+tag (Web Crypto output). */
export async function encryptFileToBlob(file: File): Promise<{ blob: Blob; aesKeyB64: string }> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await file.arrayBuffer();
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, buf));
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return { blob: new Blob([out], { type: "application/octet-stream" }), aesKeyB64: bytesToB64(rawKey) };
}

export async function decryptFileBlob(blob: Blob, aesKeyB64: string): Promise<ArrayBuffer> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (buf.length < 13) throw new Error("Invalid file blob");
  const iv = buf.slice(0, 12);
  const ct = buf.slice(12);
  const rawKey = b64ToBytes(aesKeyB64);
  const key = await crypto.subtle.importKey("raw", rawKey as BufferSource, { name: "AES-GCM" }, false, ["decrypt"]);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ct as BufferSource);
}
