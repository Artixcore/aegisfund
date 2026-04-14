import {
  decryptEnvelopeUtf8,
  decryptEnvelopeUtf8FromRaw32,
  encryptUtf8Envelope,
  encryptUtf8EnvelopeFromRaw32,
  sharedSecretFromPair,
} from "./crypto";
import { bytesToB64, b64ToBytes } from "./encoding";
import type { P2pGroupWirePayload } from "./types";

export function randomGroupKeyB64(): string {
  return bytesToB64(crypto.getRandomValues(new Uint8Array(32)));
}

export async function wrapGroupKeyForPeer(opts: {
  groupKeyB64: string;
  myX25519SecretB64: string;
  peerX25519PubB64: string;
}): Promise<string> {
  const shared = await sharedSecretFromPair(opts.myX25519SecretB64, opts.peerX25519PubB64);
  const env = await encryptUtf8Envelope(JSON.stringify({ groupKeyB64: opts.groupKeyB64 }), shared);
  return JSON.stringify(env);
}

export async function unwrapGroupKeyFromPeer(opts: {
  wrapJson: string;
  myX25519SecretB64: string;
  peerX25519PubB64: string;
}): Promise<string> {
  const shared = await sharedSecretFromPair(opts.myX25519SecretB64, opts.peerX25519PubB64);
  const env = JSON.parse(opts.wrapJson) as Parameters<typeof decryptEnvelopeUtf8>[0];
  const inner = await decryptEnvelopeUtf8(env, shared);
  const o = JSON.parse(inner) as { groupKeyB64?: string };
  if (!o.groupKeyB64) throw new Error("Invalid group key wrap");
  return o.groupKeyB64;
}

export async function encryptGroupPayload(groupKeyB64: string, inner: P2pGroupWirePayload): Promise<string> {
  const raw = b64ToBytes(groupKeyB64);
  if (raw.length !== 32) throw new Error("Group key must be 32 bytes");
  const env = await encryptUtf8EnvelopeFromRaw32(JSON.stringify(inner), raw);
  return JSON.stringify(env);
}

export async function decryptGroupPayload(groupKeyB64: string, sealedJson: string): Promise<P2pGroupWirePayload> {
  const raw = b64ToBytes(groupKeyB64);
  if (raw.length !== 32) throw new Error("Group key must be 32 bytes");
  const env = JSON.parse(sealedJson) as Parameters<typeof decryptEnvelopeUtf8FromRaw32>[0];
  const plain = await decryptEnvelopeUtf8FromRaw32(env, raw);
  return JSON.parse(plain) as P2pGroupWirePayload;
}
