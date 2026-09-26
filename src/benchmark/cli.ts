import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderBenchmarkDashboard } from "./dashboard";
import { evaluatePatch, readPatch } from "./runner";

function option(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`Missing required ${name} option.`);
  return value;
}

export async function runBenchmarkCli(args = Bun.argv.slice(2)): Promise<number> {
  try {
    if (args[0] === "report") {
      const report = JSON.parse(await readFile(resolve(option(args, "--input")), "utf8"));
      const comparisonIndex = args.indexOf("--comparison");
      const comparison = comparisonIndex < 0
        ? undefined
        : JSON.parse(await readFile(resolve(option(args, "--comparison")), "utf8"));
      console.log(renderBenchmarkDashboard(report, comparison));
      return 0;
    }
    if (args[0] !== "evaluate") {
      throw new Error("Usage: benchmark evaluate --task <directory> --patch <file> --output <directory>\n       benchmark report --input <report.json> [--comparison <report.json>]");
    }
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
