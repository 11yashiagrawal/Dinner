import { describe, expect, test } from "bun:test";
import {
  ModelResponseValidationError,
  parseModelDecision,
  parseProviderUsage,
  type ModelAction,
} from "../src/model";

describe("model response schema", () => {
  const validActions: readonly [unknown, ModelAction["type"]][] = [
    [{ action: { type: "list_files", path: "src", maxDepth: 2 } }, "list_files"],
    [{ action: { type: "search", query: "refreshToken", maxResults: 20 } }, "search"],
    [{ action: { type: "read_file", path: "src/a.ts", startLine: 1, endLine: 10 } }, "read_file"],
    [{ action: { type: "apply_patch", patch: "*** Begin Patch" } }, "apply_patch"],
    [
      {
        action: {
          type: "run_command",
          command: "bun test",
          purpose: "verification",
          timeoutMs: 30_000,
        },
      },
      "run_command",
    ],
    [{ action: { type: "inspect_diff" } }, "inspect_diff"],
    [{ action: { type: "finish", summary: "Fixed and verified." } }, "finish"],
  ];

  test.each(validActions)("accepts a valid structured action", (input, expectedType) => {
    expect(parseModelDecision(input).action.type).toBe(expectedType);
  });

  test("parses a JSON string without accepting markdown wrappers", () => {
    expect(parseModelDecision('{"intent":"inspect","action":{"type":"list_files"}}')).toEqual({
      intent: "inspect",
      action: { type: "list_files" },
    });
    expect(() => parseModelDecision("```json\n{}\n```")).toThrow("valid JSON");
  });

  test("rejects unknown actions and invalid arguments", () => {
    expect(() => parseModelDecision({ intent: "missing action" })).toThrow("action must be an object");
    expect(() => parseModelDecision({ action: { type: "delete_repository" } })).toThrow(
      "Unknown action type",
    );
    expect(() =>
      parseModelDecision({ action: { type: "read_file", path: "a", startLine: 10, endLine: 2 } }),
    ).toThrow("greater than or equal");
    expect(() => parseModelDecision({ action: { type: "search", query: "" } })).toThrow(
      ModelResponseValidationError,
    );
    expect(() =>
      parseModelDecision({ action: { type: "run_command", command: "test", purpose: "claim" } }),
    ).toThrow("setup, agent, or verification");
  });

  test("distinguishes provider usage from unavailable usage", () => {
    expect(parseProviderUsage(undefined)).toEqual({ source: "unavailable" });
    expect(parseProviderUsage({ inputTokens: 10, outputTokens: 4, totalTokens: 14 })).toEqual({
      source: "provider",
      inputTokens: 10,
      outputTokens: 4,
      totalTokens: 14,
    });
  });

  test("rejects malformed usage", () => {
    expect(() =>
      parseProviderUsage({ inputTokens: 1, outputTokens: -1, totalTokens: 0 }),
    ).toThrow("non-negative integer");
  });
});
