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

clone_and_configure() {
  git clone -q "$source_repo" "$test_root/$1"
  configure_git "$test_root/$1"
}

source_repo="$test_root/source"
git init -q -b main "$source_repo"
configure_git "$source_repo"
git -C "$source_repo" config receive.denyCurrentBranch updateInstead
printf 'baseline\n' > "$source_repo/tracked.txt"
git -C "$source_repo" add tracked.txt
git -C "$source_repo" commit -q -m "Add baseline"

for state in clean dirty detached ahead stale behind diverged gone-upstream conflict unicode markdown; do
  clone_and_configure "$state"
done

printf '%s\n' "$secret_sentinel" >> "$test_root/dirty/tracked.txt"
printf '%s\n' "$secret_sentinel" > "$test_root/dirty/staged.txt"
printf '%s\n' "$secret_sentinel" > "$test_root/dirty/notes.txt"
git -C "$test_root/dirty" add staged.txt
git -C "$test_root/dirty" stash push -q -u -m "Test stash"
printf '%s\n' "$secret_sentinel" >> "$test_root/dirty/tracked.txt"
printf '%s\n' "$secret_sentinel" > "$test_root/dirty/staged.txt"
printf '%s\n' "$secret_sentinel" > "$test_root/dirty/notes.txt"
git -C "$test_root/dirty" add staged.txt

git -C "$test_root/detached" checkout -q --detach HEAD

git clone -q --depth=1 "file://$source_repo" "$test_root/shallow"
configure_git "$test_root/shallow"

git init -q -b feature "$test_root/no-upstream"
configure_git "$test_root/no-upstream"
printf 'independent\n' > "$test_root/no-upstream/tracked.txt"
git -C "$test_root/no-upstream" add tracked.txt
git -C "$test_root/no-upstream" commit -q -m "Add independent baseline"

printf 'ahead\n' > "$test_root/ahead/ahead.txt"
git -C "$test_root/ahead" add ahead.txt
git -C "$test_root/ahead" commit -q -m "Add local commit"

printf 'diverged\n' > "$test_root/diverged/diverged.txt"
git -C "$test_root/diverged" add diverged.txt
git -C "$test_root/diverged" commit -q -m "Add diverged local commit"

clone_and_configure publisher
printf 'remote advance\n' > "$test_root/publisher/remote.txt"
git -C "$test_root/publisher" add remote.txt
git -C "$test_root/publisher" commit -q -m "Advance remote"
git -C "$test_root/publisher" push -q origin main

git -C "$test_root/behind" fetch -q origin
git -C "$test_root/diverged" fetch -q origin
git -C "$test_root/gone-upstream" update-ref -d refs/remotes/origin/main

git -C "$test_root/conflict" checkout -q -b side
printf 'side\n' > "$test_root/conflict/tracked.txt"
git -C "$test_root/conflict" commit -qam "Change on side"
git -C "$test_root/conflict" checkout -q main
printf 'main\n' > "$test_root/conflict/tracked.txt"
git -C "$test_root/conflict" commit -qam "Change on main"
if git -C "$test_root/conflict" merge -q side > /dev/null 2>&1; then
  printf 'FAILED: conflict fixture merged cleanly\n' >&2
  exit 1
fi

unicode_path="ünicode-路径.txt"
printf 'unicode fixture\n' > "$test_root/unicode/$unicode_path"

markdown_path='![judge](link).txt'
markdown_author='![author](https://example.invalid/author)'
markdown_subject='![subject](https://example.invalid/subject)'
printf 'markdown fixture\n' > "$test_root/markdown/$markdown_path"
printf 'metadata fixture\n' > "$test_root/markdown/metadata.txt"
git -C "$test_root/markdown" add metadata.txt
git -C "$test_root/markdown" -c user.name="$markdown_author" -c user.email=play-test@example.invalid commit -q -m "$markdown_subject"

mkdir -p "$test_root/results"

