import { readFile } from "node:fs/promises";
import { FakeModelAdapter, parseModelDecision, type ModelTurn } from "../model";

export async function loadFakeModelScript(path: string): Promise<FakeModelAdapter> {
  const content = await readFile(path, "utf8");
  let decoded: unknown;
  try {
    decoded = JSON.parse(content);
  } catch {
    throw new Error(`Fake model script is not valid JSON: ${path}`);
  }
  if (!Array.isArray(decoded) || decoded.length === 0) {
    throw new Error("Fake model script must be a non-empty JSON array of decisions.");
  }
  const turns: ModelTurn[] = decoded.map((decision, index) => {
    try {
      return { decision: parseModelDecision(decision), usage: { source: "unavailable" } };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid fake model decision at index ${index}: ${detail}`);
    }
  });
  return new FakeModelAdapter(turns);
}
