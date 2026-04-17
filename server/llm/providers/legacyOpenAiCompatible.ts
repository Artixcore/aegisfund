import { ENV } from "../../_core/env";
import { postOpenAiCompatibleChatCompletions } from "../openaiCompatibleChat";
import { resolveLegacyChatCompletionsUrl } from "../openaiCompatibleUrl";
import type { InvokeParams, InvokeResult } from "../types";
import { OpenAiCompatLlmProvider } from "./openAiCompatProvider";

function legacyCompletionsUrl(): string {
  return resolveLegacyChatCompletionsUrl(ENV.llmBaseUrl ?? "");
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
      (ENV.llmModel?.trim() || "gpt-4o-mini");
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
