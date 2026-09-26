import { expect, test } from "bun:test";
const { add } = await import(`${process.env.DINNER_WORKSPACE}/src/math.ts`);
test("adds negative values", () => expect(add(-4, -7)).toBe(-11));
