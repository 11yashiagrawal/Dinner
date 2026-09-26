#!/usr/bin/env bash
set -euo pipefail

rehearsal_root="$(mktemp -d)"
trap 'rm -rf "$rehearsal_root"' EXIT

git archive HEAD | tar -x -C "$rehearsal_root"
cd "$rehearsal_root"
bun install --frozen-lockfile
bun run check
make contract
