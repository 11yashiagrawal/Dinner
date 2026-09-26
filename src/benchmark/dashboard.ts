type Scalar = number | null;

interface BaselineReport {
  harnessRevision: string;
  taskSet: { total: number; development: number; heldOut: number };
  autonomousRuns: {
    attempted: number;
    solved: number;
    verifiedClaims: number;
    solveRate: Scalar;
    falseSuccessRate: Scalar;
    regressionRate: Scalar;
    tokensPerSolvedTask: Scalar;
    durationPerSolvedTaskMs: Scalar;
  };
  fixtureCalibration: { attemptedEvaluations: number; expectedOutcomesObserved: number; mismatches: number };
}

interface LocalizationReport {
  scope: string;
  tasks: number;
  baseline: { relevantFileRecallAt3: number };
  candidate: { relevantFileRecallAt3: number };
}

function percentage(value: Scalar): string {
  return value === null ? "N/A" : `${(value * 100).toFixed(1)}%`;
}

function countRatio(numerator: number, denominator: number): string {
  return denominator === 0 ? "N/A" : `${numerator}/${denominator} (${((numerator / denominator) * 100).toFixed(1)}%)`;
}

function bar(value: Scalar, width = 20): string {
  if (value === null) return `[${"·".repeat(width)}]`;
  const bounded = Math.max(0, Math.min(1, value));
  const filled = Math.round(bounded * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
}

function metric(label: string, value: Scalar): string {
  return `${label.padEnd(24)} ${bar(value)} ${percentage(value).padStart(7)}`;
}

export function renderBenchmarkDashboard(baseline: BaselineReport, localization?: LocalizationReport): string {
  const calibrationRate = baseline.fixtureCalibration.attemptedEvaluations === 0
    ? null
    : baseline.fixtureCalibration.expectedOutcomesObserved / baseline.fixtureCalibration.attemptedEvaluations;
  const lines = [
    "DINNER · EVALUATION DASHBOARD",
    `revision ${baseline.harnessRevision}  |  tasks ${baseline.taskSet.total} (${baseline.taskSet.development} dev / ${baseline.taskSet.heldOut} held-out)`,
    "",
    "AUTONOMOUS PERFORMANCE",
    metric("Solve rate", baseline.autonomousRuns.solveRate),
    metric("False-success rate", baseline.autonomousRuns.falseSuccessRate),
    metric("Regression rate", baseline.autonomousRuns.regressionRate),
    `Runs                     ${baseline.autonomousRuns.solved}/${baseline.autonomousRuns.attempted} solved`,
    `Verified claims          ${baseline.autonomousRuns.verifiedClaims}`,
    `Tokens / solved task     ${baseline.autonomousRuns.tokensPerSolvedTask ?? "N/A"}`,
    `Duration / solved task   ${baseline.autonomousRuns.durationPerSolvedTaskMs === null ? "N/A" : `${baseline.autonomousRuns.durationPerSolvedTaskMs} ms`}`,
    "",
    "EVALUATOR CALIBRATION",
    metric("Expected outcomes", calibrationRate),
    `Observed                 ${countRatio(baseline.fixtureCalibration.expectedOutcomesObserved, baseline.fixtureCalibration.attemptedEvaluations)}`,
    `Mismatches               ${baseline.fixtureCalibration.mismatches}`,
  ];

  if (localization !== undefined) {
    lines.push(
      "",
      "LOCALIZATION PROXY",
      metric("Baseline recall@3", localization.baseline.relevantFileRecallAt3),
      metric("Candidate recall@3", localization.candidate.relevantFileRecallAt3),
      `Scope                    ${localization.scope}; ${localization.tasks} tasks`,
    );
  }

  lines.push("", "N/A means no real-model observations exist; calibration and localization are not solve rate.");
  return `${lines.join("\n")}\n`;
}
