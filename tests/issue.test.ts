import { describe, expect, test } from "bun:test";
import { formatIssueTask, parseGitHubIssueUrl } from "../src/issue";

describe("GitHub issue tasks", () => {
  test("parses GitHub issue URLs", () => {
    expect(parseGitHubIssueUrl("https://github.com/SASTxNST/Website_SAST/issues/378")).toEqual({
      owner: "SASTxNST",
      repo: "Website_SAST",
      number: "378",
    });
  });

  test("formats fetched issues as agent tasks", () => {
    expect(formatIssueTask({
      url: "https://github.com/o/r/issues/1",
      title: "Fix filters",
      body: "Expected outcome here.",
    })).toContain("Title: Fix filters\n\nExpected outcome here.");
  });

  test("rejects non-issue URLs", () => {
    expect(() => parseGitHubIssueUrl("https://github.com/o/r/pull/1")).toThrow("Invalid GitHub issue URL");
    expect(() => parseGitHubIssueUrl("https://example.com/o/r/issues/1")).toThrow("GitHub issue URLs");
  });
});
