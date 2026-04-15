import { resolveMysqlDatabaseUrl } from "../../shared/mysqlUrl";

function databaseUrlOrEmpty(): string {
  try {
    if (!process.env.DATABASE_URL?.trim() && !process.env.DB_HOST?.trim()) return "";
    return resolveMysqlDatabaseUrl();
  } catch {
    return "";
  }
}

export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  /** Issuer claim for session JWTs (sub = openId). */
  sessionIssuer: process.env.JWT_ISSUER ?? "aegis-fund",
  databaseUrl: databaseUrlOrEmpty(),
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",

  /**
   * When true, `GET /api/auth/dev-login` creates a signed session cookie.
   * Default: on in development unless AUTH_DEV_LOGIN=false; off in production unless AUTH_DEV_LOGIN=true.
   */
  authDevLogin:
    process.env.AUTH_DEV_LOGIN === "true" ||
    (process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_LOGIN !== "false"),

  /** Connect-style data gateway (YahooFinance, etc.). */
  dataServiceBaseUrl:
    process.env.AEGIS_DATA_API_URL ?? process.env.BUILT_IN_FORGE_API_URL ?? "",
  dataServiceApiKey:
    process.env.AEGIS_DATA_API_KEY ?? process.env.BUILT_IN_FORGE_API_KEY ?? "",

  /** OpenAI-compatible chat completions base (no path). Default: OpenAI public API. */
  llmBaseUrl: process.env.LLM_BASE_URL ?? "",
  llmApiKey:
    process.env.LLM_API_KEY ??
    process.env.OPENAI_API_KEY ??
    process.env.BUILT_IN_FORGE_API_KEY ??
    "",

  /** Optional HTTPS URL for owner alerts (JSON POST: { title, content }). */
  notificationWebhookUrl: process.env.NOTIFICATION_WEBHOOK_URL ?? "",

  etherscanApiKey: process.env.ETHERSCAN_API_KEY ?? "",
  btcRestApiBase: process.env.BTC_REST_API_BASE ?? "",
  ethRpcUrl: process.env.ETH_RPC_URL ?? "",
  solRpcUrl: process.env.SOL_RPC_URL ?? "",
  demoWalletSeeding:
    process.env.DEMO_WALLET_SEEDING === "true" ||
    (process.env.NODE_ENV !== "production" && process.env.DEMO_WALLET_SEEDING !== "false"),
};
