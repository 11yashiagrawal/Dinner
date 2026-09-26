#!/usr/bin/env bun

import { ConfigurationError, loadRunConfig, toPublicRunConfig } from "./config";
import { createAgentEventRenderer, loadFakeModelScript, runAutonomousTask } from "./agent";
import { createDeepSeekModel, createOpenRouterModel } from "./model";
import {
  collectInteractiveRunArguments,
  InteractiveRunCancelled,
  type TerminalPrompt,
} from "./interactive";

export const HELP = `Dinner — autonomous coding harness

Usage:
  bun run src/cli.ts run --repo <path> (--task <text> | --task-file <path>) [options]
  bun run src/cli.ts run                    Start the guided terminal wizard

Required environment:
  AI_API_KEY                 OpenRouter API key for live development runs
  DEEPSEEK_API_KEY           DeepSeek API key for direct DeepSeek runs

Options:
  --repo <path>              Target Git repository
  --task <text>              Software-engineering task
  --task-file <path>         Read the task from a UTF-8 file
  --output <path>            Artifact directory (default: unique OS temporary directory)
  --max-steps <integer>      Maximum agent actions (default: 40)
  --max-minutes <number>     Wall-clock limit in minutes (default: 20)
  --max-model-calls <int>    Maximum model calls (default: 30)
  --max-repair-attempts <n>  Maximum code-related failures (default: 4)
  --verification-reserve-steps <n>  Steps protected for final checks (default: 3)
  --max-stagnation-interventions <n> Repeated-action limit (default: 2)
  --max-context-chars <n>    Approximate request character limit (default: 48000)
  --repository-map <enabled|disabled>  Add ranked source map to initial context (default: disabled)
  --color <enabled|disabled>  Terminal color; NO_COLOR disables by default
  --model-script <path>      Development-only JSON decisions for the fake model
  --provider <name>          openrouter or deepseek (default: inferred from credentials)
  --model <id>               Provider model (DeepSeek default: deepseek-flash)
  --help                     Show this help
`;

export async function runCli(
  argv: string[],
  dependencies: {
    env?: Record<string, string | undefined>;
    cwd?: string;
    interactive?: boolean;
    promptForTask?: () => string | null;
    prompt?: TerminalPrompt;
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

  const [command, ...suppliedCommandArgs] = argv;
  if (command !== "run") {
    stderr(`Unknown command: ${command}\n\n${HELP}`);
    return 2;
  }

  if (suppliedCommandArgs.includes("--help") || suppliedCommandArgs.includes("-h")) {
    stdout(HELP);
    return 0;
  }

  try {
    const interactive = dependencies.interactive ?? Boolean(process.stdin.isTTY);
    const ask = dependencies.prompt ?? ((question, defaultValue) =>
      defaultValue === undefined ? prompt(question) : prompt(question, defaultValue));
    const commandArgs = interactive && suppliedCommandArgs.length === 0
      ? collectInteractiveRunArguments({
          ask,
          write: stdout,
          cwd: dependencies.cwd ?? process.cwd(),
          env: dependencies.env ?? process.env,
        })
      : suppliedCommandArgs;
    const configOptions: Parameters<typeof loadRunConfig>[0] = {
      argv: commandArgs,
      interactive,
      promptForTask: dependencies.promptForTask ?? (() => prompt("Task: ")),
    };
    if (dependencies.env !== undefined) configOptions.env = dependencies.env;
    if (dependencies.cwd !== undefined) configOptions.cwd = dependencies.cwd;

    const config = await loadRunConfig(configOptions);

    stdout(JSON.stringify(toPublicRunConfig(config), null, 2));
    const model = config.modelScriptPath === undefined
      ? config.provider === "deepseek"
        ? createDeepSeekModel({ apiKey: config.apiKey!, model: config.model })
        : createOpenRouterModel({ apiKey: config.apiKey!, model: config.model })
      : await loadFakeModelScript(config.modelScriptPath);
    const runOptions: Parameters<typeof runAutonomousTask>[0] = {
      repoPath: config.repoPath,
      outputPath: config.outputPath,
      task: config.task,
      maxSteps: config.budgets.maxSteps,
      maxMinutes: config.budgets.maxMinutes,
      maxModelCalls: config.budgets.maxModelCalls,
      maxRepairAttempts: config.budgets.maxRepairAttempts,
      verificationReserveSteps: config.budgets.verificationReserveSteps,
      maxStagnationInterventions: config.budgets.maxStagnationInterventions,
      maxContextChars: config.budgets.maxContextChars,
      repositoryMapEnabled: config.repositoryMapEnabled,
    };
    if (config.apiKey !== undefined) runOptions.apiKey = config.apiKey;
    const result = await runAutonomousTask(runOptions, {
      model,
      onEvent: createAgentEventRenderer(stdout, { color: config.colorEnabled }),
    });
    stdout(JSON.stringify(result, null, 2));
    if (result.status === "verified") return 0;
    if (result.status === "partial") return 3;
    if (result.status === "blocked") return 4;
    if (result.status === "budget_exhausted") return 5;
    return 1;
  } catch (error) {
    if (error instanceof InteractiveRunCancelled) {
      stdout("Run cancelled.");
      return 0;
    }
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
