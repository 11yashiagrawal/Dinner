import type { CommandResult } from "../execution";
import type { RepositoryMetadata } from "../tools";
import type { DiscoveredCheck, ParsedTestCounts, VerificationEvidence, VerificationStatus } from "./types";

function count(pattern: RegExp, text: string): number | null {
  const match = pattern.exec(text);
  return match === null ? null : Number(match[1]);
}

export function parseTestCounts(result: CommandResult): ParsedTestCounts | null {
  const text = `${result.stdout.preview}\n${result.stderr.preview}`;
  const passed = count(/(?:^|\s)(\d+)\s+(?:pass|passed)\b/im, text);
  const failed = count(/(?:^|\s)(\d+)\s+(?:fail|failed)\b/im, text);
  const skipped = count(/(?:^|\s)(\d+)\s+(?:skip|skipped)\b/im, text);
  const collected = count(/(?:collected\s+|ran\s+)?(\d+)\s+(?:tests?|items?)\b/im, text);
  if (passed === null && failed === null && skipped === null && collected === null) return null;
  const resolvedPassed = passed ?? 0;
  const resolvedFailed = failed ?? 0;
  const resolvedSkipped = skipped ?? 0;
  return {
    passed: resolvedPassed,
    failed: resolvedFailed,
    skipped: resolvedSkipped,
    total: collected ?? resolvedPassed + resolvedFailed + resolvedSkipped,
  };
}

export function verificationStatus(result: CommandResult, counts: ParsedTestCounts | null): VerificationStatus {
  if (result.status === "timed_out") return "timed_out";
  if (result.status === "runner_error" || result.exitCode === null) return "unknown";
  if (result.exitCode !== 0) return "failed";
  if (counts !== null && counts.total === 0) return "unknown";
  if (counts !== null && counts.passed === 0 && counts.failed === 0 && counts.skipped > 0) return "skipped";
  return "passed";
}

export function createEvidence(options: {
  result: CommandResult;
  codeFingerprint: string;
  baseline: boolean;
}): VerificationEvidence {
  const testCounts = parseTestCounts(options.result);
  return {
    id: options.result.commandId,
    codeFingerprint: options.codeFingerprint,
    command: options.result.command,
    cwd: options.result.cwd,
    status: verificationStatus(options.result, testCounts),
    exitCode: options.result.exitCode,
    durationMs: options.result.durationMs,
    timeoutMs: options.result.timeoutMs,
    stdoutLogPath: options.result.stdout.logPath,
    stderrLogPath: options.result.stderr.logPath,
    testCounts,
    baseline: options.baseline,
  };
}

export function discoverChecks(metadata: RepositoryMetadata): DiscoveredCheck[] {
  const found: DiscoveredCheck[] = [];
  const manifests = new Set(metadata.manifests);
  const configs = new Set(metadata.testConfigs);
  if (manifests.has("package.json")) found.push({ command: "bun test", source: "package.json", category: "test" });
  if (manifests.has("pyproject.toml") || manifests.has("requirements.txt") || configs.has("pytest.ini")) {
    found.push({ command: "python -m pytest", source: configs.has("pytest.ini") ? "pytest.ini" : "Python manifest", category: "test" });
  }
  if (manifests.has("Cargo.toml")) found.push({ command: "cargo test", source: "Cargo.toml", category: "test" });
  if (manifests.has("go.mod")) found.push({ command: "go test ./...", source: "go.mod", category: "test" });
  return found;
}

export function evidenceForFinalState(records: readonly VerificationEvidence[], fingerprint: string): VerificationEvidence[] {
  return records.filter((record) => record.codeFingerprint === fingerprint);
}
