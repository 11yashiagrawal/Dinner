import { describe, expect, test } from "bun:test";
import { renderBenchmarkDashboard } from "../src/benchmark";

describe("benchmark dashboard", () => {
  test("keeps unavailable agent metrics distinct from proxy accuracy", () => {
    const output = renderBenchmarkDashboard({
      harnessRevision: "abc1234",
      taskSet: { total: 8, development: 6, heldOut: 2 },
      autonomousRuns: {
        attempted: 0, solved: 0, verifiedClaims: 0, solveRate: null, falseSuccessRate: null,
        regressionRate: null, tokensPerSolvedTask: null, durationPerSolvedTaskMs: null,
      },
      fixtureCalibration: { attemptedEvaluations: 16, expectedOutcomesObserved: 16, mismatches: 0 },
    }, {
      scope: "development fixtures only",
      tasks: 6,
      baseline: { relevantFileRecallAt3: 0 },
      candidate: { relevantFileRecallAt3: 1 },
    });

    expect(output).toContain("Solve rate               [····················]     N/A");
    expect(output).toContain("Expected outcomes        [████████████████████]  100.0%");
    expect(output).toContain("Candidate recall@3       [████████████████████]  100.0%");
    expect(output).toContain("calibration and localization are not solve rate");
  });

  test("renders observed autonomous rates and costs", () => {
    const output = renderBenchmarkDashboard({
      harnessRevision: "def5678",
      taskSet: { total: 4, development: 4, heldOut: 0 },
      autonomousRuns: {
        attempted: 4, solved: 3, verifiedClaims: 3, solveRate: 0.75, falseSuccessRate: 0,
        regressionRate: 0.25, tokensPerSolvedTask: 1200, durationPerSolvedTaskMs: 8400,
      },
      fixtureCalibration: { attemptedEvaluations: 8, expectedOutcomesObserved: 8, mismatches: 0 },
    });

    expect(output).toContain("Solve rate               [███████████████░░░░░]   75.0%");
    expect(output).toContain("Tokens / solved task     1200");
    expect(output).toContain("Duration / solved task   8400 ms");
  });
});
