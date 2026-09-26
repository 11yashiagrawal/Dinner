import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { DEFAULT_BUDGETS } from "./config";
import { normalizeIssueUrl } from "./issue";
import { box, renderSplash } from "./tui";

export type TerminalPrompt = (question: string, defaultValue?: string) => string | null;

const PROVIDER_MODELS = {
  deepseek: ["deepseek-flash", "deepseek-chat", "deepseek-reasoner"],
  qwen: ["qwen-plus", "qwen-max", "qwen-turbo"],
} as const;

type InteractiveProvider = keyof typeof PROVIDER_MODELS;

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

function providerCredential(provider: InteractiveProvider): "DEEPSEEK_API_KEY" | "QWEN_API_KEY" {
  return provider === "deepseek" ? "DEEPSEEK_API_KEY" : "QWEN_API_KEY";
}

function defaultProvider(env: Record<string, string | undefined>): InteractiveProvider {
  if (env.DEEPSEEK_API_KEY?.trim()) return "deepseek";
  if (env.QWEN_API_KEY?.trim()) return "qwen";
  return "deepseek";
}

function parseProvider(input: string): InteractiveProvider {
  return input.trim().toLowerCase() === "qwen" ? "qwen" : "deepseek";
}

function resolveModel(provider: InteractiveProvider, answerValue: string): string {
  const models = PROVIDER_MODELS[provider];
  const index = Number(answerValue);
  if (Number.isInteger(index) && index >= 1 && index <= models.length) return models[index - 1] ?? models[0];
  return answerValue.trim() || models[0];
}

function cleanPath(input: string): string {
  return input.trim().replace(/^['"]|['"]$/g, "");
}

function expandPath(input: string, cwd: string): string {
  const cleaned = cleanPath(input);
  if (cleaned === "~") return homedir();
  if (cleaned.startsWith("~/")) return join(homedir(), cleaned.slice(2));
  return resolve(cwd, cleaned);
}

function isGitRepository(path: string): boolean {
  try {
    return statSync(path).isDirectory() && existsSync(join(path, ".git"));
  } catch {
    return false;
  }
}

function nearestGitRepository(start: string): string | undefined {
  let current = resolve(start);
  while (true) {
    if (isGitRepository(current)) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function childGitRepositories(root: string): string[] {
  try {
    if (!statSync(root).isDirectory()) return [];
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => join(root, entry.name))
      .filter(isGitRepository)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export function discoverRepositoryChoices(cwd: string, env: Record<string, string | undefined> = process.env): string[] {
  const candidates = [
    nearestGitRepository(cwd),
    ...childGitRepositories(cwd),
    ...childGitRepositories(join(homedir(), "Desktop")),
    ...childGitRepositories(join(homedir(), "Documents")),
    ...(env.CARAMEL_REPO?.trim() ? [expandPath(env.CARAMEL_REPO, cwd)] : []),
  ].filter((value): value is string => value !== undefined);
  return [...new Set(candidates)].slice(0, 8);
}

function resolveRepositoryInput(input: string, choices: readonly string[], cwd: string): string {
  const selected = input.trim();
  const selectedIndex = Number(selected);
  const candidate = Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= choices.length
    ? choices[selectedIndex - 1]
    : expandPath(selected, cwd);
  if (candidate === undefined || !isGitRepository(candidate)) {
    throw new Error(`Repository must be a Git checkout. Could not use: ${candidate ?? input}`);
  }
  return candidate;
}

export function collectInteractiveRunArguments(options: {
  ask: TerminalPrompt;
  write?: (message: string) => void;
  cwd: string;
  env?: Record<string, string | undefined>;
}): string[] {
  const write = options.write ?? console.log;
  const env = options.env ?? process.env;
  const color = env.NO_COLOR === undefined;

  write(renderSplash({ color }));
  answer(options.ask, "Continue", "Enter");

  write(box("Setup", [
    "Choose provider, model, repository, and GitHub issue.",
    "API keys stay in this terminal process and are never printed.",
    "Providers: DeepSeek and Qwen.",
  ], { color }));

  const repositoryChoices = discoverRepositoryChoices(options.cwd, env);
  if (repositoryChoices.length > 0) {
    write(box("Repository", [
      "Choose a detected Git checkout by number, or paste/drag another path.",
      ...repositoryChoices.map((repo, index) => `${index + 1}. ${repo}`),
    ], { color }));
  } else {
    write(box("Repository", [
      "No nearby Git checkout was detected.",
      "Paste a path, use '.', or drag the repository folder into the terminal.",
    ], { color }));
  }
  const repoInput = answer(options.ask, "Repository number or path", repositoryChoices[0] === undefined ? options.cwd : "1", true);
  const repo = resolveRepositoryInput(repoInput, repositoryChoices, options.cwd);
  const provider = parseProvider(answer(options.ask, "Provider (deepseek/qwen)", defaultProvider(env)));
  const models = PROVIDER_MODELS[provider];
  write(box("Models", models.map((model, index) => `${index + 1}. ${model}`), { color }));
  const model = resolveModel(provider, answer(options.ask, "Model number or model id", models[0]));

  const credentialName = providerCredential(provider);
  if (!env[credentialName]?.trim()) {
    const key = answer(options.ask, credentialName, undefined, true);
    env[credentialName] = key;
  }

  const taskInput = answer(options.ask, "GitHub issue URL", undefined, true);
  const normalizedTaskInput = normalizeIssueUrl(taskInput);
  const repositoryMap = answer(options.ask, "Repository map (enabled/disabled)", "enabled");
  const maxSteps = answer(options.ask, "Maximum tool steps", String(DEFAULT_BUDGETS.maxSteps));
  const maxModelCalls = answer(options.ask, "Maximum model calls", String(DEFAULT_BUDGETS.maxModelCalls));
  const maxMinutes = answer(options.ask, "Maximum minutes", String(DEFAULT_BUDGETS.maxMinutes));
  const output = answer(options.ask, "Output directory (blank = automatic)");

  const taskArguments = normalizedTaskInput.startsWith("@")
    ? ["--task-file", normalizedTaskInput.slice(1)]
    : /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+/.test(normalizedTaskInput)
      ? ["--issue", normalizedTaskInput]
      : ["--task", normalizedTaskInput];
  const argv = [
    "--repo", repo,
    ...taskArguments,
    "--provider", provider,
    "--model", model,
    "--repository-map", repositoryMap,
    "--max-steps", maxSteps,
    "--max-model-calls", maxModelCalls,
    "--max-minutes", maxMinutes,
    ...(provider === "deepseek" ? ["--reasoning-effort", "high"] : []),
    ...(output === "" ? [] : ["--output", output]),
  ];

  write(box("Ready", [
    `Repository: ${repo}`,
    `Issue: ${normalizedTaskInput}`,
    `Provider: ${provider}`,
    `Model: ${model}`,
    `Repository map: ${repositoryMap}`,
    `Limits: ${maxSteps} steps, ${maxModelCalls} model calls, ${maxMinutes} minutes`,
    `Output: ${output || "automatic temporary directory"}`,
    `API key: loaded from ${credentialName}`,
  ], { color }));

  const confirmation = answer(options.ask, "Start run? (Y/n)", "Y").toLowerCase();
  if (confirmation !== "y" && confirmation !== "yes") throw new InteractiveRunCancelled();
  return argv;
}
