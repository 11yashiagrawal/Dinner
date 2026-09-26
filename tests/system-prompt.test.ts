import { describe, expect, test } from "bun:test";
import { SYSTEM_PROMPT } from "../src/agent/controller";

describe("agent system prompt", () => {
  test("codifies observed run failures and recovery behavior", () => {
    expect(SYSTEM_PROMPT).toContain("Return only one valid JSON object");
    expect(SYSTEM_PROMPT).toContain("search must be a non-empty exact snippet");
    expect(SYSTEM_PROMPT).toContain("not a *** Begin Patch block");
    expect(SYSTEM_PROMPT).toContain("Avoid shell file-printing commands");
    expect(SYSTEM_PROMPT).toContain("Do not keep exploring once the relevant file and component are known");
    expect(SYSTEM_PROMPT).toContain("inspect_diff, then run the most relevant available verification command");
  });
});
