import type { AgentFeatureKey } from "../agents/featureStore";
import { ENV } from "../_core/env";
import { BaseLLMProvider } from "./baseProvider";
import { createDeepseekProvider } from "./providers/deepseek";
import { createGeminiProvider } from "./providers/gemini";
import { createGrokProvider } from "./providers/grok";
import {
  createLegacyOpenAiCompatProvider,
} from "./providers/legacyOpenAiCompatible";
import { createOpenAiProvider } from "./providers/openai";
import type { InvokeParams, InvokeResult, LlmProviderId } from "./types";
import { isLlmProviderId } from "./types";

const AGENT_FEATURE_KEYS: AgentFeatureKey[] = [
  "market_analysis",
  "crypto_monitoring",
  "forex_monitoring",
  "futures_commodities",
  "historical_research",
  "executive_briefing",
  "portfolio_trading",
];

function isAgentFeatureKey(value: string): value is AgentFeatureKey {
  return (AGENT_FEATURE_KEYS as readonly string[]).includes(value);
}

export function parseLlmAgentRouting(
  raw: string,
): Partial<Record<AgentFeatureKey, LlmProviderId>> {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Partial<Record<AgentFeatureKey, LlmProviderId>> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!isAgentFeatureKey(key)) continue;
      if (typeof value !== "string" || !isLlmProviderId(value)) continue;
      out[key] = value;
    }
    return out;
  } catch {
    console.warn("[LLM] LLM_AGENT_ROUTING is not valid JSON; ignoring.");
    return {};
  }
}

export function parseLlmFallbackProviders(raw: string): LlmProviderId[] {
  const out: LlmProviderId[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim().toLowerCase();
    if (id && isLlmProviderId(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

function normalizeDefaultProvider(raw: string): LlmProviderId {
  const t = raw.trim().toLowerCase();
  if (!t || !isLlmProviderId(t)) return "legacy";
  return t;
}

const CONFIGURED_PROBE_ORDER: LlmProviderId[] = [
  "legacy",
  "openai",
  "gemini",
  "grok",
  "deepseek",
];

export type LlmManagerDeps = {
  providers: Map<LlmProviderId, BaseLLMProvider>;
  agentRouting: Partial<Record<AgentFeatureKey, LlmProviderId>>;
  fallbackIds: LlmProviderId[];
  /** Raw `LLM_DEFAULT_PROVIDER` (may be empty). */
  llmDefaultProviderRaw: string;
};

export class LLMManager {
  private readonly providers: Map<LlmProviderId, BaseLLMProvider>;
  private readonly agentRouting: Partial<Record<AgentFeatureKey, LlmProviderId>>;
  private readonly fallbackIds: LlmProviderId[];
  private readonly llmDefaultProviderRaw: string;

  constructor(deps: LlmManagerDeps) {
    this.providers = deps.providers;
    this.agentRouting = deps.agentRouting;
    this.fallbackIds = deps.fallbackIds;
    this.llmDefaultProviderRaw = deps.llmDefaultProviderRaw;
  }

  static createDefault(): LLMManager {
    const providers = new Map<LlmProviderId, BaseLLMProvider>([
      ["legacy", createLegacyOpenAiCompatProvider()],
      ["openai", createOpenAiProvider()],
      ["gemini", createGeminiProvider()],
      ["grok", createGrokProvider()],
      ["deepseek", createDeepseekProvider()],
    ]);
    return new LLMManager({
      providers,
      agentRouting: parseLlmAgentRouting(ENV.llmAgentRoutingRaw),
      fallbackIds: parseLlmFallbackProviders(ENV.llmFallbackProvidersRaw),
      llmDefaultProviderRaw: ENV.llmDefaultProvider,
    });
  }

  private configured(id: LlmProviderId): boolean {
    return this.providers.get(id)?.isConfigured() ?? false;
  }

  private firstConfiguredInProbeOrder(): LlmProviderId | undefined {
    for (const id of CONFIGURED_PROBE_ORDER) {
      if (this.configured(id)) return id;
    }
    return undefined;
  }

  private resolvePrimary(params: InvokeParams): LlmProviderId {
    const fromOverride = params.llm?.provider;
    if (fromOverride && isLlmProviderId(fromOverride) && this.configured(fromOverride)) {
      return fromOverride;
    }

    const agentType = params.llm?.agentType;
    if (agentType) {
      const mapped = this.agentRouting[agentType];
      if (mapped && this.configured(mapped)) return mapped;
    }

    const def = normalizeDefaultProvider(this.llmDefaultProviderRaw);
    if (this.configured(def)) return def;

    const first = this.firstConfiguredInProbeOrder();
    if (!first) {
      throw new Error(
        "No LLM provider is configured. Set LLM_API_KEY (legacy), LLM_BASE_URL as needed, and/or provider keys (OPENAI_API_KEY, GEMINI_API_KEY, XAI_API_KEY, DEEPSEEK_API_KEY). See .env.example.",
      );
    }
    return first;
  }

  private resolveProviderChain(params: InvokeParams): LlmProviderId[] {
    const primary = this.resolvePrimary(params);
    const chain: LlmProviderId[] = [primary];
    for (const id of this.fallbackIds) {
      if (id !== primary && this.configured(id) && !chain.includes(id)) {
        chain.push(id);
      }
    }
    return chain;
  }

  async invoke(params: InvokeParams): Promise<InvokeResult> {
    const chain = this.resolveProviderChain(params);
    const errors: string[] = [];

    for (const id of chain) {
      const provider = this.providers.get(id);
      if (!provider?.isConfigured()) continue;
      try {
        return await provider.chatCompletion(params);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[LLM] provider=${id} failed:`, msg);
        errors.push(`${id}: ${msg}`);
      }
    }

    throw new Error(
      `All LLM providers in chain failed [${chain.join(", ")}]: ${errors.join(" | ")}`,
    );
  }
}

let defaultManager: LLMManager | null = null;

export function getLlmManager(): LLMManager {
  if (!defaultManager) defaultManager = LLMManager.createDefault();
  return defaultManager;
}

/** Vitest / isolated runs: reset cached manager so env changes apply. */
export function resetLlmManagerCache(): void {
  defaultManager = null;
}
