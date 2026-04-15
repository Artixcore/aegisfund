import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedPackage: { name: string; version: string } | null = null;

function readPackageMeta(): { name: string; version: string } {
  if (cachedPackage) return cachedPackage;
  for (const rel of ["../../package.json", "../package.json"]) {
    try {
      const p = join(__dirname, rel);
      const raw = readFileSync(p, "utf8");
      const j = JSON.parse(raw) as { name?: string; version?: string };
      cachedPackage = { name: j.name ?? "aegis-fund", version: j.version ?? "0.0.0" };
      return cachedPackage;
    } catch {
      /* try next */
    }
  }
  cachedPackage = { name: "aegis-fund", version: "0.0.0" };
  return cachedPackage;
}

/** JSON for `GET /api/version` and `X-Aegis-App-Version` (verify you hit the intended deploy). */
export function getServerBuildInfo() {
  const { name, version } = readPackageMeta();
  const release =
    process.env.BUILD_ID?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    "";
  return {
    name,
    version,
    release,
    /** Builds with unknown dapp keys return this HTTP status from tRPC (not 404). */
    dappLoginUnknownAccountHttpStatus: 400 as const,
  };
}
