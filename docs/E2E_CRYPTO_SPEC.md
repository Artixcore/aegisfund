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
