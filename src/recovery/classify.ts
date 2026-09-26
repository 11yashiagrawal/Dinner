import type { CommandResult } from "../execution";
import type { FailureKind } from "./types";

export function classifyCommandFailure(result: CommandResult): FailureKind | null {
  if (result.status === "completed" && result.exitCode === 0) return null;
  if (result.purpose === "setup") return "setup";
  if (result.purpose === "verification") return "test";
  return "tool";
}

export function commandFailureDetail(result: CommandResult): string {
  if (result.status === "timed_out") return `Command timed out after ${result.timeoutMs}ms.`;
  if (result.status === "runner_error") return result.error ?? "Command runner failed.";
  return result.stderr.preview.trim() || result.stdout.preview.trim() || `Command exited ${result.exitCode}.`;
}
