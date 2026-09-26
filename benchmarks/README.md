# Benchmark suite

Each task contains four pinned inputs:

- `fixture/`: the repository shown to the agent.
- `evaluator/`: acceptance tests kept outside that repository and mounted read-only.
- `solution.patch`: a known-good calibration patch.
- `manifest.json`: issue text, budgets, commands, and SHA-256 hashes for all three inputs.

The evaluator copies the fixture into a fresh Git repository, checks and applies the submitted patch atomically, then runs task and regression checks. Its `benchmark-result.json` records `solved`, `unsolved`, `timeout`, `invalid_submission`, or `infrastructure_error` independently of the agent's own verification claims.

Build the runner image, then evaluate a patch:

```sh
make runner-image
make benchmark ARGS='--task benchmarks/tasks/ts-add --patch benchmarks/tasks/ts-add/solution.patch --output /tmp/dinner-eval'
```

The output directory must be outside the task directory. Use a new output directory for each durable attempt; the CLI replaces an existing output directory so stale files cannot affect a score.
