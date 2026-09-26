import type { ModelMessage } from "../model";

export interface TaskMemoryLimits {
  maxContextChars: number;
  reserveResponseChars: number;
  maxRecentPairs: number;
  maxEntryChars: number;
}

export interface TaskMemorySnapshot {
  maxContextChars: number;
  reserveResponseChars: number;
  largestRequestChars: number;
  compactions: number;
  recentPairs: number;
  findings: number;
  hypotheses: number;
  failures: number;
  edits: number;
  checks: number;
  readCacheHits: number;
  readCacheMisses: number;
}

export interface MemoryRequest {
  messages: readonly ModelMessage[];
}
