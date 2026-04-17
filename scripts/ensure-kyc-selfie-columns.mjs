/**
 * Idempotently adds `selfieUrl1`, `selfieUrl2`, `selfieUrl3` to `kyc_profiles` if missing,
 * then backfills `selfieUrl1` from legacy `selfieUrl`.
 *
 * Use when the app returns 500 on `kyc.*` because the DB predates migration `0008_open_fixer.sql`.
 * Run: node scripts/ensure-kyc-selfie-columns.mjs
 * Requires DATABASE_URL (or DB_HOST + DB_USERNAME + DB_PASSWORD + DB_DATABASE) like other scripts.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

function parseDbFromUrl(url) {
  try {
    const u = new URL(url.replace(/^mysql:\/\//i, "http://"));
    return u.pathname.replace(/^\//, "").split("/")[0] || "";
  } catch {
    return "";
  }
}

function mysql2Host(hostname) {
  if (hostname.startsWith("[") && hostname.endsWith("]")) return hostname.slice(1, -1);
  return hostname;
}

function poolOptionsFromDatabaseUrl(direct) {
  const u = new URL(direct.trim().replace(/^mysql:\/\//i, "http://"));
  const database = decodeURIComponent(u.pathname.replace(/^\//, "").split("/")[0] || "");
  return {
    host: mysql2Host(u.hostname),
    port: Number(u.port || 3306),
    user: u.username,
    password: u.password,
    database,
  };
}

async function columnExists(conn, schema, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [schema, table, column],
  );
  return Number(rows[0]?.c) > 0;
}

async function main() {
  const direct = process.env.DATABASE_URL?.trim();
  if (!direct) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  const schema = parseDbFromUrl(direct);
  if (!schema) {
    console.error("Could not parse database name from DATABASE_URL.");
    process.exit(1);
  }

  const useSsl = process.env.DB_SSL === "1" || direct.includes("rds.amazonaws.com");
  const ssl = useSsl ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "1" } : undefined;

  const opts = { ...poolOptionsFromDatabaseUrl(direct), ssl };
  const conn = await mysql.createConnection(opts);

  const table = "kyc_profiles";
  const cols = ["selfieUrl1", "selfieUrl2", "selfieUrl3"];

  for (const col of cols) {
    const exists = await columnExists(conn, schema, table, col);
    if (exists) {
      console.log(`Column ${col}: already present`);
      continue;
    }
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` text`);
    console.log(`Column ${col}: added`);
  }

  await conn.query(
    `UPDATE \`${table}\` SET \`selfieUrl1\` = \`selfieUrl\`
     WHERE \`selfieUrl\` IS NOT NULL AND \`selfieUrl\` != ''
     AND (\`selfieUrl1\` IS NULL OR \`selfieUrl1\` = '')`,
  );
  console.log("Backfill selfieUrl1 from legacy selfieUrl (where applicable): done");

  await conn.end();
  console.log("kyc_profiles selfie columns OK.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
