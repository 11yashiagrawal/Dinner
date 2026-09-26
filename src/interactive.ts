import { DEFAULT_BUDGETS } from "./config";

export type TerminalPrompt = (question: string, defaultValue?: string) => string | null;

export class InteractiveRunCancelled extends Error {
  constructor() {
    super("Interactive run cancelled.");
    this.name = "InteractiveRunCancelled";
  }
}

function answer(
  ask: TerminalPrompt,
  label: string,
  defaultValue?: string,
  required = false,
): string {
  const response = defaultValue === undefined ? ask(label) : ask(label, defaultValue);
  const value = response?.trim() ?? "";
  const resolved = value === "" ? defaultValue ?? "" : value;
  if (required && resolved === "") throw new Error(`${label} is required.`);
  return resolved;
}

export function collectInteractiveRunArguments(options: {
  ask: TerminalPrompt;
  write?: (message: string) => void;
  cwd: string;
  env?: Record<string, string | undefined>;
}): string[] {
  const write = options.write ?? console.log;
  const env = options.env ?? process.env;

  write("\nDinner interactive run");
  write("Enter each value in order. Press Return to accept a value shown in [brackets].");
  write("For a task file, enter @ followed by its path, for example @/tmp/issue.md.\n");

  const repo = answer(options.ask, "1/8 Repository path", undefined, true);
  const taskInput = answer(options.ask, "2/8 Task or @task-file", undefined, true);
  const model = answer(
    options.ask,
    "3/8 OpenRouter model",
    env.OPENROUTER_MODEL?.trim() || "openai/gpt-5.2",
  );
  const repositoryMap = answer(options.ask, "4/8 Repository map (enabled/disabled)", "enabled");
  const maxSteps = answer(options.ask, "5/8 Maximum tool steps", String(DEFAULT_BUDGETS.maxSteps));
  const maxModelCalls = answer(
    options.ask,
    "6/8 Maximum model calls",
    String(DEFAULT_BUDGETS.maxModelCalls),
  );
  const maxMinutes = answer(
    options.ask,
    "7/8 Maximum minutes",
    String(DEFAULT_BUDGETS.maxMinutes),
  );
  const output = answer(options.ask, "8/8 Output directory (blank = automatic)");

  const taskArguments = taskInput.startsWith("@")
    ? ["--task-file", taskInput.slice(1)]
    : ["--task", taskInput];
  const argv = [
    "--repo", repo,
    ...taskArguments,
    "--model", model,
    "--repository-map", repositoryMap,
    "--max-steps", maxSteps,
    "--max-model-calls", maxModelCalls,
    "--max-minutes", maxMinutes,
    ...(output === "" ? [] : ["--output", output]),
  ];

  write("\nRun configuration");
  write(`  Repository:     ${repo}`);
  write(`  Task input:     ${taskInput}`);
  write(`  Model:          ${model}`);
  write(`  Repository map: ${repositoryMap}`);
  write(`  Limits:         ${maxSteps} steps, ${maxModelCalls} model calls, ${maxMinutes} minutes`);
  write(`  Output:         ${output || "automatic temporary directory"}`);
  write(`  API key:        ${env.AI_API_KEY?.trim() ? "loaded from AI_API_KEY" : "missing"}`);

  const confirmation = answer(options.ask, "Start run? (Y/n)", "Y").toLowerCase();
  if (confirmation !== "y" && confirmation !== "yes") throw new InteractiveRunCancelled();
  return argv;
}
