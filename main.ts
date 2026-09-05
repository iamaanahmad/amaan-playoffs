#!/usr/bin/env -S rote play run
/**
 * Git Handoff Snapshot
 *
 * Produces a compact Git handoff without outputting file contents or patch hunks.
 *
 * @rote-frontmatter
 * ---
 * name: git-handoff-snapshot
 * description: Creates a compact Git handoff with branch, last-fetched upstream state, changed paths, numeric diff totals, stash count, and recent commit metadata without outputting file contents or patch hunks.
 * source: https://git-scm.com/docs/git
 * provenance:
 *   author: Tin Computer
 * parameters:
 * - name: repo
 *   param_type: string
 *   required: true
 *   description: Absolute path to a local Git checkout on this machine (not a GitHub owner/name). Registry runs do not inherit your shell's working directory, so pass the full path rather than '.'. The run fails with a clear error when the path does not exist or is not inside a Git repository.
 *   example: /Users/me/src/my-repo
 *   input:
 *     label: Local repository path
 * - name: commit_count
 *   param_type: integer
 *   required: false
 *   default: '5'
 *   description: Number of most recent commits to include. Accepted range is 1 through 20.
 *   example: '10'
 *   input:
 *     label: Recent commit count
 *     choices:
 *     - label: '5'
 *       value: '5'
 *     - label: '10'
 *       value: '10'
 *     - label: '20'
 *       value: '20'
 *     allow_custom: true
 * metadata:
 *   rote_version: 0.74.0
 *   version: 0.2.3
 *   status: released
 *   kind: atomic
 *   flow_type: parallel
 *   execution_model: steps_with_presentation
 *   format: typescript
 *   contract:
 *     atomic: true
 *     input:
 *       type: none
 *     output:
 *       format: json
 *       destination: stdout
 *     composable: true
 *   requires_endpoints: []
 *   requires_sessions: false
 *   discoverability:
 *     tags:
 *     - git
 *     - handoff
 *     - repository
 *     - worktree
 *     - status
 *     - agent-handoff
 *     - developer-tools
 *     - typescript
 * presentation_fixtures:
 *   repo_root: resources/presentation-fixtures/repo_root/fixture.yaml
 *   head_sha: resources/presentation-fixtures/head_sha/fixture.yaml
 *   worktree_status: resources/presentation-fixtures/worktree_status/fixture.yaml
 *   recent_commits: resources/presentation-fixtures/recent_commits/fixture.yaml
 *   unstaged_numstat: resources/presentation-fixtures/unstaged_numstat/fixture.yaml
 *   staged_numstat: resources/presentation-fixtures/staged_numstat/fixture.yaml
 *   stash_list: resources/presentation-fixtures/stash_list/fixture.yaml
 *   remote_list: resources/presentation-fixtures/remote_list/fixture.yaml
 * steps:
 *   repo_root:
 *     type: process.exec
 *     argv:
 *     - bash
 *     - '@resource{validate-repo-path.sh}'
 *     - $repo
 *     - $commit_count
 *   head_sha:
 *     type: process.exec
 *     depends_on:
 *     - repo_root
 *     argv:
 *     - git
 *     - -C
 *     - $repo
 *     - rev-parse
 *     - --verify
 *     - HEAD
 *   worktree_status:
 *     type: process.exec
 *     depends_on:
 *     - repo_root
 *     argv:
 *     - git
 *     - -c
 *     - color.ui=never
 *     - -c
 *     - core.quotePath=false
 *     - -C
 *     - $repo
 *     - --no-optional-locks
 *     - status
 *     - --porcelain=v1
 *     - --branch
 *   recent_commits:
 *     type: process.exec
 *     depends_on:
 *     - repo_root
 *     argv:
 *     - git
 *     - -c
 *     - color.ui=never
 *     - -C
 *     - $repo
 *     - log
 *     - --date=iso-strict
 *     - --format=%h%x09%H%x09%ad%x09%an%x09%s
 *     - -n
 *     - $commit_count
 *   unstaged_numstat:
 *     type: process.exec
 *     depends_on:
 *     - repo_root
 *     argv:
 *     - git
 *     - -c
 *     - color.ui=never
 *     - -c
 *     - core.quotePath=false
 *     - -C
 *     - $repo
 *     - --no-optional-locks
 *     - diff
 *     - --numstat
 *   staged_numstat:
 *     type: process.exec
 *     depends_on:
 *     - repo_root
 *     argv:
 *     - git
 *     - -c
 *     - color.ui=never
 *     - -c
 *     - core.quotePath=false
 *     - -C
 *     - $repo
 *     - --no-optional-locks
 *     - diff
 *     - --cached
 *     - --numstat
 *   stash_list:
 *     type: process.exec
 *     depends_on:
 *     - repo_root
 *     argv:
 *     - git
 *     - -c
 *     - color.ui=never
 *     - -C
 *     - $repo
 *     - stash
 *     - list
 *     - --format=%gd
 *   remote_list:
 *     type: process.exec
 *     depends_on:
 *     - repo_root
 *     argv:
 *     - git
 *     - -c
 *     - color.ui=never
 *     - -C
 *     - $repo
 *     - remote
 * ---
 */

