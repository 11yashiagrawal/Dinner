import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { DockerCommandRunner, type CommandResult } from "../execution";
import {
  ModelError,
  type ModelAction,
  type ModelAdapter,
  type ModelMessage,
} from "../model";
import { RepositoryTools } from "../tools";
import { createEvidence, discoverChecks, evidenceForFinalState, type VerificationEvidence } from "../verification";
import { IsolatedWorkspace, type WorkspaceState } from "../workspace";
import { AgentEventWriter } from "./events";
import {
  emptyUsageSummary,
  recordUsage,
  type AgentEvent,
  type AgentRunResult,
  type AgentStatus,
  type CommandExecutor,
} from "./types";

export interface AutonomousRunOptions {
  repoPath: string;
  outputPath: string;
  task: string;
  maxSteps: number;
  maxMinutes: number;
  maxModelCalls: number;
  apiKey?: string;
}

export interface AutonomousRunDependencies {
  model: ModelAdapter;
  createCommandExecutor?: (
    workspacePath: string,
    logsPath: string,
  ) => Promise<CommandExecutor>;
  onEvent?: (event: AgentEvent) => void;
  now?: () => number;
  runId?: string;
}

interface ToolObservation {
  result: unknown;
  verification?: CommandResult;
  workspaceChanged: boolean;
}

const SYSTEM_PROMPT = `You are an autonomous coding agent. Choose exactly one structured action per turn.
Inspect before editing. Use unified Git patches for apply_patch. Commands run in an isolated Docker container.
Label commands as setup, agent, or verification. Before finish, inspect the diff and run a relevant verification command after the final edit.
Never claim a check passed unless its observed tool result says it passed.`;

function initialUserMessage(task: string, metadata: unknown, checks: unknown): string {
  return `Task:\n${task}\n\nRepository metadata:\n${JSON.stringify(metadata, null, 2)}\n\nLikely checks discovered by the harness:\n${JSON.stringify(checks, null, 2)}`;
}

function observationMessage(action: ModelAction, observation: unknown): string {
  return `Observed result for ${action.type}:\n${JSON.stringify(observation)}`;
}

async function currentState(workspace: IsolatedWorkspace): Promise<WorkspaceState> {
  const state = await workspace.inspectChanges();
  if (!state.ok) throw new Error(state.error.message);
  return state.value;
}

async function dispatchAction(options: {
  action: Exclude<ModelAction, { type: "finish" }>;
  repository: RepositoryTools;
  workspace: IsolatedWorkspace;
  commandExecutor: CommandExecutor;
  remainingTimeMs: number;
}): Promise<ToolObservation> {
  const { action, repository, workspace, commandExecutor } = options;
  const before = await currentState(workspace);
  let result: unknown;
  let verification: CommandResult | undefined;

  switch (action.type) {
    case "list_files":
      result = await repository.listFiles({
        ...(action.path === undefined ? {} : { path: action.path }),
        ...(action.maxDepth === undefined ? {} : { maxDepth: action.maxDepth }),
      });
      break;
    case "search":
      result = await repository.search({
        query: action.query,
        ...(action.path === undefined ? {} : { path: action.path }),
        ...(action.maxResults === undefined ? {} : { maxResults: action.maxResults }),
      });
      break;
    case "read_file":
      result = await repository.readFile({
        path: action.path,
        ...(action.startLine === undefined ? {} : { startLine: action.startLine }),
        ...(action.endLine === undefined ? {} : { endLine: action.endLine }),
      });
      break;
    case "inspect_diff":
      result = await repository.inspectDiff();
      break;
    case "apply_patch":
      result = await workspace.applyPatch(action.patch);
      break;
    case "run_command": {
      const requestedTimeout = action.timeoutMs ?? options.remainingTimeMs;
      const commandResult = await commandExecutor.run({
        command: action.command,
        purpose: action.purpose ?? "agent",
        ...(action.cwd === undefined ? {} : { cwd: action.cwd }),
        timeoutMs: Math.max(1, Math.min(requestedTimeout, options.remainingTimeMs)),
      });
      result = commandResult;
      if (commandResult.purpose === "verification") verification = commandResult;
      break;
    }
  }

  const after = await currentState(workspace);
  return {
    result,
    workspaceChanged: before.patchSha256 !== after.patchSha256,
    ...(verification === undefined ? {} : { verification }),
  };
}

