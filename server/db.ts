import { and, desc, eq, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2";
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
import { kycProfiles, mfaSettings, userSessions, alertHistory, InsertKycProfile } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { assertFieldEncryptionForWrites, decryptUtf8Field, encryptUtf8Field } from "./fieldEncryption";
import { resolveMysqlPoolOptions } from "../shared/mysqlUrl";

let _db: ReturnType<typeof drizzle> | null = null;
let _lastConnectErrorKey: string | null = null;

export async function getDb() {
  const opts = resolveMysqlPoolOptions();
  if (!_db && opts) {
    try {
      const pool = createPool(opts);
      _db = drizzle(pool);
      _lastConnectErrorKey = null;
    } catch (error) {
      const key = error instanceof Error ? error.message : String(error);
      if (_lastConnectErrorKey !== key) {
        console.warn("[Database] Failed to connect:", error);
        _lastConnectErrorKey = key;
      }
      _db = null;
    }
  }
  return _db;
}

// ============================================================
// USER HELPERS
// ============================================================

function decryptUserPiiRow<U extends { name?: string | null; email?: string | null }>(row: U): U {
  return {
    ...row,
    name: row.name != null ? decryptUtf8Field(row.name, "users.name") : row.name,
    email: row.email != null ? decryptUtf8Field(row.email, "users.email") : row.email,
  };
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    throw new Error("Database not configured or unavailable");
  }

  try {
    if (ENV.isProduction && ((user.name != null && user.name !== "") || (user.email != null && user.email !== ""))) {
      assertFieldEncryptionForWrites();
    }
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const assignNullable = (field: "loginMethod") => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    assignNullable("loginMethod");
    if (user.name !== undefined) {
      const n = user.name ?? null;
      values.name = n === null ? null : encryptUtf8Field(n, "users.name");
      updateSet.name = values.name;
    }
    if (user.email !== undefined) {
      const e = user.email ?? null;
      values.email = e === null ? null : encryptUtf8Field(e, "users.email");
      updateSet.email = values.email;
    }
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
  return result.length > 0 ? decryptUserPiiRow(result[0]) : undefined;
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

const KYC_ENCRYPTED_TEXT_FIELDS = [
  "fullName",
  "dateOfBirth",
  "nationality",
  "countryOfResidence",
  "documentType",
  "documentNumber",
  "documentFrontUrl",
  "documentBackUrl",
  "selfieUrl",
  "rejectionReason",
] as const;

function decryptKycRow(row: typeof kycProfiles.$inferSelect): typeof kycProfiles.$inferSelect {
  const out = { ...row };
  for (const f of KYC_ENCRYPTED_TEXT_FIELDS) {
    const v = out[f];
    if (typeof v === "string" && v.length > 0) {
      (out as unknown as Record<string, string | null>)[f] = decryptUtf8Field(v, `kyc_profiles.${f}`) ?? v;
    }
  }
  return out;
}

function encryptKycPayload(data: Partial<InsertKycProfile>): Partial<InsertKycProfile> {
  const out = { ...data };
  for (const f of KYC_ENCRYPTED_TEXT_FIELDS) {
    const v = out[f as keyof InsertKycProfile];
    if (typeof v === "string" && v.length > 0) {
      (out as unknown as Record<string, string>)[f] = encryptUtf8Field(v, `kyc_profiles.${f}`) ?? v;
    }
  }
  return out;
}

function kycPayloadHasSensitiveFields(data: Partial<InsertKycProfile>): boolean {
  return KYC_ENCRYPTED_TEXT_FIELDS.some((f) => {
    const v = data[f as keyof InsertKycProfile];
    return typeof v === "string" && v.length > 0;
  });
}

export async function getKycProfile(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(kycProfiles).where(eq(kycProfiles.userId, userId)).limit(1);
  return rows.length > 0 ? decryptKycRow(rows[0]) : null;
}

export async function upsertKycProfile(userId: number, data: Partial<InsertKycProfile>) {
  const db = await getDb();
  if (!db) return;
  if (ENV.isProduction && kycPayloadHasSensitiveFields(data)) {
    assertFieldEncryptionForWrites();
  }
  const payload = encryptKycPayload(data);
  const existing = await getKycProfile(userId);
  if (existing) {
    await db.update(kycProfiles).set({ ...payload, updatedAt: new Date() }).where(eq(kycProfiles.userId, userId));
  } else {
    await db.insert(kycProfiles).values({ userId, ...payload });
  }
}

// ============================================================
// MFA HELPERS
// ============================================================

type MfaBackupCodesStored = string[] | { enc: string };

function parseBackupCodesFromDb(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "object" && raw !== null && "enc" in raw && typeof (raw as { enc: string }).enc === "string") {
    const dec = decryptUtf8Field((raw as { enc: string }).enc, "mfa_settings.backupCodes");
    if (!dec) return null;
    try {
      return JSON.parse(dec) as string[];
    } catch {
      return null;
    }
  }
  return null;
}

export async function getMfaSettings(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(mfaSettings).where(eq(mfaSettings.userId, userId)).limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    ...row,
    totpSecret: row.totpSecret != null ? decryptUtf8Field(row.totpSecret, "mfa_settings.totpSecret") : row.totpSecret,
    backupCodes: parseBackupCodesFromDb(row.backupCodes) as typeof row.backupCodes,
  };
}

