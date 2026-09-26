#!/usr/bin/env bash
set -euo pipefail

mode="${1:-verified}"
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
demo_root="$(mktemp -d)"
target_repo="$demo_root/target"
output_path="$demo_root/run"
cp -R "$repo_root/benchmarks/tasks/ts-add/fixture" "$target_repo"
git -C "$target_repo" init --quiet
git -C "$target_repo" add .
git -C "$target_repo" -c user.name=Demo -c user.email=demo@example.invalid commit --quiet -m fixture

case "$mode" in
  verified)
    script="$repo_root/examples/demo-scripts/verified-ts-add.json"
    ;;
  partial)
    script="$repo_root/examples/demo-scripts/honest-partial.json"
    ;;
  *)
    echo "Usage: scripts/demo.sh [verified|partial]" >&2
    exit 2
    ;;
esac

set +e
bun run "$repo_root/src/cli.ts" run \
  --repo "$target_repo" \
  --task "Fix add() so it returns the arithmetic sum." \
  --model-script "$script" \
  --output "$output_path" \
  --color disabled
exit_code=$?
set -e

echo "Demo status code: $exit_code"
echo "Artifacts: $output_path"
cat "$output_path/report.md"

if [[ "$mode" == "verified" && "$exit_code" -ne 0 ]]; then exit "$exit_code"; fi
if [[ "$mode" == "partial" && "$exit_code" -ne 3 ]]; then exit "$exit_code"; fi
