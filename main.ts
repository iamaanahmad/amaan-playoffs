#!/usr/bin/env -S rote play run
/**
 * Git Handoff Snapshot
 *
 * Produces a compact Git handoff from repository metadata without reading file contents or patch hunks.
 *
 * @rote-frontmatter
 * ---
 * name: git-handoff-snapshot
 * description: Creates a compact Git handoff with branch state, changed paths, diff statistics, and recent commit metadata without reading file contents or patch hunks.
 * source: https://git-scm.com/docs/git
 * provenance:
 *   author: Tin Computer
 * fixtures:
 * - resources/presentation-fixtures/repo_root/fixture.yaml
 * - resources/presentation-fixtures/worktree_status/fixture.yaml
 * - resources/presentation-fixtures/recent_commits/fixture.yaml
 * - resources/presentation-fixtures/unstaged_stat/fixture.yaml
 * - resources/presentation-fixtures/staged_stat/fixture.yaml
 * - resources/presentation-fixtures/untracked_paths/fixture.yaml
 * parameters:
 * - name: repo
 *   param_type: string
 *   required: true
 *   description: Path to the local Git repository
 * - name: commit_count
 *   param_type: string
 *   required: false
 *   default: '5'
 *   description: Recent commit count accepted by git log -n; invalid values fail the recent-commits step
 * metadata:
 *   rote_version: 0.74.0
 *   version: 0.1.0
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
 *     - developer-tools
 *     - typescript
 * presentation_fixtures:
 *   repo_root: resources/presentation-fixtures/repo_root/fixture.yaml
 *   worktree_status: resources/presentation-fixtures/worktree_status/fixture.yaml
 *   recent_commits: resources/presentation-fixtures/recent_commits/fixture.yaml
 *   unstaged_stat: resources/presentation-fixtures/unstaged_stat/fixture.yaml
 *   staged_stat: resources/presentation-fixtures/staged_stat/fixture.yaml
 *   untracked_paths: resources/presentation-fixtures/untracked_paths/fixture.yaml
 * steps:
 *   repo_root:
 *     type: process.exec
 *     argv:
 *     - git
 *     - -C
 *     - $repo
 *     - rev-parse
 *     - --show-toplevel
 *   worktree_status:
 *     type: process.exec
 *     argv:
 *     - git
 *     - -C
 *     - $repo
 *     - status
 *     - --short
 *     - --branch
 *   recent_commits:
 *     type: process.exec
 *     argv:
 *     - git
 *     - -C
 *     - $repo
 *     - log
 *     - --date=iso-strict
 *     - --format=%h%x09%ad%x09%s
 *     - -n
 *     - $commit_count
 *   unstaged_stat:
 *     type: process.exec
 *     argv:
 *     - git
 *     - -C
 *     - $repo
 *     - diff
 *     - --stat
 *   staged_stat:
 *     type: process.exec
 *     argv:
 *     - git
 *     - -C
 *     - $repo
 *     - diff
 *     - --cached
 *     - --stat
 *   untracked_paths:
 *     type: process.exec
 *     argv:
 *     - git
 *     - -C
 *     - $repo
 *     - ls-files
 *     - --others
 *     - --exclude-standard
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

type ProcessObservation = {
  status: "completed" | "restored" | "failed" | "skipped" | "blocked";
  stdout: string;
  stderr: string;
  message?: string;
};

function readProcess(
  step: ReturnType<typeof ctx.step>,
  name: string,
): ProcessObservation {
  switch (step.outcome.status) {
    case "completed":
    case "restored": {
      if (!isProcessExecBody(step.outcome.output.body)) {
        throw new Error(`${name} did not record a process.exec observation`);
      }
      const body = step.outcome.output.body;
      const exit = body.status.exit;
      if (exit.kind !== "code" || exit.code !== 0) {
        throw new Error(`${name} returned an unsuccessful process result`);
      }
      return {
        status: step.outcome.status,
        stdout: body.stdout?.text ?? "",
        stderr: body.stderr?.text ?? "",
      };
    }
    case "failed":
      return {
        status: "failed",
        stdout: "",
        stderr: "",
        message: step.outcome.output.message,
      };
    case "skipped":
      return {
        status: "skipped",
        stdout: "",
        stderr: "",
        message: step.outcome.output.reason,
      };
    case "blocked":
      return {
        status: "blocked",
        stdout: "",
        stderr: "",
        message: step.outcome.output.reason,
      };
    default:
      throw new Error(`Unsupported outcome for ${name}`);
  }
}

function lines(text: string): string[] {
  return text.split("\n").map((line) => line.trimEnd()).filter((line) => line.length > 0);
}

const repoRootStep = readProcess(ctx.step(stepName("repo_root")), "repo_root");
const statusStep = readProcess(ctx.step(stepName("worktree_status")), "worktree_status");
const commitsStep = readProcess(ctx.step(stepName("recent_commits")), "recent_commits");
const unstagedStep = readProcess(ctx.step(stepName("unstaged_stat")), "unstaged_stat");
const stagedStep = readProcess(ctx.step(stepName("staged_stat")), "staged_stat");
const untrackedStep = readProcess(ctx.step(stepName("untracked_paths")), "untracked_paths");

const statusLines = lines(statusStep.stdout);
const branchHeader = statusLines.find((line) => line.startsWith("## ")) ?? "";
const branchDescriptor = branchHeader.replace(/^##\s+/, "");
const branch = branchDescriptor.split("...")[0].split(" ")[0] || null;

const changedPaths = statusLines
  .filter((line) => !line.startsWith("## "))
  .map((line) => ({ code: line.slice(0, 2), path: line.slice(3) }));
const staged = changedPaths.filter((item) => item.code[0] !== " " && item.code[0] !== "?");
const unstaged = changedPaths.filter((item) => item.code[1] !== " " && item.code[1] !== "?");
const untracked = lines(untrackedStep.stdout);

const recentCommits = lines(commitsStep.stdout).map((line) => {
  const [short_sha = "", date = "", ...subjectParts] = line.split("\t");
  return { short_sha, date, subject: subjectParts.join("\t") };
});

const repoRoot = repoRootStep.stdout.trim() || null;
const unstagedStat = lines(unstagedStep.stdout);
const stagedStat = lines(stagedStep.stdout);
const changedPathLines = changedPaths.length > 0
  ? changedPaths.map((item) => `- \`${item.code}\` ${item.path}`).join("\n")
  : "- None";
const commitLines = recentCommits.length > 0
  ? recentCommits.map((commit) => `- \`${commit.short_sha}\` ${commit.date} ${commit.subject}`).join("\n")
  : "- None";

const human = [
  "# Git handoff snapshot",
  `Repository: ${repoRoot ?? "unavailable"}`,
  `Branch: ${branch ?? "unavailable"}`,
  `Run status: ${ctx.run.status}`,
  "",
  "## Working tree",
  changedPathLines,
  "",
  "## Recent commits",
  commitLines,
  "",
  `Staged paths: ${staged.length}`,
  `Unstaged paths: ${unstaged.length}`,
  `Untracked paths: ${untracked.length}`,
  "",
  "Privacy: reads Git metadata and diff statistics only. It does not read file contents or patch hunks.",
].join("\n");

out.human(human);
out.summary(
  `${branch ?? "unknown branch"}: ${changedPaths.length} changed path(s), ${recentCommits.length} recent commit(s)`,
);
out.result({
  run_id: ctx.run.run_id,
  run_status: ctx.run.status,
  repository: repoRoot,
  branch,
  changes: {
    staged,
    unstaged,
    untracked,
    all: changedPaths,
  },
  recent_commits: recentCommits,
  diff_statistics: {
    staged: stagedStat,
    unstaged: unstagedStat,
  },
  stages: {
    repo_root: repoRootStep.status,
    worktree_status: statusStep.status,
    recent_commits: commitsStep.status,
    unstaged_stat: unstagedStep.status,
    staged_stat: stagedStep.status,
    untracked_paths: untrackedStep.status,
  },
  privacy: {
    reads_file_contents: false,
    reads_patch_hunks: false,
    reads_git_metadata: true,
  },
});
