import {
  bigint,
  boolean,
  decimal,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  /** First-seen client IP at account creation (for one-registration-per-network policy). */
  registrationIp: varchar("registrationIp", { length: 45 }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Wallet addresses and metadata per user per chain.
 */
export const wallets = mysqlTable("wallets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  chain: mysqlEnum("chain", ["BTC", "ETH", "SOL"]).notNull(),
  address: varchar("address", { length: 128 }).notNull(),
  label: varchar("label", { length: 64 }),
  isDefault: boolean("isDefault").default(false),
  /** Opaque id in your MPC coordinator (Lit, Portal, etc.); never store private key material. */
  mpcWalletId: varchar("mpcWalletId", { length: 128 }),
  custodyModel: mysqlEnum("custodyModel", ["watch_only", "mpc"]).default("watch_only").notNull(),
  walletPolicy: json("walletPolicy").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = typeof wallets.$inferInsert;

/**
 * Conversations for the encrypted messaging module.
 */
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  participantName: varchar("participantName", { length: 128 }).notNull(),
  participantHandle: varchar("participantHandle", { length: 64 }),
  encryptionKey: varchar("encryptionKey", { length: 256 }),
  lastMessageAt: timestamp("lastMessageAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

/**
 * Messages within a conversation.
 */
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  senderId: int("senderId").notNull(),
  content: text("content").notNull(),
  encrypted: boolean("encrypted").default(true),
  /** plain = legacy/demo; aes_gcm_v1 = ciphertext in ciphertextEnvelope, server is relay-only. */
  bodyEncoding: mysqlEnum("bodyEncoding", ["plain", "aes_gcm_v1"]).default("plain").notNull(),
  ciphertextEnvelope: json("ciphertextEnvelope").$type<{
    v: 1;
    iv: string;
    ciphertext: string;
    tag?: string;
  }>(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * AI Agent run records — each invocation of an agent.
 */
export const agentRuns = mysqlTable("agent_runs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  agentType: mysqlEnum("agentType", [
    "market_analysis",
    "crypto_monitoring",
    "forex_monitoring",
    "futures_commodities",
    "historical_research",
  ]).notNull(),
  status: mysqlEnum("status", ["idle", "running", "analyzing", "complete", "alert"]).default("idle").notNull(),
  taskDescription: text("taskDescription"),
  output: json("output"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AgentRun = typeof agentRuns.$inferSelect;
export type InsertAgentRun = typeof agentRuns.$inferInsert;

/**
 * Portfolio snapshots for historical P&L tracking.
 */
export const portfolioSnapshots = mysqlTable("portfolio_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  totalValueUsd: bigint("totalValueUsd", { mode: "number" }),
  btcBalanceSats: bigint("btcBalanceSats", { mode: "number" }),
  ethBalanceWei: bigint("ethBalanceWei", { mode: "number" }),
  solBalanceLamports: bigint("solBalanceLamports", { mode: "number" }),
  snapshotAt: timestamp("snapshotAt").defaultNow().notNull(),
});

export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect;

/**
 * Price alerts — user-defined thresholds for crypto price notifications.
 */
export const priceAlerts = mysqlTable("price_alerts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  symbol: mysqlEnum("symbol", ["BTC", "ETH", "SOL"]).notNull(),
  condition: mysqlEnum("condition", ["above", "below"]).notNull(),
  threshold: decimal("threshold", { precision: 18, scale: 2 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  triggeredAt: timestamp("triggeredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PriceAlert = typeof priceAlerts.$inferSelect;
export type InsertPriceAlert = typeof priceAlerts.$inferInsert;

/**
 * Agent schedules — configurable auto-run intervals per agent type per user.
 */
export const agentSchedules = mysqlTable("agent_schedules", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  agentType: mysqlEnum("agentType", [
    "market_analysis",
    "crypto_monitoring",
    "forex_monitoring",
    "futures_commodities",
    "historical_research",
  ]).notNull(),
  intervalHours: int("intervalHours").default(4).notNull(),
  isActive: boolean("isActive").default(false).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  nextRunAt: timestamp("nextRunAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AgentSchedule = typeof agentSchedules.$inferSelect;
export type InsertAgentSchedule = typeof agentSchedules.$inferInsert;

/**
 * KYC profiles — identity verification data per user.
 */
export const kycProfiles = mysqlTable("kyc_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  status: mysqlEnum("status", ["not_started", "pending", "under_review", "approved", "rejected"]).default("not_started").notNull(),
  tier: mysqlEnum("tier", ["none", "basic", "enhanced", "institutional"]).default("none").notNull(),
  fullName: varchar("fullName", { length: 256 }),
  dateOfBirth: varchar("dateOfBirth", { length: 32 }),
  nationality: varchar("nationality", { length: 128 }),
  countryOfResidence: varchar("countryOfResidence", { length: 128 }),
  documentType: varchar("documentType", { length: 64 }),
  documentNumber: varchar("documentNumber", { length: 128 }),
  documentFrontUrl: text("documentFrontUrl"),
  documentBackUrl: text("documentBackUrl"),
  selfieUrl: text("selfieUrl"),
  rejectionReason: text("rejectionReason"),
  submittedAt: timestamp("submittedAt"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KycProfile = typeof kycProfiles.$inferSelect;
export type InsertKycProfile = typeof kycProfiles.$inferInsert;

/**
 * MFA settings — TOTP and backup codes per user.
 */
export const mfaSettings = mysqlTable("mfa_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  isEnabled: boolean("isEnabled").default(false).notNull(),
  totpSecret: varchar("totpSecret", { length: 256 }),
  backupCodes: json("backupCodes"),
  enabledAt: timestamp("enabledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MfaSettings = typeof mfaSettings.$inferSelect;

/**
 * User sessions — active login sessions with device info.
 */
export const userSessions = mysqlTable("user_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sessionToken: varchar("sessionToken", { length: 256 }).notNull().unique(),
  deviceName: varchar("deviceName", { length: 128 }),
  deviceType: mysqlEnum("deviceType", ["desktop", "mobile", "tablet", "api"]).default("desktop"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  location: varchar("location", { length: 128 }),
  isCurrent: boolean("isCurrent").default(false),
  lastActiveAt: timestamp("lastActiveAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UserSession = typeof userSessions.$inferSelect;

/**
 * Alert history — log of triggered price alerts.
 */
export const alertHistory = mysqlTable("alert_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  alertId: int("alertId"),
  symbol: mysqlEnum("symbol", ["BTC", "ETH", "SOL"]).notNull(),
  condition: mysqlEnum("condition", ["above", "below"]).notNull(),
  threshold: decimal("threshold", { precision: 18, scale: 2 }).notNull(),
  priceAtTrigger: decimal("priceAtTrigger", { precision: 18, scale: 2 }).notNull(),
  triggeredAt: timestamp("triggeredAt").defaultNow().notNull(),
});

export type AlertHistory = typeof alertHistory.$inferSelect;
export type InsertAlertHistory = typeof alertHistory.$inferInsert;

/**
 * Immutable audit trail for admin and security-sensitive actions.
 */
export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  actorUserId: int("actorUserId").notNull(),
  action: varchar("action", { length: 128 }).notNull(),
  resource: varchar("resource", { length: 128 }).notNull(),
  resourceId: int("resourceId"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  ipHash: varchar("ipHash", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;

/**
 * Wallet-signed binding for messaging identity (relay sees ciphertext only; identity is chain-verified).
 */
export const userMessagingIdentities = mysqlTable("user_messaging_identities", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  chain: mysqlEnum("chain", ["ETH", "SOL", "BTC"]).notNull(),
  address: varchar("address", { length: 128 }).notNull(),
  challengeMessage: text("challengeMessage").notNull(),
  signatureHex: varchar("signatureHex", { length: 512 }).notNull(),
  verifiedAt: timestamp("verifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UserMessagingIdentity = typeof userMessagingIdentities.$inferSelect;
