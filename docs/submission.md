# Submission checklist

## Repository deliverables

| Requirement | Location or status |
|---|---|
| Reproducible setup | `make setup`, `bun.lock`, Bun 1.3.x engine |
| Standard launch | `make run ARGS="..."` |
| Deterministic tests | `make test` and `make check` |
| Clean-checkout rehearsal | `make rehearse-clean` |
| Docker validation | `make runner-image` and `make test-docker` |
| Architecture | `docs/architecture.md` |
| Execution contract | `docs/contract.md` |
| Evaluation record | `docs/evaluation.md` and `benchmarks/reports/` |
| Demonstration | `docs/demo.md` and `scripts/demo.sh` |
| Run artifacts | `result.json`, `patch.diff`, `events.jsonl`, `report.md`, `checks/` |

## Organizer-dependent items

Confirm these against the official submission portal before final submission:

- Provider endpoint, model identifier, request schema, and required environment variables.
- Exact evaluator task-input mechanism and whether `make run` receives arguments or interactive input.
- Docker availability, network policy, and resource limits in the judging environment.
- Required repository visibility, team metadata, tags/releases, video or slide links, and submission deadline.
- Required artifact upload fields and whether patches or modified repositories are expected.

The current live path intentionally exits with a clear error until the organizer adapter is implemented. Do not submit while that requirement remains unresolved.

## Final freeze procedure

1. Record the candidate Git SHA.
2. Run `make rehearse-clean` from that SHA.
3. Run `make runner-image && make test-docker` with Docker available.
4. Run the verified and partial demos.
5. Run the final affordable organizer-model benchmark without tuning on held-out tasks.
6. Update `docs/evaluation.md` with every attempted run, including failures and missing usage.
7. Recheck the repository for credentials and generated run artifacts.
8. Ensure the submitted SHA matches the evaluated SHA.
