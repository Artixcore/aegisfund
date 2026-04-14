import { Point, verifyAsync } from "@noble/ed25519";
import { SignJWT, jwtVerify } from "jose";
import {
  AEGIS_LOGIN_CHALLENGE_AUD,
  buildDappLoginMessage,
  hexToBytes,
} from "@shared/dappAuth";
import { nanoid } from "nanoid";
import { ENV } from "./env";

const CHALLENGE_TTL_SEC = 300;

export function assertValidEd25519PublicKeyHex(publicKeyHex: string): void {
  const bytes = hexToBytes(publicKeyHex);
  if (bytes.length !== 32) throw new Error("Invalid public key length");
  Point.fromBytes(bytes).assertValidity();
}

export async function verifyEd25519Signature(
  publicKeyHex: string,
  messageUtf8: string,
  signatureHex: string
): Promise<boolean> {
  const pub = hexToBytes(publicKeyHex);
  const sig = hexToBytes(signatureHex);
  const msg = new TextEncoder().encode(messageUtf8);
  return verifyAsync(sig, msg, pub);
}

function getJwtSecret() {
  const s = ENV.cookieSecret?.trim();
  if (!s) throw new Error("JWT_SECRET is required for login challenges");
  return new TextEncoder().encode(s);
}

export async function createLoginChallengeJwt(publicKeyHex: string): Promise<{
  challengeToken: string;
  message: string;
}> {
  const nonce = nanoid(32);
  const issuedAt = Math.floor(Date.now() / 1000);
  const expSec = issuedAt + CHALLENGE_TTL_SEC;
  const message = buildDappLoginMessage(publicKeyHex, nonce, expSec);

  const challengeToken = await new SignJWT({
    typ: "aegis_login_challenge",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ENV.sessionIssuer)
    .setAudience(AEGIS_LOGIN_CHALLENGE_AUD)
    .setSubject(publicKeyHex)
    .setJti(nonce)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expSec)
    .sign(getJwtSecret());

  return { challengeToken, message };
}

export type VerifiedLoginChallenge = {
  publicKeyHex: string;
  message: string;
};

export async function verifyLoginChallengeJwt(
  challengeToken: string,
  expectedPublicKeyHex: string
): Promise<VerifiedLoginChallenge> {
  const { payload } = await jwtVerify(challengeToken, getJwtSecret(), {
    algorithms: ["HS256"],
    issuer: ENV.sessionIssuer,
    audience: AEGIS_LOGIN_CHALLENGE_AUD,
  });

  const rec = payload as Record<string, unknown>;
  const typ = rec.typ;
  if (typ !== "aegis_login_challenge") {
    throw new Error("Invalid challenge type");
  }

  const publicKeyHex =
    typeof rec.sub === "string" ? rec.sub.toLowerCase() : "";
  if (!publicKeyHex || publicKeyHex !== expectedPublicKeyHex) {
    throw new Error("Public key mismatch");
  }

  const nonce = typeof rec.jti === "string" ? rec.jti : "";
  const exp =
    typeof rec.exp === "number"
      ? rec.exp
      : typeof rec.exp === "string"
        ? parseInt(rec.exp, 10)
        : NaN;
  if (!nonce || !Number.isFinite(exp)) {
    throw new Error("Invalid challenge payload");
  }

  const message = buildDappLoginMessage(publicKeyHex, nonce, exp);
  return { publicKeyHex, message };
}
