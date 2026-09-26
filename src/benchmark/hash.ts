import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

export function sha256(value: string | Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}

async function filesUnder(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(root, path)));
    else if (entry.isFile()) files.push(relative(root, path).replaceAll("\\", "/"));
    else throw new Error(`Unsupported benchmark entry: ${path}`);
  }
  return files;
}

export async function hashDirectory(root: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  for (const path of await filesUnder(root)) {
    const content = await readFile(join(root, path));
    hasher.update(`${path}\0${content.byteLength}\0`);
    hasher.update(content);
    hasher.update("\0");
  }
  return hasher.digest("hex");
}
