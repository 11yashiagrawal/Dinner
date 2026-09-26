import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadFakeModelScript } from "../src/agent";

describe("submission documentation", () => {
  test("keeps both demo scripts valid and documents honest outcomes", async () => {
    const root = resolve(import.meta.dir, "..");
    const verifiedPath = resolve(root, "examples/demo-scripts/verified-ts-add.json");
    const partialPath = resolve(root, "examples/demo-scripts/honest-partial.json");
    await loadFakeModelScript(verifiedPath);
    await loadFakeModelScript(partialPath);
    expect(JSON.parse(await readFile(verifiedPath, "utf8"))).toHaveLength(5);
    expect(JSON.parse(await readFile(partialPath, "utf8"))).toHaveLength(2);
    const demo = await readFile(resolve(root, "docs/demo.md"), "utf8");
    expect(demo).toContain("scripts/demo.sh verified");
    expect(demo).toContain("scripts/demo.sh partial");
    expect(demo).toContain("independent benchmark");
  });

  test("reports unavailable model metrics and unresolved submission dependencies", async () => {
    const root = resolve(import.meta.dir, "..");
    const evaluation = await readFile(resolve(root, "docs/evaluation.md"), "utf8");
    const submission = await readFile(resolve(root, "docs/submission.md"), "utf8");
    expect(evaluation).toContain("remain `null`");
    expect(evaluation).toContain("does not yet claim organizer API compatibility");
    expect(submission).toContain("Organizer-dependent items");
    expect(submission).toContain("Do not submit while that requirement remains unresolved");
  });
});
