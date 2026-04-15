/**
 * Creates DB_DATABASE on the server if missing (uses DB_* or DATABASE_URL from .env).
 * Run: node scripts/ensure-db.mjs
 */
import "dotenv/config";
import mysql from "mysql2/promise";

function parseDatabaseNameFromUrl(url) {
  try {
    const u = new URL(url.replace(/^mysql:\/\//, "http://"));
    const path = u.pathname.replace(/^\//, "");
    return path.split("/")[0] || "";
  } catch {
    return "";
  }
}

async function main() {
  let host = process.env.DB_HOST?.trim();
  let user = process.env.DB_USERNAME;
  let password = process.env.DB_PASSWORD;
  let port = Number(process.env.DB_PORT || 3306);
  let database = process.env.DB_DATABASE?.trim();

  const direct = process.env.DATABASE_URL?.trim();
  if (direct && !host) {
    const name = parseDatabaseNameFromUrl(direct);
    if (!name) {
      console.error("Could not parse database name from DATABASE_URL");
      process.exit(1);
    }
    const u = new URL(direct.replace(/^mysql:\/\//, "http://"));
    host = u.hostname;
    port = Number(u.port || 3306);
    user = decodeURIComponent(u.username);
    password = decodeURIComponent(u.password);
    database = name;
  }

  if (!host || !user || !database) {
    console.error("Need DB_HOST, DB_USERNAME, DB_PASSWORD, DB_DATABASE (or DATABASE_URL).");
    process.exit(1);
  }

  // RDS uses TLS; Node may not trust the chain unless you bundle Amazon CA. Default: verify off for dev.
  const useSsl = process.env.DB_SSL === "1" || host.includes("rds.amazonaws.com");
  const ssl = useSsl
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "1" }
    : undefined;

  const conn = await mysql.createConnection({
    host,
    user,
    password,
    port,
    ssl,
  });

  const safeDb = database.replace(/[^a-zA-Z0-9_]/g, "");
  if (safeDb !== database) {
    console.error("Invalid database name (use letters, numbers, underscore only).");
    process.exit(1);
  }

  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${safeDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await conn.end();
  console.log(`Database ready: ${safeDb}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
