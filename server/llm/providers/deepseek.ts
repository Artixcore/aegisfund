import { ENV } from "../../_core/env";
import { OpenAiCompatLlmProvider } from "./openAiCompatProvider";

export function createDeepseekProvider(): OpenAiCompatLlmProvider {
  return new OpenAiCompatLlmProvider({
    id: "deepseek",
    apiKey: ENV.deepseekApiKey,
    completionsUrl: "https://api.deepseek.com/v1/chat/completions",
    defaultModel: ENV.deepseekLlmModel,
  });
}
