import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { evaluatePatch } from "../src/benchmark";

const integrationTest = Bun.env.DINNER_DOCKER_INTEGRATION === "1" ? test : test.skip;

describe("benchmark runner Docker integration", () => {
  integrationTest("accepts the calibrated TypeScript patch with a read-only evaluator", async () => {
    const taskRoot = resolve(import.meta.dir, "../benchmarks/tasks/ts-add");
    const root = await mkdtemp(join(tmpdir(), "dinner-benchmark-docker-"));
    try {
      const result = await evaluatePatch({
        taskRoot,
        patch: await readFile(join(taskRoot, "solution.patch"), "utf8"),
        outputPath: join(root, "evaluation"),
      });
      expect(result.outcome).toBe("solved");
      expect(result.checks).toHaveLength(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
