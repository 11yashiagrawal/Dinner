import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { BenchmarkManifest } from "./types";

const HEX = /^[a-f0-9]{64}$/;

function positiveInteger(value: unknown, name: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) <= 0) throw new Error(`${name} must be a positive integer.`);
}

export async function loadBenchmarkManifest(taskRoot: string): Promise<BenchmarkManifest> {
  const raw: unknown = JSON.parse(await readFile(resolve(taskRoot, "manifest.json"), "utf8"));
  if (raw === null || typeof raw !== "object") throw new Error("Manifest must be an object.");
  const value = raw as Record<string, unknown>;
  if (value.schemaVersion !== 1) throw new Error("Unsupported benchmark schemaVersion.");
  if (typeof value.id !== "string" || !/^[a-z0-9-]+$/.test(value.id)) throw new Error("Invalid benchmark id.");
  if (typeof value.title !== "string" || typeof value.issue !== "string") throw new Error("Invalid benchmark text.");
  if (value.language !== "typescript" && value.language !== "python") throw new Error("Invalid benchmark language.");
  if (value.split !== "development" && value.split !== "held_out") throw new Error("Invalid benchmark split.");
  for (const name of ["fixtureSha256", "evaluatorSha256", "solutionSha256"] as const) {
    if (typeof value[name] !== "string" || !HEX.test(value[name])) throw new Error(`Invalid ${name}.`);
  }
  if (!Array.isArray(value.setup) || !value.setup.every((item) => typeof item === "string")) throw new Error("Invalid setup commands.");
  if (!Array.isArray(value.checks) || value.checks.length === 0) throw new Error("At least one check is required.");
  for (const check of value.checks as Record<string, unknown>[]) {
    if (typeof check.name !== "string" || typeof check.command !== "string") throw new Error("Invalid benchmark check.");
    if (check.kind !== "task" && check.kind !== "regression") throw new Error("Invalid check kind.");
    positiveInteger(check.timeoutMs, "check timeoutMs");
  }
  const kinds = new Set((value.checks as Record<string, unknown>[]).map((check) => check.kind));
  if (!kinds.has("task") || !kinds.has("regression")) {
    throw new Error("Benchmark checks must include task and regression coverage.");
  }
  const budget = value.budget as Record<string, unknown> | undefined;
  if (budget === undefined) throw new Error("Missing benchmark budget.");
  positiveInteger(budget.maxSteps, "budget.maxSteps");
  positiveInteger(budget.maxMinutes, "budget.maxMinutes");
  positiveInteger(budget.maxModelCalls, "budget.maxModelCalls");
  return raw as BenchmarkManifest;
}
