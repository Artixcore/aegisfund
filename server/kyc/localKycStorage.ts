import fs from "node:fs/promises";
import path from "node:path";
import { ENV } from "../_core/env";

const KYC_KEY_PREFIX = "kyc/";

export function hasLocalKycStorage(): boolean {
  return Boolean(ENV.kycLocalStorageDir?.trim() && ENV.publicAppUrl?.trim());
}

function resolvedRoot(): string {
  const raw = ENV.kycLocalStorageDir.trim();
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

/** Safe single-segment filename for keys under kyc/<userId>/ */
const SAFE_FILE = /^[a-zA-Z0-9._-]{1,240}$/;

export function isSafeKycFileName(name: string): boolean {
  return SAFE_FILE.test(name) && !name.includes("..");
}

export function buildLocalKycPublicUrl(userId: number, fileName: string): string {
  const base = ENV.publicAppUrl.trim().replace(/\/+$/, "");
  return `${base}/api/kyc/file/${userId}/${encodeURIComponent(fileName)}`;
}

/**
 * Absolute path for `kyc/<userId>/<fileName>` under the local root; null if invalid.
 */
export function absolutePathForLocalKyc(userId: number, fileName: string): string | null {
  if (!hasLocalKycStorage()) return null;
  if (!Number.isFinite(userId) || userId < 1) return null;
  if (!isSafeKycFileName(fileName)) return null;
  const root = resolvedRoot();
  const abs = path.resolve(path.join(root, "kyc", String(userId), fileName));
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return abs;
}

/** Parse `/api/kyc/file/:userId/:fileName` pathname (fileName is last segment, decoded). */
export function parseLocalKycFilePathname(pathname: string): { userId: number; fileName: string } | null {
  const prefix = "/api/kyc/file/";
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash < 0) return null;
  const userId = parseInt(rest.slice(0, slash), 10);
  const encoded = rest.slice(slash + 1);
  if (!Number.isFinite(userId) || userId < 1 || !encoded) return null;
  let fileName: string;
  try {
    fileName = decodeURIComponent(encoded);
  } catch {
    return null;
  }
  if (!isSafeKycFileName(fileName)) return null;
  return { userId, fileName };
}

/** Load image bytes: local KYC URLs read from disk; otherwise HTTP fetch (legacy remote URLs). */
export async function loadKycImageBytes(url: string): Promise<Buffer | null> {
  const trimmed = url.trim();
  const fromDisk = await readLocalKycBytesByUrl(trimmed);
  if (fromDisk) return fromDisk;
  try {
    const res = await fetch(trimmed, { redirect: "follow" });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function readLocalKycBytesByUrl(imageUrl: string): Promise<Buffer | null> {
  if (!hasLocalKycStorage()) return null;
  let u: URL;
  try {
    u = new URL(imageUrl);
  } catch {
    return null;
  }
  const parsed = parseLocalKycFilePathname(u.pathname);
  if (!parsed) return null;
  const abs = absolutePathForLocalKyc(parsed.userId, parsed.fileName);
  if (!abs) return null;
  try {
    return await fs.readFile(abs);
  } catch {
    return null;
  }
}

export async function readLocalKycBytesByKey(relKey: string): Promise<Buffer | null> {
  const key = relKey.replace(/^\/+/, "");
  if (!key.startsWith(KYC_KEY_PREFIX)) return null;
  const parts = key.split("/").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "kyc") return null;
  const userId = parseInt(parts[1], 10);
  const fileName = parts.slice(2).join("/");
  if (!Number.isFinite(userId) || !isSafeKycFileName(fileName)) return null;
  const abs = absolutePathForLocalKyc(userId, fileName);
  if (!abs) return null;
  try {
    return await fs.readFile(abs);
  } catch {
    return null;
  }
}

export async function deleteLocalKycTreeForUser(userId: number): Promise<void> {
  if (!ENV.kycLocalStorageDir?.trim()) return;
  const root = resolvedRoot();
  const dir = path.join(root, "kyc", String(userId));
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore missing dir
  }
}

export function mimeFromFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}
