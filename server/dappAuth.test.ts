import * as ed25519 from "@noble/ed25519";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bytesToHex, hexToBytes } from "@shared/dappAuth";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import type { User } from "../drizzle/schema";

const hoisted = vi.hoisted(() => ({
  getUserByOpenId: vi.fn<[], Promise<User | undefined>>(),
  upsertUser: vi.fn<[], Promise<void>>(),
  hasUserRegisteredFromIp: vi.fn<[], Promise<boolean>>(),
}));

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserByOpenId: hoisted.getUserByOpenId,
    upsertUser: hoisted.upsertUser,
    hasUserRegisteredFromIp: hoisted.hasUserRegisteredFromIp,
  };
});

function minimalUser(openId: string): User {
  return {
    id: 1,
    openId,
    name: null,
    email: null,
    loginMethod: "ed25519_dapp",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    registrationIp: "127.0.0.1",
  };
}

function createCtx(opts?: {
  forwardedFor?: string;
}): { ctx: TrpcContext; setCookies: Array<{ name: string; value: string }> } {
  const setCookies: Array<{ name: string; value: string }> = [];
  const headers: Record<string, string> = {};
  if (opts?.forwardedFor) {
    headers["x-forwarded-for"] = opts.forwardedFor;
  }
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers,
    } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string) => {
        setCookies.push({ name, value });
      },
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
  return { ctx, setCookies };
}

describe("auth.registerDapp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid hex length", async () => {
    const { ctx } = createCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.registerDapp({ publicKeyHex: "ab".repeat(16) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects malformed public key hex", async () => {
    const badHex = `${"a".repeat(63)}g`;
    const { ctx } = createCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.auth.registerDapp({ publicKeyHex: badHex })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("registers when IP gate passes", async () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = await ed25519.getPublicKeyAsync(priv);
    const publicKeyHex = bytesToHex(pub);

    hoisted.hasUserRegisteredFromIp.mockResolvedValue(false);
    hoisted.getUserByOpenId.mockResolvedValue(undefined);

    const { ctx } = createCtx({ forwardedFor: "192.0.2.10" });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.registerDapp({ publicKeyHex });
    expect(result).toEqual({ ok: true });
    expect(hoisted.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        openId: publicKeyHex,
        loginMethod: "ed25519_dapp",
      })
    );
  });

  it("conflicts when account exists", async () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = await ed25519.getPublicKeyAsync(priv);
    const publicKeyHex = bytesToHex(pub);

    hoisted.getUserByOpenId.mockResolvedValue(minimalUser(publicKeyHex));

    const { ctx } = createCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.auth.registerDapp({ publicKeyHex })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("forbids second registration from same IP", async () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = await ed25519.getPublicKeyAsync(priv);
    const publicKeyHex = bytesToHex(pub);

    hoisted.hasUserRegisteredFromIp.mockResolvedValue(true);
    hoisted.getUserByOpenId.mockResolvedValue(undefined);

    const { ctx } = createCtx({ forwardedFor: "192.0.2.20" });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.auth.registerDapp({ publicKeyHex })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("auth.loginChallenge + loginWithSignature", () => {
  let publicKeyHex: string;
  let privateKeyHex: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const priv = ed25519.utils.randomPrivateKey();
    const pub = await ed25519.getPublicKeyAsync(priv);
    publicKeyHex = bytesToHex(pub);
    privateKeyHex = bytesToHex(priv);
    hoisted.getUserByOpenId.mockResolvedValue(minimalUser(publicKeyHex));
  });

  it("issues a challenge for an existing user", async () => {
    const { ctx } = createCtx();
    const caller = appRouter.createCaller(ctx);
    const ch = await caller.auth.loginChallenge({ publicKeyHex });
    expect(ch.challengeToken.length).toBeGreaterThan(20);
    expect(ch.message).toContain("Aegis Fund login");
    expect(ch.message).toContain(publicKeyHex);
  });

  it("sets session cookie on valid signature", async () => {
    const { ctx, setCookies } = createCtx();
    const caller = appRouter.createCaller(ctx);
    const ch = await caller.auth.loginChallenge({ publicKeyHex });
    const msg = new TextEncoder().encode(ch.message);
    const sig = await ed25519.signAsync(msg, hexToBytes(privateKeyHex));
    const signatureHex = bytesToHex(sig);

    const result = await caller.auth.loginWithSignature({
      publicKeyHex,
      challengeToken: ch.challengeToken,
      signatureHex,
    });
    expect(result).toEqual({ ok: true });
    expect(setCookies.some((c) => c.name === "app_session_id")).toBe(true);
  });

  it("rejects wrong signature", async () => {
    const { ctx } = createCtx();
    const caller = appRouter.createCaller(ctx);
    const ch = await caller.auth.loginChallenge({ publicKeyHex });

    const otherPriv = ed25519.utils.randomPrivateKey();
    const msg = new TextEncoder().encode(ch.message);
    const sig = await ed25519.signAsync(msg, otherPriv);
    const signatureHex = bytesToHex(sig);

    await expect(
      caller.auth.loginWithSignature({
        publicKeyHex,
        challengeToken: ch.challengeToken,
        signatureHex,
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects tampered challenge token", async () => {
    const { ctx } = createCtx();
    const caller = appRouter.createCaller(ctx);
    const ch = await caller.auth.loginChallenge({ publicKeyHex });
    const msg = new TextEncoder().encode(ch.message);
    const sig = await ed25519.signAsync(msg, hexToBytes(privateKeyHex));
    const signatureHex = bytesToHex(sig);

    await expect(
      caller.auth.loginWithSignature({
        publicKeyHex,
        challengeToken: `${ch.challengeToken}x`,
        signatureHex,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
