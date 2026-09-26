# Evaluation record

## Deterministic validation

At revision `d408b28`, the clean-archive rehearsal installs the frozen Bun lockfile and reports 106 passing deterministic tests, five Docker-gated skips, and zero failures. Docker integration still requires a running Docker daemon and is exercised by the separate CI job and `make test-docker`.

The benchmark contains eight pinned tasks: six development tasks and two held-out tasks. Each broken fixture is independently `unsolved`, and each known-good calibration patch is `solved`. These 16 evaluations validate fixture construction; they do not measure agent capability. Full data and denominator definitions are in [`benchmarks/reports/baseline-2026-09-26.json`](../benchmarks/reports/baseline-2026-09-26.json).

No organizer-model run has been attempted because its provider, model identifier, and transport remain unavailable. Solve rate, false-success rate, regression rate, token cost, and duration per solved task therefore remain `null`. Missing usage is not recorded as zero.

## Repository-map experiment

The optional bounded repository map was tested only on six development fixtures. Relevant implementation-file recall in the top three candidates increased from 0/6 for metadata-only initial context to 6/6. Held-out tasks were excluded. This is a localization surrogate, not evidence of improved solve rate, token use, or runtime. The feature stays disabled by default. See [`benchmarks/reports/localization-comparison-2026-09-26.json`](../benchmarks/reports/localization-comparison-2026-09-26.json).

## Supported claims

- Deterministic fake-model runs exercise the complete controller, workspace, patch, verification, recovery, memory, evidence, and artifact path.
- Independent fixtures exercise TypeScript and Python targets.
- Commands are designed to run in bounded unprivileged Docker containers, with credentials excluded.
- Fresh-archive installation and deterministic checks pass with Bun 1.3.14.

The project does not yet claim organizer API compatibility, autonomous benchmark solve rate, large-repository localization performance, or completed local Docker integration on the development machine.
