# Dinner

Dinner is an autonomous coding harness for software-engineering tasks. It is being built in reviewable commits for the AI Harness Hackathon 2026.

The current checkpoint provides the TypeScript/Bun project skeleton and validates CLI inputs. Repository inspection, model calls, editing, and verification arrive in later commits; the CLI says this explicitly rather than pretending to run an agent.

## Requirements

- Bun 1.3.x
- GNU Make
- Linux and Docker for target-repository execution in later commits

## Setup

```bash
make setup
```

Create local environment configuration when live model access becomes available:

```bash
cp .env.example .env
```

Do not commit `.env` or API credentials.

## CLI

Show the command contract:

```bash
make run ARGS="--help"
```

Validate a headless task invocation:

```bash
AI_API_KEY=development-placeholder make run ARGS="--repo . --task 'Describe the requested code change'"
```

The placeholder demonstrates configuration only and is not sent anywhere at this checkpoint. The CLI accepts either `--task` or `--task-file`, never both. If neither is supplied, it prompts only when connected to an interactive terminal; headless execution exits with an error.

Direct invocation exposes optional budgets:

```bash
AI_API_KEY=development-placeholder bun run src/cli.ts run \
  --repo . \
  --task-file ./issue.txt \
  --output ./.harness-runs/manual \
  --max-steps 40 \
  --max-minutes 20 \
  --max-model-calls 30
```

## Development checks

```bash
make test
make check
```

Architecture and provisional evaluator assumptions are documented in [docs/architecture.md](docs/architecture.md) and [docs/contract.md](docs/contract.md).