states=(clean dirty detached shallow no-upstream ahead stale behind diverged gone-upstream conflict unicode markdown)

for state in "${states[@]}"; do
  output="$test_root/results/$state.txt"
  rote play run "$play_ref" \
    repo="$test_root/$state" \
    commit_count=5 \
    "${consent_args[@]}" > "$output"

  grep -Eq '^# Git handoff snapshot$' "$output"
  grep -Eq '^Run status: succeeded$' "$output"
  grep -Eq '^HEAD: `[0-9a-f]{40}`$' "$output"
  grep -Fq 'Remote fetch: Not performed' "$output"
  grep -Fq 'Privacy: Git reads local repository data to calculate metadata and numeric diff totals. Output excludes file contents and patch hunks.' "$output"
  grep -Eq '^Handoff readiness: (READY|ATTENTION|BLOCKED)$' "$output"
  grep -Eq '^Next action: .+$' "$output"
  if grep -Fq "$secret_sentinel" "$output"; then
    printf 'FAILED: %s exposed file content\n' "$state" >&2
    exit 1
  fi
  printf 'PASS: %s\n' "$state"
done

grep -Fq 'Branch: `main`' "$test_root/results/clean.txt"
grep -Fq 'Sync: Matches last-fetched `origin/main`' "$test_root/results/clean.txt"
grep -Eq '^Handoff readiness: READY$' "$test_root/results/clean.txt"
grep -Eq '^Staged: 1 file\(s\), \+1 / -0$' "$test_root/results/dirty.txt"
grep -Eq '^Unstaged: 1 file\(s\), \+1 / -0$' "$test_root/results/dirty.txt"
grep -Eq '^Untracked paths: 1$' "$test_root/results/dirty.txt"
grep -Eq '^Stash entries: 1$' "$test_root/results/dirty.txt"
grep -Fq 'Branch: `HEAD`' "$test_root/results/detached.txt"
grep -Eq '^Sync: Detached HEAD \(no branch checked out\)$' "$test_root/results/detached.txt"
grep -Eq '^Handoff readiness: ATTENTION$' "$test_root/results/detached.txt"
grep -Fq 'Branch: `feature`' "$test_root/results/no-upstream.txt"
grep -Eq '^Sync: No upstream configured$' "$test_root/results/no-upstream.txt"
grep -Fq 'Sync: Compared with last-fetched `origin/main`: 1 ahead' "$test_root/results/ahead.txt"
grep -Fq 'Sync: Matches last-fetched `origin/main`' "$test_root/results/stale.txt"
grep -Fq 'Sync: Compared with last-fetched `origin/main`: 1 behind' "$test_root/results/behind.txt"
grep -Fq 'Sync: Compared with last-fetched `origin/main`: 1 ahead, 1 behind' "$test_root/results/diverged.txt"
grep -Fq 'Sync: Last-fetched upstream `origin/main` is gone' "$test_root/results/gone-upstream.txt"
grep -Eq '^Conflicted paths: 1$' "$test_root/results/conflict.txt"
grep -Eq '^Handoff readiness: BLOCKED$' "$test_root/results/conflict.txt"
grep -Fq "\`$unicode_path\`" "$test_root/results/unicode.txt"
if grep -Fq '\\303' "$test_root/results/unicode.txt"; then
  printf 'FAILED: Unicode path was escaped\n' >&2
  exit 1
fi
grep -Fq "\`$markdown_path\`" "$test_root/results/markdown.txt"
grep -Fq "\`$markdown_author\`: \`$markdown_subject\`" "$test_root/results/markdown.txt"

stale_tracking="$(git -C "$test_root/stale" rev-parse refs/remotes/origin/main)"
remote_head="$(git ls-remote "$source_repo" refs/heads/main | cut -f1)"
if [[ "$stale_tracking" == "$remote_head" ]]; then
  printf 'FAILED: stale fixture is not stale\n' >&2
  exit 1
fi

