/**
 * Build MySQL connection URL from env. Prefer `DATABASE_URL`; else `DB_HOST` + credentials (password URL-encoded).
 */
export function resolveMysqlDatabaseUrl(): string {
  const direct = process.env.DATABASE_URL?.trim();
  if (direct) return direct;

  const host = process.env.DB_HOST?.trim();
  if (!host) {
    throw new Error("Set DATABASE_URL or DB_HOST, DB_USERNAME, DB_PASSWORD, and DB_DATABASE");
  }
  const user = encodeURIComponent(process.env.DB_USERNAME ?? "");
  const pass = encodeURIComponent(process.env.DB_PASSWORD ?? "");
  const port = process.env.DB_PORT?.trim() || "3306";
  const database = (process.env.DB_DATABASE ?? "").trim();
  if (!database) {
    throw new Error("DB_DATABASE is required when using DB_HOST-style configuration");
  }
  return `mysql://${user}:${pass}@${host}:${port}/${database}`;
}
