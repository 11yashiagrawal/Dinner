export type ModelRole = "system" | "user" | "assistant";

export interface ModelMessage {
  role: ModelRole;
  content: string;
}

export interface ModelRequest {
  messages: readonly ModelMessage[];
}

export type ModelAction =
  | { type: "list_files"; path?: string; maxDepth?: number }
  | { type: "search"; query: string; path?: string; maxResults?: number }
  | { type: "read_file"; path: string; startLine?: number; endLine?: number }
  | { type: "apply_patch"; patch: string }
  | {
      type: "run_command";
      command: string;
      purpose?: "setup" | "agent" | "verification";
      cwd?: string;
      timeoutMs?: number;
    }
  | { type: "inspect_diff" }
  | { type: "finish"; summary: string };

export interface ModelDecision {
  intent?: string;
  action: ModelAction;
}

export type ModelUsage =
  | {
      source: "provider" | "estimated";
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }
  | { source: "unavailable" };

export interface ModelTurn {
  decision: ModelDecision;
  usage: ModelUsage;
}

export interface CompletionBudget {
  remainingTimeMs?: number;
}

export interface ModelAdapter {
  complete(request: ModelRequest, budget?: CompletionBudget): Promise<ModelTurn>;
}
