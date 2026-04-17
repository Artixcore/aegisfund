import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPENAI_CHAT_COMPLETIONS_URL,
  resolveLegacyChatCompletionsUrl,
} from "./openaiCompatibleUrl";

describe("resolveLegacyChatCompletionsUrl", () => {
  it("uses OpenAI default when empty", () => {
    expect(resolveLegacyChatCompletionsUrl("")).toBe(
      DEFAULT_OPENAI_CHAT_COMPLETIONS_URL,
    );
    expect(resolveLegacyChatCompletionsUrl("   ")).toBe(
      DEFAULT_OPENAI_CHAT_COMPLETIONS_URL,
    );
  });

  it("appends /v1/chat/completions for bare OpenAI origin", () => {
    expect(resolveLegacyChatCompletionsUrl("https://api.openai.com")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
    expect(resolveLegacyChatCompletionsUrl("https://api.openai.com/")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });

  it("uses /chat/completions after /v1 without doubling", () => {
    expect(resolveLegacyChatCompletionsUrl("https://api.openai.com/v1")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });

  it("uses Gemini OpenAI-compat path (not .../openai/v1/...)", () => {
    expect(
      resolveLegacyChatCompletionsUrl(
        "https://generativelanguage.googleapis.com/v1beta/openai",
      ),
    ).toBe(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    );
  });

  it("treats any .../openai base as Gemini-style suffix", () => {
    expect(resolveLegacyChatCompletionsUrl("https://example.com/v1beta/openai")).toBe(
      "https://example.com/v1beta/openai/chat/completions",
    );
  });

  it("passes through full chat/completions URL", () => {
    const full =
      "https://api.openai.com/v1/chat/completions";
    expect(resolveLegacyChatCompletionsUrl(full)).toBe(full);
    expect(resolveLegacyChatCompletionsUrl(`${full}/`)).toBe(full);
  });
});
