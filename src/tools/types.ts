export type RepositoryToolErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_PATH"
  | "PATH_ESCAPE"
  | "NOT_FOUND"
  | "NOT_A_FILE"
  | "NOT_A_DIRECTORY"
  | "BINARY_FILE"
  | "NOT_A_GIT_REPOSITORY"
  | "IO_ERROR"
  | "GIT_ERROR";

export interface RepositoryToolFailure {
  ok: false;
  error: {
    code: RepositoryToolErrorCode;
    message: string;
  };
}

export interface RepositoryToolSuccess<T> {
  ok: true;
  value: T;
}

export type RepositoryToolResult<T> = RepositoryToolSuccess<T> | RepositoryToolFailure;

export interface FileListEntry {
  path: string;
  type: "file" | "directory" | "symlink";
}

export interface FileListResult {
  entries: FileListEntry[];
  truncated: boolean;
  notice?: string;
}

export interface FileReadResult {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number | null;
  truncated: boolean;
  notice?: string;
}

export interface SearchMatch {
  path: string;
  line: number;
  column: number;
  preview: string;
}

export interface SearchResult {
  matches: SearchMatch[];
  filesScanned: number;
  filesSkippedAsBinary: number;
  filesSkippedAsLarge: number;
  truncated: boolean;
  notice?: string;
}

export interface RepositoryDiff {
  trackedPatch: string;
  untrackedFiles: string[];
  truncated: boolean;
  notice?: string;
}

export interface RepositoryMetadata {
  rootPath: string;
  startRevision: string | null;
  branch: string | null;
  dirty: boolean;
  statusEntries: string[];
  manifests: string[];
  testConfigs: string[];
  statusTruncated: boolean;
}
