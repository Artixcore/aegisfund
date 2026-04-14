import {
  decryptEnvelopeUtf8,
  decryptEnvelopeUtf8FromRaw32,
  encryptUtf8Envelope,
  encryptUtf8EnvelopeFromRaw32,
  randomNonceHex,
  sharedSecretFromPair,
  signChatWire,
  verifyChatWire,
} from "./crypto";
import type { P2pChatWireV1, P2pIdentityRecord, P2pPeerRecord, P2pPlainPayload } from "./types";

export function serializePlainPayload(plain: string | P2pPlainPayload): string {
  if (typeof plain === "string") return JSON.stringify({ kind: "text", text: plain } satisfies P2pPlainPayload);
  return JSON.stringify(plain);
}

export function parsePlaintextPayload(inner: string): P2pPlainPayload {
  try {
    const o = JSON.parse(inner) as P2pPlainPayload;
    if (o && o.kind === "text" && typeof (o as { text?: string }).text === "string") {
      return { kind: "text", text: (o as { text: string }).text };
    }
    if (
      o &&
      o.kind === "file" &&
      typeof (o as { cid?: string }).cid === "string" &&
      typeof (o as { fileKeyWrapB64?: string }).fileKeyWrapB64 === "string"
    ) {
      return o as Extract<P2pPlainPayload, { kind: "file" }>;
    }
  } catch {
    /* legacy */
  }
  return { kind: "text", text: inner };
}

export async function buildOutgoingChat(
  self: P2pIdentityRecord,
  peer: P2pPeerRecord,
  plain: string | P2pPlainPayload,
  opts?: { sessionKeyMaterial32?: Uint8Array | null },
): Promise<P2pChatWireV1> {
  const inner = serializePlainPayload(plain);
  const envelope =
    opts?.sessionKeyMaterial32 && opts.sessionKeyMaterial32.length === 32
      ? await encryptUtf8EnvelopeFromRaw32(inner, opts.sessionKeyMaterial32)
      : await encryptUtf8Envelope(inner, await sharedSecretFromPair(self.x25519SecretB64, peer.x25519PubB64));
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
  opts?: { sessionKeyMaterial32?: Uint8Array | null },
): Promise<string> {
  if (!(await verifyChatWire(msg))) throw new Error("Invalid signature");
  if (msg.toUserId !== self.userId) throw new Error("Wrong recipient");
  if (opts?.sessionKeyMaterial32 && opts.sessionKeyMaterial32.length === 32) {
    return decryptEnvelopeUtf8FromRaw32(msg.envelope, opts.sessionKeyMaterial32);
  }
  const shared = await sharedSecretFromPair(self.x25519SecretB64, peer.x25519PubB64);
  return decryptEnvelopeUtf8(msg.envelope, shared);
}
