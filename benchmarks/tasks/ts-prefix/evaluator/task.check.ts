import { expect, test } from "bun:test";
const { formatId } = await import(`${process.env.DINNER_WORKSPACE}/src/format.ts`);
test("keeps the separator for zero", () => expect(formatId(0)).toBe("item-0"));
