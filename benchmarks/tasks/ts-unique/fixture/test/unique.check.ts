import { expect, test } from "bun:test";
import { unique } from "../src/unique";
test("removes duplicates", () => expect(unique(["a", "a"])).toEqual(["a"]));
