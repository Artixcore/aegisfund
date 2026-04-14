# Compliance and legal review checklist

Use this list before production launch or when entering new jurisdictions. It does not constitute legal advice.

## Product disclosures

- [ ] All agent outputs labeled as **research / scenario analysis**, not personalized investment advice.
- [ ] Risk warnings on dashboards that show historical or model-derived performance.
- [ ] Clear terms for **price alerts** and automated notifications.

## KYC / AML

- [ ] Data retention and deletion policy for KYC artifacts (including encrypted blobs).
- [ ] Processor agreements if using cloud storage or MPC vendors.
- [ ] Admin access to PII is logged (see `audit_logs` and `kyc_*` actions).

## Messaging

- [ ] Policy for abuse reporting when metadata is visible to the operator.
- [ ] Jurisdiction-specific rules on encrypted communications and lawful access.

## Wallet / custody (MPC)

- [ ] Vendor SOC reports / pen tests for chosen MPC stack.
- [ ] Key recovery and inheritance flows documented for users.

## Model / agents

- [ ] Dataset licensing for any non–self-hosted news or market data.
- [ ] Model cards: version, training cutoff, known limitations.
- [ ] Incident response if models emit harmful or manipulative content.
