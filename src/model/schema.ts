import type { ModelAction, ModelDecision, ModelUsage } from "./types";

export class ModelResponseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelResponseValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, location: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ModelResponseValidationError(`${location} must be an object.`);
  }
  return value;
}

function requiredString(value: unknown, location: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ModelResponseValidationError(`${location} must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown, location: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, location);
}

function optionalPositiveInteger(value: unknown, location: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ModelResponseValidationError(`${location} must be a positive integer.`);
  }
  return value;
}

function withOptional<T extends object, K extends string, V>(
  target: T,
  key: K,
  value: V | undefined,
): T & Partial<Record<K, V>> {
  return value === undefined ? target : Object.assign(target, { [key]: value });
}

function parseAction(value: unknown): ModelAction {
  const action = record(value, "action");
  const type = requiredString(action.type, "action.type");

  switch (type) {
    case "list_files": {
      const result: { type: "list_files"; path?: string; maxDepth?: number } = {
        type: "list_files",
      };
      withOptional(result, "path", optionalString(action.path, "action.path"));
      withOptional(result, "maxDepth", optionalPositiveInteger(action.maxDepth, "action.maxDepth"));
      return result;
    }
    case "search": {
      const result: { type: "search"; query: string; path?: string; maxResults?: number } = {
        type: "search",
        query: requiredString(action.query, "action.query"),
      };
      withOptional(result, "path", optionalString(action.path, "action.path"));
      withOptional(
        result,
        "maxResults",
        optionalPositiveInteger(action.maxResults, "action.maxResults"),
      );
      return result;
    }
    case "read_file": {
      const startLine = optionalPositiveInteger(action.startLine, "action.startLine");
      const endLine = optionalPositiveInteger(action.endLine, "action.endLine");
      if (startLine !== undefined && endLine !== undefined && endLine < startLine) {
        throw new ModelResponseValidationError(
          "action.endLine must be greater than or equal to action.startLine.",
        );
      }
      const result: {
        type: "read_file";
        path: string;
        startLine?: number;
        endLine?: number;
      } = {
        type: "read_file",
        path: requiredString(action.path, "action.path"),
      };
      withOptional(result, "startLine", startLine);
      withOptional(result, "endLine", endLine);
      return result;
    }
    case "apply_patch":
      return { type: "apply_patch", patch: requiredString(action.patch, "action.patch") };
    case "create_checkpoint":
      return { type: "create_checkpoint", label: requiredString(action.label, "action.label") };
    case "restore_checkpoint":
      return {
        type: "restore_checkpoint",
        checkpointId: requiredString(action.checkpointId, "action.checkpointId"),
      };
    case "run_command": {
      const result: {
        type: "run_command";
        command: string;
        purpose?: "setup" | "agent" | "verification";
        cwd?: string;
        timeoutMs?: number;
      } = {
        type: "run_command",
        command: requiredString(action.command, "action.command"),
      };
      if (action.purpose !== undefined) {
        if (
          action.purpose !== "setup" &&
          action.purpose !== "agent" &&
          action.purpose !== "verification"
        ) {
          throw new ModelResponseValidationError(
            "action.purpose must be setup, agent, or verification.",
          );
        }
        result.purpose = action.purpose;
      }
      withOptional(result, "cwd", optionalString(action.cwd, "action.cwd"));
      withOptional(
        result,
        "timeoutMs",
        optionalPositiveInteger(action.timeoutMs, "action.timeoutMs"),
      );
      return result;
    }
    case "inspect_diff":
      return { type: "inspect_diff" };
    case "finish":
      return { type: "finish", summary: requiredString(action.summary, "action.summary") };
    default:
      throw new ModelResponseValidationError(`Unknown action type: ${type}.`);
  }
}

export function parseModelDecision(value: unknown): ModelDecision {
  let decoded = value;
  if (typeof value === "string") {
    try {
      decoded = JSON.parse(value);
    } catch {
      throw new ModelResponseValidationError("Model output must be valid JSON.");
    }
  }

  const response = record(decoded, "model output");
  const intent = optionalString(response.intent, "intent");
  const decision: ModelDecision = { action: parseAction(response.action) };
  if (intent !== undefined) decision.intent = intent;
  return decision;
}

function tokenCount(value: unknown, location: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ModelResponseValidationError(`${location} must be a non-negative integer.`);
  }
  return value;
}

export function parseProviderUsage(value: unknown): ModelUsage {
  if (value === undefined) return { source: "unavailable" };

  const usage = record(value, "usage");
  return {
    source: "provider",
    inputTokens: tokenCount(usage.inputTokens, "usage.inputTokens"),
    outputTokens: tokenCount(usage.outputTokens, "usage.outputTokens"),
    totalTokens: tokenCount(usage.totalTokens, "usage.totalTokens"),
  };
}
