import { z } from "zod";

export const AEGIS_LOGIN_CHALLENGE_AUD = "aegis-login-challenge";

const hex64 = /^[0-9a-f]{64}$/;

export const ed25519KeyHex64Schema = z
  .string()
  .trim()
  .transform((s) => s.toLowerCase())
  .pipe(z.string().length(64).regex(hex64));

export const ed25519SignatureHex128Schema = z
  .string()
  .trim()
  .transform((s) => s.toLowerCase())
  .pipe(z.string().length(128).regex(/^[0-9a-f]{128}$/));

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.toLowerCase();
  if (h.length % 2 !== 0) throw new Error("Invalid hex length");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error("Invalid hex");
    out[i] = byte;
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i]!.toString(16).padStart(2, "0");
  }
  return s;
}

/** Exact bytes the client signs (UTF-8). Server rebuilds from verified JWT fields only. */
export function buildDappLoginMessage(
  publicKeyHex: string,
  nonce: string,
  expSec: number
): string {
  return `Aegis Fund login\n${publicKeyHex}\n${nonce}\n${String(expSec)}`;
}
