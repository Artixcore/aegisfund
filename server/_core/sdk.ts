import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  name: string;
};

class AuthService {
  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map<string, string>();
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }

  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId,
      name: options.name ?? "",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(ENV.sessionIssuer)
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<SessionPayload | null> {
    if (!cookieValue) {
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
        issuer: ENV.sessionIssuer,
      });
      const rec = payload as Record<string, unknown>;
      const openId = rec.openId ?? rec.sub;
      if (!isNonEmptyString(openId)) {
        return null;
      }
      const name = isNonEmptyString(rec.name) ? rec.name : "";
      return { openId, name };
    } catch {
      try {
        const { payload } = await jwtVerify(cookieValue, this.getSessionSecret(), {
          algorithms: ["HS256"],
        });
        const rec = payload as Record<string, unknown>;
        const openId = rec.openId ?? rec.sub;
        if (!isNonEmptyString(openId)) return null;
        const name = isNonEmptyString(rec.name) ? rec.name : "";
        return { openId, name };
      } catch {
        return null;
      }
    }
  }

  /**
   * Resolve the signed-in user from the session cookie; creates a DB row on first login.
   */
  async authenticateRequest(req: Request): Promise<User> {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const signedInAt = new Date();
    const user = await db.getUserByOpenId(session.openId);

    if (!user) {
      throw ForbiddenError("User not found");
    }

    await db.upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt,
    });

    const refreshed = await db.getUserByOpenId(session.openId);
    return refreshed ?? user;
  }
}

export const sdk = new AuthService();
