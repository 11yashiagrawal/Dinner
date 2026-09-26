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
      reasoning_effort: "medium",
      response_format: { type: "json_object" },
      stream: false,
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(request)).not.toContain("not-forwarded");
  });

  test("allows higher reasoning effort for harder runs", async () => {
    let request: any;
    const model = createDeepSeekModel({
      apiKey: "secret",
      reasoningEffort: "high",
      client: {
        chat: {
          completions: {
            async create(nextRequest) {
              request = nextRequest;
              return {
                choices: [{ message: { content: JSON.stringify({ action: { type: "inspect_diff" } }) } }],
              };
            },
          },
        },
      },
    });

    await model.complete({ messages: [] });
    expect(request.reasoning_effort).toBe("high");
  });


  test("retries empty provider content and keeps useful responses", async () => {
    let calls = 0;
    const model = createDeepSeekModel({
      apiKey: "secret",
      client: {
        chat: {
          completions: {
            async create() {
              calls += 1;
              if (calls === 1) return { choices: [{ message: { content: "" } }] };
              return { choices: [{ message: { content: JSON.stringify({ action: { type: "inspect_diff" } }) } }] };
            },
          },
        },
      },
    });

    await expect(model.complete({ messages: [] })).resolves.toMatchObject({
      decision: { action: { type: "inspect_diff" } },
    });
    expect(calls).toBe(2);
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
