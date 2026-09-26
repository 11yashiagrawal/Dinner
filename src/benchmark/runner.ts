import { cp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { DockerCommandRunner } from "../execution";
import { hashDirectory, sha256 } from "./hash";
import { loadBenchmarkManifest } from "./manifest";
import type { BenchmarkExecutor, BenchmarkOutcome, BenchmarkResult } from "./types";

async function git(cwd: string, args: readonly string[], input?: string): Promise<{ code: number; stderr: string }> {
  const child = Bun.spawn(["git", ...args], { cwd, stdin: input === undefined ? "ignore" : "pipe", stdout: "ignore", stderr: "pipe" });
  if (input !== undefined && child.stdin !== undefined && typeof child.stdin !== "number") {
    child.stdin.write(input);
    child.stdin.end();
  }
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  return { code, stderr };
}

async function initializeRepository(path: string): Promise<void> {
  for (const args of [["init", "--quiet"], ["config", "user.name", "Dinner Benchmark"], ["config", "user.email", "benchmark@example.invalid"], ["add", "-A"], ["commit", "--quiet", "-m", "benchmark fixture"]]) {
    const result = await git(path, args);
    if (result.code !== 0) throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

async function canonicalProspectivePath(path: string): Promise<string> {
  const absolute = resolve(path);
  try {
    return await realpath(absolute);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    const parentPath = dirname(absolute);
    return resolve(await realpath(parentPath), absolute.slice(parentPath.length + 1));
  }
}

async function defaultExecutor(workspacePath: string, evaluatorPath: string, outputPath: string): Promise<BenchmarkExecutor> {
  const runner = await DockerCommandRunner.create({
    workspacePath,
    logsPath: resolve(outputPath, "logs"),
    readOnlyMounts: [{ hostPath: evaluatorPath, containerPath: "/dinner-inputs/evaluator" }],
  });
  return { run: (command, timeoutMs, env) => runner.run({ command, timeoutMs, env, purpose: "verification" }) };
}

export async function materializeTaskSource(taskRoot: string, destination: string): Promise<void> {
  const fixture = resolve(taskRoot, "fixture");
  const manifest = await loadBenchmarkManifest(taskRoot);
  if ((await hashDirectory(fixture)) !== manifest.fixtureSha256) throw new Error(`Fixture hash mismatch for ${manifest.id}.`);
  await cp(fixture, destination, { recursive: true, errorOnExist: true, force: false });
  await initializeRepository(destination);
}

export async function evaluatePatch(options: {
  taskRoot: string;
  patch: string;
  outputPath: string;
  executorFactory?: (workspacePath: string, evaluatorPath: string, outputPath: string) => Promise<BenchmarkExecutor>;
  now?: () => Date;
}): Promise<BenchmarkResult> {
  const taskRoot = await realpath(resolve(options.taskRoot));
  const evaluatorPath = resolve(taskRoot, "evaluator");
  const manifest = await loadBenchmarkManifest(taskRoot);
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const outputPath = await canonicalProspectivePath(options.outputPath);
  if (isInside(taskRoot, outputPath) || isInside(outputPath, taskRoot)) {
    throw new Error("Benchmark output and task directories must not overlap.");
  }
  const workspacePath = resolve(outputPath, "workspace");
  await rm(outputPath, { recursive: true, force: true });
  await mkdir(outputPath, { recursive: true });
  let outcome: BenchmarkOutcome = "infrastructure_error";
  let error: string | undefined;
  const checks: BenchmarkResult["checks"] = [];
  const fixtureSha256 = await hashDirectory(resolve(taskRoot, "fixture"));
  const evaluatorSha256 = await hashDirectory(evaluatorPath);

  try {
    if (fixtureSha256 !== manifest.fixtureSha256) throw new Error(`Fixture hash mismatch for ${manifest.id}.`);
    if (evaluatorSha256 !== manifest.evaluatorSha256) throw new Error(`Evaluator hash mismatch for ${manifest.id}.`);
    await materializeTaskSource(taskRoot, workspacePath);
    if (options.patch.trim() !== "") {
      const checked = await git(workspacePath, ["apply", "--check", "--whitespace=error-all", "-"], options.patch);
      if (checked.code !== 0) {
        outcome = "invalid_submission";
        error = checked.stderr.trim() || "Patch did not apply.";
      } else {
        const applied = await git(workspacePath, ["apply", "--whitespace=error-all", "-"], options.patch);
        if (applied.code !== 0) throw new Error(applied.stderr.trim() || "Patch application failed after validation.");
      }
    }
    if (outcome !== "invalid_submission") {
      const factory = options.executorFactory ?? defaultExecutor;
      const executor = await factory(workspacePath, evaluatorPath, outputPath);
      const inDocker = options.executorFactory === undefined;
      const env = {
        DINNER_EVALUATOR: inDocker ? "/dinner-inputs/evaluator" : evaluatorPath,
        DINNER_WORKSPACE: inDocker ? "/workspace" : workspacePath,
      };
      for (const command of manifest.setup) {
        const setup = await executor.run(command, 120_000, env);
        if (setup.status !== "completed" || setup.exitCode !== 0) {
          outcome = setup.status === "timed_out" ? "timeout" : "infrastructure_error";
          error = setup.error ?? setup.stderr.preview;
          if (error === "") error = "Benchmark setup failed.";
          break;
        }
      }
      if (error === undefined) {
        for (const check of manifest.checks) {
          const result = await executor.run(check.command, check.timeoutMs, env);
          const passed = result.status === "completed" && result.exitCode === 0;
          checks.push({ ...check, result, passed });
        }
        outcome = checks.some(({ result }) => result.status === "timed_out")
          ? "timeout"
          : checks.some(({ result }) => result.status === "runner_error")
            ? "infrastructure_error"
            : checks.every(({ passed }) => passed) ? "solved" : "unsolved";
      }
      if ((await hashDirectory(evaluatorPath)) !== evaluatorSha256) throw new Error("Evaluator files changed during execution.");
    }
  } catch (caught) {
    outcome = "infrastructure_error";
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const result: BenchmarkResult = {
    schemaVersion: 1,
    taskId: manifest.id,
    outcome,
    startedAt,
    finishedAt: now().toISOString(),
    patchSha256: sha256(options.patch),
    fixtureSha256,
    evaluatorSha256,
    checks,
    ...(error === undefined ? {} : { error }),
  };
  await writeFile(resolve(outputPath, "benchmark-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export async function readPatch(path: string): Promise<string> {
  return await readFile(resolve(path), "utf8");
}
