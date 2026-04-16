import { ENV } from "../../_core/env";
import { OpenAiCompatLlmProvider } from "./openAiCompatProvider";

export function createGeminiProvider(): OpenAiCompatLlmProvider {
  return new OpenAiCompatLlmProvider({
    id: "gemini",
    apiKey: ENV.geminiApiKey,
    completionsUrl:
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    defaultModel: ENV.geminiLlmModel,
  });
}
