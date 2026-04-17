import { describe, expect, it } from "vitest";
import {
  buildOpenAiCompatiblePayload,
  shouldUseMaxCompletionTokens,
} from "./openaiCompatibleChat";

describe("shouldUseMaxCompletionTokens", () => {
  it("is true when env forces", () => {
    expect(shouldUseMaxCompletionTokens("gpt-4o-mini", true)).toBe(true);
  });

  it("matches reasoning and newer GPT families", () => {
    expect(shouldUseMaxCompletionTokens("o3-mini", false)).toBe(true);
    expect(shouldUseMaxCompletionTokens("gpt-5-nano", false)).toBe(true);
    expect(shouldUseMaxCompletionTokens("gpt-4.1-mini", false)).toBe(true);
    expect(shouldUseMaxCompletionTokens("chatgpt-4o-latest", false)).toBe(true);
  });

  it("is false for common chat models when env is false", () => {
    expect(shouldUseMaxCompletionTokens("gpt-4o-mini", false)).toBe(false);
    expect(shouldUseMaxCompletionTokens("deepseek-chat", false)).toBe(false);
  });
});

describe("buildOpenAiCompatiblePayload token field", () => {
  const baseParams = {
    messages: [{ role: "user" as const, content: "hi" }],
  };

  it("uses max_tokens by default", () => {
    const p = buildOpenAiCompatiblePayload("gpt-4o-mini", baseParams);
    expect(p.max_tokens).toBe(32768);
    expect(p.max_completion_tokens).toBeUndefined();
  });

  it("uses max_completion_tokens when flagged", () => {
    const p = buildOpenAiCompatiblePayload("gpt-5-nano", baseParams, {
      useMaxCompletionTokens: true,
    });
    expect(p.max_completion_tokens).toBe(32768);
    expect(p.max_tokens).toBeUndefined();
  });
});
