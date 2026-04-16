import { BaseLLMProvider } from "../baseProvider";
import { postOpenAiCompatibleChatCompletions } from "../openaiCompatibleChat";
import type { InvokeParams, InvokeResult, LlmProviderId } from "../types";

type OpenAiCompatProviderConfig = {
  id: LlmProviderId;
  apiKey: string;
  completionsUrl: string;
  defaultModel: string;
};

/**
 * OpenAI-compatible HTTP chat/completions (OpenAI, xAI, DeepSeek, Gemini compat, legacy proxy).
 */
export class OpenAiCompatLlmProvider extends BaseLLMProvider {
  readonly id: LlmProviderId;

  private readonly apiKey: string;
  private readonly completionsUrl: string;
  private readonly defaultModel: string;

  constructor(config: OpenAiCompatProviderConfig) {
    super();
    this.id = config.id;
    this.apiKey = config.apiKey;
    this.completionsUrl = config.completionsUrl;
    this.defaultModel = config.defaultModel;
  }

  isConfigured(): boolean {
    return this.apiKey.trim().length > 0;
  }

  chatCompletion(params: InvokeParams): Promise<InvokeResult> {
    const override = params.llm?.model?.trim();
    const modelId =
      (override && override.length > 0 ? override : this.defaultModel) ||
      this.defaultModel;
    return postOpenAiCompatibleChatCompletions(
      this.completionsUrl,
      this.apiKey,
      modelId.trim(),
      params,
    );
  }
}
