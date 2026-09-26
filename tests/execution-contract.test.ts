import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { HELP, runCli } from "../src/cli";
import { loadRunConfig } from "../src/config";

describe("documented execution contract", () => {
  test("pins Bun and exposes required make targets", async () => {
    const root = resolve(import.meta.dir, "..");
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const makefile = await readFile(join(root, "Makefile"), "utf8");
    expect(packageJson.engines.bun).toBe(">=1.3.0 <2");
    for (const target of ["setup:", "run:", "test:", "check:"]) expect(makefile).toContain(`\n${target}`);
    expect(await readFile(join(root, ".env.example"), "utf8")).not.toMatch(/AI_API_KEY=\S+/);
  });

  test("keeps help and missing-credential behavior deterministic in headless mode", async () => {
    expect(HELP).toContain("--repo <path>");
    expect(HELP).toContain("--task-file <path>");
    const stdout: string[] = [];
    expect(await runCli(["--help"], { stdout: (line) => stdout.push(line) })).toBe(0);
    expect(stdout.join("\n")).toContain("Usage:");
    const root = await mkdtemp(join(tmpdir(), "dinner-contract-"));
    try {
      await expect(loadRunConfig({ argv: ["--repo", root, "--task", "Fix it"], env: {}, cwd: root, interactive: false })).rejects.toThrow("AI_API_KEY is required");
      await expect(loadRunConfig({ argv: ["--repo", join(root, "missing"), "--task", "Fix it"], env: { AI_API_KEY: "x" }, cwd: root })).rejects.toThrow("Repository does not exist");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("does not place live or Docker integration work in the routine test command", async () => {
    const packageJson = JSON.parse(await readFile(resolve(import.meta.dir, "../package.json"), "utf8"));
    expect(packageJson.scripts.test).toBe("bun test");
    expect(packageJson.scripts.test).not.toContain("AI_API_KEY");
    expect(packageJson.scripts.test).not.toContain("DINNER_DOCKER_INTEGRATION");
  });
});
