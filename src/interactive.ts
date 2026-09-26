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

  const repo = answer(options.ask, "1/9 Repository path", undefined, true);
  const taskInput = answer(options.ask, "2/9 Task or @task-file", undefined, true);
  const defaultProvider = env.DEEPSEEK_API_KEY?.trim() ? "deepseek" : "openrouter";
  const provider = answer(options.ask, "3/9 Model provider (deepseek/openrouter)", defaultProvider);
  const model = answer(
    options.ask,
    "4/9 Model",
    provider === "deepseek"
      ? env.DEEPSEEK_MODEL?.trim() || "deepseek-flash"
      : env.OPENROUTER_MODEL?.trim() || "openai/gpt-5.2",
  );
  const repositoryMap = answer(options.ask, "5/9 Repository map (enabled/disabled)", "enabled");
  const maxSteps = answer(options.ask, "6/9 Maximum tool steps", String(DEFAULT_BUDGETS.maxSteps));
  const maxModelCalls = answer(
    options.ask,
    "7/9 Maximum model calls",
    String(DEFAULT_BUDGETS.maxModelCalls),
  );
  const maxMinutes = answer(
    options.ask,
    "8/9 Maximum minutes",
    String(DEFAULT_BUDGETS.maxMinutes),
  );
  const output = answer(options.ask, "9/9 Output directory (blank = automatic)");

  const taskArguments = taskInput.startsWith("@")
    ? ["--task-file", taskInput.slice(1)]
    : ["--task", taskInput];
  const argv = [
    "--repo", repo,
    ...taskArguments,
    "--provider", provider,
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
  write(`  Provider:       ${provider}`);
  write(`  Model:          ${model}`);
  write(`  Repository map: ${repositoryMap}`);
  write(`  Limits:         ${maxSteps} steps, ${maxModelCalls} model calls, ${maxMinutes} minutes`);
  write(`  Output:         ${output || "automatic temporary directory"}`);
  const credentialName = provider === "deepseek" ? "DEEPSEEK_API_KEY" : "AI_API_KEY";
  write(`  API key:        ${env[credentialName]?.trim() ? `loaded from ${credentialName}` : `missing ${credentialName}`}`);

  const confirmation = answer(options.ask, "Start run? (Y/n)", "Y").toLowerCase();
  if (confirmation !== "y" && confirmation !== "yes") throw new InteractiveRunCancelled();
  return argv;
}
