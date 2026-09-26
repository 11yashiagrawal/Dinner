.PHONY: setup runner-image run test test-docker check

setup:
	bun install --frozen-lockfile

runner-image:
	docker build --file docker/runner.Dockerfile --tag dinner-runner:0.1.0 .

run:
	bun run src/cli.ts run $(ARGS)

test:
	bun test

test-docker:
	DINNER_DOCKER_INTEGRATION=1 bun test tests/docker-runner.integration.test.ts

check:
	bun run check
