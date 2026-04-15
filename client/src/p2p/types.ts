/**
 * Wire format versioning: bump `v` on breaking crypto or canonical signing changes.
 * Clients must reject unknown major versions; optional fields may be ignored forward-compat.
 */
export const P2P_CHAT_WIRE_VERSION = 1 as const;

export type P2pGroupRole = "admin" | "moderator" | "member";

/** Inner plaintext after decrypt: JSON string on the wire (legacy: raw UTF-8 text only). */
export type P2pPlainPayload =
  | { kind: "text"; text: string }
  | {
      kind: "file";
      name: string;
      mime: string;
      size: number;
      cid: string;
      /** JSON.stringify(CiphertextEnvelopeV1) wrapped to the DM ECDH key. */
      fileKeyWrapJson: string;
    }
  | {
      kind: "groupInvite";
      groupId: string;
      name: string;
      /** Output of `wrapGroupKeyForPeer` (JSON envelope string). */
      wrappedGroupKeyJson: string;
      role: P2pGroupRole;
    };

export type CiphertextEnvelopeV1 = {
  v: 1;
  iv: string;
  ciphertext: string;
};

/** Signed + encrypted chat message on the wire. */
export type P2pChatWireV1 = {
  v: typeof P2P_CHAT_WIRE_VERSION;
  id: string;
  fromUserId: string;
  fromSigningPubB64: string;
  toUserId: string;
  ts: number;
  nonce: string;
  envelope: CiphertextEnvelopeV1;
  signatureB64: string;
};

export type P2pHandshakeFrameV1 = {
  type: "handshake";
  v: 1;
  role: "init" | "resp";
  ephPubB64: string;
};

export type P2pTypingFrameV1 = { type: "typing"; v: 1; chat: "dm"; peerUserId: string; active: boolean };

export type P2pSeenFrameV1 = { type: "seen"; v: 1; messageId: string };

export type P2pEphemeralNoticeV1 = { type: "ephemeral"; v: 1; messageId: string; deleteAfterMs: number };

/** On-chain addresses shared out-of-band (not encrypted chat). */
export type WalletInfoV1 = {
  v: 1;
  type: "wallet_info";
  chains: Partial<{ ethereum: string; bitcoin: string; solana: string }>;
  displayName?: string;
};

export type P2pPaymentAckV1 = {
  v: 1;
  type: "payment_ack";
  chain: "ethereum" | "bitcoin" | "solana";
  txHash: string;
};

/** Wire frame on RTCDataChannel (JSON stringified). */
export type P2pChannelFrame =
  | { type: "chat"; payload: P2pChatWireV1 }
  | { type: "ack"; v: 1; messageId: string }
  | { type: "delivered"; v: 1; messageId: string }
  | P2pHandshakeFrameV1
  | P2pTypingFrameV1
  | P2pSeenFrameV1
  | P2pEphemeralNoticeV1
  | { type: "groupSignal"; v: 1; groupId: string; payloadB64: string }
  | { type: "wallet_info"; payload: WalletInfoV1 }
  | { type: "payment_ack"; payload: P2pPaymentAckV1 };

