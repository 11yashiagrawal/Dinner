import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runAutonomousTask, type CommandExecutor } from "../src/agent";
import { type CommandRequest, type CommandResult } from "../src/execution";
import { FakeModelAdapter, ModelError, type ModelTurn } from "../src/model";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

async function temporaryDirectory(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(path);
  return path;
}

function git(root: string, args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString();
}

async function codingFixture(): Promise<string> {
  const root = await temporaryDirectory("dinner-agent-source-");
  git(root, ["init", "-q"]);
  await mkdir(join(root, "src"));
  await mkdir(join(root, "tests"));
  await writeFile(join(root, "package.json"), '{"type":"module","scripts":{"test":"bun test"}}\n');
  await writeFile(
    join(root, "src", "math.ts"),
    "export function add(a: number, b: number): number {\n  return a - b;\n}\n",
  );
  await writeFile(
    join(root, "tests", "math.test.ts"),
    'import { expect, test } from "bun:test";\nimport { add } from "../src/math";\ntest("adds", () => expect(add(2, 3)).toBe(5));\n',
  );
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]);
  return root;
}

function turn(action: ModelTurn["decision"]["action"], intent?: string): ModelTurn {
  return {
    decision: { action, ...(intent === undefined ? {} : { intent }) },
    usage: { source: "unavailable" },
  };
}

class LocalCommandExecutor implements CommandExecutor {
  constructor(
    private readonly workspacePath: string,
    private readonly logsPath: string,
  ) {}

