/**
 * Vendor-neutral MPC wallet metadata stored alongside on-chain addresses.
 * Signing ceremonies and share management live in an MPC coordinator (integrate Lit, Portal, DFNS, etc.).
 */

export type MpcWalletLifecycle =
  | "uninitialized"
  | "enrollment"
  | "active"
  | "rotating"
  | "recovery"
  | "revoked";

export type CustodyModel = "watch_only" | "mpc";

export type WalletPolicy = {
  /** Max spend per day in USD for policy engines (optional). */
  dailySpendLimitUsd?: number;
  /** Allowed chains for signing requests. */
  allowedChains?: Array<"BTC" | "ETH" | "SOL">;
  /** Opaque policy version for your MPC provider. */
  policyVersion?: string;
};

export type MpcWalletMetadata = {
  mpcWalletId: string;
  lifecycle: MpcWalletLifecycle;
  custodyModel: CustodyModel;
  policy?: WalletPolicy;
  /** ISO timestamps for audit. */
  enrolledAt?: string;
  lastRotatedAt?: string;
};