for state in "${states[@]}"; do
  json_output="$test_root/results/$state.json"
  rote play run "$play_ref" \
    repo="$test_root/$state" \
    commit_count=5 \
    --output=json \
    "${consent_args[@]}" > "$json_output"

  if grep -Fq "$secret_sentinel" "$json_output"; then
    printf 'FAILED: %s JSON exposed file content\n' "$state" >&2
    exit 1
  fi

  python3 - "$json_output" "$state" "$unicode_path" "$markdown_path" "$markdown_author" "$markdown_subject" <<'PY'
import json
import re
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    data = json.load(handle)

state, unicode_path, markdown_path, markdown_author, markdown_subject = sys.argv[2:]
assert data["run_status"] == "succeeded"
assert re.fullmatch(r"[0-9a-f]{40}", data["head"])
assert data["branch"]["comparison_basis"] == "last_fetched_tracking_reference"
assert data["branch"]["remote_fetch_performed"] is False
assert data["privacy"]["git_reads_local_repository_data"] is True
assert data["privacy"]["outputs_file_contents"] is False
assert data["privacy"]["outputs_patch_hunks"] is False
assert data["privacy"]["writes_repository"] is False
assert isinstance(data["input"]["commit_count"], int)
assert isinstance(data["readiness"]["next_action"], str)
assert data["readiness"]["next_action"]

expected_verdict = {
    "clean": "ready",
    "dirty": "ready",
    "detached": "attention",
    "shallow": "ready",
    "no-upstream": "attention",
    "ahead": "ready",
    "stale": "ready",
    "behind": "attention",
    "diverged": "attention",
    "gone-upstream": "attention",
    "conflict": "blocked",
    "unicode": "ready",
    "markdown": "ready",
}
assert data["readiness"]["verdict"] == expected_verdict[state]

if state == "dirty":
    assert data["stash_count"] == 1
    assert data["branch"]["name"] == "main"
    assert len(data["changes"]["staged"]) == 1
    assert len(data["changes"]["unstaged"]) == 1
    assert len(data["changes"]["untracked"]) == 1
elif state == "detached":
    assert data["branch"]["detached"] is True
elif state == "no-upstream":
    assert data["branch"]["name"] == "feature"
    assert data["branch"]["upstream"] is None
elif state == "ahead":
    assert data["branch"]["ahead"] == 1
elif state == "behind":
    assert data["branch"]["behind"] == 1
elif state == "diverged":
    assert data["branch"]["ahead"] == 1
    assert data["branch"]["behind"] == 1
elif state == "gone-upstream":
    assert data["branch"]["upstream_gone"] is True
elif state == "conflict":
    assert len(data["changes"]["conflicted"]) == 1
elif state == "unicode":
    assert unicode_path in data["changes"]["untracked"]
elif state == "markdown":
    assert markdown_path in data["changes"]["untracked"]
    assert data["recent_commits"][0]["author"] == markdown_author
    assert data["recent_commits"][0]["subject"] == markdown_subject
PY
  printf 'PASS: %s JSON\n' "$state"
done

for valid_count in 1 20; do
  rote play run "$play_ref" repo="$test_root/clean" commit_count="$valid_count" "${consent_args[@]}" > /dev/null
  printf 'PASS: commit_count=%s\n' "$valid_count"
done

for invalid_count in 0 21; do
  bounds_output="$test_root/results/commit-count-$invalid_count.txt"
  if rote play run "$play_ref" repo="$test_root/clean" commit_count="$invalid_count" "${consent_args[@]}" > "$bounds_output" 2>&1; then
    printf 'FAILED: commit_count=%s succeeded\n' "$invalid_count" >&2
    exit 1
  fi
  grep -Fq 'commit_count must be an integer from 1 through 20.' "$bounds_output"
  printf 'PASS: commit_count=%s rejected\n' "$invalid_count"
done

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

printf 'All repository states, rendering cases, bounds, and input failures passed.\n'
