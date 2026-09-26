import { RepositoryTools } from "./repository";

export interface RepositoryMapCandidate {
  path: string;
  score: number;
  matchedTerms: string[];
  symbols: string[];
}

export interface RepositoryMap {
  candidates: RepositoryMapCandidate[];
  filesConsidered: number;
  filesRead: number;
  truncated: boolean;
}

const SOURCE_EXTENSION = /\.(?:ts|tsx|js|jsx|py|go|rs|java|rb|php|cs)$/i;
const STOP_WORDS = new Set(["the", "and", "for", "with", "without", "from", "into", "return", "when", "where", "that", "this", "its", "not", "but", "fix", "correct", "implement", "behavior", "values", "input"]);

function terms(task: string): string[] {
  return [...new Set(task.toLowerCase().match(/[a-z_][a-z0-9_]{2,}/g) ?? [])]
    .filter((term) => !STOP_WORDS.has(term));
}

function symbols(content: string): string[] {
  const found = new Set<string>();
  const pattern = /\b(?:function|class|interface|type|const|let|var|def)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  for (const match of content.matchAll(pattern)) {
    if (match[1] !== undefined) found.add(match[1]);
  }
  return [...found].slice(0, 20);
}

export async function buildRepositoryMap(options: {
  repository: RepositoryTools;
  task: string;
  maxFiles?: number;
  maxCandidates?: number;
}): Promise<RepositoryMap> {
  const maxFiles = options.maxFiles ?? 200;
  const maxCandidates = options.maxCandidates ?? 12;
  const listing = await options.repository.listFiles({ path: ".", maxDepth: 8 });
  if (!listing.ok) throw new Error(`Repository map listing failed: ${listing.error.message}`);
  const files = listing.value.entries
    .filter((entry) => entry.type === "file" && SOURCE_EXTENSION.test(entry.path))
    .slice(0, maxFiles);
  const taskTerms = terms(options.task);
  const candidates: RepositoryMapCandidate[] = [];
  let filesRead = 0;
  for (const file of files) {
    const read = await options.repository.readFile({ path: file.path, startLine: 1, endLine: 240 });
    if (!read.ok) continue;
    filesRead += 1;
    const content = read.value.content.toLowerCase();
    const path = file.path.toLowerCase();
    const fileSymbols = symbols(read.value.content);
    const matchedTerms = taskTerms.filter((term) => path.includes(term) || content.includes(term));
    const symbolTerms = taskTerms.filter((term) => fileSymbols.some((symbol) => symbol.toLowerCase() === term));
    const score = matchedTerms.reduce((total, term) => total + (path.includes(term) ? 4 : 1), 0) + symbolTerms.length * 6;
    if (score > 0) candidates.push({ path: file.path, score, matchedTerms, symbols: fileSymbols });
  }
  candidates.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
  return {
    candidates: candidates.slice(0, maxCandidates),
    filesConsidered: files.length,
    filesRead,
    truncated: listing.value.truncated || files.length === maxFiles || candidates.length > maxCandidates,
  };
}
