.PHONY: setup runner-image run benchmark test test-docker contract rehearse-clean check

setup:
	bun install --frozen-lockfile

runner-image:
	docker build --file docker/runner.Dockerfile --tag dinner-runner:0.1.0 .

run:
	bun run src/cli.ts run $(ARGS)

benchmark:
	bun run src/benchmark/cli.ts evaluate $(ARGS)

test:
	bun test

test-docker:
	DINNER_DOCKER_INTEGRATION=1 bun test tests/docker-runner.integration.test.ts tests/benchmark-runner.integration.test.ts

contract:
	bun test tests/execution-contract.test.ts

rehearse-clean:
	bash scripts/rehearse-clean-install.sh

check:
	bun run check
