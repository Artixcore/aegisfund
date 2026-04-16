import { createHash, randomBytes } from "node:crypto";
import { AGENT_RUN_GROUNDING_KEY } from "@shared/agentGrounding";
import { COOKIE_NAME, DAPP_UNKNOWN_ACCOUNT_MSG, ONE_YEAR_MS } from "@shared/const";
import {
  buildDappRegisterReceiveMessage,
  ed25519KeyHex64Schema,
  ed25519SignatureHex128Schema,
} from "@shared/dappAuth";
import { TRPCError } from "@trpc/server";
import { generateSecret, generateURI } from "otplib";
import { nanoid } from "nanoid";
import { z } from "zod";
import { prepareExecutiveBriefingRun } from "./agents/briefingOrchestrator";
import { toAgentErrorMessage } from "./agents/errorMessage";
import { notifyScheduledAgentOutcome } from "./agents/scheduledAgentNotify";
import type { AgentFeatureKey } from "./agents/featureStore";
import { getAgentResponseJsonSchema } from "./agents/outputSchemas";
import { prepareAgentRun } from "./agents/orchestrator";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { systemRouter } from "./_core/systemRouter";
import { tradewatchRouter } from "./market/tradewatchRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { callDataApi } from "./_core/dataApi";
import {
  assertValidEd25519PublicKeyHex,
  createLoginChallengeJwt,
  verifyEd25519Signature,
  verifyLoginChallengeJwt,
} from "./_core/dappAuthChallenge";
import { getClientIp } from "./_core/clientIp";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { storagePut } from "./storage";
import { fetchBtcBalance, fetchEthBalance, fetchSolBalance } from "./blockchain";
import { fetchCryptoSpotPrices, fetchCryptoSpotPriceMap } from "./cryptoPrices";
import { getBtcRestApiBase, getEthRpcUrl, getSolRpcUrl } from "./wallet/chainEndpoints";
import { pickPrimaryAddressForChain } from "./wallet/pickPrimaryAddress";
import { validateReceiveAddresses } from "./wallet/validateReceiveAddresses";
import {
  createAgentRun,
  createMessage,
  createPriceAlert,
  deletePriceAlert,
  deleteWallet,
  updateWalletById,
  getActivePriceAlerts,
  getAgentHistory,
  getAgentSchedulesByUserId,
  getConversationsByUserId,
  getDueSchedules,
  getLatestAgentRuns,
  getLatestPortfolioSnapshot,
  getMessagesByConversationId,
  getPriceAlertsByUserId,
  getPortfolioHistory,
  savePortfolioSnapshot,
  getWalletsByUserId,
  markAlertTriggered,
  togglePriceAlert,
  updateAgentRun,
  updateScheduleAfterRun,
  upsertAgentSchedule,
  upsertWallet,
  getKycProfile,
  upsertKycProfile,
  getMfaSettings,
  upsertMfaSettings,
  getUserSessions,
  upsertUserSession,
  revokeUserSession,
  getAlertHistory,
  insertAlertHistory,
  getAllKycProfiles,
  getPendingKycProfiles,
  reviewKycProfile,
  getAllWalletsForSnapshot,
  insertAuditLog,
  recordMessagingIdentityBinding,
  getMessagingIdentitiesByUserId,
  getDb,
  getUserByOpenId,
  hasUserRegisteredFromIp,
  upsertUser,
} from "./db";
import { setMessagingChallenge, validateMessagingChallenge, clearMessagingChallenge } from "./messaging/challengeStore";
import { verifyEthPersonalSign } from "./messaging/verifyEthWallet";

// ============================================================
// BACKGROUND SERVICES (price monitor + agent scheduler)
// ============================================================

let monitorStarted = false;

