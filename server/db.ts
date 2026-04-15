import { and, desc, eq, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  agentRuns,
  agentSchedules,
  auditLogs,
  conversations,
  messages,
  portfolioSnapshots,
  priceAlerts,
  userMessagingIdentities,
  users,
  wallets,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  const url = ENV.databaseUrl;
  if (!_db && url) {
    try {
      _db = drizzle(url);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============================================================
// USER HELPERS
// ============================================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    throw new Error("Database not configured or unavailable");
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.registrationIp !== undefined && user.registrationIp !== null) {
      values.registrationIp = user.registrationIp;
    }
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function hasUserRegisteredFromIp(ip: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db.select({ id: users.id }).from(users).where(eq(users.registrationIp, ip)).limit(1);
  return result.length > 0;
}

// ============================================================
// WALLET HELPERS
// ============================================================

export async function getWalletsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(wallets).where(eq(wallets.userId, userId));
}

export async function upsertWallet(data: {
  userId: number;
  chain: "BTC" | "ETH" | "SOL";
  address: string;
  label?: string;
  mpcWalletId?: string | null;
  custodyModel?: "watch_only" | "mpc";
  walletPolicy?: Record<string, unknown> | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await db.select().from(wallets)
    .where(and(eq(wallets.userId, data.userId), eq(wallets.chain, data.chain)))
    .limit(1);
  const custodyModel = data.custodyModel ?? (data.mpcWalletId ? "mpc" : "watch_only");
  const patch = {
    address: data.address,
    label: data.label ?? existing[0]?.label,
    mpcWalletId: data.mpcWalletId ?? existing[0]?.mpcWalletId ?? null,
    custodyModel,
    walletPolicy: data.walletPolicy ?? existing[0]?.walletPolicy ?? null,
  };
  if (existing.length > 0) {
    await db.update(wallets)
      .set(patch)
      .where(eq(wallets.id, existing[0].id));
  } else {
    await db.insert(wallets).values({
      userId: data.userId,
      chain: data.chain,
      address: data.address,
      label: data.label,
      isDefault: true,
      mpcWalletId: data.mpcWalletId ?? null,
      custodyModel,
      walletPolicy: data.walletPolicy ?? null,
    });
  }
}

export async function deleteWallet(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(wallets).where(and(eq(wallets.id, id), eq(wallets.userId, userId)));
}

export async function upsertDefaultWallets(userId: number) {
  const db = await getDb();
  if (!db) return;
  const existing = await getWalletsByUserId(userId);
  if (existing.length > 0) return;
  if (!ENV.demoWalletSeeding) {
    return;
  }

  // Dev-only placeholder addresses — production uses MPC onboarding / user-supplied addresses only
  const btcAddr = `bc1q${userId.toString().padStart(4, "0")}aegisfundbtcwallet${userId}xyzabc`;
  const ethAddr = `0x${userId.toString(16).padStart(4, "0")}AegisFundETHWallet${userId}ABCDEF`.substring(0, 42);
  const solAddr = `AegisFund${userId}SolanaWalletAddressXYZ${userId}`.substring(0, 44);

  await db.insert(wallets).values([
    { userId, chain: "BTC", address: btcAddr.substring(0, 62), label: "Primary Bitcoin", isDefault: true },
    { userId, chain: "ETH", address: ethAddr, label: "Primary Ethereum", isDefault: true },
    { userId, chain: "SOL", address: solAddr, label: "Primary Solana", isDefault: true },
  ]);
}

// ============================================================
// CONVERSATION & MESSAGE HELPERS
// ============================================================

export async function getConversationsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.lastMessageAt));
}

export async function getMessagesByConversationId(conversationId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
}

export async function createMessage(data: {
  conversationId: number;
  senderId: number;
  content: string;
  encrypted?: boolean;
  bodyEncoding?: "plain" | "aes_gcm_v1";
  ciphertextEnvelope?: { v: 1; iv: string; ciphertext: string; tag?: string };
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const bodyEncoding =
    data.bodyEncoding ?? (data.ciphertextEnvelope ? "aes_gcm_v1" : "plain");
  await db.insert(messages).values({
    conversationId: data.conversationId,
    senderId: data.senderId,
    content: data.content,
    encrypted: data.encrypted ?? true,
    bodyEncoding,
    ciphertextEnvelope: data.ciphertextEnvelope ?? null,
  });
  await db.update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, data.conversationId));
}

