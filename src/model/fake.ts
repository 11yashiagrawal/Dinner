import { ModelError } from "./adapter";
import type {
  CompletionBudget,
  ModelAdapter,
  ModelRequest,
  ModelTurn,
} from "./types";

export type FakeModelStep = ModelTurn | Error;

export class FakeModelAdapter implements ModelAdapter {
  readonly requests: ModelRequest[] = [];
  private nextStep = 0;

  constructor(private readonly script: readonly FakeModelStep[]) {}

  async complete(request: ModelRequest, _budget?: CompletionBudget): Promise<ModelTurn> {
    this.requests.push(structuredClone(request));
    const step = this.script[this.nextStep];
    this.nextStep += 1;

    if (step === undefined) {
      throw new ModelError(
        "transport",
        `Fake model script exhausted after ${this.requests.length - 1} response(s).`,
        false,
        1,
      );
    }
    if (step instanceof Error) throw step;
    return structuredClone(step);
  }
}
