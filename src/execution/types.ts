export type CommandPurpose = "setup" | "agent" | "verification";

export interface CommandRequest {
  command: string;
  purpose: CommandPurpose;
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export type CommandStatus = "completed" | "timed_out" | "runner_error";

export interface CommandOutput {
  preview: string;
  previewTruncated: boolean;
  logPath: string;
  logTruncated: boolean;
  capturedBytes: number;
}

export interface CommandResult {
  commandId: string;
  command: string;
  purpose: CommandPurpose;
  cwd: string;
  image: string;
  status: CommandStatus;
  exitCode: number | null;
  durationMs: number;
  timeoutMs: number;
  stdout: CommandOutput;
  stderr: CommandOutput;
  error?: string;
}
