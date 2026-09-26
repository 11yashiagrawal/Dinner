# AI coding harness: implementation and commit plan

Status: the core plan is implemented through release hardening. Organizer-specific model integration and final submission remain dependent on the provider and submission contract.

## Scope and assumptions

Build a terminal coding agent that accepts a repository and an issue, edits an isolated working copy, runs checks, repairs failures within a budget, and exports a patch plus evidence.

Default stack: TypeScript on Bun 1.3.x, strict compiler settings, `bun:test`, a thin adapter for the organizer-provided model, JSONL event logs, and a plain autonomous CLI. Target-repository commands run inside disposable Linux containers with network access throughout the task. Model credentials remain in the host harness process and are never forwarded to target containers.

The supplied problem statement confirms the autonomous harness goal and its focus on correctness, evidence, efficiency, orchestration, context, tools, verification, and recovery. It does not define the model/API protocol, evaluator input/output format, repository provisioning, resource limits, required commands, allowed dependencies, or submission deliverables. The conversation mentions AI_API_KEY and make setup/run/test; treat these as provisional until checked against the remaining official documents.

No model switching, extra agent architecture, vector database, web IDE, automatic publishing, or GitHub issue integration is required for the initial version.

## Working rules

- Preserve existing work and stage only files belonging to the current planned commit.
- Each commit is a reviewable working increment. Inspect staged changes and run its stated checks before committing.
- Commit implementation and meaningful tests together. Never commit keys, generated run logs, or target-repository workspaces.
- Keep public CLI/result contracts stable once evaluation integration starts.
- Use fake model responses for deterministic harness tests. Real-model evaluation is a separate, explicit command with a budget.
- A passing harness test suite does not establish that the agent solves tasks; track both separately.
- Use feature flags for experimental changes and retain a known-good baseline.
- Do not silently exclude failed runs from metrics.

## Chunk 0 — Confirm the execution contract

### Commit 01: docs: define harness contract and acceptance criteria

Implement:
- docs/contract.md: official requirements with source references and unresolved questions.
- docs/architecture.md: controller, model adapter, tools, state, verifier, event stream, evaluator.
- Define proposed CLI inputs: repository path, task text/file, output directory, and budget limits.
- Define result statuses: verified, partial, blocked, budget_exhausted, failed.
- Define verified as checks passed against final code, distinct from independently solved.
- Decide supported platform and initially exercised repository language based on constraints.

Check: compare each contract field with the original documents; identify every assumption explicitly.

Exit: the team knows exactly how an evaluator starts a run and retrieves its output. If documents remain unavailable, keep the adapter/input layer replaceable and do not claim compliance.

## Chunk 1 — Running skeleton and model boundary

### Commit 02: build: add reproducible package and CLI entrypoint

Implement:
- package.json, bun.lock, tsconfig.json, package entrypoint, tests/, .gitignore, .env.example.
- Root Makefile targets setup, run, test, check; adapt names to confirmed requirements.
- Typed configuration with environment credentials and clear validation errors.
- Interactive task input only when a terminal is attached; headless mode never waits for input.
- README quick start with exact commands.

Checks: `bun install --frozen-lockfile`; CLI help; missing task/key handling; noninteractive invocation; no credentials in output; `bun test`; `bun run typecheck`.

Exit: setup and CLI work without editing source code.

### Commit 03: feat: add model adapter and structured actions

Implement:
- A single adapter for the prescribed API and model.
- Validated action and response schemas.
- Request timeouts, bounded transient retries, and budget-aware backoff.
- Usage recording; distinguish reported usage from estimates or unavailable data.
- Fake adapter with scripted responses for tests.
- Handle unavailable structured-output support through validated parsing, not unbounded retries.

Checks: valid and malformed responses, missing fields, unknown actions, rate limits, timeout, authentication errors, retry exhaustion. Run one small real API smoke call once credentials are available.

Exit: model errors have explicit outcomes and cannot create infinite loops.

## Chunk 2 — Safe execution tools

### Commit 04: feat: add bounded repository inspection tools

