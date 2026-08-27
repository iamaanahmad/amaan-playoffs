# Git handoff snapshot

A secret-safe [Rote Play](https://play.modiqo.ai/amaan-playoffs/git-handoff-snapshot@0.2.0) for concise repository handoffs.

It reports HEAD, branch sync, changed paths, numeric diff totals, conflicts, stashes, and recent commit metadata. It never reads file contents or patch hunks.

## Run the published Play

Requirements:

- Rote 0.74.0 or newer
- Git 2.30.0 or newer
- A local Git repository with at least one commit

Inspect the exact release before execution:

```sh
rote play inspect amaan-playoffs/git-handoff-snapshot@0.2.0 --json
```

Run it against a local repository:

```sh
rote play run amaan-playoffs/git-handoff-snapshot@0.2.0 \
  repo=/absolute/path/to/repository \
  commit_count=5 \
  --yes
```

The `repo` value must be an absolute path to a local checkout. Values such as `owner/name` and `.` fail with one clear input error.

The Play prints a readable handoff and a structured JSON result. `commit_count` is an integer and defaults to `5`.

## Example handoff

A repository with staged, unstaged, and untracked changes produces a handoff like this:

```text
# Git handoff snapshot
Repository: /work/repository
Branch: main
HEAD: 8ec1081d8cdbdb7809b0315a5107c725bd8a7a3f
Sync: In sync with origin/main
Run status: succeeded

## Working tree
- `A ` staged.txt
- ` M` tracked.txt
- `??` notes.txt

## Recent commits
- `8ec1081` 2026-08-27T17:44:39Z Play test: Add baseline

Staged: 1 file(s), +1 / -0
Unstaged: 1 file(s), +1 / -0
Untracked paths: 1
Conflicted paths: 0
Stash entries: 1

Privacy: reads Git metadata and diff statistics only. It does not read file contents or patch hunks.
```

## Verify this source

The repository mirrors the published `0.2.0` Play source and its presentation fixtures.

```sh
rote deps check deps.toml
rote play validate main.ts
rote play lint ./main.ts --json
rote play run "$PWD/main.ts" repo="$PWD" commit_count=5
```

Test the Play across clean, dirty, detached, shallow, no-upstream, and ahead repositories. The same test covers bad paths and JSON output.

```sh
resources/tests/test-repository-states.sh
```
