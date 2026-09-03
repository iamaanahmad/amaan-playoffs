#!/usr/bin/env bash
set -euo pipefail

repo_path="${1:-}"
commit_count="${2:-}"

if [[ ! "$commit_count" =~ ^[0-9]+$ ]] || (( 10#$commit_count < 1 || 10#$commit_count > 20 )); then
  printf '%s\n' 'commit_count must be an integer from 1 through 20.' >&2
  exit 64
fi

if [[ -z "$repo_path" ]]; then
  printf '%s\n' 'The repo path is required. Pass an absolute local checkout path.' >&2
  exit 64
fi

if [[ "$repo_path" != /* ]]; then
  printf 'The repo path must be absolute: %s\n' "$repo_path" >&2
  printf '%s\n' 'Pass a local checkout path such as /Users/me/src/my-repo, not owner/name or .' >&2
  exit 64
fi

exec git -C "$repo_path" rev-parse --show-toplevel
