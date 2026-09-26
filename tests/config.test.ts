import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigurationError,
  DEFAULT_BUDGETS,
  loadRunConfig,
  toPublicRunConfig,
} from "../src/config";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "dinner-config-"));
  temporaryDirectories.push(path);
  return path;
}

describe("loadRunConfig", () => {
  test("loads a headless task with defaults", async () => {
    const cwd = await temporaryDirectory();
    const config = await loadRunConfig({
      argv: ["--repo", ".", "--task", "Fix the bug"],
      cwd,
      env: { AI_API_KEY: "top-secret" },
    });

    expect(config.repoPath).toBe(cwd);
    expect(config.task).toBe("Fix the bug");
    expect(config.budgets).toEqual(DEFAULT_BUDGETS);
  });

  test("reads a task file", async () => {
    const cwd = await temporaryDirectory();
    await writeFile(join(cwd, "issue.txt"), "  Repair empty input handling.  \n");

    const config = await loadRunConfig({
      argv: ["--repo", ".", "--task-file", "issue.txt"],
      cwd,
      env: { AI_API_KEY: "secret" },
    });

    expect(config.task).toBe("Repair empty input handling.");
  });

  test("prompts for a task only in interactive mode", async () => {
    const cwd = await temporaryDirectory();
    const config = await loadRunConfig({
      argv: ["--repo", "."],
      cwd,
      env: { AI_API_KEY: "secret" },
      interactive: true,
      promptForTask: () => "Investigate the failure",
    });

    expect(config.task).toBe("Investigate the failure");
  });

  test("rejects a missing task in headless mode", async () => {
    const cwd = await temporaryDirectory();
    expect(
      loadRunConfig({ argv: ["--repo", "."], cwd, env: { AI_API_KEY: "secret" } }),
    ).rejects.toBeInstanceOf(ConfigurationError);
  });

  test("rejects simultaneous inline and file tasks", async () => {
    const cwd = await temporaryDirectory();
    expect(
      loadRunConfig({
        argv: ["--repo", ".", "--task", "one", "--task-file", "two.txt"],
        cwd,
        env: { AI_API_KEY: "secret" },
      }),
    ).rejects.toThrow("either --task or --task-file");
  });

  test("requires a credential without printing its value", async () => {
    const cwd = await temporaryDirectory();
    expect(
      loadRunConfig({ argv: ["--repo", ".", "--task", "Fix it"], cwd, env: {} }),
    ).rejects.toThrow("AI_API_KEY is required");
  });

  test("rejects invalid budget values", async () => {
    const cwd = await temporaryDirectory();
    expect(
      loadRunConfig({
        argv: ["--repo", ".", "--task", "Fix it", "--max-steps", "2.5"],
        cwd,
        env: { AI_API_KEY: "secret" },
      }),
    ).rejects.toThrow("--max-steps must be a positive integer");
  });

  test("omits the credential from public configuration", async () => {
    const cwd = await temporaryDirectory();
    const config = await loadRunConfig({
      argv: ["--repo", ".", "--task", "Fix it"],
      cwd,
      env: { AI_API_KEY: "never-print-this" },
    });

    const serialized = JSON.stringify(toPublicRunConfig(config));
    expect(serialized).not.toContain("never-print-this");
    expect(serialized).not.toContain("apiKey");
  });
});
