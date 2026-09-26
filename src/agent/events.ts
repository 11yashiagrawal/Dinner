import { appendFile, writeFile } from "node:fs/promises";
import type { AgentEvent, AgentEventType } from "./types";

function redact(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === "string") {
    return secrets.reduce(
      (current, secret) => (secret === "" ? current : current.replaceAll(secret, "[REDACTED]")),
      value,
    );
  }
  if (Array.isArray(value)) return value.map((entry) => redact(entry, secrets));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redact(entry, secrets)]),
    );
  }
  return value;
}

export class AgentEventWriter {
  private sequence = 0;

  private constructor(
    readonly path: string,
    private readonly secrets: readonly string[],
    private readonly onEvent?: (event: AgentEvent) => void,
  ) {}

  static async create(options: {
    path: string;
    secrets?: readonly string[];
    onEvent?: (event: AgentEvent) => void;
  }): Promise<AgentEventWriter> {
    await writeFile(options.path, "", { flag: "wx" });
    return new AgentEventWriter(options.path, options.secrets ?? [], options.onEvent);
  }

  async write(type: AgentEventType, payload: unknown): Promise<AgentEvent> {
    const event: AgentEvent = {
      sequence: ++this.sequence,
      timestamp: new Date().toISOString(),
      type,
      payload: redact(payload, this.secrets),
    };
    await appendFile(this.path, `${JSON.stringify(event)}\n`);
    try {
      this.onEvent?.(event);
    } catch {
      // Rendering and observers cannot interrupt the durable agent run.
    }
    return event;
  }
}
