export type FailureKind = "model" | "setup" | "tool" | "patch" | "test";

export interface FailureRecord {
  sequence: number;
  kind: FailureKind;
  hypothesis: string | null;
  action: string;
  detail: string;
  codeFingerprint: string;
  countsAgainstRepairLimit: boolean;
}

export interface RecoverySummary {
  maxRepairAttempts: number;
  repairAttempts: number;
  failures: FailureRecord[];
  checkpointsCreated: number;
  checkpointsRestored: number;
}
