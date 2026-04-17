// Storage: KYC local FS when KYC_LOCAL_STORAGE_DIR + PUBLIC_APP_URL; else data gateway; else direct S3.

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import fs from "node:fs/promises";
import path from "node:path";
import { ENV } from "./_core/env";
import {
  buildLocalKycPublicUrl,
  hasLocalKycStorage,
  isSafeKycFileName,
} from "./kyc/localKycStorage";

type StorageConfig = { baseUrl: string; apiKey: string };

function getGatewayConfig(): StorageConfig | null {
  const baseUrl = ENV.dataServiceBaseUrl?.trim();
  const apiKey = ENV.dataServiceApiKey?.trim();
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function hasDirectS3(): boolean {
  return Boolean(ENV.s3Bucket && ENV.s3PublicBaseUrl);
}

function parseKycKey(key: string): { userId: number; fileName: string } | null {
  const parts = key.split("/").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "kyc") return null;
  const userId = parseInt(parts[1], 10);
  const fileName = parts.slice(2).join("/");
  if (!Number.isFinite(userId) || userId < 1 || !isSafeKycFileName(fileName)) return null;
  return { userId, fileName };
}

async function storagePutLocal(
  key: string,
  data: Buffer | Uint8Array | string,
  _contentType: string
): Promise<{ key: string; url: string }> {
  const parsed = parseKycKey(key);
  if (!parsed) {
    throw new Error(`Invalid KYC storage key: ${key}`);
  }
  const root = path.isAbsolute(ENV.kycLocalStorageDir.trim())
    ? ENV.kycLocalStorageDir.trim()
    : path.resolve(process.cwd(), ENV.kycLocalStorageDir.trim());
  const abs = path.resolve(path.join(root, "kyc", String(parsed.userId), parsed.fileName));
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Invalid KYC local path");
  }
  const body =
    typeof data === "string"
      ? Buffer.from(data, "utf8")
      : Buffer.from(data instanceof Uint8Array ? data : new Uint8Array(data));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, body);
  return { key, url: buildLocalKycPublicUrl(parsed.userId, parsed.fileName) };
}

function assertKycLocalEnvIfKycKey(key: string): void {
  if (!key.startsWith("kyc/")) return;
  if (!ENV.kycLocalStorageDir?.trim()) return;
  if (!ENV.publicAppUrl?.trim()) {
    throw new Error(
      "KYC_LOCAL_STORAGE_DIR is set but PUBLIC_APP_URL is required to build KYC file URLs."
    );
  }
}

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(
  baseUrl: string,
  relKey: string,
  apiKey: string
): Promise<string> {
  const downloadApiUrl = new URL(
    "v1/storage/downloadUrl",
    ensureTrailingSlash(baseUrl)
  );
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
  });
  return (await response.json()).url;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

export function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function toFormData(
  data: Buffer | Uint8Array | string,
  contentType: string,
  fileName: string
): FormData {
  const bytes: Uint8Array =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : new Uint8Array(data as Buffer | Uint8Array);
  const blob = new Blob([bytes as unknown as BlobPart], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

function publicUrlForKey(key: string): string {
  const base = ENV.s3PublicBaseUrl;
  const encoded = key.split("/").map((s) => encodeURIComponent(s)).join("/");
  return `${base}/${encoded}`;
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: ENV.awsRegion,
      ...(ENV.s3Endpoint
        ? { endpoint: ENV.s3Endpoint, forcePathStyle: true }
        : {}),
    });
  }
  return s3Client;
}

async function storagePutGateway(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
  cfg: StorageConfig
): Promise<{ key: string; url: string }> {
  const { baseUrl, apiKey } = cfg;
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

async function storagePutS3(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const body =
    typeof data === "string"
      ? Buffer.from(data, "utf8")
      : Buffer.from(data instanceof Uint8Array ? data : new Uint8Array(data));
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return { key, url: publicUrlForKey(key) };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  assertKycLocalEnvIfKycKey(key);

  if (key.startsWith("kyc/") && hasLocalKycStorage()) {
    return storagePutLocal(key, data, contentType);
  }

  const gateway = getGatewayConfig();
  if (gateway) {
    return storagePutGateway(key, data, contentType, gateway);
  }

  if (hasDirectS3()) {
    return storagePutS3(key, data, contentType);
  }

  throw new Error(
    "Storage not configured. For KYC: set KYC_LOCAL_STORAGE_DIR + PUBLIC_APP_URL, or set AEGIS_DATA_API_URL + AEGIS_DATA_API_KEY, " +
      "or set S3_BUCKET + S3_PUBLIC_BASE_URL (and AWS credentials via env or instance role, plus AWS_REGION)."
  );
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  assertKycLocalEnvIfKycKey(key);

  if (key.startsWith("kyc/") && hasLocalKycStorage()) {
    const parsed = parseKycKey(key);
    if (!parsed) {
      throw new Error(`Invalid KYC storage key: ${key}`);
    }
    return { key, url: buildLocalKycPublicUrl(parsed.userId, parsed.fileName) };
  }

  const gateway = getGatewayConfig();
  if (gateway) {
    return {
      key,
      url: await buildDownloadUrl(gateway.baseUrl, key, gateway.apiKey),
    };
  }

  if (hasDirectS3()) {
    return { key, url: publicUrlForKey(key) };
  }

  throw new Error(
    "Storage not configured (KYC local, data gateway, or S3 required for storageGet)."
  );
}
