import { describe, expect, test } from "bun:test";
import { createQwenModel } from "../src/model";

describe("Qwen model transport", () => {
  test("sends OpenAI-compatible JSON mode requests and maps usage", async () => {
    let request: any;
    let options: any;
    const model = createQwenModel({
      apiKey: "secret-not-forwarded",
      model: "qwen-max",
      client: {
        chat: {
          completions: {
            async create(nextRequest, nextOptions) {
              request = nextRequest;
              options = nextOptions;
              return {
                choices: [{ message: { content: JSON.stringify({ action: { type: "inspect_diff" } }) } }],
                usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 },
              };
            },
          },
        },
      },
    });

    const turn = await model.complete({ messages: [{ role: "user", content: "Inspect it" }] });

    expect(turn).toEqual({
      decision: { action: { type: "inspect_diff" } },
      usage: { source: "provider", inputTokens: 9, outputTokens: 4, totalTokens: 13 },
    });
    expect(request).toMatchObject({
      model: "qwen-max",
      response_format: { type: "json_object" },
      temperature: 0,
      stream: false,
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(request)).not.toContain("secret-not-forwarded");
  });

  test("maps authentication errors without retrying", async () => {
    let calls = 0;
    const model = createQwenModel({
      apiKey: "secret",
      client: {
        chat: {
          completions: {
            async create() {
              calls += 1;
              throw Object.assign(new Error("Forbidden"), { status: 403 });
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
