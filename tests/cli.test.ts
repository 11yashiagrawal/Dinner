import { describe, expect, test } from "bun:test";
import { runCli } from "../src/cli";

describe("runCli", () => {
  test("shows help without requiring configuration", async () => {
    const output: string[] = [];
    const exitCode = await runCli(["--help"], { stdout: (message) => output.push(message) });

    expect(exitCode).toBe(0);
    expect(output.join("\n")).toContain("Dinner — autonomous coding harness");
    expect(output.join("\n")).toContain("default: unique OS temporary directory");
  });

  test("rejects unknown commands", async () => {
    const errors: string[] = [];
    const exitCode = await runCli(["dance"], { stderr: (message) => errors.push(message) });

    expect(exitCode).toBe(2);
    expect(errors.join("\n")).toContain("Unknown command: dance");
  });

  test("headless execution never prompts for a missing task", async () => {
    let prompted = false;
    const errors: string[] = [];
    const exitCode = await runCli(["run", "--repo", "."], {
      env: { AI_API_KEY: "secret" },
      interactive: false,
      promptForTask: () => {
        prompted = true;
        return "should not be used";
      },
      stderr: (message) => errors.push(message),
    });

    expect(exitCode).toBe(2);
    expect(prompted).toBeFalse();
    expect(errors.join("\n")).toContain("A task is required");
  });
});
