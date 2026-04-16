import * as ed25519 from "@noble/ed25519";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DAPP_UNKNOWN_ACCOUNT_MSG } from "@shared/const";
import { buildDappRegisterReceiveMessage, bytesToHex, hexToBytes } from "@shared/dappAuth";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import type { User } from "../drizzle/schema";

const hoisted = vi.hoisted(() => ({
  getUserByOpenId: vi.fn<[], Promise<User | undefined>>(),
  upsertUser: vi.fn<[], Promise<void>>(),
  upsertWallet: vi.fn<[], Promise<void>>(),
  hasUserRegisteredFromIp: vi.fn<[], Promise<boolean>>(),
  getDb: vi.fn<[], Promise<Record<string, never> | null>>(),
}));

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserByOpenId: hoisted.getUserByOpenId,
    upsertUser: hoisted.upsertUser,
    upsertWallet: hoisted.upsertWallet,
    hasUserRegisteredFromIp: hoisted.hasUserRegisteredFromIp,
    getDb: hoisted.getDb,
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

/** Passes zod; invalid addresses/signature ok when handler exits before those checks. */
function dummyRegisterFields() {
  return {
    btc: "bbbbbbbbbbbbbb",
    eth: "eeeeeeeeee",
    sol: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    btcNetwork: "mainnet" as const,
    receiveSignatureHex: `${"ab".repeat(64)}`,
  };
}

async function buildValidRegisterDappInput(publicKeyHex: string, privateKeyHex: string) {
  const btc = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
  const eth = "0x0000000000000000000000000000000000000000";
  const sol = "11111111111111111111111111111111";
  const btcNetwork = "mainnet" as const;
  const receiveMessage = buildDappRegisterReceiveMessage({
    publicKeyHex,
    btc,
    eth,
    sol,
    btcNetwork,
  });
  const sig = await ed25519.signAsync(new TextEncoder().encode(receiveMessage), hexToBytes(privateKeyHex));
  return {
    publicKeyHex,
    btc,
    eth,
    sol,
    btcNetwork,
    receiveSignatureHex: bytesToHex(sig),
  };
}

describe("auth.registerDapp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getDb.mockResolvedValue({});
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
    const privateKeyHex = bytesToHex(priv);

    hoisted.hasUserRegisteredFromIp.mockResolvedValue(false);
    hoisted.getUserByOpenId
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(minimalUser(publicKeyHex));

    const { ctx } = createCtx({ forwardedFor: "192.0.2.10" });
    const caller = appRouter.createCaller(ctx);
    const input = await buildValidRegisterDappInput(publicKeyHex, privateKeyHex);
    const result = await caller.auth.registerDapp(input);
    expect(result).toEqual({ ok: true });
    expect(hoisted.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        openId: publicKeyHex,
        loginMethod: "ed25519_dapp",
      })
    );
    expect(hoisted.upsertWallet).toHaveBeenCalledTimes(3);
    expect(hoisted.upsertWallet).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, chain: "BTC", address: input.btc })
    );
    expect(hoisted.upsertWallet).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, chain: "ETH", address: input.eth })
    );
    expect(hoisted.upsertWallet).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, chain: "SOL", address: input.sol })
    );
  });

  it("conflicts when account exists", async () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = await ed25519.getPublicKeyAsync(priv);
    const publicKeyHex = bytesToHex(pub);

    hoisted.getUserByOpenId.mockResolvedValue(minimalUser(publicKeyHex));

    const { ctx } = createCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.registerDapp({ publicKeyHex, ...dummyRegisterFields() })
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("fails when database is not configured", async () => {
    hoisted.getDb.mockResolvedValue(null);

    const priv = ed25519.utils.randomPrivateKey();
    const pub = await ed25519.getPublicKeyAsync(priv);
    const publicKeyHex = bytesToHex(pub);

    const { ctx } = createCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.registerDapp({ publicKeyHex, ...dummyRegisterFields() })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(hoisted.upsertUser).not.toHaveBeenCalled();
  });

  it("forbids second registration from same IP", async () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = await ed25519.getPublicKeyAsync(priv);
    const publicKeyHex = bytesToHex(pub);

    hoisted.hasUserRegisteredFromIp.mockResolvedValue(true);
    hoisted.getUserByOpenId.mockResolvedValue(undefined);

    const { ctx } = createCtx({ forwardedFor: "192.0.2.20" });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.registerDapp({ publicKeyHex, ...dummyRegisterFields() })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects invalid receive signature", async () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = await ed25519.getPublicKeyAsync(priv);
    const publicKeyHex = bytesToHex(pub);
    const privateKeyHex = bytesToHex(priv);

    hoisted.hasUserRegisteredFromIp.mockResolvedValue(false);
    hoisted.getUserByOpenId.mockResolvedValue(undefined);

    const base = await buildValidRegisterDappInput(publicKeyHex, privateKeyHex);
    const otherPriv = ed25519.utils.randomPrivateKey();
    const wrongSig = await ed25519.signAsync(
      new TextEncoder().encode("wrong message"),
      otherPriv
    );

    const { ctx } = createCtx({ forwardedFor: "192.0.2.30" });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.registerDapp({
        ...base,
        receiveSignatureHex: bytesToHex(wrongSig),
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Invalid signature for receive addresses",
    });
    expect(hoisted.upsertUser).not.toHaveBeenCalled();
  });

  it("rejects invalid ETH address", async () => {
    const pub = await ed25519.getPublicKeyAsync(ed25519.utils.randomPrivateKey());
    const publicKeyHex = bytesToHex(pub);

    hoisted.hasUserRegisteredFromIp.mockResolvedValue(false);
    hoisted.getUserByOpenId.mockResolvedValue(undefined);

    const btc = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
    const eth = "not-a-valid-eth-address-string-xxxxxxxxxxxxxxxxxxxxxx";
    const sol = "11111111111111111111111111111111";
    const btcNetwork = "mainnet" as const;

    const { ctx } = createCtx({ forwardedFor: "192.0.2.31" });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.registerDapp({
        publicKeyHex,
        btc,
        eth,
        sol,
        btcNetwork,
        receiveSignatureHex: `${"ab".repeat(64)}`,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Invalid ETH address",
    });
    expect(hoisted.upsertUser).not.toHaveBeenCalled();
  });
});

describe("auth.loginChallenge + loginWithSignature", () => {
  let publicKeyHex: string;
  let privateKeyHex: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    hoisted.getDb.mockResolvedValue({});
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

  it("rejects sign-in for an unknown public key", async () => {
    hoisted.getUserByOpenId.mockResolvedValue(undefined);
    const { ctx } = createCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.auth.loginChallenge({ publicKeyHex })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: DAPP_UNKNOWN_ACCOUNT_MSG,
    });
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
