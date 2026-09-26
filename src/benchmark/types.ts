import type { CommandResult } from "../execution";

export type BenchmarkLanguage = "typescript" | "python";
export type BenchmarkCheckKind = "task" | "regression";
export type BenchmarkOutcome =
  | "solved"
  | "unsolved"
  | "timeout"
  | "infrastructure_error"
  | "invalid_submission";

export interface BenchmarkCheck {
  name: string;
  kind: BenchmarkCheckKind;
  command: string;
  timeoutMs: number;
}

export interface BenchmarkManifest {
  schemaVersion: 1;
  id: string;
  title: string;
  language: BenchmarkLanguage;
  split: "development" | "held_out";
  issue: string;
  fixtureSha256: string;
  evaluatorSha256: string;
  solutionSha256: string;
  setup: readonly string[];
  checks: readonly BenchmarkCheck[];
  budget: { maxSteps: number; maxMinutes: number; maxModelCalls: number };
}

export interface BenchmarkCheckResult extends BenchmarkCheck {
  result: CommandResult;
  passed: boolean;
}

export interface BenchmarkResult {
  schemaVersion: 1;
  taskId: string;
  outcome: BenchmarkOutcome;
  startedAt: string;
  finishedAt: string;
  patchSha256: string;
  fixtureSha256: string;
  evaluatorSha256: string;
  checks: BenchmarkCheckResult[];
  error?: string;
}

export interface BenchmarkExecutor {
  run(command: string, timeoutMs: number, env: Record<string, string>): Promise<CommandResult>;
}
