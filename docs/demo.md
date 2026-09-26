# Demo

Build the runner image before the verified demo:

```sh
make setup
make runner-image
scripts/demo.sh verified
```

The script creates a temporary Git repository from the `ts-add` fixture, runs the real CLI with deterministic model decisions, applies a patch in an isolated workspace, executes the public regression test in Docker, reviews the final diff, and prints `report.md`. The source fixture remains unchanged. Inspect the printed artifact directory for `result.json`, `patch.diff`, `events.jsonl`, `report.md`, and `checks/`.

The independent benchmark can then reapply the patch and execute the hidden evaluator:

```sh
make benchmark ARGS='--task benchmarks/tasks/ts-add --patch <demo-artifact-directory>/patch.diff --output /tmp/dinner-demo-evaluation'
cat /tmp/dinner-demo-evaluation/benchmark-result.json
```

To demonstrate honest incomplete behavior without Docker:

```sh
scripts/demo.sh partial
```

That run inspects the repository, makes no change, records no verification evidence, returns the CLI's `partial` exit code internally, and prints a report that marks final verification and diff evidence as missing.
