import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadBenchmarkManifest } from "../src/benchmark";
import { buildRepositoryMap, RepositoryTools } from "../src/tools";

const expected = new Map([
  ["ts-add", "src/math.ts"],
  ["py-slug", "slug.py"],
  ["ts-prefix", "src/format.ts"],
  ["py-median", "stats.py"],
  ["ts-clamp", "src/clamp.ts"],
  ["py-port", "ports.py"],
]);

describe("bounded repository map", () => {
  test("improves relevant-file recall on development tasks without using held-out tasks", async () => {
    const tasksRoot = resolve(import.meta.dir, "../benchmarks/tasks");
    const report = JSON.parse(await readFile(resolve(import.meta.dir, "../benchmarks/reports/localization-comparison-2026-09-26.json"), "utf8"));
    let found = 0;
    for (const [id, relevantFile] of expected) {
      const taskRoot = resolve(tasksRoot, id);
      const manifest = await loadBenchmarkManifest(taskRoot);
      expect(manifest.split).toBe("development");
      const repository = await RepositoryTools.create(resolve(taskRoot, "fixture"));
      const map = await buildRepositoryMap({ repository, task: manifest.issue });
      const rank = map.candidates.findIndex(({ path }) => path === relevantFile) + 1;
      expect(rank).toBeGreaterThan(0);
      expect(rank).toBeLessThanOrEqual(3);
      found += 1;
      expect(report.taskResults.find((row: { id: string }) => row.id === id)).toEqual({ id, relevantFile, rank });
    }
    expect(report.scope).toBe("development fixtures only");
    expect(report.candidate.relevantFilesFound).toBe(found);
    expect(report.candidate.relevantFileRecallAt3).toBe(found / expected.size);
    expect(report.limitations.join(" ")).toContain("not task solve rate");
  });
});