export function parseP2pChannelFrame(raw: unknown): P2pChannelFrame | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { type?: string };
  if (o.type === "chat" && "payload" in (raw as object)) {
    const p = (raw as { payload: P2pChatWireV1 }).payload;
    if (!p || typeof p !== "object" || p.v !== P2P_CHAT_WIRE_VERSION) return null;
    return raw as P2pChannelFrame;
  }
  if (o.type === "ack" && typeof (raw as { messageId?: string }).messageId === "string") {
    return { type: "ack", v: 1, messageId: (raw as { messageId: string }).messageId };
  }
  if (o.type === "delivered" && typeof (raw as { messageId?: string }).messageId === "string") {
    return { type: "delivered", v: 1, messageId: (raw as { messageId: string }).messageId };
  }
  if (o.type === "handshake") {
    const h = raw as P2pHandshakeFrameV1;
    if (h.v !== 1 || (h.role !== "init" && h.role !== "resp") || typeof h.ephPubB64 !== "string") return null;
    return h;
  }
  if (o.type === "typing") {
    const t = raw as P2pTypingFrameV1;
    if (t.v !== 1 || t.chat !== "dm" || typeof t.peerUserId !== "string" || typeof t.active !== "boolean") return null;
    return t;
  }
  if (o.type === "seen") {
    const s = raw as P2pSeenFrameV1;
    if (s.v !== 1 || typeof s.messageId !== "string") return null;
    return s;
  }
  if (o.type === "ephemeral") {
    const e = raw as P2pEphemeralNoticeV1;
    if (e.v !== 1 || typeof e.messageId !== "string" || typeof e.deleteAfterMs !== "number") return null;
    return e;
  }
  if (o.type === "groupSignal") {
    const g = raw as { type: "groupSignal"; v: number; groupId: string; payloadB64: string };
    if (g.v !== 1 || typeof g.groupId !== "string" || typeof g.payloadB64 !== "string") return null;
    return { type: "groupSignal" as const, v: 1 as const, groupId: g.groupId, payloadB64: g.payloadB64 };
  }
  if (o.type === "wallet_info") {
    const w = raw as { payload?: WalletInfoV1 };
    const p = w.payload;
    if (!p || p.v !== 1 || p.type !== "wallet_info" || typeof p.chains !== "object" || p.chains === null) return null;
    return raw as P2pChannelFrame;
  }
  if (o.type === "payment_ack") {
    const p = (raw as { payload?: P2pPaymentAckV1 }).payload;
    if (
      !p ||
      p.v !== 1 ||
      p.type !== "payment_ack" ||
      (p.chain !== "ethereum" && p.chain !== "bitcoin" && p.chain !== "solana") ||
      typeof p.txHash !== "string"
    )
      return null;
    return raw as P2pChannelFrame;
  }
  return null;
}

/** Public invite payload (share via QR / paste). */
export type P2pInviteV1 = {
  v: 1;
  userId: string;
  signingPubB64: string;
  x25519PubB64: string;
  displayName?: string;
};

export type P2pIdentityRecord = {
  userId: string;
  signingPubB64: string;
  x25519PubB64: string;
  signingSecretB64: string;
  x25519SecretB64: string;
  displayName?: string;
  createdAt: number;
  /** If set, private keys are not stored plaintext; use unlock. */
  wrappedSecrets?: {
    saltB64: string;
    iv: string;
    ciphertext: string;
  };
};

export type P2pPeerRecord = {
  peerId: string;
  signingPubB64: string;
  x25519PubB64: string;
  displayName?: string;
  addedAt: number;
  /** When false, inbound chat is ignored until user enables chat for this contact. */
  inboundChatEnabled?: boolean;
  /** Last known addresses from peer `wallet_info` frames. */
  chainAddresses?: Partial<{ ethereum: string; bitcoin: string; solana: string }>;
};

export type P2pStoredMessage = {
  id: string;
  peerId: string;
  direction: "in" | "out";
  /** Serialized `P2pPlainPayload` JSON or legacy raw text; summary for wallet rows. */
  plaintext: string;
  ts: number;
  deliveredAt?: number;
  seenAt?: number;
  /** Local wall-clock expiry for ephemeral UI (best-effort). */
  expiresAt?: number;
  /** Structured DM rows (not encrypted plaintext). */
  narrativeKind?: "wallet_info" | "payment_ack";
  walletInfoPayload?: WalletInfoV1;
  paymentAckPayload?: { chain: "ethereum" | "bitcoin" | "solana"; txHash: string };
};

export type P2pOutboxRecord = {
  id: string;
  peerId: string;
  frameJson: string;
  createdAt: number;
  attempts: number;
};

/** --- Groups (local + relay fan-out) --- */

export type P2pGroupRecord = {
  groupId: string;
  name: string;
  createdAt: number;
  createdByUserId: string;
  /** Symmetric group key (base64) — stored only locally; distribute wrapped copies to members. */
  groupKeyB64: string;
  keyVersion: number;
  isPublic: boolean;
};

export type P2pGroupMemberRecord = {
  groupId: string;
  userId: string;
  signingPubB64: string;
  x25519PubB64: string;
  role: P2pGroupRole;
  addedAt: number;
};

export type P2pGroupStoredMessage = {
  id: string;
  groupId: string;
  fromUserId: string;
  direction: "in" | "out";
  plaintext: string;
  ts: number;
};

export type P2pGroupOutboxRecord = {
  id: string;
  groupId: string;
  frameJson: string;
  createdAt: number;
  attempts: number;
};

export type P2pGroupWirePayload = {
  kind: "text";
  text: string;
  fromUserId: string;
  id: string;
  ts: number;
};