const {
  FlowOutput,
  isProcessExecBody,
  loadPresentationContext,
  stepName,
} = await import("__ROTE_PRESENTATION_SDK__");

const out = new FlowOutput();
const ctx = await loadPresentationContext();

type StepStatus = "completed" | "restored" | "failed" | "skipped" | "blocked";

type ProcessObservation = {
  status: StepStatus;
  ok: boolean;
  stdout: string;
  stderr: string;
  message: string | null;
};

// Never throws: a partial run still renders whatever evidence exists, and the
// step table tells the reader exactly which git call did not contribute.
function readProcess(step: ReturnType<typeof ctx.step>): ProcessObservation {
  const outcome = step.outcome;
  switch (outcome.status) {
    case "completed":
    case "restored": {
      const body = outcome.output.body;
      if (!isProcessExecBody(body)) {
        return { status: outcome.status, ok: false, stdout: "", stderr: "", message: "no process.exec observation recorded" };
      }
      const exit = body.status.exit;
      const ok = exit.kind === "code" && exit.code === 0;
      const stderr = body.stderr?.text ?? "";
      return {
        status: outcome.status,
        ok,
        stdout: body.stdout?.text ?? "",
        stderr,
        message: ok ? null : (stderr.trim() || `exit ${exit.kind === "code" ? exit.code : exit.kind}`),
      };
    }
    case "failed":
      return { status: "failed", ok: false, stdout: "", stderr: "", message: outcome.output.message };
    case "skipped":
      return { status: "skipped", ok: false, stdout: "", stderr: "", message: outcome.output.reason };
    case "blocked":
      return { status: "blocked", ok: false, stdout: "", stderr: "", message: outcome.output.reason };
  }
}

function lines(text: string): string[] {
  return text.split("\n").map((line) => line.trimEnd()).filter((line) => line.length > 0);
}

const STEPS = [
  "repo_root",
  "head_sha",
  "worktree_status",
  "recent_commits",
  "unstaged_numstat",
  "staged_numstat",
  "stash_list",
  "remote_list",
] as const;
type Step = (typeof STEPS)[number];

const obs: Record<Step, ProcessObservation> = {
  repo_root: readProcess(ctx.step(stepName("repo_root"))),
  head_sha: readProcess(ctx.step(stepName("head_sha"))),
  worktree_status: readProcess(ctx.step(stepName("worktree_status"))),
  recent_commits: readProcess(ctx.step(stepName("recent_commits"))),
  unstaged_numstat: readProcess(ctx.step(stepName("unstaged_numstat"))),
  staged_numstat: readProcess(ctx.step(stepName("staged_numstat"))),
  stash_list: readProcess(ctx.step(stepName("stash_list"))),
  remote_list: readProcess(ctx.step(stepName("remote_list"))),
};

const requestedRepo = String(ctx.params.repo ?? "");

// --- Input validation -------------------------------------------------------
// The gate step is `git -C $repo rev-parse --show-toplevel`. Its stderr is the
// only reliable signal for "path missing" vs "not a repository"; every other
// step is blocked on it so a bad input produces one error, not seven.
type InputProblem = { kind: "invalid_commit_count" | "missing_path" | "not_a_repository" | "git_error"; detail: string };

