#!/usr/bin/env bash
set -euo pipefail

play_ref="${1:-$PWD/main.ts}"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/git-handoff-snapshot.XXXXXX")"
secret_sentinel="DO_NOT_LEAK_CONTENT_8420"
consent_args=()
if [[ "$play_ref" != /* && "$play_ref" != ./* && "$play_ref" != *.ts ]]; then
  consent_args=(--yes)
fi

cleanup() {
  if [[ "${KEEP_TEST_ROOT:-0}" == "1" ]]; then
    printf 'Test artifacts: %s\n' "$test_root"
    return
  fi
  rm -rf -- "$test_root"
}
trap cleanup EXIT

configure_git() {
  git -C "$1" config user.name "Play test"
  git -C "$1" config user.email "play-test@example.invalid"
}

source_repo="$test_root/source"
git init -q -b main "$source_repo"
configure_git "$source_repo"
printf 'baseline\n' > "$source_repo/tracked.txt"
git -C "$source_repo" add tracked.txt
git -C "$source_repo" commit -q -m "Add baseline"

git clone -q "$source_repo" "$test_root/clean"

git clone -q "$source_repo" "$test_root/dirty"
configure_git "$test_root/dirty"
printf '%s\n' "$secret_sentinel" >> "$test_root/dirty/tracked.txt"
printf '%s\n' "$secret_sentinel" > "$test_root/dirty/staged.txt"
printf '%s\n' "$secret_sentinel" > "$test_root/dirty/notes.txt"
git -C "$test_root/dirty" add staged.txt
git -C "$test_root/dirty" stash push -q -u -m "Test stash"
printf '%s\n' "$secret_sentinel" >> "$test_root/dirty/tracked.txt"
printf '%s\n' "$secret_sentinel" > "$test_root/dirty/staged.txt"
printf '%s\n' "$secret_sentinel" > "$test_root/dirty/notes.txt"
git -C "$test_root/dirty" add staged.txt

git clone -q "$source_repo" "$test_root/detached"
git -C "$test_root/detached" checkout -q --detach HEAD

git clone -q --depth=1 "file://$source_repo" "$test_root/shallow"

git init -q -b feature "$test_root/no-upstream"
configure_git "$test_root/no-upstream"
printf 'independent\n' > "$test_root/no-upstream/tracked.txt"
git -C "$test_root/no-upstream" add tracked.txt
git -C "$test_root/no-upstream" commit -q -m "Add independent baseline"

git clone -q "$source_repo" "$test_root/ahead"
configure_git "$test_root/ahead"
printf 'ahead\n' > "$test_root/ahead/ahead.txt"
git -C "$test_root/ahead" add ahead.txt
git -C "$test_root/ahead" commit -q -m "Add local commit"

mkdir -p "$test_root/results"

for state in clean dirty detached shallow no-upstream ahead; do
  output="$test_root/results/$state.txt"
  rote play run "$play_ref" \
    repo="$test_root/$state" \
    commit_count=5 \
    "${consent_args[@]}" > "$output"

  grep -Eq '^# Git handoff snapshot$' "$output"
  grep -Eq '^Run status: succeeded$' "$output"
  grep -Eq '^HEAD: [0-9a-f]{40}$' "$output"
  grep -Eq '^Privacy: reads Git metadata and diff statistics only\.' "$output"
  if grep -Fq "$secret_sentinel" "$output"; then
    printf 'FAILED: %s exposed file content\n' "$state" >&2
    exit 1
  fi
  printf 'PASS: %s\n' "$state"
done

grep -Eq '^Branch: main$' "$test_root/results/clean.txt"
grep -Eq '^Sync: In sync with origin/main$' "$test_root/results/clean.txt"
grep -Eq '^Staged: 1 file\(s\), \+1 / -0$' "$test_root/results/dirty.txt"
grep -Eq '^Unstaged: 1 file\(s\), \+1 / -0$' "$test_root/results/dirty.txt"
grep -Eq '^Untracked paths: 1$' "$test_root/results/dirty.txt"
grep -Eq '^Stash entries: 1$' "$test_root/results/dirty.txt"
grep -Eq '^Branch: HEAD$' "$test_root/results/detached.txt"
grep -Eq '^Sync: Detached HEAD \(no branch checked out\)$' "$test_root/results/detached.txt"
grep -Eq '^Branch: feature$' "$test_root/results/no-upstream.txt"
grep -Eq '^Sync: No upstream configured$' "$test_root/results/no-upstream.txt"
grep -Eq '^Sync: 1 ahead of origin/main$' "$test_root/results/ahead.txt"

json_output="$test_root/results/json.txt"
rote play run "$play_ref" \
  repo="$test_root/dirty" \
  commit_count=5 \
  --output=json \
  "${consent_args[@]}" > "$json_output"
python3 - "$json_output" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    data = json.load(handle)

assert data["stash_count"] == 1
assert data["branch"]["name"] == "main"
assert data["privacy"]["reads_file_contents"] is False
assert data["privacy"]["reads_patch_hunks"] is False
assert isinstance(data["input"]["commit_count"], int)
PY

relative_output="$test_root/results/relative.txt"
if rote play run "$play_ref" repo=owner/name commit_count=5 "${consent_args[@]}" > "$relative_output" 2>&1; then
  printf 'FAILED: relative path succeeded\n' >&2
  exit 1
fi
grep -Eq 'repo path must be absolute|Input error' "$relative_output"

nonrepo="$test_root/not-a-repository"
mkdir -p "$nonrepo"
nonrepo_output="$test_root/results/nonrepo.txt"
if rote play run "$play_ref" repo="$nonrepo" commit_count=5 "${consent_args[@]}" > "$nonrepo_output" 2>&1; then
  printf 'FAILED: non-repository path succeeded\n' >&2
  exit 1
fi
grep -Eq 'not inside a Git repository|not a git repository' "$nonrepo_output"

printf 'All six repository states and input failures passed.\n'