Implement:
- list_files, search, read_file, and inspect_diff.
- Line ranges, output limits, binary/generated-directory exclusions, explicit truncation markers.
- Canonical path validation including symlink escapes.
- Initial repository metadata: starting revision, dirty state, manifests, available test configuration.

Checks: traversal, symlink escape, missing file, large output, binary files, empty repository, dirty repository.

Exit: the agent can inspect a repository without needing a full repository dump.

### Commit 05: feat: add bounded command execution

Implement:
- Structured command results: cwd, exit status, duration, stdout/stderr locations, timeout status.
- Working-directory validation, output limits, process-group cleanup, controlled environment.
- Keep model credentials outside the target command environment.
- Disposable unprivileged Docker execution boundary with network access throughout the task; never forward model credentials or mount broad host paths.
- Separate dependency setup commands from ordinary verification commands.

Checks: successful/failing commands, output flood, timeout with child process, invalid cwd, credential absence, documented isolation boundary.

Exit: commands are observable and bounded; the README accurately describes isolation limitations.

### Commit 06: feat: add atomic patching and isolated workspaces

Implement:
- Isolated task working copy and recorded initial state; support incoming dirty changes deliberately.
- Exact-context or structured patch application; reject ambiguous/stale edits.
- Atomic edits where possible, support add/delete files, changed-file inventory.
- Checkpoints containing agent-owned changes only; restoration must not discard supplied changes.
- Final patch export against the recorded input state, including new files.

Checks: stale and ambiguous patches, failed multi-file edit, new/deleted files, checkpoint restore, preservation of pre-existing changes, patch reapplies to matching input state.

Exit: edits are controlled and the deliverable patch is reproducible.

## Chunk 3 — First autonomous vertical slice

### Commit 07: feat: connect the autonomous agent loop

Implement:
- Task -> inspect -> short plan -> tool action -> observe -> finish request.
- Controller-owned action validation, task statuses, wall-time/step/model-call limits.
- JSONL events plus plain terminal rendering.
- Minimal state: task, inspected files, plan, latest failures, changed files.
- A fake-model end-to-end fixture and one tiny real-model repository task when organizer API access becomes available.

Checks: scripted agent produces a correct patch; invalid action recovers; limit exhaustion stops; model finish request cannot fabricate command evidence.

Exit: one issue is solved end-to-end without manual edits to the target repository.

This is the first demo checkpoint. Keep a record of this version before expanding scope.

## Chunk 4 — Independent task evaluation

### Commit 08: test: add benchmark runner and initial fixtures

Implement:
- Task manifest: ID, starting revision/snapshot, issue, setup, acceptance tests, run budget.
- Start with four representative tasks and a known-good solution for validating each fixture.
- Fresh workspace per run; evaluator tests stored outside agent-readable/editable space.
- Evaluator reconstructs the final patch in a fresh evaluation workspace and runs independent checks there.
- Capture solved, regression, timeout, infrastructure-error, runtime, and usage outcomes.

Checks: broken baseline fails task-specific checks; known-good solution passes; no-op/wrong patch fails; evaluation tests remain unchanged; repeated tasks cannot share mutable workspaces.

Exit: we can tell whether the harness solved tasks independently of its own claims.

## Chunk 5 — Verification and reliable completion

### Commit 09: feat: add verification evidence and completion gates

Implement:
- Discover likely checks from manifests/configuration and allow the model to propose relevant commands.
- Record relevant baseline failures where practical.
- Verification ladder: syntax/build when useful, targeted tests, broader checks within budget, final diff inspection.
- Evidence records with code fingerprint, exact command, working directory, exit status, duration, log location, and parsed test counts when available.
- Conservative invalidation of code-related evidence after edits; optimize invalidation only later.
- Distinguish passed, failed, skipped, not_run, timed_out, and unknown parsing results.
- Finish validation checks for required available evidence and unresolved failures.

Checks: stale evidence cannot satisfy completion; zero collected tests is not proof of a fix; failed/skipped/unrun checks stay distinct; known baseline failures are reported honestly.

Exit: the final report describes the exact final state that was tested.

