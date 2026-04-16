import { ENV } from "../../_core/env";
import { OpenAiCompatLlmProvider } from "./openAiCompatProvider";

export function createGrokProvider(): OpenAiCompatLlmProvider {
  return new OpenAiCompatLlmProvider({
    id: "grok",
    apiKey: ENV.xaiApiKey,
    completionsUrl: "https://api.x.ai/v1/chat/completions",
    defaultModel: ENV.xaiLlmModel,
  });
}
