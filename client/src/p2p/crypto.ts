import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { bytesToB64, b64ToBytes, hexFromBytes } from "./encoding";
import type { CiphertextEnvelopeV1, P2pChatWireV1, P2pIdentityRecord, P2pInviteV1, P2pPeerRecord } from "./types";

const HKDF_SALT_LABEL = new TextEncoder().encode("aegis-p2p-hkdf-salt-v1");
const HKDF_INFO = new TextEncoder().encode("aegis-p2p-msg-v1");

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

export async function userIdFromSigningPublicKey(signingPublicKey: Uint8Array): Promise<string> {
  return hexFromBytes(await sha256(signingPublicKey));
}

export async function createFullIdentity(displayName?: string): Promise<P2pIdentityRecord> {
  const { secretKey: signingSecret, publicKey: signingPub } = ed25519.keygen();
  const { secretKey: x25519Secret, publicKey: x25519Pub } = x25519.keygen();
  const signingPubB64 = bytesToB64(signingPub);
  const userId = await userIdFromSigningPublicKey(signingPub);
  return {
    userId,
    signingPubB64,
    x25519PubB64: bytesToB64(x25519Pub),
    signingSecretB64: bytesToB64(signingSecret),
    x25519SecretB64: bytesToB64(x25519Secret),
    displayName,
    createdAt: Date.now(),
  };
}

export function identityToInvite(id: P2pIdentityRecord): P2pInviteV1 {
  return {
    v: 1,
    userId: id.userId,
    signingPubB64: id.signingPubB64,
    x25519PubB64: id.x25519PubB64,
    displayName: id.displayName,
  };
}

export function parseInvite(json: string): P2pInviteV1 {
  const o = JSON.parse(json) as P2pInviteV1;
  if (o.v !== 1 || !o.userId || !o.signingPubB64 || !o.x25519PubB64) {
    throw new Error("Invalid invite envelope");
  }
  return o;
}

export function peerRecordFromInvite(inv: P2pInviteV1): P2pPeerRecord {
  return {
    peerId: inv.userId,
    signingPubB64: inv.signingPubB64,
    x25519PubB64: inv.x25519PubB64,
    displayName: inv.displayName,
    addedAt: Date.now(),
  };
}

export async function sharedSecretFromPair(
  myX25519SecretB64: string,
  peerX25519PubB64: string,
): Promise<Uint8Array> {
  const sec = b64ToBytes(myX25519SecretB64);
  const peerPub = b64ToBytes(peerX25519PubB64);
  return x25519.getSharedSecret(sec, peerPub);
}

async function hkdfAes256Key(ikm: Uint8Array): Promise<CryptoKey> {
  const salt = await sha256(HKDF_SALT_LABEL);
  const baseKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: HKDF_INFO },
    baseKey,
    256,
  );
  const raw = new Uint8Array(bits);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptUtf8Envelope(plaintext: string, sharedSecret: Uint8Array): Promise<CiphertextEnvelopeV1> {
  const key = await hkdfAes256Key(sharedSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const combined = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(plaintext)),
  );
  return { v: 1, iv: bytesToB64(iv), ciphertext: bytesToB64(combined) };
}

export async function decryptEnvelopeUtf8(envelope: CiphertextEnvelopeV1, sharedSecret: Uint8Array): Promise<string> {
  const key = await hkdfAes256Key(sharedSecret);
  const iv = b64ToBytes(envelope.iv);
  const combined = b64ToBytes(envelope.ciphertext);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    combined as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

export async function signingPreimageHash(msg: Omit<P2pChatWireV1, "signatureB64">): Promise<Uint8Array> {
  const canon = [
    "aegis_p2p_v1",
    String(msg.v),
    msg.fromUserId,
    msg.fromSigningPubB64,
    msg.toUserId,
    String(msg.ts),
    msg.nonce,
    msg.envelope.iv,
    msg.envelope.ciphertext,
  ].join("|");
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canon)));
}

export async function signChatWire(
  body: Omit<P2pChatWireV1, "signatureB64">,
  signingSecretB64: string,
): Promise<P2pChatWireV1> {
  const hash = await signingPreimageHash(body);
  const sig = ed25519.sign(hash, b64ToBytes(signingSecretB64));
  return { ...body, signatureB64: bytesToB64(sig) };
}

export async function verifyChatWire(msg: P2pChatWireV1): Promise<boolean> {
  const { signatureB64, ...rest } = msg;
  const hash = await signingPreimageHash(rest);
  const sig = b64ToBytes(signatureB64);
  const pub = b64ToBytes(msg.fromSigningPubB64);
  try {
    return ed25519.verify(sig, hash, pub);
  } catch {
    return false;
  }
}

export function randomNonceHex(): string {
  return hexFromBytes(crypto.getRandomValues(new Uint8Array(16)));
}