export async function upsertDefaultConversations(userId: number) {
  const db = await getDb();
  if (!db) return;
  const existing = await getConversationsByUserId(userId);
  if (existing.length > 0) return;

  const contacts = [
    { participantName: "Cipher Protocol", participantHandle: "@cipher_proto" },
    { participantName: "Vault Collective", participantHandle: "@vault_col" },
    { participantName: "Meridian Capital", participantHandle: "@meridian_cap" },
  ];

  for (const contact of contacts) {
    const [result] = await db.insert(conversations).values({
      userId,
      ...contact,
      encryptionKey: `aegis_e2e_key_${Math.random().toString(36).substring(2)}`,
    });
    const convId = (result as { insertId: number }).insertId;
    await db.insert(messages).values([
      { conversationId: convId, senderId: 0, content: "Secure channel established. All communications are end-to-end encrypted.", encrypted: true },
      { conversationId: convId, senderId: userId, content: "Confirmed. Ready to proceed.", encrypted: true },
    ]);
  }
}

// ============================================================
// AGENT HELPERS
// ============================================================

export async function getLatestAgentRuns(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const agentTypes = [
    "market_analysis",
    "crypto_monitoring",
    "forex_monitoring",
    "futures_commodities",
    "historical_research",
  ] as const;

  const results = [];
  for (const agentType of agentTypes) {
    const rows = await db.select().from(agentRuns)
      .where(and(eq(agentRuns.userId, userId), eq(agentRuns.agentType, agentType)))
      .orderBy(desc(agentRuns.createdAt))
      .limit(1);
    if (rows.length > 0) results.push(rows[0]);
    else results.push({ id: 0, userId, agentType, status: "idle" as const, taskDescription: null, output: null, startedAt: null, completedAt: null, createdAt: new Date() });
  }
  return results;
}

export async function getAgentHistory(userId: number, agentType: string, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(agentRuns)
    .where(and(
      eq(agentRuns.userId, userId),
      eq(agentRuns.agentType, agentType as "market_analysis" | "crypto_monitoring" | "forex_monitoring" | "futures_commodities" | "historical_research"),
      eq(agentRuns.status, "complete"),
    ))
    .orderBy(desc(agentRuns.createdAt))
    .limit(limit);
}

export async function createAgentRun(data: {
  userId: number;
  agentType: "market_analysis" | "crypto_monitoring" | "forex_monitoring" | "futures_commodities" | "historical_research";
  taskDescription?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [result] = await db.insert(agentRuns).values({
    ...data,
    status: "running",
    startedAt: new Date(),
  });
  return (result as { insertId: number }).insertId;
}

export async function updateAgentRun(id: number, data: {
  status: "idle" | "running" | "analyzing" | "complete" | "alert";
  output?: unknown;
  completedAt?: Date;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(agentRuns).set({
    status: data.status,
    output: data.output as Record<string, unknown> | null | undefined,
    completedAt: data.completedAt,
  }).where(eq(agentRuns.id, id));
}

// ============================================================
// AGENT SCHEDULE HELPERS
// ============================================================

export async function getAgentSchedulesByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(agentSchedules).where(eq(agentSchedules.userId, userId));
}

export async function upsertAgentSchedule(data: {
  userId: number;
  agentType: "market_analysis" | "crypto_monitoring" | "forex_monitoring" | "futures_commodities" | "historical_research";
  intervalHours: number;
  isActive: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await db.select().from(agentSchedules)
    .where(and(eq(agentSchedules.userId, data.userId), eq(agentSchedules.agentType, data.agentType)))
    .limit(1);

  const nextRunAt = data.isActive ? new Date(Date.now() + data.intervalHours * 3600 * 1000) : null;

  if (existing.length > 0) {
    await db.update(agentSchedules)
      .set({ intervalHours: data.intervalHours, isActive: data.isActive, nextRunAt })
      .where(eq(agentSchedules.id, existing[0].id));
    return existing[0].id;
  } else {
    const [result] = await db.insert(agentSchedules).values({ ...data, nextRunAt });
    return (result as { insertId: number }).insertId;
  }
}

export async function getDueSchedules() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(agentSchedules)
    .where(and(
      eq(agentSchedules.isActive, true),
      lte(agentSchedules.nextRunAt, new Date()),
    ));
}

export async function updateScheduleAfterRun(id: number, intervalHours: number) {
  const db = await getDb();
  if (!db) return;
  const nextRunAt = new Date(Date.now() + intervalHours * 3600 * 1000);
  await db.update(agentSchedules)
    .set({ lastRunAt: new Date(), nextRunAt })
    .where(eq(agentSchedules.id, id));
}

// ============================================================
// PRICE ALERT HELPERS
// ============================================================

export async function getPriceAlertsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(priceAlerts)
    .where(eq(priceAlerts.userId, userId))
    .orderBy(desc(priceAlerts.createdAt));
}

