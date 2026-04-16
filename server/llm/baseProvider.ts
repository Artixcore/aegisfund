import type { InvokeParams, InvokeResult, LlmProviderId, Message } from "./types";

function messageTextFromResult(result: InvokeResult): string {
  const raw = result?.choices?.[0]?.message?.content;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map(p => p.text)
      .join("");
  }
  return "";
}

export abstract class BaseLLMProvider {
  abstract readonly id: LlmProviderId;

  abstract isConfigured(): boolean;

  abstract chatCompletion(params: InvokeParams): Promise<InvokeResult>;

  /**
   * Single-turn text generation via chat/completions (no extra HTTP surface).
   */
  async generateText(
    options: Omit<InvokeParams, "messages"> & { system?: string; user: string },
  ): Promise<string> {
    const { system, user, ...rest } = options;
    const messages: Message[] = [];
    if (system !== undefined && system.length > 0) {
      messages.push({ role: "system", content: system });
    }
    messages.push({ role: "user", content: user });
    const result = await this.chatCompletion({ ...rest, messages });
    return messageTextFromResult(result);
  }
}
