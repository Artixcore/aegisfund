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

/** Strip brackets from IPv6 hostnames for mysql2 `host` option. */
function mysql2Host(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function decodedPathFirstSegment(pathname: string): string {
  const segment = pathname.replace(/^\//, "").split("/")[0] ?? "";
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Options for mysql2 `createPool` (promise) **without** `uri`, so mysql2 never runs
 * `ConnectionConfig.parseUrl` (which calls `decodeURIComponent` and throws on passwords like `100%off`).
 * Pass the **raw** `DATABASE_URL` from the environment (not the canonical string from {@link normalizeMysqlDatabaseUrl}).
 */
export function mysqlUrlToPoolOptions(mysqlUrl: string): Record<string, unknown> {
  const u = new URL(mysqlUrl.trim().replace(/^mysql:\/\//i, "http://"));
  const host = mysql2Host(u.hostname);
  const port = Number(u.port || 3306);
  const user = u.username;
  const password = u.password;
  const database = decodedPathFirstSegment(u.pathname);
  const options: Record<string, unknown> = {
    host,
    port,
    user,
    password,
    database,
  };
  for (const [key, value] of u.searchParams) {
    if (key === "host" || key === "port" || key === "user" || key === "password" || key === "database") {
      continue;
    }
    try {
      options[key] = JSON.parse(value);
    } catch {
      options[key] = value;
    }
  }
  return options;
}

/**
 * Pool options for the app process (no JDBC-style URI parsing in mysql2).
 * Prefer `DATABASE_URL`; else `DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`.
 */
export function resolveMysqlPoolOptions(): Record<string, unknown> | null {
  const direct = process.env.DATABASE_URL?.trim();
  if (direct) {
    try {
      return mysqlUrlToPoolOptions(direct);
    } catch {
      return null;
    }
  }

  const host = process.env.DB_HOST?.trim();
  if (!host) return null;
  const database = (process.env.DB_DATABASE ?? "").trim();
  if (!database) return null;
  return {
    host: mysql2Host(host),
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME ?? "",
    password: process.env.DB_PASSWORD ?? "",
    database,
  };
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
