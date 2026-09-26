import { DEFAULT_PREFIX } from "./config";
export function formatId(id: number): string {
  return `${DEFAULT_PREFIX}${id}`;
}
