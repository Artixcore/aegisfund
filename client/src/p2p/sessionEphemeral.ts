import { x25519 } from "@noble/curves/ed25519.js";
import { bytesToB64, b64ToBytes, hexFromBytes } from "./encoding";
import { sharedSecretFromPair } from "./crypto";

const HKDF_SESSION_INFO = new TextEncoder().encode("aegis-p2p-session-msg-v1");
const HKDF_SESSION_SALT_LABEL = new TextEncoder().encode("aegis-p2p-session-hkdf-salt-v1");

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data as BufferSource));
}

async function hkdfFromIkm(ikm: Uint8Array): Promise<Uint8Array> {
  const salt = await sha256(HKDF_SESSION_SALT_LABEL);
  const baseKey = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: HKDF_SESSION_INFO },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}

export function createEphemeralX25519(): { ephSecretB64: string; ephPubB64: string } {
  const { secretKey, publicKey } = x25519.keygen();
  return { ephSecretB64: bytesToB64(secretKey), ephPubB64: bytesToB64(publicKey) };
}

/**
 * Per-connection message key material: mixes long-term ECDH with ephemeral ECDH for forward secrecy
 * relative to long-term key compromise after the session ends.
 */
export async function deriveDmSessionMessageKeyMaterial(opts: {
  myLongTermSecretB64: string;
  peerLongTermPubB64: string;
  myEphSecretB64: string;
  peerEphPubB64: string;
}): Promise<Uint8Array> {
  const lt = await sharedSecretFromPair(opts.myLongTermSecretB64, opts.peerLongTermPubB64);
  const es = b64ToBytes(opts.myEphSecretB64);
  const ep = b64ToBytes(opts.peerEphPubB64);
  const ephShared = x25519.getSharedSecret(es, ep);
  const ikm = new Uint8Array(lt.length + ephShared.length);
  ikm.set(lt, 0);
  ikm.set(ephShared, lt.length);
  return hkdfFromIkm(ikm);
}

export function sessionDebugTag(material: Uint8Array): string {
  return hexFromBytes(material.slice(0, 8));
}
