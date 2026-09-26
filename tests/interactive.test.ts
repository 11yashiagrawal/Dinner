import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectInteractiveRunArguments,
  discoverRepositoryChoices,
  InteractiveRunCancelled,
} from "../src/interactive";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function gitRepo(name = "repo"): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "caramel-interactive-"));
  temporaryDirectories.push(root);
  const repo = join(root, name);
  await mkdir(join(repo, ".git"), { recursive: true });
  return repo;
}

describe("interactive run wizard", () => {
  test("collects a complete TUI setup with defaults", async () => {
    const repo = await gitRepo();
    const answers = ["", "1", "", "", "https://github.com/o/r/issues/12", "", "25", "10", "", "/tmp/run", ""];
    const output: string[] = [];
    const questions: Array<[string, string | undefined]> = [];
    const env: Record<string, string | undefined> = { DEEPSEEK_API_KEY: "secret" };
    const argv = collectInteractiveRunArguments({
      ask: (question, defaultValue) => {
        questions.push([question, defaultValue]);
        return answers.shift() ?? null;
      },
      write: (message) => output.push(message),
      cwd: repo,
      env,
    });

    expect(argv).toEqual([
      "--repo", repo,
      "--issue", "https://github.com/o/r/issues/12",
      "--provider", "deepseek",
      "--model", "deepseek-flash",
      "--repository-map", "enabled",
      "--max-steps", "25",
      "--max-model-calls", "10",
      "--max-minutes", "20",
      "--reasoning-effort", "high",
      "--output", "/tmp/run",
    ]);
    expect(output.join("\n")).toContain("Caramel AI Coding Harness");
    expect(output.join("\n")).toContain("Providers: DeepSeek and Qwen");
    expect(output.join("\n")).toContain("API key: loaded from DEEPSEEK_API_KEY");
    expect(output.join("\n")).toContain("Choose a detected Git checkout by number");
    expect(output.join("\n")).not.toContain("secret");
    expect(questions[0]).toEqual(["Continue", "Enter"]);
    expect(questions[1]).toEqual(["Repository number or path", "1"]);
    expect(questions[2]).toEqual(["Provider (deepseek/qwen)", "deepseek"]);
  });

  test("accepts Qwen setup and prompts for a missing key", async () => {
    const repo = await gitRepo();
    const answers = ["", repo, "qwen", "2", "qwen-secret", "[issue](https://github.com/o/r/issues/560)", "", "", "", "", ""];
    const env: Record<string, string | undefined> = {};
    const argv = collectInteractiveRunArguments({
      ask: () => answers.shift() ?? null,
      write: () => {},
      cwd: repo,
      env,
    });

    expect(argv).toContain("--provider");
    expect(argv).toContain("qwen");
    expect(argv).toContain("qwen-max");
    expect(argv).toContain("https://github.com/o/r/issues/560");
    expect(env.QWEN_API_KEY).toBe("qwen-secret");
  });

  test("can be cancelled before execution", async () => {
    const repo = await gitRepo();
    const answers = ["", "1", "", "", "https://github.com/o/r/issues/12", "", "", "", "", "", "n"];
    expect(() => collectInteractiveRunArguments({
      ask: () => answers.shift() ?? null,
      write: () => {},
      cwd: repo,
      env: { DEEPSEEK_API_KEY: "secret" },
    })).toThrow(InteractiveRunCancelled);
  });

  test("discovers nearby repositories and rejects non-git paths", async () => {
    const repo = await gitRepo("project");
    const choices = discoverRepositoryChoices(repo, {});
    expect(choices).toContain(repo);

    const answers = ["", "/tmp", "", "", "https://github.com/o/r/issues/12", "", "", "", "", "", ""];
    expect(() => collectInteractiveRunArguments({
      ask: () => answers.shift() ?? null,
      write: () => {},
      cwd: repo,
      env: { DEEPSEEK_API_KEY: "secret" },
    })).toThrow("Repository must be a Git checkout");
  });
});
