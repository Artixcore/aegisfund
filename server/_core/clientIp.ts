import type { Request } from "express";

/**
 * Best-effort client IP for policy checks (behind one reverse proxy when trust proxy is set).
 */
export function getClientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return normalizeIp(forwarded.split(",")[0]?.trim());
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return normalizeIp(forwarded[0].split(",")[0]?.trim());
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.length > 0) {
    return normalizeIp(realIp.trim());
  }
  const fromExpress = typeof req.ip === "string" ? req.ip.trim() : "";
  if (fromExpress.length > 0) {
    return normalizeIp(fromExpress);
  }
  const remote = req.socket?.remoteAddress;
  if (typeof remote === "string" && remote.length > 0) {
    return normalizeIp(remote.trim());
  }
  return null;
}

function normalizeIp(raw: string | undefined): string | null {
  if (!raw) return null;
  let ip = raw.trim();
  if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }
  if (ip.length === 0 || ip.length > 45) return null;
  return ip;
}
