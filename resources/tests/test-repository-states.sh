#!/usr/bin/env bash
set -euo pipefail

play_ref="${1:-amaan-playoffs/git-handoff-snapshot@0.1.0}"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/git-handoff-snapshot.XXXXXX")"
secret_sentinel="DO_NOT_LEAK_CONTENT_8420"

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

git clone -q "$source_repo" "$test_root/detached"
git -C "$test_root/detached" checkout -q --detach HEAD

git clone -q --depth=1 "file://$source_repo" "$test_root/shallow"

git init -q -b feature "$test_root/no-upstream"
configure_git "$test_root/no-upstream"
printf 'independent\n' > "$test_root/no-upstream/tracked.txt"
git -C "$test_root/no-upstream" add tracked.txt
git -C "$test_root/no-upstream" commit -q -m "Add independent baseline"

mkdir -p "$test_root/results"

for state in clean dirty detached shallow no-upstream; do
  output="$test_root/results/$state.txt"
  rote play run "$play_ref" \
    repo="$test_root/$state" \
    commit_count=5 \
    --yes > "$output"

  grep -Eq '^# Git handoff snapshot$' "$output"
  grep -Eq '^Run status: succeeded$' "$output"
  grep -Eq '^Privacy: reads Git metadata and diff statistics only\.' "$output"
  if grep -Fq "$secret_sentinel" "$output"; then
    printf 'FAILED: %s exposed file content\n' "$state" >&2
    exit 1
  fi
  printf 'PASS: %s\n' "$state"
done

grep -Eq '^Branch: main$' "$test_root/results/clean.txt"
grep -Eq '^Branch: main$' "$test_root/results/dirty.txt"
grep -Eq '^Branch: HEAD$' "$test_root/results/detached.txt"
grep -Eq '^Branch: main$' "$test_root/results/shallow.txt"
grep -Eq '^Branch: feature$' "$test_root/results/no-upstream.txt"

grep -Eq '^Staged paths: 1$' "$test_root/results/dirty.txt"
grep -Eq '^Unstaged paths: 1$' "$test_root/results/dirty.txt"
grep -Eq '^Untracked paths: 1$' "$test_root/results/dirty.txt"

printf 'All five repository states passed.\n'
