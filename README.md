# Git handoff snapshot

A secret-safe [Rote Play](https://play.modiqo.ai/amaan-playoffs/git-handoff-snapshot@0.1.0) for concise repository handoffs.

It reports the current branch, changed paths, diff statistics, untracked paths, and recent commit metadata. It never reads file contents or patch hunks.

## Run the published Play

Requirements:

- Rote 0.74.0 or newer
- Git 2.30.0 or newer
- A local Git repository with at least one commit

Inspect the exact release before execution:

```sh
rote play inspect amaan-playoffs/git-handoff-snapshot@0.1.0 --json
```

Run it against a local repository:

```sh
rote play run amaan-playoffs/git-handoff-snapshot@0.1.0 \
  repo=/absolute/path/to/repository \
  commit_count=5 \
  --yes
```

The Play prints a readable handoff and a structured JSON result.

## Verify this source

The repository mirrors the published `0.1.0` Play source and its presentation fixtures.

```sh
rote deps check deps.toml
rote play validate main.ts
rote play lint ./main.ts --json
rote play run "$PWD/main.ts" repo="$PWD" commit_count=5
```

`commit_count` defaults to `5`.

