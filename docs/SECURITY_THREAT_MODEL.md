# Security threat modeling (concise)

## Assets

- User accounts (OAuth identifiers, roles).
- Wallet public addresses and MPC metadata (`mpcWalletId`, policies).
- Message ciphertext, conversation metadata, optional plaintext legacy rows.
- KYC documents and PII.
- Agent run outputs and scheduled job state.

## Adversaries

1. **External attacker** (network): Mitigated by TLS; rate-limit auth and binding endpoints in production.
2. **Compromised app server**: Must not yield message plaintext if E2E is used end-to-end; today’s transitional `encryptionKey` on conversations **does not** meet that bar—migrate per `docs/E2E_CRYPTO_SPEC.md`.
3. **Compromised admin account**: Partially mitigated by `audit_logs` on KYC decisions; extend to other admin mutations.
4. **Malicious client**: Cannot be fully prevented server-side; use signed challenges for wallet binding and educate users on address verification.

## Priority mitigations

- Remove long-lived server-held message keys.
- Run self-hosted RPC with auth and IP allowlists.
- Add WAF / rate limits on `registerMessagingIdentity` and `sendMessage`.
