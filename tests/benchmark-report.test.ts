import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { hashDirectory, loadBenchmarkManifest } from "../src/benchmark";

describe("recorded benchmark baseline", () => {
  test("pins every task and leaves unavailable agent metrics visible", async () => {
    const tasksRoot = resolve(import.meta.dir, "../benchmarks/tasks");
    const report = JSON.parse(await readFile(resolve(import.meta.dir, "../benchmarks/reports/baseline-2026-09-26.json"), "utf8"));
    const taskIds = (await readdir(tasksRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    const manifests = await Promise.all(taskIds.map((id) => loadBenchmarkManifest(resolve(tasksRoot, id))));
    expect(report.taskSetSha256).toBe(await hashDirectory(tasksRoot));
    expect(report.fixtureCalibration.tasks.map(({ id }: { id: string }) => id).sort()).toEqual(taskIds);
    expect(report.taskSet).toEqual({
      total: manifests.length,
      development: manifests.filter(({ split }) => split === "development").length,
      heldOut: manifests.filter(({ split }) => split === "held_out").length,
    });
    expect(report.autonomousRuns).toMatchObject({ attempted: 0, solveRate: null, usage: null });
    expect(report.fixtureCalibration).toMatchObject({ attemptedEvaluations: 16, mismatches: 0 });
  });
});
