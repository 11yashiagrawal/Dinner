import type { FileReadResult, RepositoryToolResult } from "../tools";

interface Entry {
  workspaceFingerprint: string;
  contentFingerprint: string;
  result: RepositoryToolResult<FileReadResult>;
}

export class RepositoryReadCache {
  private readonly entries = new Map<string, Entry>();

  get(path: string, startLine: number | undefined, endLine: number | undefined, workspaceFingerprint: string): RepositoryToolResult<FileReadResult> | undefined {
    const entry = this.entries.get(this.key(path, startLine, endLine));
    return entry?.workspaceFingerprint === workspaceFingerprint ? structuredClone(entry.result) : undefined;
  }

  set(path: string, startLine: number | undefined, endLine: number | undefined, workspaceFingerprint: string, result: RepositoryToolResult<FileReadResult>): void {
    const content = result.ok ? result.value.content : JSON.stringify(result.error);
    this.entries.set(this.key(path, startLine, endLine), {
      workspaceFingerprint,
      contentFingerprint: new Bun.CryptoHasher("sha256").update(content).digest("hex"),
      result: structuredClone(result),
    });
  }

  private key(path: string, startLine: number | undefined, endLine: number | undefined): string {
    return `${path}\0${startLine ?? ""}\0${endLine ?? ""}`;
  }
}
