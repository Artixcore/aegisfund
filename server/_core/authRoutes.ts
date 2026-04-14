import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getClientIp } from "./clientIp";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerAuthRoutes(app: Express) {
  /**
   * Development / controlled login: sets a signed session cookie (no external OAuth).
   * Disable in production unless AUTH_DEV_LOGIN=true.
   */
  app.get("/api/auth/dev-login", async (req: Request, res: Response) => {
    if (!ENV.authDevLogin) {
      res.status(403).type("text/plain").send("Dev login is disabled. Set AUTH_DEV_LOGIN=true.");
      return;
    }

    if (!ENV.cookieSecret?.trim()) {
      res.status(500).type("text/plain").send("JWT_SECRET is required for sessions.");
      return;
    }

    const openId = getQueryParam(req, "openId")?.trim() || "dev-local-user";
    const name = getQueryParam(req, "name")?.trim() || "Local Developer";
    const email = getQueryParam(req, "email")?.trim() || null;
    const clientIp = getClientIp(req);

    try {
      const existing = await db.getUserByOpenId(openId);
      if (!existing && clientIp && (await db.hasUserRegisteredFromIp(clientIp))) {
        res
          .status(403)
          .type("html")
          .send(
            "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Sign in</title></head><body style=\"font-family:system-ui;padding:2rem\">" +
              "<p>This network already has an account. Sign in with your existing credentials.</p>" +
              "<p><a href=\"/login\">Back to sign in</a></p></body></html>"
          );
        return;
      }

      await db.upsertUser({
        openId,
        name,
        email,
        loginMethod: "dev_session",
        lastSignedIn: new Date(),
        registrationIp: existing ? undefined : clientIp ?? undefined,
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      const next = getQueryParam(req, "redirect")?.trim() || "/dashboard";
      res.redirect(302, next.startsWith("/") ? next : "/dashboard");
    } catch (error) {
      console.error("[Auth] dev-login failed", error);
      res.status(500).json({ error: "dev-login failed" });
    }
  });
}