export async function createPriceAlert(data: {
  userId: number;
  symbol: "BTC" | "ETH" | "SOL";
  condition: "above" | "below";
  threshold: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [result] = await db.insert(priceAlerts).values({ ...data, isActive: true });
  return (result as { insertId: number }).insertId;
}

export async function deletePriceAlert(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(priceAlerts).where(and(eq(priceAlerts.id, id), eq(priceAlerts.userId, userId)));
}

export async function togglePriceAlert(id: number, userId: number, isActive: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(priceAlerts)
    .set({ isActive })
    .where(and(eq(priceAlerts.id, id), eq(priceAlerts.userId, userId)));
}

export async function getActivePriceAlerts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(priceAlerts).where(eq(priceAlerts.isActive, true));
}

export async function markAlertTriggered(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(priceAlerts)
    .set({ isActive: false, triggeredAt: new Date() })
    .where(eq(priceAlerts.id, id));
}

// ============================================================
// PORTFOLIO HELPERS
// ============================================================

export async function getLatestPortfolioSnapshot(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(portfolioSnapshots)
    .where(eq(portfolioSnapshots.userId, userId))
    .orderBy(desc(portfolioSnapshots.snapshotAt))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function getPortfolioHistory(userId: number, days = 30) {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db.select().from(portfolioSnapshots)
    .where(and(eq(portfolioSnapshots.userId, userId), gte(portfolioSnapshots.snapshotAt, since)))
    .orderBy(portfolioSnapshots.snapshotAt);
}

export async function savePortfolioSnapshot(userId: number, totalValueUsd: number) {
  const db = await getDb();
  if (!db) return;
  await db.insert(portfolioSnapshots).values({
    userId,
    totalValueUsd: Math.round(totalValueUsd),
    snapshotAt: new Date(),
  });
}

// ============================================================
// KYC HELPERS
// ============================================================
import { kycProfiles, mfaSettings, userSessions, alertHistory, InsertKycProfile } from "../drizzle/schema";

export async function getKycProfile(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(kycProfiles).where(eq(kycProfiles.userId, userId)).limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function upsertKycProfile(userId: number, data: Partial<InsertKycProfile>) {
  const db = await getDb();
  if (!db) return;
  const existing = await getKycProfile(userId);
  if (existing) {
    await db.update(kycProfiles).set({ ...data, updatedAt: new Date() }).where(eq(kycProfiles.userId, userId));
  } else {
    await db.insert(kycProfiles).values({ userId, ...data });
  }
}

// ============================================================
// MFA HELPERS
// ============================================================

export async function getMfaSettings(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(mfaSettings).where(eq(mfaSettings.userId, userId)).limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function upsertMfaSettings(userId: number, data: { isEnabled: boolean; totpSecret?: string; backupCodes?: string[]; enabledAt?: Date | null }) {
  const db = await getDb();
  if (!db) return;
  const existing = await getMfaSettings(userId);
  const payload = {
    isEnabled: data.isEnabled,
    totpSecret: data.totpSecret ?? null,
    backupCodes: data.backupCodes ?? null,
    enabledAt: data.enabledAt ?? null,
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(mfaSettings).set(payload).where(eq(mfaSettings.userId, userId));
  } else {
    await db.insert(mfaSettings).values({ userId, ...payload });
  }
}

// ============================================================
// SESSION HELPERS
// ============================================================

export async function getUserSessions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userSessions)
    .where(eq(userSessions.userId, userId))
    .orderBy(desc(userSessions.lastActiveAt));
}

export async function upsertUserSession(userId: number, sessionToken: string, meta: {
  deviceName?: string; deviceType?: "desktop" | "mobile" | "tablet" | "api"; ipAddress?: string; location?: string; isCurrent?: boolean;
}) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(userSessions).where(eq(userSessions.sessionToken, sessionToken)).limit(1);
  if (existing.length > 0) {
    await db.update(userSessions).set({ lastActiveAt: new Date(), ...meta }).where(eq(userSessions.sessionToken, sessionToken));
  } else {
    await db.insert(userSessions).values({ userId, sessionToken, lastActiveAt: new Date(), ...meta });
  }
}

export async function revokeUserSession(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(userSessions).where(and(eq(userSessions.id, id), eq(userSessions.userId, userId)));
}

// ============================================================
// ALERT HISTORY HELPERS
// ============================================================

