.PHONY: setup run test check

setup:
	bun install --frozen-lockfile

run:
	bun run src/cli.ts run $(ARGS)

test:
	bun test

check:
	bun run check
