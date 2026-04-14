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

### Threat model (P2P)

- **Optional relay** ([`relay/server.ts`](../relay/server.ts)): forwards **WebRTC signaling JSON** (SDP/ICE), **opaque group ciphertext blobs**, and **mailbox blobs** (base64 JSON of `P2pChannelFrame`). The relay can observe **who connects to whom**, **group membership activity**, and **mailbox recipient ids**; it must not see DM plaintext (E2EE) or group plaintext (symmetric group key never leaves clients).
- **Self-hosted TURN** is still recommended for symmetric NATs; configure via [`VITE_P2P_ICE_SERVERS`](../client/src/p2p/iceConfig.ts) JSON (STUN/TURN URLs and credentials).
- **Metadata** to Internet observers is **not** hidden end-to-end; optional future work: padding, Tor, MLS sender keys, etc.
- **Malicious clients / peers** are not fully mitigated; Ed25519 signatures bind ciphertext to the claimed signing key for that payload only.
- **Per-session key mix**: after the WebRTC data channel opens, peers run an **ephemeral X25519** handshake and HKDF (`aegis-p2p-session-msg-v1`) to derive a **32-byte AES key** used for new envelopes; decrypt first tries the session key then falls back to the long-term ECDH key so queued/out-of-order frames still decrypt. This is **not** a full Double Ratchet; compromise of long-term keys may still harm past sessions—treat as incremental hardening.

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

- **Out-of-band**: copy/paste JSON packages (SDP + ICE) as in [`client/src/p2p/webrtc.ts`](../client/src/p2p/webrtc.ts).
- **Optional relay path**: [`client/src/p2p/signalingClient.ts`](../client/src/p2p/signalingClient.ts) + `npm run relay` exchanges the same JSON strings over a WebSocket room keyed by a shared **session id** (buffered until both sides join).

### Groups and relay fan-out

- Local metadata in IndexedDB (`groups`, `groupMembers`, `groupMessages`): see [`client/src/p2p/db.ts`](../client/src/p2p/db.ts).
- **Group key**: random 32-byte AES key, distributed to members via DM [`P2pPlainPayload`](../client/src/p2p/types.ts) `groupInvite` envelopes wrapped with pairwise X25519/HKDF ([`groupCrypto.ts`](../client/src/p2p/groupCrypto.ts), [`groupInvite.ts`](../client/src/p2p/groupInvite.ts)).
- **Transport**: [`encryptGroupPayload`](../client/src/p2p/groupCrypto.ts) seals `P2pGroupWirePayload`; clients broadcast **base64 UTF-8** ciphertext via relay `groupBroadcast`.

### Files (IPFS-style pinning)

- Client encrypts with [`fileEncrypt.ts`](../client/src/p2p/fileEncrypt.ts), uploads ciphertext to **`VITE_P2P_IPFS_UPLOAD_URL`** (multipart `file` → JSON `{ cid }`), and references `{ cid, fileKeyWrapJson }` in the DM plaintext ([`dmFileWrap.ts`](../client/src/p2p/dmFileWrap.ts)). The pinning server sees ciphertext only.

### Mailbox (relay TTL store)

- When the data channel is down, the UI may `mboxPut` a base64-wrapped `P2pChannelFrame` for a recipient `userId`. **Authorization is weak** unless you set matching **`RELAY_SHARED_SECRET`** (server) and **`VITE_P2P_RELAY_SECRET`** (client). Intended for self-hosted LAN/dev; do not expose raw to the public Internet.

### Backup / identity export

- [`identityExport.ts`](../client/src/p2p/identityExport.ts): PBKDF2 (250k) + AES-GCM export of the full identity JSON (separate password from screen lock). **Rotation** wipes local IndexedDB P2P stores and mints a new keypair in the Messages UI.

### Safety primitives

- [`policy.ts`](../client/src/p2p/policy.ts) sliding-window rate limits; per-peer **mute** (inbound drop) and **block** lists in IndexedDB meta; **typing / ack / delivered / seen / ephemeral** control frames on the data channel ([`types.ts`](../client/src/p2p/types.ts) `parseP2pChannelFrame`).

### Local multi-chain wallet (separate from P2P identity)

- **BIP39 vault** in IndexedDB (`aegis-chain-wallet-v1`), browser-only JSON-RPC / Esplora; see [LOCAL_WALLET.md](./LOCAL_WALLET.md).
- **P2P**: optional `wallet_info` / `payment_ack` frames on the same data channel ([`types.ts`](../client/src/p2p/types.ts)); Messages can **Share my addresses** when the local wallet session is unlocked on the Wallets tab.
