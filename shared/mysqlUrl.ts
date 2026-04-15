/**
 * Parse `DATABASE_URL` and return a canonical `mysql://…` string with safely encoded userinfo.
 * Avoids mysql2 / drizzle-kit `decodeURIComponent` failures when the password contains raw `%`
 * or other characters that are not valid percent-encoding in the original string.
 */
export function normalizeMysqlDatabaseUrl(direct: string): string {
  const trimmed = direct.trim();
  const u = new URL(trimmed.replace(/^mysql:\/\//i, "http://"));
  const host = u.hostname;
  if (!host) {
    throw new Error("DATABASE_URL has no host");
  }
  const user = u.username;
  const password = u.password;
  const port = u.port || "3306";
  const path = u.pathname.replace(/^\//, "");
  const database = path.split("/")[0] ?? "";
  const search = u.search ?? "";
  const base = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
  return search ? `${base}${search}` : base;
}

/**
 * Build MySQL connection URL from env. Prefer `DATABASE_URL`; else `DB_HOST` + credentials (password URL-encoded).
 */
export function resolveMysqlDatabaseUrl(): string {
  const direct = process.env.DATABASE_URL?.trim();
  if (direct) {
    try {
      return normalizeMysqlDatabaseUrl(direct);
    } catch (e) {
      const hint = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Invalid DATABASE_URL (${hint}). URL-encode special characters in the password (e.g. % → %25, @ → %40).`,
      );
    }
  }

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