function statusForModelError(error: ModelError): AgentStatus {
  if (error.kind === "authentication") return "blocked";
  if (error.kind === "budget_exhausted") return "budget_exhausted";
  return "failed";
}

export async function runAutonomousTask(
  options: AutonomousRunOptions,
  dependencies: AutonomousRunDependencies,
): Promise<AgentRunResult> {
  if (!Number.isInteger(options.maxSteps) || options.maxSteps <= 0) {
    throw new Error("maxSteps must be a positive integer.");
  }
  if (!Number.isInteger(options.maxModelCalls) || options.maxModelCalls <= 0) {
    throw new Error("maxModelCalls must be a positive integer.");
  }
  if (!Number.isFinite(options.maxMinutes) || options.maxMinutes <= 0) {
    throw new Error("maxMinutes must be positive.");
  }
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  const deadline = startedAt + options.maxMinutes * 60_000;
  const runId = dependencies.runId ?? crypto.randomUUID();
  const initialized = await IsolatedWorkspace.create({
    sourcePath: options.repoPath,
    runRoot: options.outputPath,
  });
  if (!initialized.ok) throw new Error(`Workspace initialization failed: ${initialized.error.message}`);
  const workspace = initialized.value;
  const checksPath = resolve(workspace.runRoot, "checks");
  await mkdir(checksPath, { recursive: true });
  const eventOptions: Parameters<typeof AgentEventWriter.create>[0] = {
    path: resolve(workspace.runRoot, "events.jsonl"),
    secrets: options.apiKey === undefined ? [] : [options.apiKey],
  };
  if (dependencies.onEvent !== undefined) eventOptions.onEvent = dependencies.onEvent;
  const events = await AgentEventWriter.create(eventOptions);
  const repository = await RepositoryTools.create(workspace.workspacePath);
  const commandExecutor = await (
    dependencies.createCommandExecutor ??
    (async (workspacePath, logsPath) =>
      await DockerCommandRunner.create({ workspacePath, logsPath }))
  )(workspace.workspacePath, checksPath);
  const metadata = await repository.metadata();
  const discoveredChecks = metadata.ok ? discoverChecks(metadata.value) : [];
  const messages: ModelMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: initialUserMessage(options.task, metadata, discoveredChecks) },
  ];
  const usage = emptyUsageSummary();
  let steps = 0;
  let modelCalls = 0;
  let verificationCommands = 0;
  let lastVerification: CommandResult | null = null;
  let verifiedPatchSha: string | null = null;
  let diffReviewedPatchSha: string | null = null;
  const verificationEvidence: VerificationEvidence[] = [];
  let status: AgentStatus = "failed";
  let terminationReason = "Controller stopped unexpectedly.";
  let summary = "No model summary was produced.";

  await events.write("run_started", {
    runId,
    task: options.task,
    sourceRepo: workspace.sourcePath,
    workspacePath: workspace.workspacePath,
    budgets: {
      maxSteps: options.maxSteps,
      maxMinutes: options.maxMinutes,
      maxModelCalls: options.maxModelCalls,
    },
  });

  while (true) {
    const remainingTimeMs = deadline - now();
    if (remainingTimeMs <= 0 || steps >= options.maxSteps || modelCalls >= options.maxModelCalls) {
      status = "budget_exhausted";
      terminationReason =
        remainingTimeMs <= 0
          ? "Wall-clock budget exhausted."
          : steps >= options.maxSteps
            ? "Step budget exhausted."
            : "Model-call budget exhausted.";
      break;
    }

    let turn;
    try {
      modelCalls += 1;
      turn = await dependencies.model.complete(
        { messages },
        { remainingTimeMs },
      );
      recordUsage(usage, turn.usage);
    } catch (error) {
      const modelError =
        error instanceof ModelError
          ? error
          : new ModelError(
              "transport",
              error instanceof Error ? error.message : String(error),
              false,
              1,
              { cause: error },
            );
      await events.write("model_error", {
        kind: modelError.kind,
        message: modelError.message,
        attempts: modelError.attempts,
      });
      if (modelError.kind === "invalid_response" && modelCalls < options.maxModelCalls) {
        messages.push({
          role: "user",
          content: `Your prior response was invalid: ${modelError.message} Return one valid structured action.`,
        });
        continue;
      }
      status = statusForModelError(modelError);
      terminationReason = `Model error (${modelError.kind}): ${modelError.message}`;
      break;
    }

    const { decision } = turn;
    await events.write("model_decision", decision);
    messages.push({ role: "assistant", content: JSON.stringify(decision) });

    if (decision.action.type === "finish") {
      summary = decision.action.summary;
      const state = await currentState(workspace);
      const verified =
        state.changedFiles.length > 0 &&
        verifiedPatchSha !== null &&
        verifiedPatchSha === state.patchSha256 &&
        diffReviewedPatchSha === state.patchSha256;
      status = verified ? "verified" : "partial";
      terminationReason = verified
        ? "Model requested finish with successful verification for the final code state."
        : state.changedFiles.length === 0
          ? "Model requested finish without producing code changes."
          : diffReviewedPatchSha !== state.patchSha256
            ? "Model requested finish without reviewing the final diff."
            : "Model requested finish without successful verification for the final changed state.";
      break;
    }

    steps += 1;
    try {
      const observation = await dispatchAction({
        action: decision.action,
        repository,
        workspace,
        commandExecutor,
        remainingTimeMs: Math.max(1, deadline - now()),
      });
      if (observation.workspaceChanged) {
        verifiedPatchSha = null;
        diffReviewedPatchSha = null;
      }
      if (decision.action.type === "inspect_diff") {
        diffReviewedPatchSha = (await currentState(workspace)).patchSha256;
      }
      if (observation.verification !== undefined) {
        verificationCommands += 1;
        lastVerification = observation.verification;
        const state = await currentState(workspace);
        const evidence = createEvidence({
          result: observation.verification,
          codeFingerprint: state.patchSha256,
          baseline: state.changedFiles.length === 0,
        });
        verificationEvidence.push(evidence);
        verifiedPatchSha = evidence.status === "passed" && !observation.workspaceChanged
          ? state.patchSha256
          : null;
      }
      await events.write("tool_result", {
        action: decision.action.type,
        workspaceChanged: observation.workspaceChanged,
        result: observation.result,
      });
      messages.push({ role: "user", content: observationMessage(decision.action, observation.result) });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await events.write("tool_result", {
        action: decision.action.type,
        workspaceChanged: false,
        error: detail,
      });
      messages.push({
        role: "user",
        content: `Tool execution failed for ${decision.action.type}: ${detail}`,
      });
    }
  }

  const exported = await workspace.exportPatch();
  if (!exported.ok) {
    status = "failed";
    terminationReason = `Patch export failed: ${exported.error.message}`;
  }
  const exportValue = exported.ok
    ? exported.value
    : { patchPath: resolve(workspace.runRoot, "patch.diff"), changedFiles: [] };
  const finalState = await currentState(workspace);
  const finalEvidence = evidenceForFinalState(verificationEvidence, finalState.patchSha256);
  const successfulFinalState =
    finalState.changedFiles.length > 0 &&
    finalEvidence.at(-1)?.status === "passed" &&
    diffReviewedPatchSha === finalState.patchSha256;
  const resultPath = resolve(workspace.runRoot, "result.json");
  const result: AgentRunResult = {
    runId,
    status,
    terminationReason,
    summary,
    task: options.task,
    sourceRepo: workspace.sourcePath,
    workspacePath: workspace.workspacePath,
    resultPath,
    eventsPath: events.path,
    patchPath: exportValue.patchPath,
    changedFiles: exportValue.changedFiles,
    verification: {
      commandsRun: verificationCommands,
      successfulFinalState,
      diffReviewedForFinalState: diffReviewedPatchSha === finalState.patchSha256,
      discoveredChecks,
      evidence: verificationEvidence,
      lastResult: lastVerification,
    },
    metrics: {
      steps,
      modelCalls,
      durationMs: Math.max(0, now() - startedAt),
    },
    usage,
  };
  await events.write("run_finished", {
    status: result.status,
    terminationReason: result.terminationReason,
    changedFiles: result.changedFiles,
    successfulFinalState,
  });
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export function renderAgentEvent(event: AgentEvent): void {
  if (event.type === "run_started") console.log(`▶ Run ${String((event.payload as { runId?: unknown }).runId)}`);
  if (event.type === "model_decision") {
    const action = (event.payload as { action?: { type?: unknown } }).action?.type;
    console.log(`→ ${String(action)}`);
  }
  if (event.type === "model_error") console.log(`! Model response error`);
  if (event.type === "tool_result") console.log(`  Tool result recorded`);
  if (event.type === "run_finished") {
    console.log(`■ ${String((event.payload as { status?: unknown }).status)}`);
  }
}

export function defaultRunId(outputPath: string): string {
  return basename(outputPath);
}
