import { describe, expect, it, vi, beforeEach } from "vitest";
import { invokeLLM } from "./_core/llm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock external dependencies ────────────────────────────────────────────
vi.mock("./blockchain", () => ({
  fetchBtcBalance: vi.fn().mockResolvedValue({ balance: 0.5, balanceUsd: 50000, address: "bc1q_test", chain: "BTC" }),
  fetchEthBalance: vi.fn().mockResolvedValue({ balance: 2.0, balanceUsd: 4900, address: "0x_test", chain: "ETH" }),
  fetchSolBalance: vi.fn().mockResolvedValue({ balance: 100, balanceUsd: 15000, address: "sol_test", chain: "SOL" }),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          summary: "Test market analysis: moderate bullish bias with elevated volatility.",
          confidence_level: 72,
          risk_factors: ["Fed policy uncertainty", "Geopolitical tensions"],
          investment_thesis: "Cautiously bullish on risk assets with tight stops.",
        }),
      },
    }],
  }),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

vi.mock("./cryptoPrices", () => ({
  fetchCryptoSpotPrices: vi.fn().mockResolvedValue({
    BTC: { symbol: "BTC", price: 100_000, change24h: 0, changePct24h: 2, high24h: 0, low24h: 0, volume24h: 0, sparkline: [] },
    ETH: { symbol: "ETH", price: 3000, change24h: 0, changePct24h: 1, high24h: 0, low24h: 0, volume24h: 0, sparkline: [] },
    SOL: { symbol: "SOL", price: 150, change24h: 0, changePct24h: 0.5, high24h: 0, low24h: 0, volume24h: 0, sparkline: [] },
  }),
}));

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getWalletsByUserId: vi.fn().mockResolvedValue([
      { id: 1, userId: 1, chain: "BTC", address: "bc1q_test", label: "Primary BTC", createdAt: new Date() },
      { id: 2, userId: 1, chain: "ETH", address: "0x_test", label: "Primary ETH", createdAt: new Date() },
      { id: 3, userId: 1, chain: "SOL", address: "sol_test", label: "Primary SOL", createdAt: new Date() },
    ]),
    upsertWallet: vi.fn().mockResolvedValue(1),
    deleteWallet: vi.fn().mockResolvedValue(undefined),
    getPriceAlertsByUserId: vi.fn().mockResolvedValue([
      { id: 1, userId: 1, symbol: "BTC", condition: "above", threshold: "100000.00", isActive: true, triggeredAt: null, createdAt: new Date() },
      { id: 2, userId: 1, symbol: "ETH", condition: "below", threshold: "2000.00", isActive: false, triggeredAt: null, createdAt: new Date() },
    ]),
    createPriceAlert: vi.fn().mockResolvedValue(3),
    deletePriceAlert: vi.fn().mockResolvedValue(undefined),
    togglePriceAlert: vi.fn().mockResolvedValue(undefined),
    getActivePriceAlerts: vi.fn().mockResolvedValue([]),
    markAlertTriggered: vi.fn().mockResolvedValue(undefined),
    getAgentSchedulesByUserId: vi.fn().mockResolvedValue([
      { id: 1, userId: 1, agentType: "market_analysis", intervalHours: 4, isActive: true, nextRunAt: new Date(Date.now() + 4 * 3600_000), lastRunAt: new Date(), createdAt: new Date() },
    ]),
    upsertAgentSchedule: vi.fn().mockResolvedValue(1),
    getDueSchedules: vi.fn().mockResolvedValue([]),
    updateScheduleAfterRun: vi.fn().mockResolvedValue(undefined),
    getLatestAgentRuns: vi.fn().mockResolvedValue([
      {
        id: 1,
        userId: 1,
        agentType: "market_analysis",
        status: "complete",
        taskDescription: "Market analysis",
        errorMessage: null,
        output: { summary: "Bullish" },
        completedAt: new Date(),
      },
    ]),
    getAgentHistory: vi.fn().mockResolvedValue([
      { id: 1, userId: 1, agentType: "market_analysis", status: "complete", taskDescription: "Market analysis", output: { summary: "Bullish" }, completedAt: new Date() },
      { id: 2, userId: 1, agentType: "market_analysis", status: "complete", taskDescription: "Market analysis", output: { summary: "Neutral" }, completedAt: new Date(Date.now() - 86400_000) },
    ]),
    getPortfolioHistory: vi.fn().mockResolvedValue([]),
    createAgentRun: vi.fn().mockResolvedValue(42),
    updateAgentRun: vi.fn().mockResolvedValue(undefined),
    getConversationsByUserId: vi.fn().mockResolvedValue([]),
    getMessagesByConversationId: vi.fn().mockResolvedValue([]),
    createMessage: vi.fn().mockResolvedValue(1),
    getLatestPortfolioSnapshot: vi.fn().mockResolvedValue(null),
  };
});

