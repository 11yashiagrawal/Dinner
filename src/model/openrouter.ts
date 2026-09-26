import { OpenRouter } from "@openrouter/sdk";
import { ModelTransportError, StructuredModelAdapter, type ModelTransport } from "./adapter";
import type { ModelAdapter, ModelRequest } from "./types";

export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5.2";

const objectAction = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const optionalPath = { path: { type: "string" } };
const positiveInteger = { type: "integer", minimum: 1 };

export const MODEL_DECISION_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string" },
    action: {
      oneOf: [
        objectAction({ type: { const: "list_files" }, ...optionalPath, maxDepth: positiveInteger }, ["type"]),
        objectAction({ type: { const: "search" }, query: { type: "string" }, ...optionalPath, maxResults: positiveInteger }, ["type", "query"]),
        objectAction({ type: { const: "read_file" }, path: { type: "string" }, startLine: positiveInteger, endLine: positiveInteger }, ["type", "path"]),
        objectAction({ type: { const: "apply_patch" }, patch: { type: "string" } }, ["type", "patch"]),
        objectAction({ type: { const: "create_checkpoint" }, label: { type: "string" } }, ["type", "label"]),
        objectAction({ type: { const: "restore_checkpoint" }, checkpointId: { type: "string" } }, ["type", "checkpointId"]),
        objectAction({
          type: { const: "run_command" },
          command: { type: "string" },
          purpose: { type: "string", enum: ["setup", "agent", "verification"] },
          cwd: { type: "string" },
          timeoutMs: positiveInteger,
        }, ["type", "command"]),
        objectAction({ type: { const: "inspect_diff" } }, ["type"]),
        objectAction({ type: { const: "finish" }, summary: { type: "string" } }, ["type", "summary"]),
      ],
    },
  },
  required: ["action"],
  additionalProperties: false,
} as const;

interface OpenRouterChatClient {
  chat: {
    send(request: unknown, options?: { signal?: AbortSignal; retries?: { strategy: "none" } }): Promise<unknown>;
  };
}

function statusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === "number" ? value : undefined;
}

function transportError(error: unknown): ModelTransportError {
  const status = statusCode(error);
  const message = error instanceof Error ? error.message : "OpenRouter request failed.";
  if (status === 401 || status === 403) return new ModelTransportError("authentication", message, { cause: error });
  if (status === 429) return new ModelTransportError("rate_limit", message, { cause: error });
  if (status !== undefined && status >= 400 && status < 500) return new ModelTransportError("permanent", message, { cause: error });
  return new ModelTransportError("transient", message, { cause: error });
}

function textContent(content: unknown): string {
  if (typeof content === "string" && content.trim() !== "") return content;
  throw new ModelTransportError("permanent", "OpenRouter returned no text content.");
}

export class OpenRouterTransport implements ModelTransport {
  constructor(
    private readonly client: OpenRouterChatClient,
    private readonly model: string,
  ) {}

  async send(request: ModelRequest, signal: AbortSignal): Promise<unknown> {
    try {
      const response = await this.client.chat.send({
        chatRequest: {
          model: this.model,
          messages: request.messages.map(({ role, content }) => ({ role, content })),
          responseFormat: {
            type: "json_schema",
            jsonSchema: {
              name: "dinner_model_decision",
              description: "Exactly one validated coding-harness action.",
              strict: true,
              schema: MODEL_DECISION_SCHEMA,
            },
          },
          stream: false,
          temperature: 0,
        },
        appTitle: "Dinner AI Coding Harness",
        appCategories: "cli-agent",
      }, { signal, retries: { strategy: "none" } });
      if (typeof response !== "object" || response === null || !("choices" in response)) {
        throw new ModelTransportError("permanent", "OpenRouter returned an invalid chat response.");
      }
      const result = response as {
        choices: Array<{ message?: { content?: unknown } }>;
        usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
      };
      const usage = result.usage === undefined ? undefined : {
        inputTokens: result.usage.promptTokens,
        outputTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
      };
      return { output: textContent(result.choices[0]?.message?.content), usage };
    } catch (error) {
      if (error instanceof ModelTransportError) throw error;
      throw transportError(error);
    }
  }
}

export function createOpenRouterModel(options: {
  apiKey: string;
  model?: string;
  client?: OpenRouterChatClient;
}): ModelAdapter {
  const client = options.client ?? new OpenRouter({
    apiKey: options.apiKey,
    retryConfig: { strategy: "none" },
  });
  return new StructuredModelAdapter(new OpenRouterTransport(client, options.model ?? DEFAULT_OPENROUTER_MODEL));
}