async function runPriceMonitor() {
  try {
    const activeAlerts = await getActivePriceAlerts();
    if (activeAlerts.length === 0) return;

    // Fetch current prices
    const priceMap: Record<string, number> = {};
    for (const sym of ["BTC", "ETH", "SOL"]) {
      try {
        const resp = await callDataApi("YahooFinance/get_stock_chart", {
          query: { symbol: `${sym}-USD`, interval: "1h", range: "1d" },
        }) as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } };
        const price = resp?.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0;
        priceMap[sym] = price;
      } catch { /* skip */ }
    }

    for (const alert of activeAlerts) {
      const currentPrice = priceMap[alert.symbol] ?? 0;
      if (currentPrice === 0) continue;
      const threshold = parseFloat(String(alert.threshold));
      const triggered =
        (alert.condition === "above" && currentPrice >= threshold) ||
        (alert.condition === "below" && currentPrice <= threshold);

      if (triggered) {
        await markAlertTriggered(alert.id);
        await notifyOwner({
          title: `🚨 Aegis Price Alert: ${alert.symbol} ${alert.condition === "above" ? "↑" : "↓"} $${threshold.toLocaleString()}`,
          content: `Your price alert has been triggered!\n\n**Asset:** ${alert.symbol}\n**Condition:** ${alert.condition} $${threshold.toLocaleString()}\n**Current Price:** $${currentPrice.toLocaleString()}\n\nThis alert has been deactivated. You can create a new one in Aegis Fund.`,
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[PriceMonitor] Error:", err);
  }
}

async function runAgentScheduler() {
  try {
    const dueSchedules = await getDueSchedules();
    for (const schedule of dueSchedules) {
      let runId: number | undefined;
      try {
        const prepared =
          schedule.agentType === "executive_briefing"
            ? await prepareExecutiveBriefingRun(schedule.userId, { portfolioBookMode: "light" })
            : await prepareAgentRun(schedule.agentType, {
                userId: schedule.userId,
                portfolioBookMode: "light",
              });
        const userPreview = prepared.messages[1]?.content?.substring(0, 180) ?? "";
        runId = await createAgentRun({
          userId: schedule.userId,
          agentType: schedule.agentType,
          taskDescription: `[Scheduled] ${userPreview}`,
        });
        await updateAgentRun(runId, { status: "analyzing" });

        const response = await invokeLLM({
          messages: prepared.messages,
          response_format: agentJsonResponseFormat(schedule.agentType),
        });

        const rawMsg = response?.choices?.[0]?.message?.content;
        const rawContent = typeof rawMsg === "string" ? rawMsg : "{}";
        let output: Record<string, unknown> = {};
        try { output = JSON.parse(rawContent); } catch { output = { summary: rawContent }; }
        output = { ...output, [AGENT_RUN_GROUNDING_KEY]: prepared.groundingMeta };

        await updateAgentRun(runId, { status: "complete", output, completedAt: new Date() });
        await updateScheduleAfterRun(schedule.id, schedule.intervalHours);
        await notifyScheduledAgentOutcome({
          userId: schedule.userId,
          agentType: schedule.agentType,
          ok: true,
          runId,
          output,
        });
      } catch (err) {
        const detail = toAgentErrorMessage(err);
        console.error(
          `[AgentScheduler] Failed agentType=${schedule.agentType} runId=${runId ?? "none"} userId=${schedule.userId}:`,
          detail,
        );
        if (runId !== undefined) {
          await updateAgentRun(runId, {
            status: "alert",
            completedAt: new Date(),
            errorMessage: toAgentErrorMessage(err),
          });
        }
        await updateScheduleAfterRun(schedule.id, schedule.intervalHours);
        await notifyScheduledAgentOutcome({
          userId: schedule.userId,
          agentType: schedule.agentType,
          ok: false,
          runId,
          errorMessage: toAgentErrorMessage(err),
        });
      }
    }
  } catch (err) {
    console.error("[AgentScheduler] Error:", err);
  }
}

// ============================================================
// PORTFOLIO SNAPSHOT SCHEDULER
// ============================================================
async function runPortfolioSnapshots() {
  try {
    const priceMap = await fetchCryptoSpotPriceMap();
    if (!priceMap["BTC"] && !priceMap["ETH"] && !priceMap["SOL"]) return; // no prices available

    // Get all wallets grouped by userId
    const allWallets = await getAllWalletsForSnapshot();
    const byUser: Record<number, typeof allWallets> = {};
    for (const w of allWallets) {
      if (!byUser[w.userId]) byUser[w.userId] = [];
      byUser[w.userId].push(w);
    }

    for (const [userIdStr, userWallets] of Object.entries(byUser)) {
      const userId = Number(userIdStr);
      let totalUsd = 0;
      for (const w of userWallets) {
        const price = priceMap[w.chain] ?? 0;
        if (!price || !w.address) continue;
        try {
          let balance = 0;
          if (w.chain === "BTC") {
            const { fetchBtcBalance: fetchBtc } = await import("./blockchain");
            const result = await fetchBtc(w.address);
            balance = result.balance;
          } else if (w.chain === "ETH") {
            const { fetchEthBalance: fetchEth } = await import("./blockchain");
            const result = await fetchEth(w.address);
            balance = result.balance;
          } else if (w.chain === "SOL") {
            const { fetchSolBalance: fetchSol } = await import("./blockchain");
            const result = await fetchSol(w.address);
            balance = result.balance;
          }
          totalUsd += balance * price;
        } catch { /* skip invalid address */ }
      }
      if (totalUsd > 0) {
        await savePortfolioSnapshot(userId, totalUsd);
        console.log(`[PortfolioSnapshot] Saved $${totalUsd.toFixed(2)} for user ${userId}`);
      }
    }
  } catch (err) {
    console.error("[PortfolioSnapshot] Error:", err);
  }
}

export function startBackgroundServices() {
  if (monitorStarted) return;
  monitorStarted = true;
  // Price monitor: every 5 minutes
  setInterval(runPriceMonitor, 5 * 60 * 1000);
  // Agent scheduler: every 60 seconds
  setInterval(runAgentScheduler, 60 * 1000);
  // Portfolio snapshot: every hour
  setInterval(runPortfolioSnapshots, 60 * 60 * 1000);
  // Run portfolio snapshot immediately on startup
  setTimeout(runPortfolioSnapshots, 10 * 1000);
  console.log("[Background] Price monitor, agent scheduler, and portfolio snapshot started");
}

// ============================================================
// PRICE DATA ROUTER
// ============================================================
const pricesRouter = router({
  getCryptoPrices: publicProcedure.query(async () => {
    try {
      return await fetchCryptoSpotPrices();
    } catch (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch prices" });
    }
  }),
});

// ============================================================
// WALLET ROUTER (with on-chain balances)
// ============================================================
const walletRouter = router({
  /** Non-secret hints for clients / ops (no API keys exposed). */
  getChainInfrastructure: protectedProcedure.query(() => {
    const ethRpc = Boolean(getEthRpcUrl());
    const ethKey = Boolean(ENV.etherscanApiKey?.trim());
    const ethBalanceSource: "rpc" | "etherscan" | "none" = ethRpc ? "rpc" : ethKey ? "etherscan" : "none";
    return {
      btcRestUsesCustomBase: Boolean(ENV.btcRestApiBase?.trim()),
      ethUsesSelfHostedRpc: ethRpc,
      ethBalanceSource,
      etherscanChainId: ENV.etherscanChainId,
      solUsesSelfHostedRpc: Boolean(ENV.solRpcUrl?.trim()),
      btcRestHostPreview: getBtcRestApiBase().replace(/^https?:\/\//, "").split("/")[0],
      solRpcHostPreview: getSolRpcUrl().replace(/^https?:\/\//, "").split("/")[0],
    };
  }),

  getWallets: protectedProcedure.query(async ({ ctx }) => {
    return getWalletsByUserId(ctx.user.id);
  }),

  getOnChainBalances: protectedProcedure.query(async ({ ctx }) => {
    const userWallets = await getWalletsByUserId(ctx.user.id);
    const btcAddr = pickPrimaryAddressForChain(userWallets, "BTC");
    const ethAddr = pickPrimaryAddressForChain(userWallets, "ETH");
    const solAddr = pickPrimaryAddressForChain(userWallets, "SOL");

    const [btc, eth, sol] = await Promise.all([
      btcAddr ? fetchBtcBalance(btcAddr) : Promise.resolve(null),
      ethAddr ? fetchEthBalance(ethAddr) : Promise.resolve(null),
      solAddr ? fetchSolBalance(solAddr) : Promise.resolve(null),
    ]);

    return { BTC: btc, ETH: eth, SOL: sol };
  }),

  updateWallet: protectedProcedure
    .input(z.object({
      id: z.number().int().positive().optional(),
      chain: z.enum(["BTC", "ETH", "SOL"]),
      address: z.string().min(10).max(128),
      label: z.string().max(64).optional(),
      mpcWalletId: z.string().max(128).optional().nullable(),
      custodyModel: z.enum(["watch_only", "mpc"]).optional(),
      walletPolicy: z.record(z.string(), z.unknown()).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.id != null) {
        const rows = await getWalletsByUserId(ctx.user.id);
        const row = rows.find((w) => w.id === input.id);
        if (!row || row.chain !== input.chain) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Wallet not found or chain mismatch" });
        }
        await updateWalletById(ctx.user.id, input.id, {
          address: input.address,
          label: input.label,
          mpcWalletId: input.mpcWalletId,
          custodyModel: input.custodyModel,
          walletPolicy: input.walletPolicy,
        });
      } else {
        await upsertWallet({
          userId: ctx.user.id,
          chain: input.chain,
          address: input.address,
          label: input.label,
          mpcWalletId: input.mpcWalletId,
          custodyModel: input.custodyModel,
          walletPolicy: input.walletPolicy,
        });
      }
      return { success: true };
    }),

  addWallet: protectedProcedure
    .input(z.object({
      chain: z.enum(["BTC", "ETH", "SOL"]),
      address: z.string().min(10).max(128),
      label: z.string().max(64).optional(),
      mpcWalletId: z.string().max(128).optional().nullable(),
      custodyModel: z.enum(["watch_only", "mpc"]).optional(),
      walletPolicy: z.record(z.string(), z.unknown()).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      await upsertWallet({ userId: ctx.user.id, ...input });
      return { success: true };
    }),

  deleteWallet: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteWallet(input.id, ctx.user.id);
      return { success: true };
    }),

  /**
   * On-chain transaction rows for the portfolio (watch addresses).
   * Returns an empty list until a DB table + indexer (or explorer polling) is wired.
   */
  getTransactionHistory: protectedProcedure.query(async (): Promise<
    Array<{
      chain: "BTC" | "ETH" | "SOL";
      type: "receive" | "send";
      amount: string;
      usd: string;
      address: string;
      time: string;
      hash: string;
      explorerUrl?: string;
    }>
  > => {
    return [];
  }),
});

// ============================================================
// MESSAGES ROUTER
// ============================================================
const ciphertextEnvelopeSchema = z.object({
  v: z.literal(1),
  iv: z.string(),
  ciphertext: z.string(),
  tag: z.string().optional(),
});

const messagesRouter = router({
  getConversations: protectedProcedure.query(async ({ ctx }) => {
    return getConversationsByUserId(ctx.user.id);
  }),

  getMessages: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ input }) => {
      const msgs = await getMessagesByConversationId(input.conversationId);
      return msgs.reverse();
    }),

  /** One-time challenge for `registerMessagingIdentity` (wallet-signed). */
  getMessagingBindingChallenge: protectedProcedure.query(({ ctx }) => {
    const message = `aegis:messaging:bind:user:${ctx.user.id}:nonce:${nanoid(20)}`;
    setMessagingChallenge(ctx.user.id, message);
    return { message };
  }),

  getMessagingIdentities: protectedProcedure.query(async ({ ctx }) => {
    return getMessagingIdentitiesByUserId(ctx.user.id);
  }),

  registerMessagingIdentity: protectedProcedure
    .input(z.object({
      chain: z.enum(["ETH"]),
      address: z.string().min(6).max(128),
      message: z.string().min(10).max(512),
      signatureHex: z.string().min(10).max(512),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!validateMessagingChallenge(ctx.user.id, input.message)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired binding challenge" });
      }
      const ok = await verifyEthPersonalSign({
        address: input.address,
        message: input.message,
        signatureHex: input.signatureHex,
      });
      if (!ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Signature verification failed" });
      }
      clearMessagingChallenge(ctx.user.id);
      await recordMessagingIdentityBinding({
        userId: ctx.user.id,
        chain: input.chain,
        address: input.address,
        challengeMessage: input.message,
        signatureHex: input.signatureHex,
        verified: true,
      });
      return { success: true };
    }),

  sendMessage: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      content: z.string().min(1).max(4000),
      ciphertextEnvelope: ciphertextEnvelopeSchema.optional(),
    }).refine(
      (d) => !d.ciphertextEnvelope || d.content.length <= 120,
      { message: "With ciphertextEnvelope, content must be a short placeholder only" },
    ))
    .mutation(async ({ ctx, input }) => {
      if (ENV.messagesRequireCiphertext && !input.ciphertextEnvelope) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Encrypted payload (ciphertextEnvelope) is required for relay messages in this environment.",
        });
      }
      await createMessage({
        conversationId: input.conversationId,
        senderId: ctx.user.id,
        content: input.content,
        encrypted: true,
        ciphertextEnvelope: input.ciphertextEnvelope,
      });
      return { success: true };
    }),
});