### Commit 10: feat: add bounded diagnosis and repair

Implement:
- Classify model/API, setup, tool, patch, and test failures.
- Record hypothesis, attempted change, observed failure, and next investigation.
- Bounded repair loops and explicit termination reasons.
- Restore agent checkpoints when an approach is abandoned; invalidate affected evidence.
- Do not delete assertions, disable checks, or modify evaluator tests to manufacture success. Legitimate task-required test updates remain possible and visible.

Checks: failed hypothesis followed by successful repair; repeated failure reaches limit; setup failure is not recorded as a code defect; checkpoint restoration preserves input changes.

Exit: at least one fixture demonstrates autonomous failure diagnosis and recovery.

## Chunk 6 — Memory, context, and budgets

### Commit 11: feat: add compact task memory and context limits

Implement:
- Structured memory for task, findings with file/line provenance, hypotheses, unresolved failures, edits, and checks.
- Keep bounded recent tool results and retrieve older log detail on demand.
- Preserve original task and unresolved requirements during compression.
- Cache reads by path, requested range, and content fingerprint; invalidate on change.
- Reserve context space for the next response; define what happens when exact token counting is unavailable.
- Keep complete tool-call/result pairs valid for the provider protocol when reducing history.

Checks: long task remains within configured limits; failures survive compression; modified files bypass stale cache; provider message format stays valid.

Exit: a multi-step run retains essential evidence without retaining unlimited raw output.

### Commit 12: feat: detect stagnation and reserve verification budget

Implement:
- Detect repeated action/arguments/outcome on unchanged state, not legitimate repeated checks after edits.
- Trigger a bounded change of hypothesis or investigation when progress stalls.
- Track wall time, calls, retries, commands, and token usage when available.
- Reserve configurable capacity for final verification and result export.
- Guarantee local result export even after model budget exhaustion.

Checks: loop detection, legitimate rerun after edit, retries charged to budget, deadline enforcement, final artifact after exhaustion.

Exit: stuck runs terminate usefully without consuming the entire experiment budget.

## Chunk 7 — Measured improvements

### Commit 13: test: expand benchmark and record a baseline

Implement:
- Expand toward eight development tasks and four held-out tasks as time allows.
- Cover single-file bugs, edge cases, cross-file behavior, a small feature, and setup/pre-existing-failure handling.
- Pin model/configuration, task versions, budgets, and harness revision in each result.
- Save baseline report with all attempted runs and failure categories.
- Do not inspect held-out solutions while tuning; if a held-out task is used for development, reclassify it.

Metrics:
- Solve rate = independently solved / attempted.
- False-success rate = verified claims rejected by evaluator / verified claims; undefined if no verified claims.
- Regression rate = runs introducing independent regression failures / attempted.
- Total time or tokens across attempts / solved tasks; undefined if none solved.
- Timeout, infrastructure-failure, and consistency counts reported separately.

Checks: fixture integrity; missing runs and missing usage remain visible; denominator definitions are consistent.

Exit: optimization decisions have a recorded baseline rather than anecdotal demos.

### Commit 14: perf: improve the largest measured failure mode

Choose one change based on the baseline:
- Poor localization -> repository map/symbol search.
- Lost context -> improved retrieval/memory.
- Repeated failures -> revised stagnation intervention.
- Expensive verification -> better targeted-test selection, retaining final checks.
- Unnecessary edits -> tighter patch planning and diff review.

Do not implement all options by default. Add a feature flag, run paired comparisons with the same model/tasks/budget, and repeat uncertain cases when affordable.

Checks: report task outcomes, costs, failures, and small-sample limitations. Revert or disable an experiment that causes unacceptable regressions.

Exit: retain an improvement only when its benefit is demonstrated or explicitly labeled unproven.

## Chunk 8 — Product output and presentation

### Commit 15: feat: add evidence report and terminal progress view

Implement:
- Stable result.json, patch.diff, events.jsonl, and check-log layout.
- Final summary: status, changes, checks, stale/missing evidence, unresolved issues, cost/time, artifact paths.
- Terminal progress derived from the same events; plain/no-color mode remains available.
- Display observed tool actions and concise rationale, not fabricated internal reasoning.
- Ensure artifacts are outside the deliverable target patch.

