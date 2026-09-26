import { expect, test } from "bun:test";
const { clamp } = await import(`${process.env.DINNER_WORKSPACE}/src/clamp.ts`);
test("uses both bounds", () => {
  expect(clamp(-2, 0, 10)).toBe(0);
  expect(clamp(12, 0, 10)).toBe(10);
});