// ============================================================
// AGENTS ROUTER (with scheduling + history)
// ============================================================

function agentJsonResponseFormat(agentType: AgentFeatureKey) {
  const js = getAgentResponseJsonSchema(agentType);
  return {
    type: "json_schema" as const,
    json_schema: {
      name: js.name,
      strict: js.strict,
      schema: js.schema,
    },
  };
}

const AGENT_TRPC_DEV_DETAIL_MAX = 280;

function agentTrpcFailureMessage(generic: string, detail: string): string {
  if (ENV.isProduction) return generic;
  const d = detail.trim();
  if (!d) return generic;
  const clipped =
    d.length > AGENT_TRPC_DEV_DETAIL_MAX
      ? `${d.slice(0, AGENT_TRPC_DEV_DETAIL_MAX)}…`
      : d;
  return `${generic}: ${clipped}`;
}

const agentRunTypeSchema = z.enum([
  "market_analysis",
  "crypto_monitoring",
  "forex_monitoring",
  "futures_commodities",
  "historical_research",
  "executive_briefing",
]);

const agentsRouter = router({
  getAgentStatuses: protectedProcedure.query(async ({ ctx }) => {
    return getLatestAgentRuns(ctx.user.id);
  }),

  getAgentHistory: protectedProcedure
    .input(z.object({
      agentType: agentRunTypeSchema,
      limit: z.number().min(1).max(20).default(10),
    }))
    .query(async ({ ctx, input }) => {
      return getAgentHistory(ctx.user.id, input.agentType, input.limit);
    }),

  getSchedules: protectedProcedure.query(async ({ ctx }) => {
    return getAgentSchedulesByUserId(ctx.user.id);
  }),

  upsertSchedule: protectedProcedure
    .input(z.object({
      agentType: agentRunTypeSchema,
      intervalHours: z.number().min(1).max(168),
      isActive: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await upsertAgentSchedule({ userId: ctx.user.id, ...input });
      return { success: true, id };
    }),

  runAgent: protectedProcedure
    .input(z.object({
      agentType: z.enum(["market_analysis", "crypto_monitoring", "forex_monitoring", "futures_commodities", "historical_research"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const prepared = await prepareAgentRun(input.agentType, { userId: ctx.user.id });
      const preview = prepared.messages[1]?.content?.substring(0, 200) ?? "";

      const runId = await createAgentRun({
        userId: ctx.user.id,
        agentType: input.agentType,
        taskDescription: preview,
      });

      try {
        await updateAgentRun(runId, { status: "analyzing" });

        const response = await invokeLLM({
          messages: prepared.messages,
          response_format: agentJsonResponseFormat(input.agentType),
        });

        const rawMsg = response?.choices?.[0]?.message?.content;
        const rawContent = typeof rawMsg === "string" ? rawMsg : "{}";
        let output: Record<string, unknown> = {};
        try { output = JSON.parse(rawContent); } catch { output = { summary: rawContent }; }
        output = { ...output, [AGENT_RUN_GROUNDING_KEY]: prepared.groundingMeta };

        await updateAgentRun(runId, { status: "complete", output, completedAt: new Date() });
        return { success: true, runId, output };
      } catch (error) {
        const detail = toAgentErrorMessage(error);
        console.error(
          `[runAgent] runId=${runId} agentType=${input.agentType} userId=${ctx.user.id}:`,
          detail,
        );
        await updateAgentRun(runId, {
          status: "alert",
          completedAt: new Date(),
          errorMessage: detail,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: agentTrpcFailureMessage("Agent execution failed", detail),
        });
      }
    }),

  /** Synthesizes the five specialist desks’ latest complete outputs + fresh snapshot into one briefing. */
  runExecutiveBriefing: protectedProcedure.mutation(async ({ ctx }) => {
    const prepared = await prepareExecutiveBriefingRun(ctx.user.id);
    const preview = prepared.messages[1]?.content?.substring(0, 200) ?? "";

    const runId = await createAgentRun({
      userId: ctx.user.id,
      agentType: "executive_briefing",
      taskDescription: preview,
    });

    try {
      await updateAgentRun(runId, { status: "analyzing" });

      const response = await invokeLLM({
        messages: prepared.messages,
        response_format: agentJsonResponseFormat("executive_briefing"),
      });

      const rawMsg = response?.choices?.[0]?.message?.content;
      const rawContent = typeof rawMsg === "string" ? rawMsg : "{}";
      let output: Record<string, unknown> = {};
      try { output = JSON.parse(rawContent); } catch { output = { summary: rawContent }; }
      output = { ...output, [AGENT_RUN_GROUNDING_KEY]: prepared.groundingMeta };

      await updateAgentRun(runId, { status: "complete", output, completedAt: new Date() });
      return { success: true, runId, output };
    } catch (error) {
      const detail = toAgentErrorMessage(error);
      console.error(`[runExecutiveBriefing] runId=${runId} userId=${ctx.user.id}:`, detail);
      await updateAgentRun(runId, {
        status: "alert",
        completedAt: new Date(),
        errorMessage: detail,
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: agentTrpcFailureMessage("Executive briefing failed", detail),
      });
    }
  }),
});

// ============================================================
// PRICE ALERTS ROUTER
// ============================================================
const alertsRouter = router({
  getAlerts: protectedProcedure.query(async ({ ctx }) => {
    return getPriceAlertsByUserId(ctx.user.id);
  }),

  createAlert: protectedProcedure
    .input(z.object({
      symbol: z.enum(["BTC", "ETH", "SOL"]),
      condition: z.enum(["above", "below"]),
      threshold: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await createPriceAlert({
        userId: ctx.user.id,
        symbol: input.symbol,
        condition: input.condition,
        threshold: input.threshold.toFixed(2),
      });
      return { success: true, id };
    }),

  deleteAlert: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deletePriceAlert(input.id, ctx.user.id);
      return { success: true };
    }),

  toggleAlert: protectedProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await togglePriceAlert(input.id, ctx.user.id, input.isActive);
      return { success: true };
    }),
});

async function buildPortfolioSummaryForUser(userId: number) {
  const snapshot = await getLatestPortfolioSnapshot(userId);
  const userWallets = await getWalletsByUserId(userId);
  const prices = await fetchCryptoSpotPrices();

  const btcAddr = pickPrimaryAddressForChain(userWallets, "BTC");
  const ethAddr = pickPrimaryAddressForChain(userWallets, "ETH");
  const solAddr = pickPrimaryAddressForChain(userWallets, "SOL");

  const [btcBal, ethBal, solBal] = await Promise.all([
    btcAddr ? fetchBtcBalance(btcAddr) : Promise.resolve({ balance: 0, address: "" }),
    ethAddr ? fetchEthBalance(ethAddr) : Promise.resolve({ balance: 0, address: "" }),
    solAddr ? fetchSolBalance(solAddr) : Promise.resolve({ balance: 0, address: "" }),
  ]);

  const pBtc = prices.BTC?.price ?? 0;
  const pEth = prices.ETH?.price ?? 0;
  const pSol = prices.SOL?.price ?? 0;
  const pctBtc = prices.BTC?.changePct24h ?? 0;
  const pctEth = prices.ETH?.changePct24h ?? 0;
  const pctSol = prices.SOL?.changePct24h ?? 0;

  const btcBalance = btcBal.balance;
  const ethBalance = ethBal.balance;
  const solBalance = solBal.balance;

  const btcUsd = btcBalance * pBtc;
  const ethUsd = ethBalance * pEth;
  const solUsd = solBalance * pSol;
  const totalValueUsd = btcUsd + ethUsd + solUsd;

  const priorMultiplier = (pct: number) => {
    if (!Number.isFinite(pct) || pct <= -100) return 0;
    return 1 / (1 + pct / 100);
  };
  const valueYesterday =
    btcBalance * pBtc * priorMultiplier(pctBtc) +
    ethBalance * pEth * priorMultiplier(pctEth) +
    solBalance * pSol * priorMultiplier(pctSol);
  const change24h = totalValueUsd - valueYesterday;
  const changePct24h = valueYesterday > 0 ? (change24h / valueYesterday) * 100 : 0;

  const allocationBtc = totalValueUsd > 0 ? (btcUsd / totalValueUsd) * 100 : 0;
  const allocationEth = totalValueUsd > 0 ? (ethUsd / totalValueUsd) * 100 : 0;
  const allocationSol = totalValueUsd > 0 ? (solUsd / totalValueUsd) * 100 : 0;

  return {
    totalValueUsd: Math.round(totalValueUsd * 100) / 100,
    change24h: Math.round(change24h * 100) / 100,
    changePct24h: Math.round(changePct24h * 100) / 100,
    btcBalance,
    ethBalance,
    solBalance,
    allocationBtc: Math.round(allocationBtc * 10) / 10,
    allocationEth: Math.round(allocationEth * 10) / 10,
    allocationSol: Math.round(allocationSol * 10) / 10,
    snapshot,
  };
}

// ============================================================
// PORTFOLIO ROUTER
// ============================================================
const portfolioRouter = router({
  getSummary: protectedProcedure.query(async ({ ctx }) => {
    return buildPortfolioSummaryForUser(ctx.user.id);
  }),

  getHistory: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      const rows = await getPortfolioHistory(ctx.user.id, input.days);
      return rows.map((r) => ({ snapshotAt: r.snapshotAt, totalValueUsd: r.totalValueUsd ?? 0 }));
    }),

  saveSnapshot: protectedProcedure
    .input(z.object({ totalValueUsd: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await savePortfolioSnapshot(ctx.user.id, input.totalValueUsd);
      return { success: true };
    }),
});

