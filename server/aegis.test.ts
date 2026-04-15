import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: Array<{ name: string; options: Record<string, unknown> }> } {
  const clearedCookies: Array<{ name: string; options: Record<string, unknown> }> = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-aegis",
    email: "test@aegisfund.io",
    name: "Test Operator",
    loginMethod: "session",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// ============================================================
// AUTH TESTS
// ============================================================
describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "lax",
      httpOnly: true,
      path: "/",
    });
  });

  it("returns null for unauthenticated me query", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user for authenticated me query", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Test Operator");
    expect(result?.role).toBe("user");
  });
});

// ============================================================
// SETTINGS TESTS
// ============================================================
describe("settings", () => {
  it("getProfile returns user data", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const profile = await caller.settings.getProfile();

    expect(profile.id).toBe(1);
    expect(profile.name).toBe("Test Operator");
    expect(profile.email).toBe("test@aegisfund.io");
    expect(profile.role).toBe("user");
  });

  it("updateProfile returns success with updated name", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.settings.updateProfile({ name: "Updated Operator" });

    expect(result.success).toBe(true);
    expect(result.name).toBe("Updated Operator");
  });

  it("updateProfile without name returns original name", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.settings.updateProfile({});

    expect(result.success).toBe(true);
    expect(result.name).toBe("Test Operator");
  });
});

// ============================================================
// AGENT TYPE VALIDATION TESTS
// ============================================================
describe("agents.runAgent input validation", () => {
  it("rejects invalid agent type", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      // @ts-expect-error — intentionally testing invalid input
      caller.agents.runAgent({ agentType: "invalid_agent" })
    ).rejects.toThrow();
  });
});

// ============================================================
// MESSAGES VALIDATION TESTS
// ============================================================
describe("messages.sendMessage input validation", () => {
  it("rejects empty content", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.messages.sendMessage({ conversationId: 1, content: "" })
    ).rejects.toThrow();
  });

  it("rejects content exceeding 4000 chars", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.messages.sendMessage({ conversationId: 1, content: "x".repeat(4001) })
    ).rejects.toThrow();
  });
});

// ============================================================
// PORTFOLIO (live-derived summary; depends on DB + price gateway when unmocked)
// ============================================================
describe("portfolio.getSummary", () => {
  it("returns numeric summary fields consistent with totals", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const summary = await caller.portfolio.getSummary();

    expect(typeof summary.totalValueUsd).toBe("number");
    expect(typeof summary.btcBalance).toBe("number");
    expect(typeof summary.ethBalance).toBe("number");
    expect(typeof summary.solBalance).toBe("number");
    const allocSum = summary.allocationBtc + summary.allocationEth + summary.allocationSol;
    if (summary.totalValueUsd > 0) {
      expect(allocSum).toBeCloseTo(100, 0);
    } else {
      expect(allocSum).toBe(0);
    }
  });
});