Checks: headless output, redirected output, unsupported terminal, failed/partial/budget-exhausted runs, parseable JSON, no leaked credentials.

Exit: a reviewer can understand success and failure from saved artifacts without watching the run live.

## Chunk 9 — Release hardening and submission

### Commit 16: test: add clean-install and execution contract checks

Implement:
- CI for deterministic tests, formatting/static checks, installation, and CLI contract.
- Fresh-clone rehearsal matching the official launch sequence.
- Test missing credentials, inaccessible repository, unavailable network/setup dependencies, and exhausted budgets.
- Check only harness tests in routine CI; do not hide paid benchmark calls inside make test.

Checks: execute from a fresh checkout with only documented prerequisites and environment variables. Verify patch export and apply it in another clean evaluation workspace.

Exit: another person can run the system without undocumented help.

### Commit 17: docs: add evaluation results demo and submission guide

Implement:
- README installation, use, supported environments, configuration, architecture, limitations, and artifact interpretation.
- Benchmark report naming exact harness/model/task/config versions and all attempted runs.
- Demo script: issue -> failing behavior -> agent investigation -> patch -> final evidence -> independent check.
- A second short demo of honest partial/blocked behavior.
- Map every official required deliverable to a file or submission field.

Checks: teammate follows README from scratch; no unsupported scoring claims; no hard-coded credentials; demo uses the actual engine.

Exit: submission is understandable and all official requirements are accounted for.

### Commit 18: chore: finalize release configuration

Implement only necessary final fixes/defaults found during rehearsal. If no files need changes, do not create an empty commit merely to match this plan.

Final execution:
1. Freeze features and record the candidate commit.
2. Run setup, deterministic tests, static checks, and official invocation from a clean checkout.
3. Run the final affordable benchmark, including held-out tasks, on the frozen candidate.
4. If code/config changes afterward, rerun affected checks and clearly version the results.
5. Verify patch reapplication, artifact completeness, credential exclusion, and repository status.
6. Record the final SHA and attach artifacts required by the official submission process.
7. Push/tag/submit when explicitly requested or otherwise authorized; this planning document does not execute those actions.

Exit: final deliverable and reported evaluation results refer to a clearly identified, verified revision.

## Time allocation for a 24-hour event

| Hours | Work | Required outcome |
|---|---|---|
| 0–2 | Commits 01–03 | Contract, reproducible CLI, model smoke call |
| 2–5 | Commits 04–07 | First autonomous fix |
| 5–8 | Commits 08–10 | Independent evaluation, evidence, recovery |
| 8–12 | Commits 11–13 | Context/budgets and measured baseline |
| 12–16 | Commit 14 and fixes | Address observed failures |
| 16–19 | Commit 15 | Clear results and terminal presentation |
| 19–21 | Commit 16 | Clean-install rehearsal |
| 21–24 | Commits 17–18 | Freeze, final evaluation, documentation/submission |

The timeline is a planning budget, not a guarantee. Small atomic commits may split further. Never postpone the first end-to-end run to complete every abstraction.

## Cut order if time is short

Cut elaborate TUI styling, semantic indexing, persisted resume, adaptive test-impact graphs, and speculative optimization first. Simplify compression to bounded structured state if needed. Reduce benchmark breadth transparently before skipping independent evaluation entirely.

Keep: working entrypoint, model integration, bounded tools, autonomous loop, controlled edits, verification evidence, honest termination, independent scoring, and clean-install rehearsal.

## Optional follow-up commits after the core is stable

- feat: resume interrupted runs after validating workspace state and invalidating stale evidence.
- feat: show evidence timeline and checkpoint comparisons in terminal.
- perf: add symbol-aware repository navigation if localization remains a measured weakness.
- perf: add measured test-impact selection without removing final regression checks.

Each optional feature must have a concrete failure it addresses, a bounded implementation, and a before/after evaluation. No optional feature is required merely for novelty.