// ============================================================
// KYC ROUTER
// ============================================================
const kycRouter = router({
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const profile = await getKycProfile(ctx.user.id);
    return profile ?? { status: "not_started", tier: "none", userId: ctx.user.id };
  }),

  savePersonalInfo: protectedProcedure
    .input(z.object({
      fullName: z.string().min(2).max(256),
      dateOfBirth: z.string(),
      nationality: z.string().min(2).max(128),
      countryOfResidence: z.string().min(2).max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      await upsertKycProfile(ctx.user.id, { ...input, status: "pending" });
      return { success: true };
    }),

  saveDocumentInfo: protectedProcedure
    .input(z.object({
      documentType: z.string(),
      documentNumber: z.string(),
      documentFrontUrl: z.string().optional(),
      documentBackUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await upsertKycProfile(ctx.user.id, { ...input, status: "pending" });
      return { success: true };
    }),

  saveSelfie: protectedProcedure
    .input(z.object({ selfieUrl: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await upsertKycProfile(ctx.user.id, { selfieUrl: input.selfieUrl, status: "pending" });
      return { success: true };
    }),

  submitForReview: protectedProcedure.mutation(async ({ ctx }) => {
    await upsertKycProfile(ctx.user.id, { status: "under_review", submittedAt: new Date() });
    await notifyOwner({ title: "New KYC Submission", content: `User ${ctx.user.name ?? ctx.user.openId} (ID: ${ctx.user.id}) submitted KYC for compliance review. Visit /admin/kyc to review.` });
    return { success: true };
  }),

  // Upload document image to S3 and return the CDN URL
  uploadDocument: protectedProcedure
    .input(z.object({
      fileBase64: z.string(),          // base64-encoded file
      mimeType: z.string(),            // e.g. "image/jpeg"
      side: z.enum(["front", "back"]), // which side of the document
    }))
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = input.mimeType.split("/")[1] ?? "jpg";
      const key = `kyc/${ctx.user.id}/document-${input.side}-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      // Persist the URL to the KYC profile
      if (input.side === "front") {
        await upsertKycProfile(ctx.user.id, { documentFrontUrl: url });
      } else {
        await upsertKycProfile(ctx.user.id, { documentBackUrl: url });
      }
      return { url };
    }),

  // Upload selfie image to S3 and return the CDN URL
  uploadSelfie: protectedProcedure
    .input(z.object({
      fileBase64: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = input.mimeType.split("/")[1] ?? "jpg";
      const key = `kyc/${ctx.user.id}/selfie-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      await upsertKycProfile(ctx.user.id, { selfieUrl: url });
      return { url };
    }),
});

