import "dotenv/config";

/**
 * Many hosts run `node dist/index.js` without setting NODE_ENV. Default to production
 * so static assets, security flags, and encryption assertions match a real deploy.
 * Does not override explicit values (development, test, staging, etc.).
 */
const raw = process.env.NODE_ENV;
if (raw === undefined || raw === null || String(raw).trim() === "") {
  process.env.NODE_ENV = "production";
}
