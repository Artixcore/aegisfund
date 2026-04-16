export type {
  FileContent,
  ImageContent,
  InvokeParams,
  InvokeResult,
  JsonSchema,
  LlmInvokeRouting,
  LlmProviderId,
  Message,
  MessageContent,
  OutputSchema,
  ResponseFormat,
  Role,
  TextContent,
  Tool,
  ToolCall,
  ToolChoice,
} from "../llm/types";
export { isLlmProviderId, LLM_PROVIDER_IDS } from "../llm/types";

import { getLlmManager } from "../llm/manager";
import type { InvokeParams, InvokeResult } from "../llm/types";

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  return getLlmManager().invoke(params);
}
