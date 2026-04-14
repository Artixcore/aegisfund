# Local non-custodial wallet (browser-only)

The **Local wallet** tab under [Wallets](../client/src/pages/Wallets.tsx) stores a BIP39 mnemonic **only** on the device: encrypted at rest (PBKDF2 + AES-GCM, same pattern as P2P key wrap) and optionally held in memory after unlock for signing.

## Threat model

- **Chain RPC / Esplora**: You choose the URLs. The browser sends reads and signed broadcasts directly to those hosts. You must trust the endpoint operator for correctness and privacy of queries (TLS protects bytes in transit, not the operator).
- **CORS**: Many public Ethereum RPCs **block browser origins**. Use a node or proxy that sets `Access-Control-Allow-Origin` for your app, or run a local JSON-RPC service.
- **No forward secrecy on-chain**: On-chain transfers are public and permanent; messaging E2E properties do not apply to ledger data.
- **Recovery**: Only the mnemonic (and passphrase for the local vault) can restore funds. Losing both means permanent loss.

## Integration with P2P

From **Messages**, **Share my addresses** sends a `wallet_info` data-channel frame (same outbox / optional relay path as chat). Peers see a structured card and their contact record stores the last known ETH/BTC strings for quick reference. Keys are never included in these frames.

## Bitcoin fees and UTXOs

Fee targets use Esplora `/fee-estimates`. Spending selects confirmed UTXOs, prefers a change output when change is above the dust threshold, and otherwise uses a single-output transaction with an implicit fee.
