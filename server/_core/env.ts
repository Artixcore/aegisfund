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

  /** TradeWatch REST API (https://tradewatch.io/docs). Required for `market.*` tRPC procedures. */
  tradewatchApiKey: process.env.TRADEWATCH_API_KEY?.trim() ?? "",
  /** Override API host for staging; default production `https://api.tradewatch.io`. */
  tradewatchBaseUrl: process.env.TRADEWATCH_BASE_URL?.trim() || "https://api.tradewatch.io",

  /** OpenAI-compatible chat completions base (no path). Default: OpenAI public API. */
  llmBaseUrl: process.env.LLM_BASE_URL ?? "",
  /**
   * Legacy `LLM_*` model id. Default `gpt-4o-mini` matches the default host (OpenAI) when `LLM_BASE_URL` is unset.
   * Use a Gemini model id only when `LLM_BASE_URL` points at a Gemini-compatible or proxy endpoint.
   */
  llmModel: process.env.LLM_MODEL?.trim() || "gpt-4o-mini",
  llmApiKey:
    process.env.LLM_API_KEY ??
    process.env.OPENAI_API_KEY ??
    process.env.BUILT_IN_FORGE_API_KEY ??
    "",

  /** Default provider when not overridden (`legacy` uses LLM_BASE_URL / LLM_API_KEY / LLM_MODEL). */
  llmDefaultProvider: process.env.LLM_DEFAULT_PROVIDER?.trim().toLowerCase() ?? "",
  /** Comma-separated provider ids tried after the primary fails (e.g. `grok,openai`). */
  llmFallbackProvidersRaw: process.env.LLM_FALLBACK_PROVIDERS?.trim() ?? "",
  /** JSON map of agent type → provider id (e.g. `{"crypto_monitoring":"grok"}`). */
  llmAgentRoutingRaw: process.env.LLM_AGENT_ROUTING?.trim() ?? "",

  /**
   * When true, chat payloads use `max_completion_tokens` instead of `max_tokens` (required by some OpenAI models).
   * Heuristics also apply when unset; set to true if your model rejects `max_tokens`.
   */
  llmPreferMaxCompletionTokens:
    process.env.LLM_PREFER_MAX_COMPLETION_TOKENS === "true" ||
    process.env.LLM_PREFER_MAX_COMPLETION_TOKENS === "1",

  /** OpenAI platform (https://api.openai.com). */
  openaiApiKey: process.env.OPENAI_API_KEY?.trim() ?? "",
  openaiLlmModel: process.env.OPENAI_LLM_MODEL?.trim() || "gpt-4o-mini",

  /** Google Gemini (OpenAI-compatible surface, AI Studio key). */
  geminiApiKey:
    process.env.GEMINI_API_KEY?.trim() ??
    process.env.GOOGLE_API_KEY?.trim() ??
    "",
  geminiLlmModel: process.env.GEMINI_LLM_MODEL?.trim() || "gemini-2.5-flash",

  /** xAI Grok (https://api.x.ai). */
  xaiApiKey:
    process.env.XAI_API_KEY?.trim() ??
    process.env.GROK_API_KEY?.trim() ??
    "",
  xaiLlmModel:
    process.env.XAI_LLM_MODEL?.trim() ??
    process.env.GROK_LLM_MODEL?.trim() ??
    "grok-2-latest",

  /** DeepSeek (https://api.deepseek.com). */
  deepseekApiKey: process.env.DEEPSEEK_API_KEY?.trim() ?? "",
  deepseekLlmModel: process.env.DEEPSEEK_LLM_MODEL?.trim() || "deepseek-chat",

  /** Optional HTTPS URL for owner alerts (JSON POST: { title, content }). */
  notificationWebhookUrl: process.env.NOTIFICATION_WEBHOOK_URL ?? "",

  etherscanApiKey: process.env.ETHERSCAN_API_KEY ?? "",
  /** Etherscan API v2 `chainid` when using HTTP balance fallback (no ETH_RPC_URL). Default mainnet `1`. */
  etherscanChainId: process.env.ETHERSCAN_CHAIN_ID?.trim() || "1",
  btcRestApiBase: process.env.BTC_REST_API_BASE ?? "",
  ethRpcUrl: process.env.ETH_RPC_URL ?? "",
  solRpcUrl: process.env.SOL_RPC_URL ?? "",
  /** Production: reject relay messages without client ciphertext. Override with MESSAGES_REQUIRE_CIPHERTEXT=false. */
  messagesRequireCiphertext:
    process.env.NODE_ENV === "production"
      ? process.env.MESSAGES_REQUIRE_CIPHERTEXT !== "false"
      : process.env.MESSAGES_REQUIRE_CIPHERTEXT === "true",

  /**
   * AES-256 field encryption for KYC/MFA/user PII at rest (hex 64 chars or base64 44 chars).
   * Required in production when writing encrypted columns (see server/fieldEncryption.ts).
   */
  databaseFieldEncryptionKey: process.env.DATABASE_FIELD_ENCRYPTION_KEY?.trim() ?? "",
};
