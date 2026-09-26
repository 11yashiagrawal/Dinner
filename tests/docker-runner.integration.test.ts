import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DockerCommandRunner } from "../src/execution";

const integrationEnabled = Bun.env.DINNER_DOCKER_INTEGRATION === "1";
const describeIntegration = integrationEnabled ? describe : describe.skip;

describeIntegration("DockerCommandRunner integration", () => {
  let workspace: string;
  let logs: string;
  let runner: DockerCommandRunner;

  beforeAll(async () => {
    workspace = await mkdtemp(join(tmpdir(), "dinner-docker-workspace-"));
    logs = await mkdtemp(join(tmpdir(), "dinner-docker-logs-"));
    runner = await DockerCommandRunner.create({
      workspacePath: workspace,
      logsPath: logs,
      defaultTimeoutMs: 5_000,
      maxTimeoutMs: 10_000,
    });
  });

  afterAll(async () => {
    await Promise.all([
      rm(workspace, { recursive: true, force: true }),
      rm(logs, { recursive: true, force: true }),
    ]);
  });

  test("runs commands without forwarding host model credentials", async () => {
    const result = await runner.run({
      command:
        "printf '%s|%s|%s|%s|%s' \"$(bun --version)\" \"$(node --version)\" \"$(npm --version)\" \"$(python3 --version)\" \"${AI_API_KEY-unset}\"",
      purpose: "verification",
    });

    expect(result.status).toBe("completed");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.preview).toMatch(/\|v22\./);
    expect(result.stdout.preview).toContain("Python 3");
    expect(result.stdout.preview).toEndWith("|unset");
  });

  test("preserves failures and terminates a command tree on timeout", async () => {
    const failure = await runner.run({ command: "exit 9", purpose: "verification" });
    expect(failure).toMatchObject({ status: "completed", exitCode: 9 });

    const timeout = await runner.run({
      command: "sleep 30 & wait",
      purpose: "agent",
      timeoutMs: 100,
    });
    expect(timeout).toMatchObject({ status: "timed_out", exitCode: null });
  });
});
