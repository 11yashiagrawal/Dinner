import type { ModelAction } from "../model";

function stableOutcome(result: unknown): unknown {
  if (typeof result === "object" && result !== null && "status" in result && "exitCode" in result) {
    const command = result as { status?: unknown; exitCode?: unknown; stdout?: { preview?: unknown }; stderr?: { preview?: unknown } };
    return {
      status: command.status,
      exitCode: command.exitCode,
      stdout: command.stdout?.preview,
      stderr: command.stderr?.preview,
    };
  }
  return result;
}

export class ProgressTracker {
  private previousSignature: string | null = null;
  private repetitions = 0;

  observe(action: ModelAction, result: unknown, workspaceFingerprint: string): number {
    const signature = new Bun.CryptoHasher("sha256")
      .update(JSON.stringify({ action, result: stableOutcome(result), workspaceFingerprint }))
      .digest("hex");
    if (signature === this.previousSignature) this.repetitions += 1;
    else {
      this.previousSignature = signature;
      this.repetitions = 1;
    }
    return this.repetitions;
  }
}
