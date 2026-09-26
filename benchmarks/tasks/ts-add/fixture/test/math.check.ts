import { expect, test } from "bun:test";
import { add } from "../src/math";
test("adds positive values", () => expect(add(2, 3)).toBe(5));