export async function upsertMfaSettings(userId: number, data: { isEnabled: boolean; totpSecret?: string; backupCodes?: string[]; enabledAt?: Date | null }) {
  const db = await getDb();
  if (!db) return;
  if (
    ENV.isProduction &&
    (data.isEnabled && (Boolean(data.totpSecret) || (data.backupCodes?.length ?? 0) > 0))
  ) {
    assertFieldEncryptionForWrites();
  }

  const patch: {
    isEnabled: boolean;
    totpSecret?: string | null;
    backupCodes?: MfaBackupCodesStored | null;
    enabledAt?: Date | null;
    updatedAt: Date;
  } = {
    isEnabled: data.isEnabled,
    updatedAt: new Date(),
  };
  if (!data.isEnabled) {
    patch.totpSecret = null;
    patch.backupCodes = null;
    patch.enabledAt = data.enabledAt ?? null;
  } else {
    if (data.enabledAt !== undefined) {
      patch.enabledAt = data.enabledAt;
    }
    if (data.totpSecret !== undefined) {
      patch.totpSecret =
        data.totpSecret && data.totpSecret.length > 0
          ? encryptUtf8Field(data.totpSecret, "mfa_settings.totpSecret")
          : null;
    }
    if (data.backupCodes !== undefined) {
      patch.backupCodes =
        data.backupCodes && data.backupCodes.length > 0
          ? { enc: encryptUtf8Field(JSON.stringify(data.backupCodes), "mfa_settings.backupCodes")! }
          : null;
    }
  }

  const existingRows = await db.select({ id: mfaSettings.id }).from(mfaSettings).where(eq(mfaSettings.userId, userId)).limit(1);
  if (existingRows.length > 0) {
    await db.update(mfaSettings).set(patch).where(eq(mfaSettings.userId, userId));
  } else {
    await db.insert(mfaSettings).values({
      userId,
      isEnabled: patch.isEnabled,
      totpSecret: patch.totpSecret ?? null,
      backupCodes: (patch.backupCodes ?? null) as typeof mfaSettings.$inferInsert.backupCodes,
      enabledAt: patch.enabledAt ?? null,
      updatedAt: patch.updatedAt,
    });
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

function mapAdminKycJoinRow<
  T extends {
    fullName: string | null;
    dateOfBirth: string | null;
    nationality: string | null;
    countryOfResidence: string | null;
    documentType: string | null;
    documentNumber: string | null;
    documentFrontUrl: string | null;
    documentBackUrl: string | null;
    selfieUrl: string | null;
    rejectionReason: string | null;
    userName: string | null;
    userEmail: string | null;
  },
>(row: T): T {
  const out = { ...row };
  for (const f of KYC_ENCRYPTED_TEXT_FIELDS) {
    const v = out[f as keyof T];
    if (typeof v === "string" && v.length > 0) {
      (out as unknown as Record<string, string | null>)[f] = decryptUtf8Field(v, `kyc_profiles.${f}`) ?? v;
    }
  }
  return {
    ...out,
    userName: out.userName != null ? decryptUtf8Field(out.userName, "users.name") : out.userName,
    userEmail: out.userEmail != null ? decryptUtf8Field(out.userEmail, "users.email") : out.userEmail,
  };
}

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
  return rows.map(mapAdminKycJoinRow);
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
  return rows.map(mapAdminKycJoinRow);
}

export async function reviewKycProfile(
  profileId: number,
  decision: "approved" | "rejected",
  rejectionReason?: string
) {
  const db = await getDb();
  if (!db) return;
  const plainReason =
    decision === "rejected" ? (rejectionReason ?? "Application rejected by compliance team.") : null;
  if (ENV.isProduction && plainReason) {
    assertFieldEncryptionForWrites();
  }
  const encReason =
    plainReason == null ? null : encryptUtf8Field(plainReason, "kyc_profiles.rejectionReason");
  await db
    .update(kycProfiles)
    .set({
      status: decision,
      rejectionReason: encReason,
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
