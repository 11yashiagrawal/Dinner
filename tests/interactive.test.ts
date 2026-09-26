import { describe, expect, test } from "bun:test";
import {
  collectInteractiveRunArguments,
  InteractiveRunCancelled,
} from "../src/interactive";

describe("interactive run wizard", () => {
  test("collects a complete stepwise configuration with defaults", () => {
    const answers = ["/repo", "@/tmp/issue.md", "", "", "", "25", "10", "/tmp/run", ""];
    const output: string[] = [];
    const questions: Array<[string, string | undefined]> = [];
    const argv = collectInteractiveRunArguments({
      ask: (question, defaultValue) => {
        questions.push([question, defaultValue]);
        return answers.shift() ?? null;
      },
      write: (message) => output.push(message),
      cwd: "/cwd",
      env: { AI_API_KEY: "secret", OPENROUTER_MODEL: "example/model" },
    });

    expect(argv).toEqual([
      "--repo", "/repo",
      "--task-file", "/tmp/issue.md",
      "--model", "example/model",
      "--repository-map", "enabled",
      "--max-steps", "40",
      "--max-model-calls", "25",
      "--max-minutes", "10",
      "--output", "/tmp/run",
    ]);
    expect(output.join("\n")).toContain("API key:        loaded");
    expect(output.join("\n")).not.toContain("secret");
    expect(questions[0]).toEqual(["1/8 Repository path", undefined]);
  });

  test("can be cancelled before execution", () => {
    const answers = ["/repo", "Fix it", "", "", "", "", "", "", "n"];
    expect(() => collectInteractiveRunArguments({
      ask: () => answers.shift() ?? null,
      cwd: "/cwd",
      env: { AI_API_KEY: "secret" },
    })).toThrow(InteractiveRunCancelled);
  });
});
