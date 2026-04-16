import { describe, expect, it, vi } from "vitest";
import { BaseLLMProvider } from "./baseProvider";
import {
  LLMManager,
  parseLlmAgentRouting,
  parseLlmFallbackProviders,
} from "./manager";
import type { InvokeParams, InvokeResult, LlmProviderId } from "./types";

function minimalResult(text: string): InvokeResult {
  return {
    id: "stub",
    created: 0,
    model: "stub-model",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
  };
}

class FailProvider extends BaseLLMProvider {
  constructor(readonly id: LlmProviderId) {
    super();
  }

  isConfigured() {
    return true;
  }

  async chatCompletion(): Promise<InvokeResult> {
    throw new Error("simulated failure");
  }
}

class OkProvider extends BaseLLMProvider {
  constructor(readonly id: LlmProviderId, private readonly text: string) {
    super();
  }

  isConfigured() {
    return true;
  }

  async chatCompletion(): Promise<InvokeResult> {
    return minimalResult(this.text);
  }
}

class UnconfiguredProvider extends BaseLLMProvider {
  readonly id: LlmProviderId = "legacy";

  isConfigured() {
    return false;
  }

  async chatCompletion(): Promise<InvokeResult> {
    throw new Error("should not be called");
  }
}

describe("parseLlmFallbackProviders", () => {
  it("parses comma list and dedupes", () => {
    expect(parseLlmFallbackProviders("grok, openai, grok, invalid")).toEqual([
      "grok",
      "openai",
    ]);
  });
});

describe("parseLlmAgentRouting", () => {
  it("returns empty on invalid JSON", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseLlmAgentRouting("{not json")).toEqual({});
    warn.mockRestore();
  });

  it("parses valid agent keys and provider ids", () => {
    const raw = JSON.stringify({
      crypto_monitoring: "grok",
      market_analysis: "deepseek",
      badKey: "openai",
      forex_monitoring: "not_a_provider",
    });
    expect(parseLlmAgentRouting(raw)).toEqual({
      crypto_monitoring: "grok",
      market_analysis: "deepseek",
    });
  });
});

describe("LLMManager", () => {
  it("tries fallback provider when primary throws", async () => {
    const providers = new Map<LlmProviderId, BaseLLMProvider>([
      ["openai", new FailProvider("openai")],
      ["legacy", new OkProvider("legacy", "from-legacy")],
    ]);
    const mgr = new LLMManager({
      providers,
      agentRouting: {},
      fallbackIds: ["legacy"],
      llmDefaultProviderRaw: "openai",
    });
    const res = await mgr.invoke({
      messages: [{ role: "user", content: "hi" }],
      llm: { provider: "openai" },
    });
    expect(res.choices[0].message.content).toBe("from-legacy");
  });

  it("uses agent routing when override absent", async () => {
    const providers = new Map<LlmProviderId, BaseLLMProvider>([
      ["openai", new OkProvider("openai", "openai-ok")],
      ["legacy", new FailProvider("legacy")],
    ]);
    const mgr = new LLMManager({
      providers,
      agentRouting: { crypto_monitoring: "openai" },
      fallbackIds: [],
      llmDefaultProviderRaw: "legacy",
    });
    const res = await mgr.invoke({
      messages: [{ role: "user", content: "x" }],
      llm: { agentType: "crypto_monitoring" },
    });
    expect(res.choices[0].message.content).toBe("openai-ok");
  });

  it("skips unconfigured primary and uses first configured probe", async () => {
    const providers = new Map<LlmProviderId, BaseLLMProvider>([
      ["legacy", new UnconfiguredProvider()],
      ["openai", new OkProvider("openai", "probe-openai")],
    ]);
    const mgr = new LLMManager({
      providers,
      agentRouting: {},
      fallbackIds: [],
      llmDefaultProviderRaw: "legacy",
    });
    const res = await mgr.invoke({
      messages: [{ role: "user", content: "x" }],
    });
    expect(res.choices[0].message.content).toBe("probe-openai");
  });

  it("throws when no provider is configured", async () => {
    const providers = new Map<LlmProviderId, BaseLLMProvider>([
      ["legacy", new UnconfiguredProvider()],
      ["openai", new UnconfiguredProvider()],
    ]);
    const mgr = new LLMManager({
      providers,
      agentRouting: {},
      fallbackIds: [],
      llmDefaultProviderRaw: "legacy",
    });
    await expect(
      mgr.invoke({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow(/No LLM provider is configured/);
  });
});