// ============================================================
// SETTINGS ROUTER (with MFA + sessions)
// ============================================================
const settingsRouter = router({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    return {
      id: ctx.user.id,
      name: ctx.user.name,
      email: ctx.user.email,
      role: ctx.user.role,
      createdAt: ctx.user.createdAt,
    };
  }),

  updateProfile: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(128).optional() }))
    .mutation(async ({ ctx, input }) => {
      return { success: true, name: input.name ?? ctx.user.name };
    }),

  getMfaSettings: protectedProcedure.query(async ({ ctx }) => {
    const mfa = await getMfaSettings(ctx.user.id);
    return {
      isEnabled: mfa?.isEnabled ?? false,
      hasBackupCodes: Array.isArray(mfa?.backupCodes) && (mfa.backupCodes as string[]).length > 0,
      enabledAt: mfa?.enabledAt ?? null,
    };
  }),

  setupMfa: protectedProcedure
    .input(z.object({ enable: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (input.enable) {
        const secret = generateSecret();
        const backupCodes = Array.from({ length: 8 }, () =>
          randomBytes(5).toString("hex").toUpperCase()
        );
        const accountLabel = ctx.user.email?.trim() || ctx.user.name?.trim() || `user-${ctx.user.id}`;
        const otpauthUrl = generateURI({
          issuer: "Aegis Fund",
          label: accountLabel,
          secret,
        });
        await upsertMfaSettings(ctx.user.id, {
          isEnabled: true,
          totpSecret: secret,
          backupCodes,
          enabledAt: new Date(),
        });
        return { success: true, totpSecret: secret, backupCodes, qrCodeUrl: otpauthUrl };
      } else {
        await upsertMfaSettings(ctx.user.id, { isEnabled: false, totpSecret: undefined, backupCodes: undefined, enabledAt: null });
        return { success: true, totpSecret: null, backupCodes: [], qrCodeUrl: null };
      }
    }),

  getSessions: protectedProcedure.query(async ({ ctx }) => {
    // Ensure current session is recorded
    await upsertUserSession(ctx.user.id, `session-${ctx.user.id}-current`, {
      deviceName: "Current Browser",
      deviceType: "desktop",
      isCurrent: true,
    });
    return getUserSessions(ctx.user.id);
  }),

  revokeSession: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await revokeUserSession(input.id, ctx.user.id);
      return { success: true };
    }),
});

