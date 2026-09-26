import { describe, expect, test } from "bun:test";
import { box, createTuiEventRenderer, renderSplash } from "../src/tui";

describe("terminal UI rendering", () => {
  test("renders splash and boxed panels", () => {
    expect(renderSplash({ color: false })).toContain("Caramel AI Coding Harness");
    expect(box("Setup", ["Provider: deepseek"], { color: false })).toContain("Provider: deepseek");
  });

  test("renders live model decisions without raw payload dumps", () => {
    const output: string[] = [];
    const render = createTuiEventRenderer((message) => output.push(message), { color: false });
    render({
      sequence: 2,
      timestamp: new Date(0).toISOString(),
      type: "model_decision",
      payload: { intent: "Edit members filter", action: { type: "replace_text" } },
    });

    expect(output.join("\n")).toContain("thinking: Edit members filter");
    expect(output.join("\n")).toContain("action: replace_text");
  });
});
