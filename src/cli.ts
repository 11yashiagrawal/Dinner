#!/usr/bin/env bun

import { ConfigurationError, loadRunConfig, toPublicRunConfig } from "./config";
import { loadFakeModelScript, renderAgentEvent, runAutonomousTask } from "./agent";

export const HELP = `Dinner — autonomous coding harness

Usage:
  bun run src/cli.ts run --repo <path> (--task <text> | --task-file <path>) [options]

Required environment:
  AI_API_KEY                 Model credential (provider contract pending)

Options:
  --repo <path>              Target Git repository
  --task <text>              Software-engineering task
  --task-file <path>         Read the task from a UTF-8 file
  --output <path>            Artifact directory (default: .harness-runs/latest)
  --max-steps <integer>      Maximum agent actions (default: 40)
  --max-minutes <number>     Wall-clock limit in minutes (default: 20)
  --max-model-calls <int>    Maximum model calls (default: 30)
  --model-script <path>      Development-only JSON decisions for the fake model
  --help                     Show this help
`;

export async function runCli(
  argv: string[],
  dependencies: {
    env?: Record<string, string | undefined>;
    cwd?: string;
    interactive?: boolean;
    promptForTask?: () => string | null;
    stdout?: (message: string) => void;
    stderr?: (message: string) => void;
  } = {},
): Promise<number> {
  const stdout = dependencies.stdout ?? console.log;
  const stderr = dependencies.stderr ?? console.error;

  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    stdout(HELP);
    return 0;
  }

  const [command, ...commandArgs] = argv;
  if (command !== "run") {
    stderr(`Unknown command: ${command}\n\n${HELP}`);
    return 2;
  }

  if (commandArgs.includes("--help") || commandArgs.includes("-h")) {
    stdout(HELP);
    return 0;
  }

  try {
    const configOptions: Parameters<typeof loadRunConfig>[0] = {
      argv: commandArgs,
      interactive: dependencies.interactive ?? Boolean(process.stdin.isTTY),
      promptForTask: dependencies.promptForTask ?? (() => prompt("Task: ")),
    };
    if (dependencies.env !== undefined) configOptions.env = dependencies.env;
    if (dependencies.cwd !== undefined) configOptions.cwd = dependencies.cwd;

    const config = await loadRunConfig(configOptions);

    stdout(JSON.stringify(toPublicRunConfig(config), null, 2));
    if (config.modelScriptPath === undefined) {
      stderr(
        "The organizer model transport is not configured yet. Use --model-script for deterministic development runs.",
      );
      return 3;
    }

    const model = await loadFakeModelScript(config.modelScriptPath);
    const runOptions: Parameters<typeof runAutonomousTask>[0] = {
      repoPath: config.repoPath,
      outputPath: config.outputPath,
      task: config.task,
      maxSteps: config.budgets.maxSteps,
      maxMinutes: config.budgets.maxMinutes,
      maxModelCalls: config.budgets.maxModelCalls,
    };
    if (config.apiKey !== undefined) runOptions.apiKey = config.apiKey;
    const result = await runAutonomousTask(runOptions, {
      model,
      onEvent: renderAgentEvent,
    });
    stdout(JSON.stringify(result, null, 2));
    if (result.status === "verified") return 0;
    if (result.status === "partial") return 3;
    if (result.status === "blocked") return 4;
    if (result.status === "budget_exhausted") return 5;
    return 1;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      stderr(`Configuration error: ${error.message}`);
      return 2;
    }
    const detail = error instanceof Error ? error.message : String(error);
    stderr(`Unexpected error: ${detail}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runCli(process.argv.slice(2));
}