// ============================================================
// ADMIN ROUTER (admin-only KYC review)
// ============================================================
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

const adminRouter = router({
  // List all KYC submissions (admin sees all)
  listAllKyc: adminProcedure.query(async () => {
    return getAllKycProfiles();
  }),

  // List only pending (under_review) submissions
  listPendingKyc: adminProcedure.query(async () => {
    return getPendingKycProfiles();
  }),

  // Approve or reject a KYC submission
  reviewKyc: adminProcedure
    .input(z.object({
      profileId: z.number(),
      decision: z.enum(["approved", "rejected"]),
      rejectionReason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await reviewKycProfile(input.profileId, input.decision, input.rejectionReason);
      const fwd = ctx.req.headers["x-forwarded-for"];
      const rawIp =
        typeof fwd === "string" ? fwd.split(",")[0]?.trim() : ctx.req.socket?.remoteAddress ?? "";
      const ipHash = rawIp ? createHash("sha256").update(rawIp).digest("hex") : null;
      await insertAuditLog({
        actorUserId: ctx.user.id,
        action: `kyc_${input.decision}`,
        resource: "kyc_profile",
        resourceId: input.profileId,
        metadata: { rejectionReason: input.rejectionReason ?? null },
        ipHash,
      });
      // Notify the owner (admin) that a review was completed
      await notifyOwner({
        title: `KYC ${input.decision === "approved" ? "Approved" : "Rejected"}`,
        content: `Profile #${input.profileId} was ${input.decision} by ${ctx.user.name ?? ctx.user.openId}.`,
      });
      return { success: true };
    }),
});

// ============================================================
// APP ROUTER
// ============================================================
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    /** When true, this network already registered an account; UI should hide Create account. */
    registrationGate: publicProcedure.query(async ({ ctx }) => {
      const ip = getClientIp(ctx.req);
      if (!ip) {
        return { priorRegistrationOnThisNetwork: false as const };
      }
      const priorRegistrationOnThisNetwork = await hasUserRegisteredFromIp(ip);
      return { priorRegistrationOnThisNetwork };
    }),
    registerDapp: publicProcedure
      .input(
        z.object({
          publicKeyHex: ed25519KeyHex64Schema,
          btc: z.string().min(14).max(128),
          eth: z.string().min(10).max(128),
          sol: z.string().min(32).max(64),
          btcNetwork: z.enum(["mainnet", "testnet"]),
          receiveSignatureHex: ed25519SignatureHex128Schema,
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!ENV.cookieSecret?.trim()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "JWT_SECRET is not configured",
          });
        }
        if (!(await getDb())) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Database is not configured. Set DATABASE_URL (see .env.example), run db:migrate, then try again.",
          });
        }
        try {
          assertValidEd25519PublicKeyHex(input.publicKeyHex);
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid Ed25519 public key",
          });
        }

        const existing = await getUserByOpenId(input.publicKeyHex);
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An account with this public key already exists",
          });
        }

        const clientIp = getClientIp(ctx.req);
        if (clientIp && (await hasUserRegisteredFromIp(clientIp))) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This network already has an account. Sign in instead.",
          });
        }

        const btc = input.btc.trim();
        const eth = input.eth.trim().toLowerCase();
        const sol = input.sol.trim();
        const addrCheck = validateReceiveAddresses({
          btc,
          eth,
          sol,
          btcNetwork: input.btcNetwork,
        });
        if (!addrCheck.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: addrCheck.message });
        }

        const receiveMessage = buildDappRegisterReceiveMessage({
          publicKeyHex: input.publicKeyHex,
          btc,
          eth,
          sol,
          btcNetwork: input.btcNetwork,
        });
        const sigOk = await verifyEd25519Signature(
          input.publicKeyHex,
          receiveMessage,
          input.receiveSignatureHex
        );
        if (!sigOk) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid signature for receive addresses",
          });
        }

        await upsertUser({
          openId: input.publicKeyHex,
          name: null,
          email: null,
          loginMethod: "ed25519_dapp",
          lastSignedIn: new Date(),
          registrationIp: clientIp ?? undefined,
        });

        const created = await getUserByOpenId(input.publicKeyHex);
        if (!created) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "User was not found after registration",
          });
        }

        await upsertWallet({
          userId: created.id,
          chain: "BTC",
          address: btc,
          label: "Primary",
        });
        await upsertWallet({
          userId: created.id,
          chain: "ETH",
          address: eth,
          label: "Primary",
        });
        await upsertWallet({
          userId: created.id,
          chain: "SOL",
          address: sol,
          label: "Primary",
        });

        return { ok: true as const };
      }),
    loginChallenge: publicProcedure
      .input(z.object({ publicKeyHex: ed25519KeyHex64Schema }))
      .mutation(async ({ input }) => {
        if (!ENV.cookieSecret?.trim()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "JWT_SECRET is not configured",
          });
        }
        const user = await getUserByOpenId(input.publicKeyHex);
        if (!user) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: DAPP_UNKNOWN_ACCOUNT_MSG,
          });
        }
        return createLoginChallengeJwt(input.publicKeyHex);
      }),
    loginWithSignature: publicProcedure
      .input(
        z.object({
          publicKeyHex: ed25519KeyHex64Schema,
          challengeToken: z.string().min(20),
          signatureHex: ed25519SignatureHex128Schema,
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!ENV.cookieSecret?.trim()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "JWT_SECRET is not configured",
          });
        }

        let verified: { publicKeyHex: string; message: string };
        try {
          verified = await verifyLoginChallengeJwt(
            input.challengeToken,
            input.publicKeyHex
          );
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid or expired login challenge",
          });
        }

        const sigOk = await verifyEd25519Signature(
          verified.publicKeyHex,
          verified.message,
          input.signatureHex
        );
        if (!sigOk) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid signature",
          });
        }

        const user = await getUserByOpenId(verified.publicKeyHex);
        if (!user) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: DAPP_UNKNOWN_ACCOUNT_MSG,
          });
        }

        const sessionToken = await sdk.createSessionToken(verified.publicKeyHex, {
          name: "",
          expiresInMs: ONE_YEAR_MS,
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: ONE_YEAR_MS,
        });

        return { ok: true as const };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  prices: pricesRouter,
  market: tradewatchRouter,
  wallet: walletRouter,
  messages: messagesRouter,
  agents: agentsRouter,
  alerts: alertsRouter,
  portfolio: portfolioRouter,
  settings: settingsRouter,
  kyc: kycRouter,
  admin: adminRouter,
  alertHistory: router({
    getHistory: protectedProcedure.query(async ({ ctx }) => {
      return getAlertHistory(ctx.user.id);
    }),
    rearm: protectedProcedure
      .input(z.object({
        symbol: z.enum(["BTC", "ETH", "SOL"]),
        condition: z.enum(["above", "below"]),
        threshold: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await createPriceAlert({ userId: ctx.user.id, symbol: input.symbol, condition: input.condition, threshold: String(input.threshold) });
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