function classifyInput(root: ProcessObservation): InputProblem | null {
  if (root.ok) return null;
  const detail = (root.message ?? "").trim();
  if (/commit_count must be/i.test(detail)) return { kind: "invalid_commit_count", detail };
  if (/cannot change to/i.test(detail)) return { kind: "missing_path", detail };
  if (/not a git repository/i.test(detail)) return { kind: "not_a_repository", detail };
  return { kind: "git_error", detail: detail || `repo_root ${root.status}` };
}

const inputProblem = classifyInput(obs.repo_root);

// --- Parsing ------------------------------------------------------------------
const repoRoot = obs.repo_root.stdout.trim() || null;
const headSha = obs.head_sha.stdout.trim() || null;

const statusLines = lines(obs.worktree_status.stdout);
const branchHeader = statusLines.find((line) => line.startsWith("## "))?.slice(3) ?? "";

type BranchState = {
  name: string | null;
  detached: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  gone: boolean;
};

function parseBranchHeader(header: string): BranchState {
  const state: BranchState = { name: null, detached: false, upstream: null, ahead: 0, behind: 0, gone: false };
  if (!header) return state;
  if (/^HEAD \(no branch\)/.test(header) || /^No commits yet on /.test(header)) {
    state.detached = /^HEAD/.test(header);
    state.name = header.replace(/^No commits yet on /, "").replace(/^HEAD \(no branch\)$/, "HEAD") || null;
    return state;
  }
  const bracket = header.match(/\[(.*)\]\s*$/);
  const head = bracket ? header.slice(0, bracket.index).trim() : header.trim();
  const [local, upstream] = head.split("...");
  state.name = local || null;
  state.upstream = upstream || null;
  if (bracket) {
    const ahead = bracket[1].match(/ahead (\d+)/);
    const behind = bracket[1].match(/behind (\d+)/);
    state.ahead = ahead ? Number(ahead[1]) : 0;
    state.behind = behind ? Number(behind[1]) : 0;
    state.gone = /\bgone\b/.test(bracket[1]);
  }
  return state;
}

const branch = parseBranchHeader(branchHeader);

type ChangedPath = { code: string; path: string; original_path: string | null };

// Porcelain v1: `XY path` or `XY orig -> path` for renames/copies.
const changedPaths: ChangedPath[] = statusLines
  .filter((line) => !line.startsWith("## "))
  .map((line) => {
    const code = line.slice(0, 2);
    const rest = line.slice(3);
    const arrow = rest.indexOf(" -> ");
    if (arrow >= 0 && /[RC]/.test(code)) {
      return { code, path: rest.slice(arrow + 4), original_path: rest.slice(0, arrow) };
    }
    return { code, path: rest, original_path: null };
  });

const untracked = changedPaths.filter((item) => item.code === "??");
const staged = changedPaths.filter((item) => item.code !== "??" && item.code[0] !== " ");
const unstaged = changedPaths.filter((item) => item.code !== "??" && item.code[1] !== " ");
const conflicted = changedPaths.filter((item) => /^(DD|AU|UD|UA|DU|AA|UU)$/.test(item.code));

type NumStat = { path: string; added: number | null; deleted: number | null; binary: boolean };

function parseNumstat(text: string): NumStat[] {
  return lines(text).map((line) => {
    const [a = "", d = "", ...rest] = line.split("\t");
    const binary = a === "-" || d === "-";
    return {
      path: rest.join("\t"),
      added: binary ? null : Number(a),
      deleted: binary ? null : Number(d),
      binary,
    };
  });
}

function totals(stats: NumStat[]) {
  return stats.reduce(
    (acc, s) => ({ files: acc.files + 1, added: acc.added + (s.added ?? 0), deleted: acc.deleted + (s.deleted ?? 0) }),
    { files: 0, added: 0, deleted: 0 },
  );
}

const unstagedStat = parseNumstat(obs.unstaged_numstat.stdout);
const stagedStat = parseNumstat(obs.staged_numstat.stdout);
const unstagedTotals = totals(unstagedStat);
const stagedTotals = totals(stagedStat);
const stashCount = lines(obs.stash_list.stdout).length;
const remotes = lines(obs.remote_list.stdout);

