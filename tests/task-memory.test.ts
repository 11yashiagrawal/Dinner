import { describe, expect, test } from "bun:test";
import { RepositoryReadCache, TaskMemory } from "../src/memory";
import type { FileReadResult, RepositoryToolResult } from "../src/tools";

describe("TaskMemory", () => {
  test("keeps requests bounded while preserving task, failures, and action-result pairs", () => {
    const memory = new TaskMemory("system", "Never lose this task", { manifest: "package.json" }, {
      maxContextChars: 1_600,
      reserveResponseChars: 400,
      maxRecentPairs: 2,
      maxEntryChars: 300,
    });
    memory.recordFailure({
      sequence: 1, kind: "test", hypothesis: "wrong operator", action: "run_command",
      detail: "expected five but got six", codeFingerprint: "abc", countsAgainstRepairLimit: true,
    });
    for (let index = 0; index < 8; index += 1) {
      memory.recordDecision({ intent: `inspect ${index}`, action: { type: "list_files", path: `src/${index}` } });
      memory.recordObservation({ type: "list_files", path: `src/${index}` }, { entries: ["x".repeat(500)] });
    }
    const request = memory.request();
    const chars = request.messages.reduce((total, message) => total + message.content.length, 0);
    expect(chars).toBeLessThanOrEqual(1_200);
    expect(request.messages[1]?.content).toContain("Never lose this task");
    expect(request.messages[1]?.content).toContain("expected five but got six");
    const recentRoles = request.messages.slice(2).map(({ role }) => role);
    expect(recentRoles.length).toBeGreaterThanOrEqual(2);
    expect(recentRoles.every((role, index) => role === (index % 2 === 0 ? "assistant" : "user"))).toBeTrue();
    expect(memory.snapshot().compactions).toBeGreaterThan(0);
  });

  test("formats invalid-response feedback as a complete assistant-user pair", () => {
    const memory = new TaskMemory("system", "task", {});
    memory.recordInvalidResponse("missing action");
    const messages = memory.request().messages;
    expect(messages.map(({ role }) => role)).toEqual(["system", "user", "assistant", "user"]);
    expect(messages.at(-1)?.content).toContain("missing action");
  });
});

describe("RepositoryReadCache", () => {
  test("keys ranges and refuses a stale workspace fingerprint", () => {
    const cache = new RepositoryReadCache();
    const result: RepositoryToolResult<FileReadResult> = {
      ok: true,
      value: { path: "src/a.ts", content: "old", startLine: 1, endLine: 1, totalLines: 1, truncated: false },
    };
    cache.set("src/a.ts", 1, 1, "before", result);
    expect(cache.get("src/a.ts", 1, 1, "before")).toEqual(result);
    expect(cache.get("src/a.ts", 1, 1, "after")).toBeUndefined();
    expect(cache.get("src/a.ts", 2, 2, "before")).toBeUndefined();
  });
});
