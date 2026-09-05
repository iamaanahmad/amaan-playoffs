# Git handoff snapshot

A secret-safe [Rote Play](https://play.modiqo.ai/amaan-playoffs/git-handoff-snapshot@0.2.3) for concise repository handoffs.

It reports HEAD, last-fetched branch state, changed paths, numeric diff totals, conflicts, stashes, and recent commit metadata.

Git reads local repository data to calculate these values. The Play does not output file contents or patch hunks.

Its output can include repository paths, path names, author names, and commit subjects. Review the handoff before sharing it.

## Judge this in 60 seconds

Inspect the exact release:

```sh
rote play inspect https://play.modiqo.ai/amaan-playoffs/git-handoff-snapshot@0.2.3 --json
```

Run it against any local checkout:

```sh
rote play run https://play.modiqo.ai/amaan-playoffs/git-handoff-snapshot@0.2.3 \
  repo=/absolute/path/to/repository \
  commit_count=5 \
  --yes
```

Check four proof points in the result:

- Sync uses the last-fetched tracking reference. The Play does not fetch a remote.
- Unicode paths stay readable. Markdown-like metadata stays inert in the readable handoff.
- The privacy note states what Git reads and what the Play outputs.
- The readiness verdict gives one safe next action.

## Run the published Play

Requirements:

- Rote 0.74.0 or newer
- Git 2.30.0 or newer
- A local Git repository with at least one commit

Inspect the exact release before execution:

```sh
rote play inspect amaan-playoffs/git-handoff-snapshot@0.2.3 --json
```

Run it against a local repository:

```sh
rote play run amaan-playoffs/git-handoff-snapshot@0.2.3 \
  repo=/absolute/path/to/repository \
  commit_count=5 \
  --yes
```

The `repo` value must be an absolute path to a local checkout. Values such as `owner/name` and `.` fail with one clear input error.

The Play prints a readable handoff and a structured JSON result. `commit_count` defaults to `5` and accepts `1` through `20`.

Run it before an agent handoff, after returning to a branch, or before code review.

## Example handoff

A repository with staged, unstaged, and untracked changes produces a handoff like this:

```text
# Git handoff snapshot
Repository: `/work/repository`
Branch: `main`
HEAD: `8ec1081d8cdbdb7809b0315a5107c725bd8a7a3f`
Sync: Matches last-fetched `origin/main`
Remote fetch: Not performed
Run status: succeeded

## Working tree
- `A ` `staged.txt`
- ` M` `tracked.txt`
- `??` `notes.txt`

## Recent commits
- `8ec1081` 2026-08-27T17:44:39Z `Play test`: `Add baseline`

Staged: 1 file(s), +1 / -0
Unstaged: 1 file(s), +1 / -0
Untracked paths: 1
Conflicted paths: 0
Stash entries: 1

Handoff readiness: READY
Next action: Review the listed paths, then share this handoff.

Privacy: Git reads local repository data to calculate metadata and numeric diff totals. Output excludes file contents and patch hunks.
```

## Verify this source

The repository mirrors the published `0.2.3` Play source and its presentation fixtures.

```sh
rote deps check deps.toml
rote play validate main.ts
rote play lint ./main.ts --json
rote play run "$PWD/main.ts" repo="$PWD" commit_count=5
```

The regression suite covers old and new repository states, unsafe metadata, input bounds, and JSON output.

```sh
resources/tests/test-repository-states.sh
```

## Support

For bugs or feature requests, [open a GitHub issue](https://github.com/iamaanahmad/amaan-playoffs/issues). For private questions, email [iamaanshaikh@cit.org.in](mailto:iamaanshaikh@cit.org.in).
