import { chmod, copyFile, lstat, mkdir, readFile, readlink, realpath, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type {
  PatchApplication,
  PatchExport,
  WorkspaceCheckpoint,
  WorkspaceErrorCode,
  WorkspaceResult,
  WorkspaceSnapshot,
} from "./types";

class WorkspaceException extends Error {
  constructor(
    readonly code: WorkspaceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WorkspaceException";
  }
}

interface GitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function success<T>(value: T): WorkspaceResult<T> {
  return { ok: true, value };
}

function failure(error: unknown): WorkspaceResult<never> {
  if (error instanceof WorkspaceException) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }
  const detail = error instanceof Error ? error.message : String(error);
  return { ok: false, error: { code: "IO_ERROR", message: detail } };
}

function isInside(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot))
  );
}

function sha256(value: string | Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function canonicalizeProspectivePath(path: string): Promise<string> {
  let ancestor = resolve(path);
  const missingSegments: string[] = [];
  while (!(await pathExists(ancestor))) {
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    missingSegments.unshift(basename(ancestor));
    ancestor = parent;
  }
  return resolve(await realpath(ancestor), ...missingSegments);
}

async function runGit(
  cwd: string,
  args: readonly string[],
  input?: string,
): Promise<GitResult> {
  const process = Bun.spawn(["git", ...args], {
    cwd,
    stdin: input === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...Bun.env, GIT_OPTIONAL_LOCKS: "0" },
  });
  if (input !== undefined && process.stdin !== undefined && typeof process.stdin !== "number") {
    process.stdin.write(input);
    process.stdin.end();
  }
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { exitCode, stdout, stderr };
}

async function requireGit(cwd: string, args: readonly string[], input?: string): Promise<string> {
  const result = await runGit(cwd, args, input);
  if (result.exitCode !== 0) {
    throw new WorkspaceException(
      "GIT_ERROR",
      result.stderr.trim() || `git ${args.join(" ")} failed with exit code ${result.exitCode}.`,
    );
  }
  return result.stdout;
}

