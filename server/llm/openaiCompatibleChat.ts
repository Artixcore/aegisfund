import { ENV } from "../_core/env";
import type {
  FileContent,
  ImageContent,
  InvokeParams,
  InvokeResult,
  JsonSchema,
  Message,
  MessageContent,
  OutputSchema,
  ResponseFormat,
  TextContent,
  Tool,
  ToolChoice,
  ToolChoiceExplicit,
} from "./types";

const ensureArray = (
  value: MessageContent | MessageContent[],
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent,
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

export function normalizeMessageForOpenAiCompat(message: Message) {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
}

export function normalizeToolChoiceForPayload(
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined,
): "none" | "auto" | ToolChoiceExplicit | undefined {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured",
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly",
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
}

export function normalizeResponseFormatForPayload({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}): (
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined
) {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object",
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
}

export type ChatCompletionsRequest = Omit<
  InvokeParams,
  "llm" | "tool_choice" | "output_schema" | "response_format" | "max_tokens"
> & {
  tool_choice?: ToolChoice;
  output_schema?: OutputSchema;
  response_format?: ResponseFormat;
  max_tokens?: number;
};

/** Strip routing-only fields before building HTTP body. */
export function stripLlmRouting(
  params: InvokeParams,
): ChatCompletionsRequest {
  const {
    llm: _llm,
    messages,
    tools,
    toolChoice,
    tool_choice,
    maxTokens,
    max_tokens,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;
  return {
    messages,
    tools,
    toolChoice,
    tool_choice,
    maxTokens,
    max_tokens,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  };
}

/**
 * Some OpenAI models reject `max_tokens` and require `max_completion_tokens` in Chat Completions.
 */
export function shouldUseMaxCompletionTokens(
  modelId: string,
  envPrefer: boolean,
): boolean {
  if (envPrefer) return true;
  const id = modelId.trim().toLowerCase();
  if (id === "chatgpt-4o-latest") return true;
  if (/^gpt-5/.test(id)) return true;
  if (/^gpt-4\.1/.test(id)) return true;
  if (/^o[1-9]/.test(id)) return true;
  if (/\b(o1|o3|o4)-(mini|preview|pro|nano)\b/.test(id)) return true;
  return false;
}

export type BuildOpenAiCompatiblePayloadOptions = {
  useMaxCompletionTokens?: boolean;
};

export function buildOpenAiCompatiblePayload(
  modelId: string,
  params: ChatCompletionsRequest,
  options?: BuildOpenAiCompatiblePayloadOptions,
): Record<string, unknown> {
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    maxTokens,
    max_tokens,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const payload: Record<string, unknown> = {
    model: modelId,
    messages: messages.map(normalizeMessageForOpenAiCompat),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoiceForPayload(
    toolChoice || tool_choice,
    tools,
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  const cap = maxTokens ?? max_tokens;
  const tokenCap = typeof cap === "number" && cap > 0 ? cap : 32768;
  if (options?.useMaxCompletionTokens) {
    payload.max_completion_tokens = tokenCap;
  } else {
    payload.max_tokens = tokenCap;
  }

  if (/gemini/i.test(modelId)) {
    payload.thinking = { budget_tokens: 128 };
  }

  const normalizedResponseFormat = normalizeResponseFormatForPayload({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  return payload;
}

export async function postOpenAiCompatibleChatCompletions(
  completionsUrl: string,
  apiKey: string,
  modelId: string,
  params: InvokeParams,
): Promise<InvokeResult> {
  const bodyParams = stripLlmRouting(params);
  const useMaxCompletionTokens = shouldUseMaxCompletionTokens(
    modelId,
    ENV.llmPreferMaxCompletionTokens,
  );
  const payload = buildOpenAiCompatiblePayload(modelId, bodyParams, {
    useMaxCompletionTokens: useMaxCompletionTokens,
  });

  const response = await fetch(completionsUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`,
    );
  }

  return (await response.json()) as InvokeResult;
}