const recentCommits = lines(obs.recent_commits.stdout).map((line) => {
  const [short_sha = "", sha = "", date = "", author = "", ...subjectParts] = line.split("\t");
  return { short_sha, sha, date, author, subject: subjectParts.join("\t") };
});

const stepStatuses = Object.fromEntries(
  STEPS.map((name) => [name, obs[name].ok ? obs[name].status : `${obs[name].status}: ${obs[name].message ?? ""}`.trim()]),
) as Record<Step, string>;

const failedSteps = STEPS.filter((name) => !obs[name].ok);

// --- Rendering ----------------------------------------------------------------
function inlineCode(value: string): string {
  const longestRun = Math.max(0, ...Array.from(value.matchAll(/`+/g), (match) => match[0].length));
  const fence = "`".repeat(longestRun + 1);
  const padding = value.startsWith("`") || value.endsWith("`") ? " " : "";
  return `${fence}${padding}${value}${padding}${fence}`;
}

function describeInputProblem(problem: InputProblem): string {
  switch (problem.kind) {
    case "invalid_commit_count":
      return problem.detail;
    case "missing_path":
      return `The \`repo\` path ${inlineCode(requestedRepo)} does not exist on this machine. Pass a local checkout path, not a GitHub \`owner/name\`.`;
    case "not_a_repository":
      return `The \`repo\` path ${inlineCode(requestedRepo)} exists but is not inside a Git repository. Pass the absolute path of a checkout.`;
    case "git_error":
      return `Git could not inspect ${inlineCode(requestedRepo)}: ${problem.detail}`;
  }
}

function syncLine(state: BranchState, configuredRemotes: string[]): string {
  if (state.detached) return "Detached HEAD (no branch checked out)";
  if (!state.upstream && configuredRemotes.length === 0) return "Local-only repository (no remotes configured)";
  if (!state.upstream) return "No upstream configured";
  if (state.gone) return `Last-fetched upstream ${inlineCode(state.upstream)} is gone`;
  if (state.ahead === 0 && state.behind === 0) return `Matches last-fetched ${inlineCode(state.upstream)}`;
  const parts: string[] = [];
  if (state.ahead > 0) parts.push(`${state.ahead} ahead`);
  if (state.behind > 0) parts.push(`${state.behind} behind`);
  return `Compared with last-fetched ${inlineCode(state.upstream)}: ${parts.join(", ")}`;
}

function pathLines(items: ChangedPath[]): string {
  if (items.length === 0) return "- None";
  return items
    .map((item) => `- ${inlineCode(item.code)} ${item.original_path ? `${inlineCode(item.original_path)} -> ` : ""}${inlineCode(item.path)}`)
    .join("\n");
}

function statLine(label: string, t: { files: number; added: number; deleted: number }): string {
  return `${label}: ${t.files} file(s), +${t.added} / -${t.deleted}`;
}

type ReadinessVerdict = "ready" | "attention" | "blocked";
type Readiness = { verdict: ReadinessVerdict; reasons: string[]; next_action: string };

function assessReadiness(): Readiness {
  if (inputProblem || failedSteps.length > 0) {
    return {
      verdict: "blocked",
      reasons: inputProblem ? [inputProblem.kind] : failedSteps.map((name) => `failed_step:${name}`),
      next_action: "Fix the failed Git checks, then rerun this Play.",
    };
  }
  if (conflicted.length > 0) {
    return { verdict: "blocked", reasons: ["conflicted_paths"], next_action: "Resolve the conflicted paths before handing off." };
  }
  if (branch.gone) {
    return { verdict: "attention", reasons: ["upstream_gone"], next_action: "Confirm or replace the missing upstream before handing off." };
  }
  if (branch.behind > 0) {
    return { verdict: "attention", reasons: ["behind_last_fetched_upstream"], next_action: "Review the last-fetched upstream changes before handing off." };
  }
  if (branch.detached) {
    return { verdict: "attention", reasons: ["detached_head"], next_action: "Record why HEAD is detached before handing off." };
  }
  if (!branch.upstream) {
    if (remotes.length === 0) {
      if (changedPaths.length > 0) {
        return { verdict: "ready", reasons: ["local_changes_present"], next_action: "Review the listed paths, then share this handoff." };
      }
      return {
        verdict: "ready",
        reasons: ["local_only_repository"],
        next_action: "Share this local-only snapshot. Add a remote only if collaboration needs one.",
      };
    }
    return { verdict: "attention", reasons: ["no_upstream"], next_action: "Name the intended upstream branch in the handoff." };
  }
  if (changedPaths.length > 0) {
    return { verdict: "ready", reasons: ["local_changes_present"], next_action: "Review the listed paths, then share this handoff." };
  }
  return { verdict: "ready", reasons: ["clean_worktree"], next_action: "Share this snapshot with the next developer or agent." };
}

const readiness = assessReadiness();

const human: string[] = ["# Git handoff snapshot"];

if (inputProblem) {
  human.push(
    "",
    `**Input error:** ${describeInputProblem(inputProblem)}`,
    "",
    `Run status: ${ctx.run.status}`,
    `Handoff readiness: ${readiness.verdict.toUpperCase()}`,
    `Next action: ${readiness.next_action}`,
  );
} else {
  human.push(
    `Repository: ${repoRoot ? inlineCode(repoRoot) : "unavailable"}`,
    `Branch: ${branch.name ? inlineCode(branch.name) : "unavailable"}`,
    `HEAD: ${headSha ? inlineCode(headSha) : "unavailable"}`,
    `Sync: ${syncLine(branch, remotes)}`,
    "Remote fetch: Not performed",
    `Run status: ${ctx.run.status}`,
    "",
    "## Working tree",
    pathLines(changedPaths),
    "",
    "## Recent commits",
    recentCommits.length > 0
      ? recentCommits.map((c) => `- ${inlineCode(c.short_sha)} ${c.date} ${inlineCode(c.author)}: ${inlineCode(c.subject)}`).join("\n")
      : "- None",
    "",
    statLine("Staged", stagedTotals),
    statLine("Unstaged", unstagedTotals),
    `Untracked paths: ${untracked.length}`,
    `Conflicted paths: ${conflicted.length}`,
    `Stash entries: ${stashCount}`,
    "",
    `Handoff readiness: ${readiness.verdict.toUpperCase()}`,
    `Next action: ${readiness.next_action}`,
  );
  if (failedSteps.length > 0) {
    human.push("", "## Incomplete evidence");
    for (const name of failedSteps) human.push(`- ${name}: ${stepStatuses[name]}`);
  }
}

human.push("", "Privacy: Git reads local repository data to calculate metadata and numeric diff totals. Output excludes file contents and patch hunks.");

out.human(human.join("\n"));

out.summary(
  inputProblem
    ? `input error: ${inputProblem.kind.replace(/_/g, " ")} (${requestedRepo})`
    : `${branch.name ?? "unknown branch"} @ ${headSha?.slice(0, 7) ?? "?"}: ${changedPaths.length} changed path(s), ${syncLine(branch, remotes).toLowerCase()}, ${recentCommits.length} recent commit(s)`,
);

out.result({
  run_id: ctx.run.run_id,
  run_status: ctx.run.status,
  input: {
    repo: requestedRepo,
    commit_count: ctx.params.commit_count ?? null,
    problem: inputProblem,
  },
  repository: repoRoot,
  head: headSha,
  branch: {
    name: branch.name,
    detached: branch.detached,
    upstream: branch.upstream,
    ahead: branch.ahead,
    behind: branch.behind,
    upstream_gone: branch.gone,
    comparison_basis: "last_fetched_tracking_reference",
    remote_fetch_performed: false,
    remotes,
  },
  changes: {
    staged,
    unstaged,
    untracked: untracked.map((item) => item.path),
    conflicted,
    all: changedPaths,
  },
  recent_commits: recentCommits,
  diff_statistics: {
    staged: { files: stagedStat, totals: stagedTotals },
    unstaged: { files: unstagedStat, totals: unstagedTotals },
  },
  stash_count: stashCount,
  steps: stepStatuses,
  readiness,
  privacy: {
    git_reads_local_repository_data: true,
    outputs_file_contents: false,
    outputs_patch_hunks: false,
    writes_repository: false,
  },
});
