import { describe, expect, it } from "vitest";
import {
  createFullIdentity,
  decryptEnvelopeUtf8,
  encryptUtf8Envelope,
  randomNonceHex,
  sharedSecretFromPair,
  userIdFromSigningPublicKey,
  verifyChatWire,
} from "./crypto";
import { b64ToBytes, bytesToB64 } from "./encoding";
import { buildOutgoingChat, decryptIncomingChat } from "./message";
import type { P2pPeerRecord } from "./types";
import { ReplayGuard } from "./replay";

describe("p2p crypto", () => {
  it("derives matching shared secrets", async () => {
    const a = await createFullIdentity();
    const b = await createFullIdentity();
    const sa = await sharedSecretFromPair(a.x25519SecretB64, b.x25519PubB64);
    const sb = await sharedSecretFromPair(b.x25519SecretB64, a.x25519PubB64);
    expect(sa.length === sb.length && sa.every((v, i) => v === sb[i])).toBe(true);
  });

  it("encrypts and decrypts with HKDF-derived key", async () => {
    const a = await createFullIdentity();
    const b = await createFullIdentity();
    const shared = await sharedSecretFromPair(a.x25519SecretB64, b.x25519PubB64);
    const env = await encryptUtf8Envelope("hello p2p", shared);
    const plain = await decryptEnvelopeUtf8(env, shared);
    expect(plain).toBe("hello p2p");
  });

  it("userId is sha256 of signing public key", async () => {
    const a = await createFullIdentity();
    const uid = await userIdFromSigningPublicKey(b64ToBytes(a.signingPubB64));
    expect(uid).toBe(a.userId);
  });

  it("signs and verifies chat wire", async () => {
    const a = await createFullIdentity();
    const b = await createFullIdentity();
    const peer: P2pPeerRecord = {
      peerId: b.userId,
      signingPubB64: b.signingPubB64,
      x25519PubB64: b.x25519PubB64,
      addedAt: 1,
    };
    const wire = await buildOutgoingChat(a, peer, "m1");
    expect(await verifyChatWire(wire)).toBe(true);
    const tampered = { ...wire, signatureB64: bytesToB64(new Uint8Array(64)) };
    expect(await verifyChatWire(tampered)).toBe(false);
  });

  it("end-to-end build and decrypt between two identities", async () => {
    const alice = await createFullIdentity();
    const bob = await createFullIdentity();
    const bobAsPeer: P2pPeerRecord = {
      peerId: bob.userId,
      signingPubB64: bob.signingPubB64,
      x25519PubB64: bob.x25519PubB64,
      addedAt: 1,
    };
    const aliceAsPeer: P2pPeerRecord = {
      peerId: alice.userId,
      signingPubB64: alice.signingPubB64,
      x25519PubB64: alice.x25519PubB64,
      addedAt: 1,
    };
    const wire = await buildOutgoingChat(alice, bobAsPeer, "secret text");
    const plain = await decryptIncomingChat(wire, bob, aliceAsPeer);
    expect(plain).toBe("secret text");
  });

  it("nonce helper returns 32 hex chars", () => {
    expect(randomNonceHex().length).toBe(32);
  });
});

describe("ReplayGuard", () => {
  it("rejects duplicate id", () => {
    const g = new ReplayGuard();
    const peer = "p1";
    expect(g.checkAndRecord(peer, "id1", Date.now(), "n1")).toBe("ok");
    expect(g.checkAndRecord(peer, "id1", Date.now(), "n2")).toBe("dup_id");
  });

  it("rejects duplicate nonce", () => {
    const g = new ReplayGuard();
    const peer = "p1";
    expect(g.checkAndRecord(peer, "id1", Date.now(), "same")).toBe("ok");
    expect(g.checkAndRecord(peer, "id2", Date.now(), "same")).toBe("dup_nonce");
  });
});
