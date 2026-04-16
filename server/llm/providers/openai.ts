import { ENV } from "../../_core/env";
import { OpenAiCompatLlmProvider } from "./openAiCompatProvider";

export function createOpenAiProvider(): OpenAiCompatLlmProvider {
  return new OpenAiCompatLlmProvider({
    id: "openai",
    apiKey: ENV.openaiApiKey,
    completionsUrl: "https://api.openai.com/v1/chat/completions",
    defaultModel: ENV.openaiLlmModel,
  });
}
