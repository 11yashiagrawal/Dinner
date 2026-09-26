import { describe, expect, test } from "bun:test";
import { createDeepSeekModel } from "../src/model";

describe("DeepSeek model transport", () => {
  test("sends thinking configuration and maps OpenAI-compatible usage", async () => {
    let request: any;
    let options: any;
    const model = createDeepSeekModel({
      apiKey: "not-forwarded",
      model: "deepseek-flash",
      client: {
        chat: {
          completions: {
            async create(nextRequest, nextOptions) {
              request = nextRequest;
              options = nextOptions;
              return {
                choices: [{ message: { content: JSON.stringify({ action: { type: "inspect_diff" } }) } }],
                usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
              };
            },
          },
        },
      },
    });

    const turn = await model.complete({ messages: [{ role: "user", content: "Inspect it" }] });

    expect(turn).toEqual({
      decision: { action: { type: "inspect_diff" } },
      usage: { source: "provider", inputTokens: 20, outputTokens: 5, totalTokens: 25 },
    });
    expect(request).toMatchObject({
      model: "deepseek-flash",
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      response_format: { type: "json_object" },
      stream: false,
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(request)).not.toContain("not-forwarded");
  });

  test("maps authentication errors without retrying", async () => {
    let calls = 0;
    const model = createDeepSeekModel({
      apiKey: "secret",
      client: {
        chat: {
          completions: {
            async create() {
              calls += 1;
              throw Object.assign(new Error("Unauthorized"), { status: 401 });
            },
          },
        },
      },
    });

    await expect(model.complete({ messages: [] })).rejects.toMatchObject({
      kind: "authentication",
      retryable: false,
      attempts: 1,
    });
    expect(calls).toBe(1);
  });
});
