import { ENV } from "../../_core/env";
import { postOpenAiCompatibleChatCompletions } from "../openaiCompatibleChat";
import type { InvokeParams, InvokeResult } from "../types";
import { OpenAiCompatLlmProvider } from "./openAiCompatProvider";

function legacyCompletionsUrl(): string {
  const base = ENV.llmBaseUrl?.trim() ?? "";
  if (base.length > 0) {
    return `${base.replace(/\/$/, "")}/v1/chat/completions`;
  }
  return "https://api.openai.com/v1/chat/completions";
}

export class LegacyOpenAiCompatProvider extends OpenAiCompatLlmProvider {
  constructor() {
    super({
      id: "legacy",
      apiKey: ENV.llmApiKey,
      completionsUrl: legacyCompletionsUrl(),
      defaultModel: ENV.llmModel,
    });
  }

  chatCompletion(params: InvokeParams): Promise<InvokeResult> {
    const modelId =
      params.llm?.model?.trim() ||
      (ENV.llmModel?.trim() || "gemini-2.5-flash");
    return postOpenAiCompatibleChatCompletions(
      legacyCompletionsUrl(),
      ENV.llmApiKey,
      modelId.trim(),
      params,
    );
  }
}

export function createLegacyOpenAiCompatProvider(): LegacyOpenAiCompatProvider {
  return new LegacyOpenAiCompatProvider();
}
