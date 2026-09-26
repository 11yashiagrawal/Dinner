import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFakeModelScript } from "../src/agent";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true })));
});

async function scriptFile(content: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "dinner-model-script-"));
  directories.push(directory);
  const path = join(directory, "script.json");
  await writeFile(path, content);
  return path;
}

describe("loadFakeModelScript", () => {
  test("loads validated decisions with unavailable usage", async () => {
    const path = await scriptFile(
      JSON.stringify([{ intent: "done", action: { type: "finish", summary: "Complete." } }]),
    );
    const model = await loadFakeModelScript(path);

    expect(await model.complete({ messages: [] })).toEqual({
      decision: { intent: "done", action: { type: "finish", summary: "Complete." } },
      usage: { source: "unavailable" },
    });
  });

  test("rejects empty and invalid scripts before a run", async () => {
    await expect(loadFakeModelScript(await scriptFile("[]"))).rejects.toThrow("non-empty");
    await expect(
      loadFakeModelScript(
        await scriptFile(JSON.stringify([{ action: { type: "unknown_action" } }])),
      ),
    ).rejects.toThrow("Invalid fake model decision at index 0");
  });
});
