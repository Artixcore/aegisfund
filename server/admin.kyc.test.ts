import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock the DB helpers so tests don't need a real database ───────────────
vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getAllKycProfiles: vi.fn().mockResolvedValue([
      {
        id: 1,
        userId: 10,
        status: "under_review",
        tier: "standard",
        fullName: "Alice Smith",
        dateOfBirth: "1990-01-01",
        nationality: "US",
        countryOfResidence: "US",
        documentType: "passport",
        documentNumber: "A12345678",
        documentFrontUrl: "https://cdn.example.com/front.jpg",
        documentBackUrl: "https://cdn.example.com/back.jpg",
        selfieUrl: "https://cdn.example.com/selfie.jpg",
        rejectionReason: null,
        submittedAt: new Date("2026-04-01T10:00:00Z"),
        reviewedAt: null,
        createdAt: new Date("2026-04-01T09:00:00Z"),
        updatedAt: new Date("2026-04-01T10:00:00Z"),
        userName: "Alice Smith",
        userEmail: "alice@example.com",
        userOpenId: "alice-open-id",
      },
    ]),
    getPendingKycProfiles: vi.fn().mockResolvedValue([
      {
        id: 1,
        userId: 10,
        status: "under_review",
        tier: "standard",
        fullName: "Alice Smith",
        submittedAt: new Date("2026-04-01T10:00:00Z"),
        userName: "Alice Smith",
        userEmail: "alice@example.com",
        userOpenId: "alice-open-id",
      },
    ]),
    reviewKycProfile: vi.fn().mockResolvedValue(undefined),
    insertAuditLog: vi.fn().mockResolvedValue(undefined),
  };
});

// ─── Mock notifyOwner so tests don't make real HTTP calls ──────────────────
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// ─── Context factories ─────────────────────────────────────────────────────
function makeAdminCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-open-id",
      name: "Admin User",
      email: "admin@aegis.fund",
      loginMethod: "session",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeUserCtx(): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "user-open-id",
      name: "Regular User",
      email: "user@example.com",
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

// ─── Tests ─────────────────────────────────────────────────────────────────
describe("admin.listAllKyc", () => {
  it("returns all KYC profiles for admin users", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.admin.listAllKyc();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toMatchObject({ status: "under_review", fullName: "Alice Smith" });
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(caller.admin.listAllKyc()).rejects.toThrow(/FORBIDDEN|Admin access required/i);
  });
});

describe("admin.listPendingKyc", () => {
  it("returns only pending (under_review) submissions for admin", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.admin.listPendingKyc();
    expect(Array.isArray(result)).toBe(true);
    expect(result.every((r) => r.status === "under_review")).toBe(true);
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(caller.admin.listPendingKyc()).rejects.toThrow(/FORBIDDEN|Admin access required/i);
  });
});

describe("admin.reviewKyc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("approves a KYC submission and returns success", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.admin.reviewKyc({ profileId: 1, decision: "approved" });
    expect(result).toEqual({ success: true });
  });

  it("rejects a KYC submission with a reason and returns success", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.admin.reviewKyc({
      profileId: 1,
      decision: "rejected",
      rejectionReason: "Document appears tampered",
    });
    expect(result).toEqual({ success: true });
  });

  it("throws FORBIDDEN when a non-admin attempts to review", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(
      caller.admin.reviewKyc({ profileId: 1, decision: "approved" })
    ).rejects.toThrow(/FORBIDDEN|Admin access required/i);
  });

  it("throws when decision is not approved or rejected", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    await expect(
      // @ts-expect-error intentionally invalid decision
      caller.admin.reviewKyc({ profileId: 1, decision: "maybe" })
    ).rejects.toThrow();
  });
});
