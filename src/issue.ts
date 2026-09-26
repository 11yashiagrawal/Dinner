export interface IssueTask {
  url: string;
  title: string;
  body: string;
}

export type IssueFetcher = (url: string) => Promise<IssueTask>;

interface GitHubIssueResponse {
  html_url?: unknown;
  title?: unknown;
  body?: unknown;
  number?: unknown;
  state?: unknown;
}

export function formatIssueTask(issue: IssueTask): string {
  return [
    `Source issue: ${issue.url}`,
    `Title: ${issue.title}`,
    "",
    issue.body.trim() || "(No issue body provided.)",
  ].join("\n");
}

export function parseGitHubIssueUrl(url: string): { owner: string; repo: string; number: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid issue URL: ${url}`);
  }
  if (parsed.hostname !== "github.com") {
    throw new Error("--issue currently supports GitHub issue URLs.");
  }
  const [owner, repo, issues, number] = parsed.pathname.split("/").filter(Boolean);
  if (owner === undefined || repo === undefined || issues !== "issues" || number === undefined || !/^\d+$/.test(number)) {
    throw new Error(`Invalid GitHub issue URL: ${url}`);
  }
  return { owner, repo, number };
}

export async function fetchGitHubIssueTask(url: string): Promise<IssueTask> {
  const { owner, repo, number } = parseGitHubIssueUrl(url);
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${number}`, {
    headers: {
      "accept": "application/vnd.github+json",
      "user-agent": "Dinner-AI-Coding-Harness",
    },
  });
  if (!response.ok) {
    throw new Error(`Unable to fetch issue ${url}: HTTP ${response.status}`);
  }
  const issue = await response.json() as GitHubIssueResponse;
  const title = typeof issue.title === "string" ? issue.title.trim() : "";
  const body = typeof issue.body === "string" ? issue.body : "";
  const htmlUrl = typeof issue.html_url === "string" ? issue.html_url : url;
  if (title === "") throw new Error(`Fetched issue has no title: ${url}`);
  return { url: htmlUrl, title, body };
}
