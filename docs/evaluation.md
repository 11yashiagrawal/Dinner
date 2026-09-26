# Evaluation record

## Deterministic validation

At revision `62e5c9c`, the routine suite reports 110 passing deterministic tests, five Docker-gated skip entries, and zero failures. On Docker Engine 27.4.0, `make test-docker` builds the pinned runner image and passes all three integration cases: isolated command execution without model credentials, failure and process-tree timeout handling, and hidden evaluator execution through a read-only mount. The five routine skip entries include suite hooks; they correspond to these three test cases.

The benchmark contains eight pinned tasks: six development tasks and two held-out tasks. Each broken fixture is independently `unsolved`, and each known-good calibration patch is `solved`. These 16 evaluations validate fixture construction; they do not measure agent capability. Full data and denominator definitions are in [`benchmarks/reports/baseline-2026-09-26.json`](../benchmarks/reports/baseline-2026-09-26.json).

No organizer-model run has been attempted because its provider, model identifier, and transport remain unavailable. Solve rate, false-success rate, regression rate, token cost, and duration per solved task therefore remain `null`. Missing usage is not recorded as zero.

## Repository-map experiment

The optional bounded repository map was tested only on six development fixtures. Relevant implementation-file recall in the top three candidates increased from 0/6 for metadata-only initial context to 6/6. Held-out tasks were excluded. This is a localization surrogate, not evidence of improved solve rate, token use, or runtime. The feature stays disabled by default. See [`benchmarks/reports/localization-comparison-2026-09-26.json`](../benchmarks/reports/localization-comparison-2026-09-26.json).

## Supported claims

- Deterministic fake-model runs exercise the complete controller, workspace, patch, verification, recovery, memory, evidence, and artifact path.
- Independent fixtures exercise TypeScript and Python targets.
- Commands run successfully in bounded unprivileged Docker containers, with model credentials excluded from the target environment.
- Fresh-archive installation and deterministic checks pass with Bun 1.3.14.

The project does not yet claim organizer API compatibility, autonomous benchmark solve rate, or large-repository localization performance.
