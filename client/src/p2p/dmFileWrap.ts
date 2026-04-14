import { decryptEnvelopeUtf8, encryptUtf8Envelope, sharedSecretFromPair } from "./crypto";
import type { P2pIdentityRecord, P2pPeerRecord } from "./types";

export async function wrapAesKeyForDmPeer(
  aesKeyB64: string,
  self: P2pIdentityRecord,
  peer: P2pPeerRecord,
): Promise<string> {
  const shared = await sharedSecretFromPair(self.x25519SecretB64, peer.x25519PubB64);
  const env = await encryptUtf8Envelope(JSON.stringify({ aesKeyB64 }), shared);
  return JSON.stringify(env);
}

export async function unwrapAesKeyFromDmPeer(
  fileKeyWrapJson: string,
  self: P2pIdentityRecord,
  peer: P2pPeerRecord,
): Promise<string> {
  const shared = await sharedSecretFromPair(self.x25519SecretB64, peer.x25519PubB64);
  const env = JSON.parse(fileKeyWrapJson) as Parameters<typeof decryptEnvelopeUtf8>[0];
  const inner = await decryptEnvelopeUtf8(env, shared);
  const o = JSON.parse(inner) as { aesKeyB64?: string };
  if (!o.aesKeyB64) throw new Error("Invalid file key wrap");
  return o.aesKeyB64;
}
