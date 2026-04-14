# Aegis Fund — end-to-end encryption specification

This document maps cryptographic goals onto the codebase. It is a living spec: implement migrations in lockstep with each phase.

## Threat model (summary)

- **Honest but curious relay/API**: operators must not learn message plaintext or KYC document contents.
- **Authenticated users**: OAuth establishes app sessions; messaging identity is additionally bound to a wallet (`registerMessagingIdentity` on ETH today).
- **Not in scope for v1**: protection against malicious clients, post-quantum algorithms, or metadata hiding (who talks to whom, timing, sizes).

## Layers

1. **Transport**: TLS between browser and your Express host (baseline).
2. **At-rest relay payload**: Messages may use `bodyEncoding = aes_gcm_v1` with `ciphertextEnvelope` JSON; plaintext placeholder in `content` (short) for UI fallbacks.
3. **Keys (current transitional path)**: Conversations still carry a server-generated `encryptionKey` string for bootstrapping demo UX. **Production target**: remove server knowledge of message keys by using an X25519 ECDH handshake between participants, storing only wrapped per-device keys or using MLS / Double Ratchet.
4. **KYC / attachments**: Prefer **client-side encryption** of files before upload to object storage; store only ciphertext + KEK wrapped to compliance officers’ keys if legally required. Document retention policy separately.

## Message envelope (`ciphertextEnvelope`)

```json
{ "v": 1, "iv": "<base64>", "ciphertext": "<base64 AES-GCM sealed>" }
```

- IV is 12 bytes random.
- Ciphertext includes the GCM auth tag (Web Crypto `encrypt` output).
- Client implementation: [`client/src/lib/e2eCrypto.ts`](../client/src/lib/e2eCrypto.ts).

## Wallet-signed relay identity

1. Client calls `messages.getMessagingBindingChallenge` → receives `message`.
2. User signs `message` with their ETH wallet (personal_sign).
3. Client calls `messages.registerMessagingIdentity` with `{ chain: "ETH", address, message, signatureHex }`.
4. Server verifies challenge freshness, then `viem.verifyMessage`, then persists [`user_messaging_identities`](../drizzle/schema.ts).

## MPC wallet metadata

- Table [`wallets`](../drizzle/schema.ts): `mpcWalletId`, `custodyModel`, `walletPolicy` — **never** store raw private keys or MPC shares on the app server.
- Integrate your MPC vendor SDK in the client and optional coordinator service; keep this API as metadata + address registry only.

## Rotation

- When upgrading from shared `encryptionKey` to per-session keys, bump a `keyVersion` column on conversations and re-wrap or archive old threads.

## Decentralized P2P mode (Messages UI)

The [`Messages`](../client/src/pages/Messages.tsx) page uses **browser-only** P2P chat (no Aegis server for transport or persistence). The legacy `messages.*` tRPC procedures remain in the codebase for tests and any future reuse, but this UI does not call them.

### Threat model (P2P MVP)

- **No relay operator** for message transport; TLS to Aegis still applies for login and other pages.
- **STUN-only** WebRTC: pathological NATs may fail to connect without a **TURN** relay (operators can self-host TURN; not bundled here).
- **Metadata** (who connects to whom, IP timing, message sizes on the wire) is **not** hidden from network observers.
- **Malicious clients / peers** are not fully mitigated; signatures prove possession of the claimed Ed25519 key for the signed payload only.
- **Forward secrecy**: not provided in v1 (static X25519 long-term keys). Upgrade path would be Double Ratchet / pre-keys.

### Cryptography

1. **Identity**: separate Ed25519 (`@noble/ed25519` via `@noble/curves`) and X25519 keypairs; `userId` is hex(SHA-256(Ed25519 public key)).
2. **Invite**: JSON [`P2pInviteV1`](../client/src/p2p/types.ts) with both public keys; share via copy or QR.
3. **ECDH**: X25519 shared secret → HKDF-SHA256 (salt + info `aegis-p2p-msg-v1`) → AES-256-GCM for the inner envelope (same `iv` + `ciphertext` shape as relay mode).
4. **Sign**: Ed25519 over SHA-256 of canonical string `aegis_p2p_v1|v|fromUserId|fromSigningPubB64|toUserId|ts|nonce|iv|ciphertext`.
5. **Replay / duplicates**: client-side [`ReplayGuard`](../client/src/p2p/replay.ts) per sender `userId` using message `id`, `nonce`, and timestamp window.

### Storage and offline

- **IndexedDB** database `aegis-p2p-v1`: identity, peers, decrypted messages, outbox rows for sends when the data channel is down (drained on connect).
- Optional **PBKDF2** (250k iterations) + AES-GCM wraps private keys when the user sets a lock passphrase ([`keyWrap.ts`](../client/src/p2p/keyWrap.ts)).

### WebRTC signaling

- **Out-of-band only**: initiator pastes a JSON package (SDP + gathered ICE candidates) to the answerer; answerer returns a second package. No signaling server.
- Implementation: [`client/src/p2p/webrtc.ts`](../client/src/p2p/webrtc.ts).
