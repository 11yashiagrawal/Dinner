import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const DEFAULT_BUDGETS = {
  maxSteps: 40,
  maxMinutes: 20,
  maxModelCalls: 30,
} as const;

export interface RunConfig {
  repoPath: string;
  task: string;
  outputPath: string;
  apiKey: string;
  budgets: {
    maxSteps: number;
    maxMinutes: number;
    maxModelCalls: number;
  };
}

export interface PublicRunConfig extends Omit<RunConfig, "apiKey"> {
  credentialConfigured: boolean;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

interface RunArguments {
  repo?: string;
  task?: string;
  taskFile?: string;
  output?: string;
  maxSteps?: string;
  maxMinutes?: string;
  maxModelCalls?: string;
}

export interface LoadRunConfigOptions {
  argv: string[];
  env?: Record<string, string | undefined>;
  cwd?: string;
  interactive?: boolean;
  promptForTask?: () => string | null;
}

const OPTION_NAMES = new Map<string, keyof RunArguments>([
  ["--repo", "repo"],
  ["--task", "task"],
  ["--task-file", "taskFile"],
  ["--output", "output"],
  ["--max-steps", "maxSteps"],
  ["--max-minutes", "maxMinutes"],
  ["--max-model-calls", "maxModelCalls"],
]);

function parseArguments(argv: string[]): RunArguments {
  const parsed: RunArguments = {};

  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    const key = option === undefined ? undefined : OPTION_NAMES.get(option);

    if (key === undefined) {
      throw new ConfigurationError(`Unknown option: ${option ?? "<missing>"}`);
    }
    if (value === undefined || value.startsWith("--")) {
      throw new ConfigurationError(`Option ${option} requires a value.`);
    }
    if (parsed[key] !== undefined) {
      throw new ConfigurationError(`Option ${option} may be supplied only once.`);
    }

    parsed[key] = value;
  }

  return parsed;
}

function positiveNumber(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ConfigurationError(`${name} must be a positive number.`);
  }
  return parsed;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = positiveNumber(value, fallback, name);
  if (!Number.isInteger(parsed)) {
    throw new ConfigurationError(`${name} must be a positive integer.`);
  }
  return parsed;
}

function validateRepository(repo: string | undefined, cwd: string): string {
  if (repo === undefined || repo.trim() === "") {
    throw new ConfigurationError("--repo is required.");
  }

  const repoPath = resolve(cwd, repo);
  if (!existsSync(repoPath)) {
    throw new ConfigurationError(`Repository does not exist: ${repoPath}`);
  }
  if (!statSync(repoPath).isDirectory()) {
    throw new ConfigurationError(`Repository path is not a directory: ${repoPath}`);
  }
  return repoPath;
}

async function resolveTask(
  args: RunArguments,
  cwd: string,
  interactive: boolean,
  promptForTask?: () => string | null,
): Promise<string> {
  if (args.task !== undefined && args.taskFile !== undefined) {
    throw new ConfigurationError("Use either --task or --task-file, not both.");
  }

  let task = args.task;
  if (args.taskFile !== undefined) {
    const taskPath = resolve(cwd, args.taskFile);
    try {
      task = await readFile(taskPath, "utf8");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ConfigurationError(`Unable to read task file ${taskPath}: ${detail}`);
    }
  }

  if ((task === undefined || task.trim() === "") && interactive) {
    task = promptForTask?.() ?? undefined;
  }

  if (task === undefined || task.trim() === "") {
    throw new ConfigurationError(
      "A task is required. Pass --task or --task-file; interactive prompting is unavailable in this process.",
    );
  }
  return task.trim();
}

export async function loadRunConfig(options: LoadRunConfigOptions): Promise<RunConfig> {
  const args = parseArguments(options.argv);
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const apiKey = env.AI_API_KEY?.trim();

  if (apiKey === undefined || apiKey === "") {
    throw new ConfigurationError("AI_API_KEY is required for a run.");
  }

  const repoPath = validateRepository(args.repo, cwd);
  const task = await resolveTask(
    args,
    cwd,
    options.interactive ?? false,
    options.promptForTask,
  );

  return {
    repoPath,
    task,
    outputPath: resolve(cwd, args.output ?? ".harness-runs/latest"),
    apiKey,
    budgets: {
      maxSteps: positiveInteger(args.maxSteps, DEFAULT_BUDGETS.maxSteps, "--max-steps"),
      maxMinutes: positiveNumber(args.maxMinutes, DEFAULT_BUDGETS.maxMinutes, "--max-minutes"),
      maxModelCalls: positiveInteger(
        args.maxModelCalls,
        DEFAULT_BUDGETS.maxModelCalls,
        "--max-model-calls",
      ),
    },
  };
}

export function toPublicRunConfig(config: RunConfig): PublicRunConfig {
  const { apiKey: _secret, ...safeConfig } = config;
  return { ...safeConfig, credentialConfigured: true };
}