export async function getAlertHistory(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(alertHistory)
    .where(eq(alertHistory.userId, userId))
    .orderBy(desc(alertHistory.triggeredAt))
    .limit(50);
}

export async function insertAlertHistory(userId: number, data: {
  alertId?: number; symbol: "BTC" | "ETH" | "SOL"; condition: "above" | "below"; threshold: string; priceAtTrigger: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(alertHistory).values({ userId, ...data });
}

// ============================================================
// ADMIN HELPERS
// ============================================================

export async function getAllKycProfiles() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: kycProfiles.id,
      userId: kycProfiles.userId,
      status: kycProfiles.status,
      tier: kycProfiles.tier,
      fullName: kycProfiles.fullName,
      dateOfBirth: kycProfiles.dateOfBirth,
      nationality: kycProfiles.nationality,
      countryOfResidence: kycProfiles.countryOfResidence,
      documentType: kycProfiles.documentType,
      documentNumber: kycProfiles.documentNumber,
      documentFrontUrl: kycProfiles.documentFrontUrl,
      documentBackUrl: kycProfiles.documentBackUrl,
      selfieUrl: kycProfiles.selfieUrl,
      rejectionReason: kycProfiles.rejectionReason,
      submittedAt: kycProfiles.submittedAt,
      reviewedAt: kycProfiles.reviewedAt,
      createdAt: kycProfiles.createdAt,
      updatedAt: kycProfiles.updatedAt,
      userName: users.name,
      userEmail: users.email,
      userOpenId: users.openId,
    })
    .from(kycProfiles)
    .leftJoin(users, eq(kycProfiles.userId, users.id))
    .orderBy(desc(kycProfiles.submittedAt));
  return rows;
}

export async function getPendingKycProfiles() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: kycProfiles.id,
      userId: kycProfiles.userId,
      status: kycProfiles.status,
      tier: kycProfiles.tier,
      fullName: kycProfiles.fullName,
      dateOfBirth: kycProfiles.dateOfBirth,
      nationality: kycProfiles.nationality,
      countryOfResidence: kycProfiles.countryOfResidence,
      documentType: kycProfiles.documentType,
      documentNumber: kycProfiles.documentNumber,
      documentFrontUrl: kycProfiles.documentFrontUrl,
      documentBackUrl: kycProfiles.documentBackUrl,
      selfieUrl: kycProfiles.selfieUrl,
      rejectionReason: kycProfiles.rejectionReason,
      submittedAt: kycProfiles.submittedAt,
      reviewedAt: kycProfiles.reviewedAt,
      createdAt: kycProfiles.createdAt,
      updatedAt: kycProfiles.updatedAt,
      userName: users.name,
      userEmail: users.email,
      userOpenId: users.openId,
    })
    .from(kycProfiles)
    .leftJoin(users, eq(kycProfiles.userId, users.id))
    .where(eq(kycProfiles.status, "under_review"))
    .orderBy(desc(kycProfiles.submittedAt));
  return rows;
}

export async function reviewKycProfile(
  profileId: number,
  decision: "approved" | "rejected",
  rejectionReason?: string
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(kycProfiles)
    .set({
      status: decision,
      rejectionReason: decision === "rejected" ? (rejectionReason ?? "Application rejected by compliance team.") : null,
      reviewedAt: new Date(),
    })
    .where(eq(kycProfiles.id, profileId));
}

// ============================================================
// AUDIT & MESSAGING IDENTITY
// ============================================================

export async function insertAuditLog(entry: {
  actorUserId: number;
  action: string;
  resource: string;
  resourceId?: number | null;
  metadata?: Record<string, unknown>;
  ipHash?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    resource: entry.resource,
    resourceId: entry.resourceId ?? null,
    metadata: entry.metadata ?? null,
    ipHash: entry.ipHash ?? null,
  });
}

export async function recordMessagingIdentityBinding(data: {
  userId: number;
  chain: "ETH" | "SOL" | "BTC";
  address: string;
  challengeMessage: string;
  signatureHex: string;
  verified: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(userMessagingIdentities).values({
    userId: data.userId,
    chain: data.chain,
    address: data.address,
    challengeMessage: data.challengeMessage,
    signatureHex: data.signatureHex,
    verifiedAt: data.verified ? new Date() : null,
  });
}

export async function getMessagingIdentitiesByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(userMessagingIdentities)
    .where(eq(userMessagingIdentities.userId, userId))
    .orderBy(desc(userMessagingIdentities.createdAt));
}

export async function getAllWalletsForSnapshot() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(wallets);
}