async function sourceRevision(sourcePath: string): Promise<string | null> {
  const result = await runGit(sourcePath, ["rev-parse", "--verify", "HEAD"]);
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

async function repositoryFiles(sourcePath: string): Promise<string[]> {
  const output = await requireGit(sourcePath, [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  return [...new Set(output.split("\0").filter(Boolean))].sort();
}

async function copyRepositoryEntry(sourceRoot: string, targetRoot: string, path: string): Promise<void> {
  const source = resolve(sourceRoot, path);
  const target = resolve(targetRoot, path);
  if (!isInside(sourceRoot, source) || !isInside(targetRoot, target)) {
    throw new WorkspaceException("INVALID_SOURCE", `Repository path escapes its root: ${path}`);
  }

  let sourceStat: Awaited<ReturnType<typeof lstat>>;
  try {
    sourceStat = await lstat(source);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      await rm(target, { recursive: true, force: true });
      return;
    }
    throw error;
  }

  await mkdir(dirname(target), { recursive: true });
  await rm(target, { recursive: true, force: true });
  if (sourceStat.isFile()) {
    await copyFile(source, target);
    await chmod(target, sourceStat.mode);
    return;
  }
  if (sourceStat.isSymbolicLink()) {
    const link = await readlink(source);
    if (isAbsolute(link) || !isInside(sourceRoot, resolve(dirname(source), link))) {
      throw new WorkspaceException(
        "UNSUPPORTED_ENTRY",
        `External or absolute symlink is not supported in the input snapshot: ${path}`,
      );
    }
    await symlink(link, target);
    return;
  }
  throw new WorkspaceException(
    "UNSUPPORTED_ENTRY",
    `Only files and internal relative symlinks are supported: ${path}`,
  );
}

async function changedFiles(workspacePath: string, baselineRevision: string): Promise<string[]> {
  await requireGit(workspacePath, ["add", "-A", "--", "."]);
  const output = await requireGit(workspacePath, [
    "diff",
    "--cached",
    "--name-only",
    "-z",
    baselineRevision,
    "--",
    ".",
  ]);
  return output.split("\0").filter(Boolean).sort();
}

async function patchFromBaseline(workspacePath: string, baselineRevision: string): Promise<string> {
  await requireGit(workspacePath, ["add", "-A", "--", "."]);
  return await requireGit(workspacePath, [
    "diff",
    "--cached",
    "--binary",
    "--full-index",
    baselineRevision,
    "--",
    ".",
  ]);
}

export class IsolatedWorkspace {
  readonly sourcePath: string;
  readonly sourceRevision: string | null;
  readonly workspacePath: string;
  readonly runRoot: string;
  readonly baselineRevision: string;
  private readonly checkpointsPath: string;

  private constructor(snapshot: WorkspaceSnapshot) {
    this.sourcePath = snapshot.sourcePath;
    this.sourceRevision = snapshot.sourceRevision;
    this.workspacePath = snapshot.workspacePath;
    this.runRoot = snapshot.runRoot;
    this.baselineRevision = snapshot.baselineRevision;
    this.checkpointsPath = resolve(this.runRoot, "checkpoints");
  }

  static async create(options: {
    sourcePath: string;
    runRoot: string;
  }): Promise<WorkspaceResult<IsolatedWorkspace>> {
    let temporaryRoot: string | undefined;
    try {
      const sourcePath = await realpath(resolve(options.sourcePath));
      if (!(await stat(sourcePath)).isDirectory()) {
        throw new WorkspaceException("INVALID_SOURCE", `Source is not a directory: ${sourcePath}`);
      }
      const topLevel = await runGit(sourcePath, ["rev-parse", "--show-toplevel"]);
      if (topLevel.exitCode !== 0 || resolve(topLevel.stdout.trim()) !== sourcePath) {
        throw new WorkspaceException(
          "INVALID_SOURCE",
          `Source must be the root of a Git worktree: ${sourcePath}`,
        );
      }

      const runRoot = await canonicalizeProspectivePath(options.runRoot);
      if (isInside(sourcePath, runRoot)) {
        throw new WorkspaceException(
          "INVALID_OUTPUT",
          "Run output must be outside the source repository.",
        );
      }
      if (await pathExists(runRoot)) {
        throw new WorkspaceException("INVALID_OUTPUT", `Run output already exists: ${runRoot}`);
      }

      await mkdir(dirname(runRoot), { recursive: true });
      temporaryRoot = `${runRoot}.initializing-${crypto.randomUUID()}`;
      const temporaryWorkspace = resolve(temporaryRoot, "workspace");
      await mkdir(temporaryRoot);
      const clone = await runGit(dirname(temporaryWorkspace), [
        "clone",
        "--quiet",
        "--no-hardlinks",
        "--no-checkout",
        sourcePath,
        temporaryWorkspace,
      ]);
      if (clone.exitCode !== 0) {
        throw new WorkspaceException("GIT_ERROR", clone.stderr.trim() || "Unable to clone source.");
      }

      const originalRevision = await sourceRevision(sourcePath);
      if (originalRevision !== null) {
        await requireGit(temporaryWorkspace, ["checkout", "--quiet", "--detach", originalRevision]);
      }
      for (const path of await repositoryFiles(sourcePath)) {
        await copyRepositoryEntry(sourcePath, temporaryWorkspace, path);
      }

      await requireGit(temporaryWorkspace, ["config", "user.name", "Dinner Harness"]);
      await requireGit(temporaryWorkspace, ["config", "user.email", "harness@example.invalid"]);
      await requireGit(temporaryWorkspace, ["add", "-A", "--", "."]);
      await requireGit(temporaryWorkspace, [
        "commit",
        "--quiet",
        "--allow-empty",
        "-m",
        "Dinner input snapshot",
      ]);
      const baselineRevision = (
        await requireGit(temporaryWorkspace, ["rev-parse", "HEAD"])
      ).trim();
      await mkdir(resolve(temporaryRoot, "checkpoints"));
      await rename(temporaryRoot, runRoot);
      temporaryRoot = undefined;

      return success(
        new IsolatedWorkspace({
          sourcePath,
          sourceRevision: originalRevision,
          workspacePath: resolve(runRoot, "workspace"),
          runRoot,
          baselineRevision,
        }),
      );
    } catch (error) {
      if (temporaryRoot !== undefined) await rm(temporaryRoot, { recursive: true, force: true });
      return failure(error);
    }
  }

  async applyPatch(patch: string): Promise<WorkspaceResult<PatchApplication>> {
    try {
      if (patch.trim() === "") {
        throw new WorkspaceException("PATCH_REJECTED", "Patch must not be empty.");
      }
      const check = await runGit(
        this.workspacePath,
        ["apply", "--check", "--binary", "--whitespace=nowarn", "-"],
        patch,
      );
      if (check.exitCode !== 0) {
        throw new WorkspaceException(
          "PATCH_REJECTED",
          check.stderr.trim() || "Patch does not apply to the current workspace state.",
        );
      }
      const applied = await runGit(
        this.workspacePath,
        ["apply", "--binary", "--whitespace=nowarn", "-"],
        patch,
      );
      if (applied.exitCode !== 0) {
        throw new WorkspaceException(
          "PATCH_REJECTED",
          applied.stderr.trim() || "Patch application failed.",
        );
      }
      return success({ changedFiles: await changedFiles(this.workspacePath, this.baselineRevision) });
    } catch (error) {
      return failure(error);
    }
  }

  async createCheckpoint(label: string): Promise<WorkspaceResult<WorkspaceCheckpoint>> {
    try {
      if (label.trim() === "") {
        throw new WorkspaceException("CHECKPOINT_INVALID", "Checkpoint label must not be empty.");
      }
      const patch = await patchFromBaseline(this.workspacePath, this.baselineRevision);
      const id = crypto.randomUUID();
      const patchPath = resolve(this.checkpointsPath, `${id}.patch`);
      await writeFile(patchPath, patch, { flag: "wx" });
      return success({
        id,
        label: label.trim(),
        patchPath,
        patchSha256: sha256(patch),
        changedFiles: await changedFiles(this.workspacePath, this.baselineRevision),
      });
    } catch (error) {
      return failure(error);
    }
  }

  async restoreCheckpoint(checkpoint: WorkspaceCheckpoint): Promise<WorkspaceResult<PatchApplication>> {
    try {
      const patchPath = resolve(checkpoint.patchPath);
      if (!isInside(this.checkpointsPath, patchPath)) {
        throw new WorkspaceException("CHECKPOINT_INVALID", "Checkpoint path is outside this run.");
      }
      const patch = await readFile(patchPath, "utf8");
      if (sha256(patch) !== checkpoint.patchSha256) {
        throw new WorkspaceException("CHECKPOINT_INVALID", "Checkpoint content hash does not match.");
      }

      await requireGit(this.workspacePath, ["reset", "--hard", "--quiet", this.baselineRevision]);
      await requireGit(this.workspacePath, ["clean", "-fd", "--quiet"]);
      if (patch.length > 0) {
        await requireGit(
          this.workspacePath,
          ["apply", "--binary", "--whitespace=nowarn", "-"],
          patch,
        );
      }
      const restoredFiles = await changedFiles(this.workspacePath, this.baselineRevision);
      return success({ changedFiles: restoredFiles });
    } catch (error) {
      return failure(error);
    }
  }

  async exportPatch(destination = resolve(this.runRoot, "patch.diff")): Promise<WorkspaceResult<PatchExport>> {
    try {
      const patchPath = await canonicalizeProspectivePath(destination);
      if (!isInside(this.runRoot, patchPath) || isInside(this.workspacePath, patchPath)) {
        throw new WorkspaceException(
          "INVALID_OUTPUT",
          "Patch export must be inside the run output and outside the target workspace.",
        );
      }
      const patch = await patchFromBaseline(this.workspacePath, this.baselineRevision);
      await mkdir(dirname(patchPath), { recursive: true });
      await writeFile(patchPath, patch);
      return success({
        patchPath,
        patchSha256: sha256(patch),
        changedFiles: await changedFiles(this.workspacePath, this.baselineRevision),
        bytes: Buffer.byteLength(patch),
      });
    } catch (error) {
      return failure(error);
    }
  }
}
