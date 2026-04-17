/** Default when `LLM_BASE_URL` is unset (OpenAI public API). */
export const DEFAULT_OPENAI_CHAT_COMPLETIONS_URL =
  "https://api.openai.com/v1/chat/completions";

/**
 * Builds the chat-completions URL for legacy `LLM_BASE_URL`:
 * - OpenAI-style: `origin` → `origin/v1/chat/completions`
 * - Google Gemini OpenAI-compat: `.../openai` → `.../openai/chat/completions` (not `.../openai/v1/...`)
 * - If the user pastes a full `.../chat/completions` URL, it is returned unchanged.
 */
export function resolveLegacyChatCompletionsUrl(llmBaseUrl: string): string {
  const raw = llmBaseUrl?.trim() ?? "";
  if (!raw) return DEFAULT_OPENAI_CHAT_COMPLETIONS_URL;

  let base = raw.replace(/\/+$/, "");

  if (/chat\/completions$/i.test(base)) {
    return base;
  }

  // `https://api.openai.com/v1` → `.../v1/chat/completions` (avoid `/v1/v1/...`)
  if (/\/v1$/i.test(base)) {
    return `${base}/chat/completions`;
  }

  try {
    const u = new URL(base);
    if (u.hostname === "generativelanguage.googleapis.com") {
      return `${base}/chat/completions`;
    }
  } catch {
    // fall through
  }

  if (/\/openai$/i.test(base)) {
    return `${base}/chat/completions`;
  }

  return `${base}/v1/chat/completions`;
}
