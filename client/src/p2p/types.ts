/** Wire frame on RTCDataChannel (JSON stringified). */
export type P2pChannelFrame =
  | { type: "chat"; payload: P2pChatWireV1 }
  | { type: "ack"; messageId: string };

export type CiphertextEnvelopeV1 = {
  v: 1;
  iv: string;
  ciphertext: string;
};

/** Signed + encrypted chat message on the wire. */
export type P2pChatWireV1 = {
  v: 1;
  id: string;
  fromUserId: string;
  fromSigningPubB64: string;
  toUserId: string;
  ts: number;
  nonce: string;
  envelope: CiphertextEnvelopeV1;
  signatureB64: string;
};

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
};

export type P2pStoredMessage = {
  id: string;
  peerId: string;
  direction: "in" | "out";
  plaintext: string;
  ts: number;
};

export type P2pOutboxRecord = {
  id: string;
  peerId: string;
  frameJson: string;
  createdAt: number;
  attempts: number;
};