// ─── Test context factory ───────────────────────────────────────────────────
function makeCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@aegis.fund",
      name: "Test User",
      loginMethod: "session",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Wallet tests ────────────────────────────────────────────────────────────
describe("wallet.getWallets", () => {
  it("returns the user's wallets", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const wallets = await caller.wallet.getWallets();
    expect(wallets).toHaveLength(3);
    expect(wallets[0].chain).toBe("BTC");
    expect(wallets[1].chain).toBe("ETH");
    expect(wallets[2].chain).toBe("SOL");
  });
});

describe("wallet.getOnChainBalances", () => {
  it("returns on-chain balances for all chains", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const balances = await caller.wallet.getOnChainBalances();
    expect(balances.BTC).toBeDefined();
    expect(balances.ETH).toBeDefined();
    expect(balances.SOL).toBeDefined();
    expect(balances.BTC?.balance).toBe(0.5);
    expect(balances.ETH?.balance).toBe(2.0);
    expect(balances.SOL?.balance).toBe(100);
  });
});

describe("wallet.updateWallet", () => {
  it("updates a wallet address successfully", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.wallet.updateWallet({ chain: "BTC", address: "bc1qnewaddress123456789" });
    expect(result.success).toBe(true);
  });

  it("rejects an address that is too short", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.wallet.updateWallet({ chain: "BTC", address: "short" })).rejects.toThrow();
  });
});

// ─── Price alert tests ───────────────────────────────────────────────────────
describe("alerts.getAlerts", () => {
  it("returns the user's price alerts", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const alerts = await caller.alerts.getAlerts();
    expect(alerts).toHaveLength(2);
    expect(alerts[0].symbol).toBe("BTC");
    expect(alerts[0].condition).toBe("above");
    expect(alerts[1].isActive).toBe(false);
  });
});

describe("alerts.createAlert", () => {
  it("creates a price alert with valid input", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.alerts.createAlert({ symbol: "ETH", condition: "above", threshold: 5000 });
    expect(result.success).toBe(true);
    expect(result.id).toBe(3);
  });

  it("rejects a negative threshold", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.alerts.createAlert({ symbol: "BTC", condition: "above", threshold: -100 })).rejects.toThrow();
  });
});

describe("alerts.toggleAlert", () => {
  it("toggles an alert's active state", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.alerts.toggleAlert({ id: 1, isActive: false });
    expect(result.success).toBe(true);
  });
});

describe("alerts.deleteAlert", () => {
  it("deletes an alert", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.alerts.deleteAlert({ id: 1 });
    expect(result.success).toBe(true);
  });
});

// ─── Agent scheduling tests ──────────────────────────────────────────────────
describe("agents.getSchedules", () => {
  it("returns the user's agent schedules", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const schedules = await caller.agents.getSchedules();
    expect(schedules).toHaveLength(1);
    expect(schedules[0].agentType).toBe("market_analysis");
    expect(schedules[0].intervalHours).toBe(4);
    expect(schedules[0].isActive).toBe(true);
  });
});

describe("agents.upsertSchedule", () => {
  it("creates a schedule for an agent", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.agents.upsertSchedule({
      agentType: "crypto_monitoring",
      intervalHours: 8,
      isActive: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects interval below 1 hour", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.agents.upsertSchedule({
      agentType: "crypto_monitoring",
      intervalHours: 0,
      isActive: true,
    })).rejects.toThrow();
  });

  it("rejects interval above 168 hours (1 week)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.agents.upsertSchedule({
      agentType: "crypto_monitoring",
      intervalHours: 200,
      isActive: true,
    })).rejects.toThrow();
  });
});

describe("agents.getAgentHistory", () => {
  it("returns historical runs for an agent", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const history = await caller.agents.getAgentHistory({ agentType: "market_analysis", limit: 10 });
    expect(history).toHaveLength(2);
    expect(history[0].status).toBe("complete");
  });
});

describe("agents.runAgent", () => {
  it("runs an agent and returns structured output", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.agents.runAgent({ agentType: "market_analysis" });
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(typeof result.output.summary).toBe("string");
    expect((result.output.summary as string).length).toBeGreaterThan(0);

    const userMsg = vi.mocked(invokeLLM).mock.calls[0]?.[0]?.messages?.[1]?.content ?? "";
    expect(userMsg).toContain("portfolioBook");
    expect(userMsg).toContain("user-chain-balances");
  });
});

// ─── Portfolio tests ─────────────────────────────────────────────────────────
describe("portfolio.getSummary", () => {
  it("returns portfolio summary with expected fields", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const summary = await caller.portfolio.getSummary();
    expect(summary.totalValueUsd).toBeGreaterThan(0);
    expect(summary.btcBalance).toBeGreaterThan(0);
    expect(summary.ethBalance).toBeGreaterThan(0);
    expect(summary.solBalance).toBeGreaterThan(0);
    const allocSum = summary.allocationBtc + summary.allocationEth + summary.allocationSol;
    expect(allocSum).toBeCloseTo(100, 0);
  });
});
