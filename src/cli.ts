#!/usr/bin/env bun

import { ConfigurationError, loadRunConfig, toPublicRunConfig } from "./config";

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
    stdout("Configuration accepted. The autonomous runtime will be connected in a later commit.");
    return 0;
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
