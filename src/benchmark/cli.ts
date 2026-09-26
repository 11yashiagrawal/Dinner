import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluatePatch, readPatch } from "./runner";

function option(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`Missing required ${name} option.`);
  return value;
}

export async function runBenchmarkCli(args = Bun.argv.slice(2)): Promise<number> {
  try {
    if (args[0] !== "evaluate") throw new Error("Usage: benchmark evaluate --task <directory> --patch <file> --output <directory>");
    const taskRoot = option(args, "--task");
    const patchPath = option(args, "--patch");
    const outputPath = option(args, "--output");
    await mkdir(resolve(outputPath, ".."), { recursive: true });
    const result = await evaluatePatch({ taskRoot, patch: await readPatch(patchPath), outputPath });
    console.log(JSON.stringify(result, null, 2));
    return result.outcome === "solved" ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

if (import.meta.main) process.exitCode = await runBenchmarkCli();
