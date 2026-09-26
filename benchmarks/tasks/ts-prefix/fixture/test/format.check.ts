import { expect, test } from "bun:test";
import { formatId } from "../src/format";
test("formats an id", () => expect(formatId(7)).toBe("item-7"));
