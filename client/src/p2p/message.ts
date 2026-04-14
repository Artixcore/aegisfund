import {
  decryptEnvelopeUtf8,
  encryptUtf8Envelope,
  randomNonceHex,
  sharedSecretFromPair,
  signChatWire,
  verifyChatWire,
} from "./crypto";
import type { P2pChatWireV1, P2pIdentityRecord, P2pPeerRecord } from "./types";

export async function buildOutgoingChat(self: P2pIdentityRecord, peer: P2pPeerRecord, plaintext: string): Promise<P2pChatWireV1> {
  const shared = await sharedSecretFromPair(self.x25519SecretB64, peer.x25519PubB64);
  const envelope = await encryptUtf8Envelope(plaintext, shared);
  const body: Omit<P2pChatWireV1, "signatureB64"> = {
    v: 1,
    id: crypto.randomUUID(),
    fromUserId: self.userId,
    fromSigningPubB64: self.signingPubB64,
    toUserId: peer.peerId,
    ts: Date.now(),
    nonce: randomNonceHex(),
    envelope,
  };
  return signChatWire(body, self.signingSecretB64);
}

export async function decryptIncomingChat(
  msg: P2pChatWireV1,
  self: P2pIdentityRecord,
  peer: P2pPeerRecord,
): Promise<string> {
  if (!(await verifyChatWire(msg))) throw new Error("Invalid signature");
  if (msg.toUserId !== self.userId) throw new Error("Wrong recipient");
  const shared = await sharedSecretFromPair(self.x25519SecretB64, peer.x25519PubB64);
  return decryptEnvelopeUtf8(msg.envelope, shared);
}