  async run(request: CommandRequest): Promise<CommandResult> {
    const startedAt = Date.now();
    const cwd = request.cwd ?? ".";
    const process = Bun.spawn(["/bin/sh", "-lc", request.command], {
      cwd: resolve(this.workspacePath, cwd),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);
    const id = crypto.randomUUID();
    const stdoutPath = join(this.logsPath, `${id}.stdout.log`);
    const stderrPath = join(this.logsPath, `${id}.stderr.log`);
    await Promise.all([writeFile(stdoutPath, stdout), writeFile(stderrPath, stderr)]);
    return {
      commandId: id,
      command: request.command,
      purpose: request.purpose,
      cwd,
      image: "test-host-runner",
      status: "completed",
      exitCode,
      durationMs: Date.now() - startedAt,
      timeoutMs: request.timeoutMs ?? 10_000,
      stdout: {
        preview: stdout,
        previewTruncated: false,
        logPath: stdoutPath,
        logTruncated: false,
        capturedBytes: Buffer.byteLength(stdout),
      },
      stderr: {
        preview: stderr,
        previewTruncated: false,
        logPath: stderrPath,
        logTruncated: false,
        capturedBytes: Buffer.byteLength(stderr),
      },
    };
  }
}

const FIX_PATCH = `diff --git a/src/math.ts b/src/math.ts
--- a/src/math.ts
+++ b/src/math.ts
@@ -1,3 +1,3 @@
 export function add(a: number, b: number): number {
-  return a - b;
+  return a + b;
 }
`;

async function runWithScript(options: {
  source: string;
  script: readonly (ModelTurn | Error)[];
  maxSteps?: number;
}) {
  const parent = await temporaryDirectory("dinner-agent-output-");
  const outputPath = join(parent, "run");
  const model = new FakeModelAdapter(options.script);
  const result = await runAutonomousTask(
    {
      repoPath: options.source,
      outputPath,
      task: "Fix add so the existing test passes.",
      maxSteps: options.maxSteps ?? 10,
      maxMinutes: 2,
      maxModelCalls: 10,
    },
    {
      model,
      runId: "test-run",
      createCommandExecutor: async (workspacePath, logsPath) =>
        new LocalCommandExecutor(workspacePath, logsPath),
    },
  );
  return { result, model };
}

describe("autonomous agent vertical slice", () => {
  test("inspects, patches, verifies, finishes, and exports evidence", async () => {
    const source = await codingFixture();
    const { result, model } = await runWithScript({
      source,
      script: [
        turn({ type: "list_files", path: ".", maxDepth: 3 }, "map repository"),
        turn({ type: "read_file", path: "src/math.ts" }, "inspect implementation"),
        turn({ type: "apply_patch", patch: FIX_PATCH }, "correct addition"),
        turn(
          { type: "run_command", command: "bun test", purpose: "verification" },
          "verify behavior",
        ),
        turn({ type: "inspect_diff" }, "review changes"),
        turn({ type: "finish", summary: "Corrected addition and verified the test." }),
      ],
    });

    expect(result.status).toBe("verified");
    expect(result.changedFiles).toEqual(["src/math.ts"]);
    expect(result.verification).toMatchObject({ commandsRun: 1, successfulFinalState: true });
    expect(result.metrics).toMatchObject({ steps: 5, modelCalls: 6 });
    expect(model.requests).toHaveLength(6);
    expect(await readFile(join(source, "src", "math.ts"), "utf8")).toContain("a - b");
    expect(await readFile(result.patchPath, "utf8")).toContain("return a + b");
    expect(JSON.parse(await readFile(result.resultPath, "utf8"))).toMatchObject({
      status: "verified",
      changedFiles: ["src/math.ts"],
    });
    const events = (await readFile(result.eventsPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events[0]).toMatchObject({ sequence: 1, type: "run_started" });
    expect(events.at(-1)).toMatchObject({ type: "run_finished", payload: { status: "verified" } });
  });

  test("recovers from one invalid model response", async () => {
    const source = await codingFixture();
    const { result, model } = await runWithScript({
      source,
      script: [
        new ModelError("invalid_response", "missing action", false, 1),
        turn({ type: "finish", summary: "Could not complete." }),
      ],
    });

    expect(result.status).toBe("partial");
    expect(result.metrics.modelCalls).toBe(2);
    expect(model.requests[1]?.messages.at(-1)?.content).toContain("prior response was invalid");
  });

  test("stops at the step budget and still exports artifacts", async () => {
    const source = await codingFixture();
    const { result } = await runWithScript({
      source,
      maxSteps: 1,
      script: [
        turn({ type: "list_files", path: "." }),
        turn({ type: "finish", summary: "This turn must not run." }),
      ],
    });

    expect(result.status).toBe("budget_exhausted");
    expect(result.metrics).toMatchObject({ steps: 1, modelCalls: 1 });
    expect(await Bun.file(result.patchPath).exists()).toBeTrue();
    expect(await Bun.file(result.resultPath).exists()).toBeTrue();
  });

  test("does not accept a fabricated finish claim as verification", async () => {
    const source = await codingFixture();
    const { result } = await runWithScript({
      source,
      script: [turn({ type: "finish", summary: "Everything passed." })],
    });

    expect(result.status).toBe("partial");
    expect(result.verification).toMatchObject({
      commandsRun: 0,
      successfulFinalState: false,
      lastResult: null,
    });
  });

  test("invalidates successful verification after a later edit", async () => {
    const source = await codingFixture();
    const secondPatch = FIX_PATCH.replace("-  return a - b;", "-  return a + b;").replace(
      "+  return a + b;",
      "+  return a * b;",
    );
    const { result } = await runWithScript({
      source,
      script: [
        turn({ type: "apply_patch", patch: FIX_PATCH }),
        turn({ type: "run_command", command: "bun test", purpose: "verification" }),
        turn({ type: "apply_patch", patch: secondPatch }),
        turn({ type: "finish", summary: "Claimed success after another edit." }),
      ],
    });

    expect(result.status).toBe("partial");
    expect(result.verification.successfulFinalState).toBeFalse();
  });

  test("does not retain earlier success after a later verification failure", async () => {
    const source = await codingFixture();
    const { result } = await runWithScript({
      source,
      script: [
        turn({ type: "apply_patch", patch: FIX_PATCH }),
        turn({ type: "run_command", command: "bun test", purpose: "verification" }),
        turn({ type: "run_command", command: "exit 9", purpose: "verification" }),
        turn({ type: "inspect_diff" }),
        turn({ type: "finish", summary: "The latest check failed." }),
      ],
    });

    expect(result.status).toBe("partial");
    expect(result.verification).toMatchObject({
      commandsRun: 2,
      successfulFinalState: false,
      lastResult: { exitCode: 9 },
    });
  });

  test("does not treat a zero-test command as proof of a fix", async () => {
    const source = await codingFixture();
    const { result } = await runWithScript({
      source,
      script: [
        turn({ type: "apply_patch", patch: FIX_PATCH }),
        turn({ type: "run_command", command: "echo '0 tests'", purpose: "verification" }),
        turn({ type: "inspect_diff" }),
        turn({ type: "finish", summary: "No tests actually ran." }),
      ],
    });
    expect(result.status).toBe("partial");
    expect(result.verification.evidence[0]?.status).toBe("unknown");
  });
});
