import { expect, test } from "bun:test";
const { unique } = await import(`${process.env.DINNER_WORKSPACE}/src/unique.ts`);
test("preserves first-seen order", () => expect(unique(["z", "a", "z", "b"])).toEqual(["z", "a", "b"]));
