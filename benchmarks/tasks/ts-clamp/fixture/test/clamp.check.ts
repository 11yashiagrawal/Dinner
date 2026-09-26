import { expect, test } from "bun:test";
import { clamp } from "../src/clamp";
test("keeps an in-range number", () => expect(clamp(5, 0, 10)).toBe(5));
