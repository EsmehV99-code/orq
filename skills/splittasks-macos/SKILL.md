---
# managed-by: orq
name: splittasks
description: Split a complex goal into parallel terminal workstreams. Assigns each terminal a role and model (Sonnet/Opus/Haiku), writes handoff .md files to ./splits/ in the project root, and prints a briefing with exact commands to run in each terminal. (macOS variant; installed by orq's installer)
triggers: ["/splittasks"]
---

# /splittasks — Multi-Terminal Parallel Orchestration

> **Platform variant: macOS** (Terminal.app via `osascript`). The Windows variant lives at
> `skills/splittasks-windows/` in the orq repo. `node ~/.claude/skills/orq/scripts/install.js`
> copies the right one for your OS to `~/.claude/skills/splittasks/`, so the command is always
> `/splittasks`. This variant was written for macOS by a collaborator and has NOT been re-tested
> for this release. It mentions a few helper tools of its author (`/audit-fix`, the factory
> checks) that are not included; the core flow does not need them.

Splits one big goal into parallel workstreams across multiple Claude Code terminals, each with the right model and a self-contained handoff file.

---

## How to invoke

```
/splittasks [your goal here]
```

Run from the project root. The skill writes session files to `./splits/<SESSION_ID>/` inside that project, not to a global directory.

---

## What Claude does when this skill runs

### Step 0 — Read open audit findings

Before analyzing the goal, check if the current repo has `.audits/index.json`:

```bash
test -f .audits/index.json && cat .audits/index.json
```

If present, parse the file. For every finding with `status` in (`open`, `fixing`, `verifying`):
- Note its `file_globs` — these are zones another lane may own
- Capture the finding `id` and severity

In the MASTER.md you write, include a new section "Open audit findings (visible to all lanes)" listing the top 10 critical/important opens with id + file_globs. Each terminal handoff (`T*.md`) gets a sentence in its "Boundaries — do NOT touch" section: "Audit lanes may currently own these globs: <list>. Coordinate via Discord if you must touch them."

If `.audits/index.json` does not exist, skip Step 0 silently. Do not error.

### Step 1 — Analyze the goal

Break the goal into 2–4 workstreams based on:
- What's independent vs. sequential
- What's complex (needs Opus) vs. standard (Sonnet) vs. mechanical (Haiku)
- What needs review vs. what needs building

### Step 2 — Assign terminals

| Terminal | Role | Model | When to use |
|----------|------|-------|-------------|
| T1 | Master orchestrator + final reviewer | Sonnet | Always exists. Coordinates, reviews output from other terminals, does the merge/integration, makes final decisions |
| T2 | Primary builder | Opus | Complex logic, auth, architecture, anything requiring deep reasoning |
| T3 | Secondary builder or researcher | Sonnet | Standard coding, API work, feature implementation |
| T4 | Fast mechanical work | Haiku | Boilerplate, type definitions, file moves, search/lookups, formatting |

Use only as many terminals as the task needs. Don't spawn T4 if there's no mechanical work.

### Step 3 — Create the session directory and write handoff files

Compute a session id, the project root, and the absolute session directory:

```
PROJECT_ROOT = $(pwd)             # the cwd where /splittasks was invoked
SESSION_ID   = YYYYMMDD-HHMM-<slug>
SESSION_DIR  = $PROJECT_ROOT/splits/$SESSION_ID/   # absolute path
PROJECT_SLUG = $(basename "$PROJECT_ROOT")         # for worktree root
WT_ROOT      = $HOME/.claude/splittasks-worktrees/$PROJECT_SLUG/$SESSION_ID
                                                   # one worktree per lane lives under this
```

- `YYYYMMDD-HHMM` = current local time at skill invocation
- `<slug>` = 2–4 word kebab-case derived from the goal (e.g. `smoke-pipeline`, `auth-refactor`)

If `./splits/` is not in the project's `.gitignore`, add it. The splits dir is per-session scratch space; don't commit it.

Write **all** files for this run inside `$SESSION_DIR/` — never at the top of `./splits/`. Top-level `./splits/` is an archive of past sessions; flat `T*.md` at the root is forbidden and causes cross-session collisions.

**Per-lane git worktrees are MANDATORY** (prevents cross-lane working-tree contamination — a shared cwd lets one lane's uncommitted edits bleed into another lane's git state). Each lane runs in its OWN worktree on its OWN branch; lanes never share a working tree. See the "Per-lane git worktrees" section below for the full contract. The LAUNCH.sh template creates them serially with rollback before spawning any Terminal.app window.

**Preflight checks the skill writer runs BEFORE writing any session files:**

1. `git -C "$PROJECT_ROOT" rev-parse --git-dir` — must succeed. If not a git repo: **fail closed.** Tell the owner: "/splittasks requires a git repository (workers run in per-lane worktrees to prevent cross-lane contamination). Run `git init` first, or set `SPLITTASKS_ALLOW_SHARED_CWD=1` to opt back into the shared-cwd model (NOT recommended — the original incident class will reappear)." Honour the env-var escape hatch; if set, skip worktree creation entirely and warn in the chat briefing + every T*.md.
2. Capture immutable session facts at generation time (NOT spawn time — the user's HEAD could move between lanes):
   - `BASE_SHA=$(git -C "$PROJECT_ROOT" rev-parse HEAD)` — what every lane branches from. PIN to SHA, not a moving branch.
   - `BASE_BRANCH=$(git -C "$PROJECT_ROOT" symbolic-ref --short HEAD 2>/dev/null || echo "(detached)")` — recorded for merge-target only, not used as a checkout ref.
   - `REMOTE=$(git -C "$PROJECT_ROOT" config --get branch."$BASE_BRANCH".remote || echo "origin")` — for `git push -u $REMOTE …` discipline.
   Persist them in `$SESSION_DIR/SESSION.env` (sourced by LAUNCH.sh, RELAUNCH-T<N>.sh, and the T1 cleanup helper).
3. If `git -C "$PROJECT_ROOT" status --porcelain` returns non-empty, print a one-line warning in the chat briefing: *"Note: $PROJECT_ROOT has uncommitted changes. With worktrees enabled, these stay in your cwd and do NOT bleed into lanes — but lanes will branch from HEAD, not from your dirty state. If you want lanes to see your in-progress work, commit (or stash + git stash apply per-worktree) first."* Do not refuse — worktrees make this safe; it's a UX hint, not a hazard.
4. Sanitize SESSION_ID for use in a branch name: lowercase, replace anything not in `[a-z0-9._-]` with `-`, collapse runs of `-`. Then validate: `git check-ref-format --branch "splittasks/$SANITIZED_SESSION_ID/t1"` must exit 0. If validation fails, regenerate the slug and retry once; if still failing, abort with the exact `check-ref-format` error so the owner can pick a saner slug.

**Department routing detection (runs before T*.md generation):**

```
# Path 1: project root — the historical location + the FACTORY wrapper's own project-side install.
# Path 2: FACTORY department subdir — the factory emits DEPT/agents/_SPLITTASKS_ROUTING.md per
# docs/BOOTSTRAP-OUTPUT-STRUCTURE.md, so also check
# $PROJECT_ROOT/software-department-*/agents/_SPLITTASKS_ROUTING.md when the project-root file
# is absent. First hit wins.
ROUTING_FILE=""
if [ -f "$PROJECT_ROOT/agents/_SPLITTASKS_ROUTING.md" ]; then
  ROUTING_FILE="$PROJECT_ROOT/agents/_SPLITTASKS_ROUTING.md"
else
  for candidate in "$PROJECT_ROOT"/software-department-*/agents/_SPLITTASKS_ROUTING.md; do
    [ -f "$candidate" ] && { ROUTING_FILE="$candidate"; break; }
  done
fi
DEPT_MODE=false
[ -n "$ROUTING_FILE" ] && DEPT_MODE=true
# DEPT_AGENTS_ROOT is the directory holding the routing file. The KC_HEADER injection uses
# this so lanes resolve <SPEC_FILE> correctly whether the specs live at <project-root>/agents/
# or under <project-root>/software-department-<slug>/agents/.
DEPT_AGENTS_ROOT=""
[ -n "$ROUTING_FILE" ] && DEPT_AGENTS_ROOT="$(dirname "$ROUTING_FILE")"
```

When `DEPT_MODE=true`:
1. Parse the routing table rows from `$ROUTING_FILE` (role keywords | command slug | spec file).
2. For each lane: match the lane's role description against col 1 (role keywords). On match, capture `$COMMAND_SLUG` (col 2) and `$SPEC_FILE` (col 3). On no match, leave the lane generic and note "no routing match" in MASTER.md.
   **KC_HEADER path substitution:** the injection block references `agents/<SPEC_FILE>`. When the routing file lives under `software-department-<slug>/agents/`, substitute the KC_HEADER's `agents/` prefix with `<DEPT_AGENTS_ROOT_RELATIVE>/` — where `DEPT_AGENTS_ROOT_RELATIVE` is `$DEPT_AGENTS_ROOT` made relative to `$PROJECT_ROOT` (e.g. `software-department-client-repo/agents`). This keeps the injected instruction resolvable from the lane's worktree root without requiring a project-side symlink.
3. Read the `KC_HEADER..END_KC_HEADER` injection block from `$ROUTING_FILE` verbatim.
4. Substitute `$COMMAND_SLUG` and `$SPEC_FILE` in the block; prepend the result to that lane's `T*.md` brief (above the existing `# T[N] — [Role]: [Model]` heading).
5. For the T1 brief only: add a DoD pre-check step before the Codex review step — "read `$PROJECT_ROOT/agents/$SPEC_FILE` for each routed lane → verify DoD criteria against the lane's deliverables → only then run Codex."
5b. **Slice-scoped context loads (mandatory-floor triggers pull their knowledge in).** When a routed lane's slice fires a §0a mandatory-floor trigger, the skill writer appends the matching factory context files to that lane's `## Context` section as required reading during the work (not a pre-flight gate): schema change → `context/database-best-practices.md`; money/wire/PII/webhook → `context/security-invariants.md` + `context/appsec-baseline.md`; CI/workflow change → `context/cicd-pipeline-spec.md` (author jobs FROM the canonical template, never from memory). Resolve the files under the FACTORY checkout named in MASTER.md (or the department's `context/` copy if the factory emitted one). Origin: factory-audit 20260701 ledger row 7 — `cicd-pipeline-spec.md:66` already contained the exact `npm ci` step the lane omitted; the knowledge existed and nothing routed it into the lane.

**Plan-driven fan-out (DEPT_MODE only — supersedes the heuristic Step 1 lane split when a plan exists):**

6. Look for an engineering **parallel plan** — the fenced ```json `_parallel-plan` block inside
   `$PROJECT_ROOT/../projects/*/deliverables/engineering/08-tech-lead-slice-plan.md` (a
   department's work lives in the sibling `projects/<solution-slug>/`). Resolve the solution
   slug from `.solution-ref` if more than one project exists; if ambiguous, ask.
7. **If a plan is found:** do NOT use the heuristic 2–4 lane split. Instead create **one lane per
   slice** in `_parallel-plan.slices[]`, routed by each slice's `roles` (step 2), each lane's
   work step = run its routed command **scoped** `--slice <id>`. Honor `depends_on`: a slice that
   depends on another gets a STEP-0 upstream-verify block (existing mechanism) waiting on the
   upstream lane's `*-done.md`; independent slices launch in the same wave. **Never** create a lane
   for a `single_owner` zone (schema/deploy) — the T1 coordinator runs those before/after the
   fan-out (see `_parallel-plan.single_owner` and the routing file's "T1 duties" section).

   **The work step is LITERALLY the orchestrator command** (`/$COMMAND_SLUG --slice <id>`), not a
   restatement of the slice as direct implementation instructions. The lane runs the orchestrator;
   the orchestrator walks §0a and spawns its specialists with the Agent tool — the same delegation
   the single-terminal flow gets, one per lane. A brief that says "implement X" instead of "run
   `/engineering-orchestrator --slice X`" bypasses §0a entirely and produces unevidenced receipts
   (observed in a client-repo session: the T2 brief carried sub-slice implementation instructions, the
   lane wrote all specialist content inline, and 7/7 PRs failed first review).
8. **If no plan is found** (e.g. the engineering cycle hasn't reached Tech Lead yet): fall back to
   the heuristic split, and note in MASTER.md that fan-out was heuristic, not plan-driven — the
   first job of such a run is usually to produce the plan (run the front half: product cycle →
   engineering steps 0a–3), after which a re-run fans out by plan.

When `DEPT_MODE=false`: behavior unchanged. This block is a no-op in projects without `agents/_SPLITTASKS_ROUTING.md`.

Files to create:
- `$SESSION_DIR/T1.md`, `T2.md`, `T3.md`, `T4.md` (only the terminals you assigned)
- `$SESSION_DIR/MASTER.md`
- Each terminal will later write its done report into the **same** session dir.

**File format for each T*.md:**
```markdown
# T[N] — [Role]: [Model]

## Your task
[Specific, scoped task for this terminal only]

## Boundaries — do NOT touch
[What other terminals own — be explicit]

## Context
[What you need to know: relevant files, patterns, constraints]

## What other terminals are doing
- T1: [brief]
- T2: [brief]
- T3: [brief]

## Done when
[Clear completion criteria — what "done" looks like]

## Report back
When done, write your summary atomically to <SESSION_DIR>/T[N]-done.md:
1. Write content to <SESSION_DIR>/T[N]-done.md.tmp first
2. **The LAST non-empty line of the .tmp file MUST be the sentinel `<!-- T[N]-DONE -->`** — this is the filesystem-level signal that the write is complete. Downstream lanes pass this sentinel to `wait-for-upstream.sh --sentinel "<!-- T[N]-DONE -->"`, so a missing or wrong sentinel makes downstream lanes reject the file as partial.
3. `mv <SESSION_DIR>/T[N]-done.md.tmp <SESSION_DIR>/T[N]-done.md` — atomic rename on POSIX. The file appears whole or not at all.

Use the literal absolute path of this run's session dir — do NOT write to a relative path that depends on the worker's cwd. Include in the body BEFORE the sentinel line:
- What you built/changed
- Files touched
- Anything T1 needs to know before merging

Then append the sentinel as the last line and `mv`. T1's polling-loop spec verifies the sentinel before acting on the report.
```

**Downstream lanes (any T*.md that depends on another lane's output) MUST include a STEP 0 — Verify upstream block before their first work step.** See "Mandatory upstream verification (STEP 0)" under strict mode below — the rule applies to every gated run, strict or not, whenever one lane reads another lane's output file. Skill writer: when emitting a downstream lane's T*.md, prepend STEP 0 to the work-steps list with the literal absolute path to the upstream output file and a minimum-lines threshold.

Also write `$SESSION_DIR/MASTER.md` for T1 with the full picture, the session id, and merge instructions. T1 polls for `*-done.md` files inside `$SESSION_DIR/` only.

---

## Per-lane git worktrees (MANDATORY)

Every lane (including T1) runs in its own git worktree on its own branch. The shared-cwd model — where every lane `cd`s to `$PROJECT_ROOT` — is the root cause of cross-lane contamination: one lane's uncommitted edits visibly bleed into another lane's git state and into the owner's open PRs. Worktrees give each lane an isolated working tree + index while sharing the same `.git` object database, so commits/pushes still flow through one repository.

### Layout — OUTSIDE the project tree

```
$HOME/.claude/splittasks-worktrees/<PROJECT_SLUG>/<SESSION_ID>/
                                                  ├── T1/
                                                  ├── T2/
                                                  ├── T3/
                                                  └── …
```

Worktrees are **outside** `<PROJECT_ROOT>` (NOT under `splits/`) for three reasons:
- `splits/` being gitignored only protects against `git` operations; ripgrep, IDE indexing, file watchers, `find`, and an accidental `rm -rf splits/` will walk into nested worktrees and either index garbage or destroy them.
- Nested worktrees confuse some tooling (pre-commit hooks resolving paths via the parent worktree's `.git`, IDE multi-root detection).
- The audit pipeline already uses `~/.claude/audit-rebase-worktrees/` for the same isolation reason; we follow the same precedent.

### Branch namespace

`splittasks/<SANITIZED_SESSION_ID>/t<N>` — lowercase, slash-separated. Always validate with `git check-ref-format --branch` before passing to `git worktree add` (sanitization in Step 3 should already make this safe, but validate anyway — defence in depth).

### Creation discipline (in LAUNCH.sh, BEFORE any `spawn`)

Creation is **SERIAL** (parallel `git worktree add` races on the worktree list inside `.git/`) and **rollback-safe** (if creating T4 fails, the partial T2+T3 worktrees + branches must be removed; otherwise next launch sees half-created state). Pseudocode the LAUNCH.sh template implements:

```
created_worktrees=()
created_branches=()
for lane in T1 T2 T3 …; do
  branch="splittasks/$SESSION_ID/t${lane#T}"
  wt="$WT_ROOT/$lane"

  # Idempotency: if worktree already exists (RELAUNCH path), skip.
  if [ -e "$wt/.git" ] && [ "$(git -C "$wt" rev-parse --abbrev-ref HEAD)" = "$branch" ]; then
    continue
  fi

  if ! git -C "$PROJECT_ROOT" worktree add -b "$branch" "$wt" "$BASE_SHA"; then
    rollback_partial "$created_worktrees" "$created_branches"
    exit 3
  fi
  created_worktrees+=("$wt")
  created_branches+=("$branch")

  # Submodule best-effort.
  if [ -f "$wt/.gitmodules" ]; then
    git -C "$wt" submodule update --init --recursive || \
      printf '[splittasks-launch] WARN: submodule init failed for %s\n' "$lane" >&2
  fi
done
```

`rollback_partial`: iterate created_worktrees in reverse and `git -C "$PROJECT_ROOT" worktree remove --force "$wt"` for each; then `git -C "$PROJECT_ROOT" branch -D "$branch"` for each created branch. On rollback failure, print exact manual cleanup commands and exit 3 (HELPER ERROR, matches the wait-for-upstream.sh convention).

### Worker guardrail (first BEGIN action)

Every T*.md's BEGIN block opens with a worktree sanity check **as the FIRST tool call**, before STEP 0 (upstream verify) or anything else:

```bash
# STEP -1 — Worktree sanity (FIRST tool call, before STEP 0 if any)
[ "$(git rev-parse --show-toplevel)" = "<ABS_WORKTREE_PATH>" ] || {
  echo "ABORT: cwd is $(pwd), expected worktree <ABS_WORKTREE_PATH>"
  exit 1
}
[ "$(git rev-parse --abbrev-ref HEAD)" = "splittasks/<SESSION_ID>/t<N>" ] || {
  echo "ABORT: branch is $(git rev-parse --abbrev-ref HEAD), expected splittasks/<SESSION_ID>/t<N>"
  exit 1
}
```

The skill writer interpolates `<ABS_WORKTREE_PATH>` and the branch literal into every T*.md.

### Push discipline

Lanes always push with explicit upstream:

```
git push -u "$REMOTE" "splittasks/$SESSION_ID/t<N>"
```

Never rely on `push.default`. `$REMOTE` comes from `$SESSION_DIR/SESSION.env`.

### DELTA-gate contract (ONLY supported flavor for stacked code lanes)

**MERGE-gate is retired for code lanes.** Prior versions of this SKILL offered a "MERGE gate" flavor where downstream lanes waited for the upstream PR to land on `main` before starting. That mode deadlocks whenever upstream review fails: downstream can't proceed, upstream can't merge (correctly refused because it didn't pass Gate 0–3), session dies. Observed in a client-repo session — T3 chain was permanently stuck behind a HELD T2 chain, and T3.2's PR ended up bundling 76 files of unmerged T2 code because its base was `main` instead of T2.2's branch.

**Rule (top-line, enforced by T1 + lane briefs):** nothing merges without full Gate 0–3 PASS on its current head SHA. There is no "merge upstream to unblock downstream" shortcut. Downstream review runs against upstream's *branch*, not against upstream landing on `main`.

DELTA-gate is how this works in practice: each downstream lane opens its PR with base = **upstream lane branch** (not `main`), so `gh pr diff` shows only the incremental delta. T1 reviews each lane's delta on its own SHA-bound verdict, independent of merge state anywhere else in the stack. When upstream is HELD, downstream cascade-HELDs (no polluted-diff to review). When upstream reaches `merge-ready`, downstream's own gate proceeds normally.

**Merge-detected marker (`T<N>-MERGED`) still exists** — it's written by T1 when a `merge-ready` PR is eventually merged (by human owner or auto-merge), and it feeds cascade *rebase* preparation onto the post-merge `main` tip. It is NOT a synchronization primitive for downstream lanes; downstream never blocks waiting for it.

**Which gate to use** (`--merge-gate` flag removed):

| Downstream needs | Gate flavor | wait-for-upstream mode |
|---|---|---|
| Only upstream's code delta reviewed in isolation (default for stacked slices of one feature) | **DELTA** | inline bash poll for `T<N>-DELTA-APPROVED-<pr>` mirror file (see "wait-for-upstream.sh template" — native helper flag is a follow-up) |
| Only upstream's doc/output file (no PR involved) | **OUTPUT** | (no flag) — polls for `T<N>-DONE` sentinel |

DELTA is the only choice for stacked code lanes. If you literally cannot start until upstream is on `main` (e.g., integration tests that hit the merged schema at CI-runtime), split the session into two separate `/splittasks` invocations rather than trying to encode a cross-merge sync in one session — it's cleaner and the second session can plan against a known-merged base.

**Base rule (enforced by lane briefs + T1).**
- Downstream lanes open PRs with base = **upstream lane branch**, NOT `main`. `gh pr diff` then shows only the incremental delta.
- MASTER.md declares each lane's parent-lane (the base branch) alongside its role/model. The skill emits this into every downstream T*.md as `PR_BASE_BRANCH=splittasks/$SESSION_ID/t<PARENT>` in the lane's SESSION.env-scoped variables.
- If a downstream lane opens vs `main` by mistake, T1 posts a `wrong-base` comment naming the correct base branch and sets state to `delta-pending` (does NOT run Gate 3 on a wrong-base PR — the diff is polluted by upstream code).

**Per-PR state machine (T1 owns; tracked in `<SESSION_DIR>/.t1-state/pr-<n>.state`).**

| State | Set when | Next state |
|---|---|---|
| `delta-pending` | PR opened OR new head SHA pushed OR gate re-runnable | `delta-approved` (Gate 0-3 all PASS) · `needs-lane-rebase` (retarget conflict) · `blocked-conflict` (CI/mss FAIL) · `review-pending` (reviewer unavailable) |
| `delta-approved` | Gate 0-3 all PASS on current head SHA + declared parent SHA | `merge-ready` (parent merged) · `delta-pending` (new SHA pushed → verdict invalidated) |
| `review-pending` | codex OR code-reviewer unavailable (quota, session limit, network) — set instead of silently waiting | `delta-approved`/`delta-pending` when reviewer available again; auto-timeout after `T1_REVIEW_PENDING_WINDOW_MIN` (default 30) → PR comment explaining pause, degrade to codex-only if code-reviewer out or fully pause if codex out |
| `needs-lane-rebase` | T1's retarget or rebase hit conflicts | `delta-pending` when lane pushes a new head SHA at the correct base |
| `blocked-conflict` | mergeStateStatus ≠ CLEAN OR required CI check FAIL — not a Gate 3 review problem | `delta-pending` when the underlying condition resolves (lane push, CI re-run, secret provisioned) |
| `merge-ready` | `delta-approved` AND parent is `merged` | `merged` (cascade merge success) · `needs-lane-rebase` (rebase-to-main conflict) · `delta-pending` (post-retarget Gate 3 FAIL) |
| `merged` | `gh pr merge` succeeded | terminal |
| `held` | 3-strike escalation OR lane self-abort with unresolved FAIL — per project session MASTER.md rule | terminal (cascades HELD to descendants) |

**SHA-bound verdict marker (source of truth, not GitHub `reviewDecision`).**

When T1 completes Gate 0-3 PASS on a PR's head SHA, it MUST post BOTH:

1. `gh pr review --approve --body "<verdict body>"` — the GitHub-native APPROVED state (visible to humans opening the PR on the web).
2. A machine-readable marker line inside the review body:
   ```
   FACTORY-DELTA-APPROVED sha=<head-sha> base=<expected-parent-sha> reviewer_run=<T1-run-id> gates=g0:pass,g1:pass,g2:pass,g3:pass ts=<iso-8601>
   ```

Downstream cascade logic and any polling script MUST parse the marker line and verify the `sha` matches the current PR head AND the `base` matches the parent's current tip. GitHub's `reviewDecision=APPROVED` alone is insufficient because approvals can be dismissed, become stale after commits, or reflect a different SHA under branch-protection rules.

**Mandatory session-dir mirror**: T1 also writes `<SESSION_DIR>/T<N>-DELTA-APPROVED-<pr>` containing the same marker line — this is the polling source-of-truth (downstream can't run `gh pr view` per iteration; `reviewDecision=APPROVED` is not per-SHA-reliable). Both writes are atomic; if either fails, T1 rolls back to `delta-pending`. Downstream polls the mirror via the bash one-liner in the "wait-for-upstream.sh template" section.

**Rebase ownership (T1 does clean retargets only).**
- T1 attempts `gh pr edit <n> --base main` + local rebase onto the pinned `base_tip_after_merge` from the parent's `T<PARENT>-MERGED` marker.
- If the rebase succeeds cleanly (fast-forward or auto-mergeable), T1 force-pushes with `--force-with-lease` and moves the PR to `merge-ready`.
- If conflicts appear, T1 does NOT attempt resolution. It:
  1. Aborts the rebase (`git rebase --abort`).
  2. Sets state to `needs-lane-rebase`.
  3. Posts a PR comment naming the exact upstream tip SHA the lane must rebase onto + the paths that conflicted.
  4. Stops advancing that branch of the stack — cascade does not proceed until lane pushes the resolved SHA.

Conflict resolution belongs to the lane owner (they know their intent). This preserves the "T1 is a reviewer, not a builder" boundary.

**Cascade preparation (T1 stops at merge-ready; humans perform every merge).**

**Merge policy — DEFAULT: T1 DOES NOT AUTO-MERGE.** T1's job ends when a PR is declared `merge-ready`. The human owner performs the final `gh pr merge`. Rationale: the 2026-07-01 session had 3 real security bugs on a single PR (seal-bypass, HMAC-over-Date, over-tight grant); auto-merge on both-LLM-PASS would have shipped the first-round fix that codex-approved on the surface but broke the write path. Human-in-the-loop between "both LLMs PASS" and "in main" is a hard requirement while the reviewer chain is still maturing. To opt into auto-merge for a session, set `T1_AUTO_MERGE=true` in `SESSION.env` — off is the default.

**Merge-conflict discipline — NEVER merge with conflicts.** `mergeStateStatus` MUST be `CLEAN` (or `HAS_HOOKS`) before either T1 or a human merges. `DIRTY`, `BEHIND`, `BLOCKED` states MUST route through `needs-lane-rebase` and get resolved by the lane owner. T1 NEVER uses `--admin` to bypass a dirty state — branch protection exists for the same reason the human-in-the-loop does. Under `T1_AUTO_MERGE=true`, T1 uses `gh pr merge --squash --delete-branch` (no `--admin` flag). Under the default, T1 does not run `gh pr merge` at all.

When a PR reaches `merge-ready` prep:

1. Retarget: `gh pr edit <n> --base main`.
2. Fetch + rebase onto pinned parent's `base_tip_after_merge`. Conflict → `needs-lane-rebase` (stop; comment the exact SHA + conflicted paths; lane owner resolves, pushes new head SHA).
3. Force-push (`--force-with-lease`). This produces a **new head SHA**.
4. **Always re-run required CI checks AND Gate 3 (codex + code-reviewer per Tiered review chain) on the new post-rebase head SHA.** No "material changes" shortcut — required checks that only exist on `main`-targeted PRs may differ from checks on parent-lane-targeted PRs, and Gate 3 must validate the post-rebase diff for silent conflict resolutions.
5. On PASS + `mergeStateStatus=CLEAN`: set state `merge-ready`; post an APPROVED review + a marker comment `FACTORY-MERGE-READY sha=<final-head> gates=g0:pass,g1:pass,g2:pass,g3:pass mss=CLEAN ts=<iso>` on the PR; write `<SESSION_DIR>/T<N>-MERGE-READY-<pr>` mirror. If `T1_AUTO_MERGE=true`, then AND ONLY THEN run `gh pr merge --squash --delete-branch`, capture the squash SHA, and immediately execute step 6. Otherwise stop — the human owner merges.
6. **Write `T<N>-MERGED` marker regardless of who merged.** T1's polling loop watches every `merge-ready` PR for `state=MERGED` (via `gh pr view <n> --json state,mergedAt,mergeCommit`). On detection — whether the merge was performed by T1 (auto-merge branch) or by the human owner (default branch) — T1 writes `<SESSION_DIR>/T<N>-MERGED` with the schema below and advances the PR to `merged`. Downstream cascade retarget/rebase depends on this marker, so it MUST be written for BOTH merge paths; otherwise the next PR in the stack has no `base_tip_after_merge` to rebase onto.
   ```
   merged_pr: <PR-number>
   merged_commit: <squash SHA captured from mergeCommit.oid>
   base_branch: main
   base_tip_after_merge: <SHA of origin/main captured immediately after fetch — this is the merged tip>
   merged_at: <mergedAt from gh pr view, or ISO-8601 of detection if unavailable>
   ```
7. On Gate 3 FAIL post-rebase: revert PR state to `delta-pending`, comment findings, stop cascade.
8. On `mergeStateStatus != CLEAN` after step 3-4: state `needs-lane-rebase` (someone else pushed to `main` between rebase and merge check — lane rebases again).

**Wrong-base PR handling.**

If T1 discovers a downstream PR opened against `main` (or against any branch other than its declared parent), T1:
1. Posts a comment: "Wrong base. Expected `splittasks/$SESSION_ID/t<PARENT>`, found `<actual>`. Retarget with `gh pr edit <n> --base splittasks/$SESSION_ID/t<PARENT>`, or if this PR is intentionally against main, remove from the session-scope PR list."
2. Sets state to `delta-pending` with sub-status `wrong-base`.
3. Does NOT run Gate 3 (the diff is polluted by upstream code the reviewer cannot fairly judge in isolation).
4. Sub-status clears when the PR's base is corrected AND a new head SHA lands.

**Verdict discipline (lanes don't judge themselves).**

Done-reports (`T<N>-done.md`) MUST NOT declare a PASS / FAIL / PASS-WITH-NOTES verdict. Verdicts belong to T1. **This is a closed enum with two states — there is no third.** The frontmatter carries exactly one of:

```yaml
state: iterating          # lane is alive in the loop — covers BOTH the first submission (ready for T1's initial Gate 3 review) AND any subsequent amendment pushed in response to reviewer FAIL. If T1 later posts FAIL, the lane will push again.
state: self-abort         # lane will not push again; cite reviewer's last comment URL (or "n/a — first submission not attempted" if the lane is bowing out before any review)
reviewer_last_comment: <URL to the T1 gate comment the lane is responding to or bowing out on; the string "n/a — first submission" is acceptable for the first done-report if no reviewer comment exists yet>
```

`self-abort` triggers T1's HELD escalation immediately (skipping the quiet-window wait). `iterating` keeps the loop alive — T1 reads it as "reviewer, do your job on the current head SHA; the lane will respond to whatever verdict you post."

**T1 actively rejects protocol violations.** When T1's polling loop reads a `T<N>-done.md`, it MUST validate the frontmatter before doing anything else. Any of these conditions is a **rejection**:

- Frontmatter contains a `verdict:` field (any value).
- Frontmatter contains a bare `PASS`, `FAIL`, `PASS-WITH-NOTES`, `HELD`, `MERGED`, or similar verdict-shaped string as a top-level YAML key or value.
- `state:` field is missing.
- `state:` field is any value other than the literal `iterating` or `self-abort`.
- Done-report exists but the lane's PR still has unaddressed reviewer FAIL comments AND state is neither `iterating` nor `self-abort`.

On rejection: T1 posts a PR comment reciting the rule (`Your done-report declared verdict "X" — protocol says lanes do not judge themselves. Rewrite the done-report frontmatter with state: iterating (if you'll push another SHA) or state: self-abort (if you're done trying) and cite reviewer_last_comment: <URL>. Nothing else is accepted.`), does NOT mark the lane done, and continues to treat the PR as active. Observed in a client-repo session — T2 declared its own `PASS-WITH-NOTES` at strike 2/3 and stopped pushing; without active rejection this looked like normal completion until the T1 done-report autopsy caught it.

See "Which gate to use" table above (DELTA + OUTPUT only; MERGE-gate retired per the top-line rule).

### Lane amend loop (MANDATORY in every worker T*.md that opens a PR)

**The single biggest deadlock source observed across splittasks sessions is push-and-idle** — a worker opens its PR(s), writes its done-report with `state: iterating`, and then goes to sleep. T1 posts `T1 gate 3: strike 1/3` comments the worker never sees because it has no comment-poll loop. The session stalls until a human pokes each terminal by hand. Observed in a client-repo session — T2 pushed 7 stacked PRs, received 7 strike-1 comments from T1's codex verdicts, and sat idle for 40+ minutes before the owner noticed and manually poked the terminal; T3 spent the same 40 minutes writing "waiting for T2.2 DELTA-approval marker" log lines every 30s.

**Rule:** every worker that opens a PR MUST end its work with a poll-and-amend loop that watches its own open PRs for new `T1 gate` comments and re-engages the amend cycle when one appears. The loop is the exit path, not a `sleep 3600` or a bare `exit 0`.

**Skill writer emits this block literally into every T*.md's BEGIN section** (after "Push your branch" and before "Do NOT run `git worktree remove`"). Interpolate `<REPO_SLUG>`, `<MY_LANE>`, and `<ABS_SESSION_DIR>` at write time.

```bash
# Lane amend loop — MANDATORY. Do NOT exit until every open PR you opened
# is terminal (merged / held / self-abort). Push-and-idle is a protocol
# violation; T1 has no way to signal you except via PR comments.
LAST_SEEN_STATE_FILE="<ABS_SESSION_DIR>/.T<N>-last-seen-comment.tsv"
: > "$LAST_SEEN_STATE_FILE"
QUIET_ITERS=0
while :; do
  ANY_ACTIVE=0
  # Every open PR on this lane's branch namespace
  PRS=$(gh pr list --repo <REPO_SLUG> --state open --author "@me" \
        --json number,headRefName,headRefOid \
        --jq '.[] | select(.headRefName | startswith("splittasks/<SESSION_ID>/t<N>")) | .number')
  for PR in $PRS; do
    ANY_ACTIVE=1
    # Latest T1 gate comment on this PR (id + createdAt).
    LATEST=$(gh pr view "$PR" --repo <REPO_SLUG> --json comments \
             --jq '[.comments[] | select(.body | test("^T1 gate"))] | sort_by(.createdAt) | last | "\(.id)\t\(.createdAt)"')
    [ -z "$LATEST" ] && continue
    SEEN=$(awk -F'\t' -v pr="$PR" '$1==pr {print $2}' "$LAST_SEEN_STATE_FILE" | tail -1)
    CID="${LATEST%%$'\t'*}"
    if [ "$CID" != "$SEEN" ]; then
      QUIET_ITERS=0
      printf '%s\t%s\n' "$PR" "$CID" >> "$LAST_SEEN_STATE_FILE"
      # → New T1 gate comment. Read it, diagnose root cause,
      #   fix the code, re-run local codex pre-check (see below),
      #   push new head SHA, update T<N>-done.md reviewer_last_comment.
      #   ^^ THIS IS THE AMEND STEP — do it now, then continue the loop.
      echo "NEW T1 GATE COMMENT ON PR #$PR — enter amend cycle"
      # <lane owner: replace this echo with the actual amend work>
      break   # after amending, restart the loop from the top
    fi
  done
  [ "$ANY_ACTIVE" = 0 ] && break        # all PRs terminal → exit
  QUIET_ITERS=$((QUIET_ITERS + 1))
  # Hard quiet-timeout backstop: if no new T1 comment for 60 min AND
  # all PRs still open, write a self-abort sentinel and exit — better
  # to surface stuck-quiet than to burn quota polling forever.
  if [ "$QUIET_ITERS" -ge 120 ]; then    # 120 × 30s = 60 min
    echo "60 min quiet on every open PR — writing quiet-timeout sentinel"
    printf 'lane T<N> exceeded 60-min quiet window while PRs still open. Owner: check PR review state and either poke T1 or restart this lane.\n' \
      > "<ABS_SESSION_DIR>/T<N>-QUIET-TIMEOUT.md"
    break
  fi
  sleep 30
done
```

**Requirement (2) — deterministic pack, THEN local codex, before every push.** Inside the amend cycle, BEFORE `git push`, the lane runs — in this order:
1. **The deterministic verify pack** (free, no LLM): `bash <FACTORY>/checks/pre-push-verify.sh --base <PR_BASE>` (workflow dep-order lint, SECURITY DEFINER identity scan, spec-coverage where the brief names one, migrate-smoke pointer when migrations changed). Fix until exit 0. Codex quota is never spent on mechanically detectable failures.
2. `/codex-review --diff <local-diff-file>` against the working diff. If codex returns FAIL, the lane fixes locally and re-runs — it does NOT push a known-FAIL SHA to burn a T1 review round. Only push when local codex PASSes.
T1 becomes the confirmatory second opinion, not the first-line filter. Observed in a client-repo session — every single one of 7 T2 initial pushes hit codex FAIL at T1; 6 of the 7 were also catchable by the deterministic pack alone, and the same codex run locally would have caught the rest before the round-trip.

**Requirement (3) — one push per amend cycle, not batched.** When a lane holds multiple open PRs and receives strike-1 on several at once, it fixes and pushes ONE AT A TIME, in stack order. Batched pushes hide which fix belongs to which strike, and if strike-2 lands mid-batch the same-seam gate can't tell whether it's a genuine second attempt on the same seam or a new bug the lane introduced.

**Requirement (4) — the "3 terminal quiet" watchdog.** T1's polling loop (see T1 session-scope patterns below) MUST detect the case where every lane is idle and no branch tip has moved for ≥ `T1_SESSION_QUIET_MIN` (default 20 min). On detection T1 writes `<SESSION_DIR>/SESSION-QUIET-STALL.md` naming the stalled lanes and their last PR event, so the owner sees "your session is stuck" in a place other than three separate terminals scrolling `waiting for X`. Without this, the stall is invisible until the owner manually inspects each terminal.

**Requirement (5) — Claims table in every PR body (claims ≠ artifacts is the top defect class).** Every PR a lane opens MUST include a `## Claims` section: a markdown table mapping each invariant/coverage claim the PR makes ("one active per kind", "verify before parse", "every W-* string seeded") to the backticked path of its executable evidence (test file in the diff, or check command + output). T1's Gate 3 pre-step runs `checks/pre-push-verify.sh claims-lint <pr-body-file>` — a missing Claims section, an empty table, or a cited evidence path absent from the diff is an immediate `delta-pending` comment WITHOUT spending a codex run. Origin: factory-audit 20260701 ledger rows 2/3/4/7 — four of seven PR bodies asserted invariants their own SQL/YAML contradicted, and no gate diffed prose against artifacts.

### T1 session-scope patterns (Gate 0, Gate 1, critical-zones, session-completion, sentinel sweep, state files)

Baselined from a client-repo session's T1.md brief so future sessions inherit these patterns instead of re-declaring them. All are strict-mode / gated-run patterns; skip for default (non-gated) runs.

**Gate 0 — routing verification (before every codex call).**

For every PR the T1 polling loop finds, before ANY other gate:

1. `PR_FILES=$(gh pr diff <PR#> --repo <slug> --name-only)`.
2. PR MUST touch AT LEAST ONE of the routing artifacts declared in MASTER.md (per project — engineering deliverables like `deliverables/engineering/{09,10,11,12,13}-*.md` for the client-repo reference session).
3. That artifact MUST contain, in the ADDED diff, a `<!-- engineering-orchestrator §0a walk receipt: T<lane>.<slice> -->` line (or the equivalent `Orchestrator receipt:` marker declared by the department's routing seam).
3b. **Delegation-evidence cross-check (routed lanes only).** The receipt's `invoked=[...]` roster
   is a CLAIM until matched against the lane's spawn log. T1 reads
   `$WT_ROOT/T<N>/.claude/logs/subagent-spawns.jsonl` (written automatically by the
   `log-subagent-spawns.js` PostToolUse hook — the lane cannot produce it by narration) and
   requires, for every specialist listed as `invoked`, at least one spawn record whose
   `subagent_type` or `description` names that role, timestamped inside the session window.
   Missing log file, empty log, or roster⊄spawns → post `T1 gate 0: delegation not evidenced —
   receipt claims [roster] but the spawn log shows [actual]`, do NOT run Gate 3, keep polling.
   (Receipts that only claim `N/A=[...]` rows need no spawn evidence. Advisory scope: the log
   evidences the drift failure mode — a lane writing specialist content inline — not deliberate
   forgery; Gate 3 codex remains the correctness authority.)
4. FAIL → post a `T1 gate 0: routing verification FAILED …` comment naming what was missing, do NOT run Gate 3, do NOT merge, keep polling.
5. Doc-only PRs opened from the T1 branch itself (e.g. the `_dod-receipt.md` PR — see §Session completion) skip Gate 0.

Why: prevents lanes from opening PRs that bypass the orchestrator's specialist gate-walk (§0a). Each lane's routing artifact records which specialists were invoked, N/A'd, or gate-blocked — and after the 20260701 audit, step 3b makes "invoked" mean an actual Agent-tool spawn (hook-logged), not a self-written comment: the receipt line proves the lane wrote a receipt; the spawn log proves delegation happened.

**Gate 1 — foundation-lock (protected paths).**

MASTER.md declares a `foundation_lock:` list of glob patterns for paths that lanes MUST NOT modify. For every open PR, T1 runs `git diff --name-only origin/main..<pr-head>` and rejects if any file matches a protected glob. FAIL → post a `T1 gate 1: foundation-lock touched: <path>` comment, do NOT run Gate 3, keep polling.

Typical protected globs: architecture/security/tech-lead deliverables (`deliverables/engineering/0[5-8]-*.md`), inception context (`interview-context/*.md`), owner-input channels (`agents/*`, `context/*`), and product-side deliverables (`deliverables/product/0[1-4]-*.md`). Business-specific — the SESSION.env / MASTER.md declaration is authoritative; the skill enforces the mechanism, not the specific patterns.

**Critical-zone dual-review trigger (generalization of CZ-1).**

MASTER.md declares one or more `critical_zones:` — glob patterns that force the dual-review chain (codex + code-reviewer subagent in parallel, both must PASS) regardless of PR type. Overrides the Tiered review chain's "codex only for feature PRs" default. Example from the client-repo session:

```yaml
critical_zones:
  cz-1-money-flow:
    trigger: "PR title matches T2\\. OR diff touches src/wire/, src/attestation/, src/vault/, src/auth/"
    reason: "money movement — HMAC, secrets, auth"
```

T1's Gate 3 evaluates every `critical_zones.<name>.trigger` predicate on the PR; if any fires, it runs BOTH reviewers (parallel) and requires BOTH PASS.

**Session-completion flow (T1 owns; runs after every sub-PR is `merged` OR `held`).**

Session is DONE when every sub-PR in the session-scope is terminal (`merged`, `held`, or explicit `self-abort`). T1 then executes in order:

1. **Integration codex on wave diff.** Compute `git diff <base-tip-at-session-start>..<current-main-tip>` and pass to `/codex-review --diff <path>`. On FAIL, apply the same 3-strike escalation used for individual PRs (see rule 4). Loop-until-PASS at the integration level.
2. **Update `_dod-receipt.md`** — deliverable at `deliverables/engineering/_dod-receipt.md` (or wherever the department's DoD-receipt file lives; MASTER.md declares the path). Verdict = `pass` (all `merged` + integration PASS), `pass-with-notes` (any `held` sub-PR), or `held` (0 merges, or CZ-1 defect unfixed). Reconcile every claim against live source: `gh pr view --json state,mergedAt` for each PR mentioned, `git ls-remote` for any branch claimed deleted.
3. **Commit + open receipt PR from the T1 branch** (`splittasks/<session>/t1`) → base = `main`. Codex-review the receipt PR. Under `T1_AUTO_MERGE=false` (default) T1 stops at `merge-ready` and human merges; under `T1_AUTO_MERGE=true` T1 merges via `gh pr merge --squash --delete-branch`. (Receipt PR is doc-only, skips Gate 0.)
4. **Sentinel sweep** — see next section.
5. **Write `T1-done.md`** — full verdict table (see done-report contents rule), HELD list with strike history, squash SHAs, codex + code-reviewer verdicts per PR, sentinel-sweep results, worktree survival list. Last non-empty line MUST be `<!-- T1-DONE -->`.
6. **Worktree cleanup** per §T1 cleanup discipline (next section).

**Sentinel sweep (cross-repo bleed check).**

MASTER.md declares `sentinel_repos:` — a list of external repositories (absolute paths) whose HEAD SHA and clean-status must be verified unchanged by this session. For each:

1. `git -C "$repo" rev-parse HEAD` — compare to the pre-session baseline SHA (captured in SESSION.env when the split was created).
2. `git -C "$repo" status --porcelain=v1` — flag any tracked-file modification (`M `). Untracked files (`??`) that predate the session's start time are OK; new untracked files from during the session are flagged.
3. Any bleed → HALT session-completion, write `<SESSION_DIR>/SENTINEL-BLEED.md` with the diff, surface in T1-done.md's "Flags still open" section, do NOT auto-clean.

For the client-repo reference session: `sentinel_repos: [/Users/you/dev/FACTORY, /Users/you/dev/client-repo-v1]`.

**Session-scope state files (`<SESSION_DIR>/.t1-state/`).**

T1 tracks per-PR review state in a small set of tab-separated files, one line per event. Human-readable, `awk`-friendly, no JSON parser needed. Schemas:

- `fail-counts.tsv` — one row per reviewer FAIL on any PR head SHA (columns tab-separated):
  ```
  pr\thead_sha\tiso_ts\treviewer\treason
  ```
  Distinct-SHA count per `pr` → strike count for the 3-strike rule. Reset by explicit `state: self-abort` in the lane's done-report OR by a new head SHA that PASSes.
- `HELD-PRs.tsv` (session root, not `.t1-state/` — human-visible per operator convention):
  ```
  pr\thead_sha\treason\tiso_ts
  ```
  Rows appended when T1 hard-escalates a PR. Descendants of a HELD parent get `cascade-HELD-parent-<PR#>` as their reason and are added in the same write.
- `pr-<n>.state` — one file per PR, single line, current state per §DELTA-gate state machine:
  ```
  <state>\t<head_sha>\t<iso_ts>\t[sub_status]
  ```
  Overwritten atomically on each transition (`mv <tmp> <target>`). Used by T1's polling loop to detect state changes across restarts.
- `seen-shas.tsv` / `seen-sentinels.tsv` — poll dedup logs; append-only, opaque keys, safe to delete between sessions.

Skill writer creates `<SESSION_DIR>/.t1-state/` as part of Step 3 alongside SESSION.env; T1 skill's STEP -1 verifies the directory exists.

### T1 cleanup discipline (after merging all lane PRs)

T1's done-report flow includes a final cleanup pass:

```bash
# For each lane whose PR merged successfully:
git -C "$PROJECT_ROOT" worktree remove --force "$WT_ROOT/T<N>"
git -C "$PROJECT_ROOT" branch -D "splittasks/$SESSION_ID/t<N>"

# Final, after all lanes processed:
git -C "$PROJECT_ROOT" worktree prune
```

Worktree-remove BEFORE branch-delete (Git refuses to delete a branch still checked out by a surviving worktree). For lanes that aborted / never merged: T1 leaves the worktree in place and lists it in T1-done.md under "Surviving worktrees — the owner decides" so the user can inspect before manual cleanup.

### Non-git escape hatch (NOT recommended)

If `SPLITTASKS_ALLOW_SHARED_CWD=1` is set in the environment when /splittasks is invoked, skip all worktree machinery and fall back to the shared-cwd model. The chat briefing prints **one line in red**:

```
⚠ SHARED-CWD MODE ACTIVE — lanes share working tree; cross-lane contamination can recur.
```

Every emitted T*.md gets the same warning at the top of its BEGIN block, and `STEP -1` is replaced by an unconditional warning echo instead of the sanity check. This exists for non-git project roots (scratch dirs, n8n exports) where worktrees are impossible — not as a normal-operation mode.

### Step 4 — Print the briefing

> **If strict mode is active, SKIP this Step 4 entirely.** The strict-mode section ("MANDATORY — BEGIN block + execute verbs") specifies the *only* boxes to emit. Rendering both Step 4's default boxes and the strict boxes is a bug — emit one set, never both.

Substitute `$SESSION_DIR` with its literal absolute path in every box. The Read paths must be absolute so a fresh terminal in any cwd can resolve them.

Output this exact block so the owner can copy-paste:

```
╭─ SPLIT PLAN ────────────────────────────────────────────────╮
│  Goal     [goal summary]                                    │
│  Session  <SESSION_ID>                                      │
│  Dir      ./splits/<SESSION_ID>/                            │
╰─────────────────────────────────────────────────────────────╯

╭─ T1  ·  Sonnet  ·  Orchestrator ────────────────────────────╮
│  $ claude                                                   │
│  → Read <ABS_SESSION_DIR>/T1.md                             │
│    and execute it                                           │
╰─────────────────────────────────────────────────────────────╯

╭─ T2  ·  Opus  ·  [role] ────────────────────────────────────╮
│  $ claude --model claude-opus-4-7                           │
│  → Read <ABS_SESSION_DIR>/T2.md                             │
│    and execute it                                           │
╰─────────────────────────────────────────────────────────────╯

╭─ T3  ·  Haiku  ·  [role] ───────────────────────────────────╮
│  $ claude --model claude-haiku-4-5-20251001                 │
│  → Read <ABS_SESSION_DIR>/T3.md                             │
│    and execute it                                           │
╰─────────────────────────────────────────────────────────────╯

▶  Auto-launching all <N> terminals via <ABS_SESSION_DIR>/LAUNCH.sh.
```

**Footer-line conditional (applies to both default and strict mode):** The ▶ line above is for **direct invocation only** (the owner typed `/splittasks`) — the skill itself execs LAUNCH.sh as its final tool call. When `/splittasks` is invoked programmatically by another skill (e.g. `/audit-fix`), REPLACE that line with the single caller-readiness line:

```
[splittasks] Session files written at <ABS_SESSION_DIR>. Caller skill must execute: bash <ABS_SESSION_DIR>/LAUNCH.sh
```

See the "Programmatic invocation contract" section near the end of this file for the full rationale.

**Rendering rules for the box block:**
- Substitute the literal `<SESSION_ID>` value everywhere — the owner copy-pastes verbatim, must not fill anything in
- Substitute `<ABS_SESSION_DIR>` with the absolute path computed in Step 3 (e.g. `/Users/you/dev/client-repo/splits/20260601-1045-smoke-pipeline`)
- The `Dir` line in the header box may stay as `./splits/<SESSION_ID>/` for brevity since the user can see they're in the project root
- Each box is exactly 63 columns wide (fits standard terminal half-screens and Hostinger's 88-char wrap)
- Pad inner content with two leading spaces; truncate role labels to fit
- Drop the T4 box entirely if T4 wasn't assigned; same for T3
- Use the exact Unicode glyphs shown (`╭ ╮ ╰ ╯ ─ │ · → ▶`) — do not substitute ASCII

---

## Model routing rules

| Work type | Model |
|-----------|-------|
| Architecture decisions, security, auth, complex state | Opus |
| Standard feature work, API routes, components, debugging | Sonnet |
| File moves, boilerplate, type stubs, grep/search, renaming | Haiku |
| Orchestration, review, merge, integration | Sonnet (T1 always) |
| One-shot mechanical transform that needs NO agent loop (draft commit msg, summarize a diff/file, bulk text rewrite, classify/label) | Local (`~/.claude/scripts/local-llm.sh -m coder`) — free, off-quota |

---

## Rules

- T1 is ALWAYS Sonnet — it's the orchestrator/reviewer, not the builder
- Never assign T1 the hardest technical task — that goes to T2 (Opus)
- Haiku only for truly mechanical work — don't waste it on reasoning tasks
- **Local model is NOT a lane.** Never assign a T<N> lane to a local model — a lane is a full Claude Code terminal with tools, worktree, and review discipline. Instead, an existing lane shells out to `~/.claude/scripts/local-llm.sh` for one-shot transforms and verifies the output. For a free first-pass diff review before spending Codex quota, use `~/.claude/scripts/local-review.sh` (same PASS/FAIL contract as `/codex-review`).
- Each terminal's task must be completable WITHOUT waiting for another terminal (except T1 which waits for all)
- Boundaries in each handoff file must be explicit — no "don't touch what the others are doing"
- If the goal is too small for splitting (1 file, trivial task), say so and do it directly instead
- Every run gets its own `./splits/<SESSION_ID>/` directory inside the project root. Never reuse a session id, never write `T*.md` at the splits/ root, never reference a path without the session id. The session id is the only thing preventing cross-session terminal collisions.

---

## After writing handoff files

Tell the owner:
1. Which terminals to open and what model flag to use
2. Which terminals to start first (parallel ones)
3. What T1 does last (review + merge)
4. Where the handoff files are (absolute path)

Do NOT start the work yourself. The point is to give the owner separate terminals to run independently.

---

## Strict mode (gated) — opt-in for fuller, fewer-bug work

When the owner says "strict", "gated", or "no bugs no dead code", apply this on top of the default skill. Cost: ~2× wall clock. Benefit: surfaces CRITICAL issues earlier so they don't sneak past a fast merge.

**Differences from default:**

1. **T1 is Opus, not Sonnet.** Strict-mode reviewer-dispatch + verification discipline benefits from Opus's care. Override the default routing.
2. **All workers may also be Opus.** The owner explicitly picks the count — common shapes are 1+3 (T1+T2+T3+T4) or 1+4 (T1+T2+T3+T4+T5).
3. **Gate signal files.** If any worker is a *gate* (its output must land before downstream workers can proceed without building on a missing premise), encode the signal as a file inside the session dir. **Two gate flavors** (see full contract in `### DELTA-gate contract` above the Strict-mode header; MERGE-gate is retired per the top-line rule):
   - **Delta gate** (default and only choice for stacked code-touching lanes): downstream PRs base on the upstream lane branch, not `main`; T1 reviews each PR's incremental delta independently and posts a SHA-bound `FACTORY-DELTA-APPROVED sha=<...> base=<...>` marker to the PR review body (mirrored to the mandatory `<SESSION_DIR>/T<N>-DELTA-APPROVED-<pr>` file). Downstream polls the mirror directly via the bash one-liner documented in the "wait-for-upstream.sh template" section (a native helper flag is a follow-up; the marker-file contract is stable across the transition). Cascade merge preparation happens after the head-of-stack lands, per the "Cascade preparation" contract — T1 stops at `merge-ready` unless `T1_AUTO_MERGE=true`. This is the ONLY flavor for stacked code lanes because it breaks the review-vs-merge deadlock (observed in a client-repo session).
   - **Output gate** (gate's output file must be fully written first, no merge needed — typical for doc-only or `~/.claude/`-scoped sessions): gate worker writes its output file, syncs, then `touch <SESSION_DIR>/T<N>-DONE`. Downstream workers wait for the upstream OUTPUT FILE (verified via STEP 0 cat — NOT just the DONE marker), then proceed.

   **Downstream workers run STEP 0 cat as their first tool call** (see "Mandatory upstream verification (STEP 0)" below). Polling loops in handoff prose are unreliable — workers skip them and silently proceed. A context-realign session on a client repo shipped 5/5 commits but T4+T5 proceeded without T2-DONE; content survived only because pre-baked verbatim references happened to match T2's actual output.

   MASTER.md must enumerate which worker is the gate, what `T<N>-DONE` (output gate) or `T<N>-DELTA-APPROVED-<pr>` (delta gate) unblocks, and the absolute path of each gate's output file so downstream STEP 0 directives can cite it.
4. **Per-PR code-reviewer subagent.** Before T1 approves any PR, T1 spawns a fresh `code-reviewer` agent (NOT the integration reviewer that watches the whole session). Reviewer reads the diff + the worker's done report + the finding/audit the PR claims to close + the boundaries from MASTER.md. Reports PASS / FAIL with evidence. T1 does not merge on FAIL.

   **Under DELTA-gate:** T1 runs Gate 0–3 on **every open PR in the session-scope, out of stack order, in parallel** — not just the top of the stack. Each PR gets its own SHA-bound verdict. When a new head SHA is pushed to a PR, its verdict is invalidated and T1 re-runs Gate 3 on the new SHA. This decouples review from merge state and prevents the "waiting on upstream to merge before I review you" deadlock.

   **Reviewer-availability degraded state.** When codex CLI OR the code-reviewer subagent is unavailable (quota-exceeded, session-limit, network), T1 does NOT silently wait: it moves the PR to `review-pending` and writes `<SESSION_DIR>/.t1-state/pr-<n>.state`. After `T1_REVIEW_PENDING_WINDOW_MIN` (default 30 min), T1 posts a PR comment explaining the pause and either (a) degrades to codex-only if code-reviewer is out, or (b) fully pauses gating if codex is out. **A reviewer-unavailable verdict (session-limit, quota-exhausted, network error, subprocess exit non-zero without a parseable PASS/FAIL) is NOT a strike** — the strike counter does not advance. T1 re-runs the strike when the reviewer recovers, or degrades per (a)/(b) above. Only a real reviewer-delivered `FAIL: <reason>` increments the strike count.

   **3-strike escalation.** T1 tracks reviewer FAIL count per-PR at distinct head SHAs. After 2 FAILs, T1 posts a `strike-2` comment naming both remaining options (push another SHA OR write `state: self-abort` in the lane's done-report). If neither event fires within `T1_STRIKE_QUIET_WINDOW_MIN` (default 15 min of no PR activity), T1 marks the PR HELD with reason `quiet-2-strike` and cascade-HELDs downstream. `self-abort` in the lane's done-report bypasses the quiet-window wait and immediately HELDs.

   **Same-seam whack-a-mole gate (lane-side, enforced by the T*.md brief and T1's strike-2 comment).** Between strikes, before the lane pushes another SHA, it MUST diagnose whether the reviewer's FAIL is on the SAME object/seam as the prior FAIL. If yes, another patch is almost certainly whack-a-mole (strike-1 defended one symptom, strike-2 defended a different symptom of the same underlying invariant, and strike-3 would defend a third). The lane MUST NOT push a same-seam patch — instead it posts a PR comment naming (a) what strike-1's fix defended, (b) what strike-2's fix defended, (c) the actual invariant it thinks is broken, and then either (d) asks for direction OR (e) writes `state: self-abort`. T1's strike-2 comment includes this directive verbatim. Observed in a client-repo session — T2.1's strike-1 defended the seal flag, strike-2 defended the seal grant, both were symptoms of "definer-only signer identity" (the real invariant); a strike-3 would have defended a third symptom. This gate short-circuits that pattern.
5. **Verification discipline before every merge:**
   - `mergeStateStatus` = `CLEAN` (re-poll on `UNKNOWN`)
   - All required CI checks = `SUCCESS`
   - Commit-author check — `<your git commit email>`, never `test@test`
   - For PRs claiming test/data results: cross-read the cited data file with `jq` — do not trust hand-typed tables
   - Smell-test the diff for `console.log` / `TODO` / `FIXME` / `.only(` / commented-out blocks
   - For behavioural fixes (e.g., contamination): run a focused live repro before merging
6. **One concern per PR.** No multi-concern monoliths. T1 enforces — split or reject.
7. **Hold rules are load-bearing.** If MASTER.md encodes a hold (e.g., "merge PR X only after audit clears Y"), T1 does not relax it unilaterally — escalate.
8. **Branch protection is respected.** GitHub blocks self-approval of your own PRs, and T1 does NOT work around it: it posts its review as a `gh pr comment` with explicit rationale and hands the merge to the owner (or to whoever has approval rights). Never `gh pr merge --admin`. Squash merges are preferred to keep `main` clean.
9. **No `--no-verify`. No `--force` push outside one explicit MASTER.md exception. No `git add -A`.**
10. **Done-report contents per worker:**
    - PRs/branches shipped + SHAs
    - What was deferred + why
    - Bugs/surprises found in the touched code
    - Smoke-test caveats (anything not actually run)
    - "Notes for T1" — anything the orchestrator must know before merging
    - **Frontmatter `state:`** — see `### DELTA-gate contract` §"Verdict discipline" above. Lanes declare `iterating` or `self-abort`; verdicts are T1's alone.
11. **T1-done report:** PRs merged with SHAs + timestamps · audit/finding flags closed · flags still open + reason · new bugs surfaced · recommendation for next sprint · wall-clock + rate-cap pauses (always zero on flat-rate Max) · plain-language recap. **PLUS** a "Worktrees" section listing which lane worktrees T1 removed (success-path cleanup) and which survived (aborted/non-merged lanes — the owner decides on manual removal).
12. **Worktree cleanup discipline (T1 runs in this exact order):**
    - For each lane whose PR merged successfully: `git -C "$PROJECT_ROOT" worktree remove --force "$WT_ROOT/T<N>"` THEN `git -C "$PROJECT_ROOT" branch -D "splittasks/$SESSION_ID/t<N>"` (remove before delete — Git refuses to delete a branch checked out by a surviving worktree).
    - For lanes that aborted / never merged: leave the worktree in place. List in T1-done.md's "Surviving worktrees" section with the absolute path + suggested manual cleanup command. Never auto-delete uncommitted work.
    - After all lanes processed (success + abort), run `git -C "$PROJECT_ROOT" worktree prune` once to clean dangling administrative records.
    - If T1 itself aborts before reaching cleanup, the owner can run `git -C "$PROJECT_ROOT" worktree list` to see what remains and `git worktree remove --force` per entry.

**When a lane times out / never reports done:** still write T1-done.md noting which lanes timed out and that the split was aborted. Leave their worktrees in place per rule 12.

### Tiered review chain (per-PR)

Strict mode treats different PR kinds with different review intensity:

| PR type | Detection | Review chain | Why |
|---|---|---|---|
| **Feature PR** | No `AUDIT-*` in title/body | `/codex-review <PR#>` only | Fast (~30-60s). One provider. Sufficient for greenfield. |
| **Audit-fix PR** | Title or body matches `/AUDIT-[A-Za-z0-9_-]+/` | `/codex-review <PR#>` **AND** `verifier` subagent (Claude) **in parallel** | Finding closure is high-stakes. Two providers, two angles. Both must PASS to merge. |

T1's per-PR review step (replacing the single `code-reviewer` invocation in rule 4 above):

1. Read PR title + body via `gh pr view <PR#>`.
2. If matches `/AUDIT-[A-Za-z0-9_-]+/`:
   - Spawn `/codex-review <PR#>` (subprocess, async)
   - Spawn `verifier` subagent (Task tool, async) with the full diff text, finding title, and acceptance criteria. Instruct: evaluate from diff only, return one line `PASS` or `FAIL: <reason>`.
   - Wait for BOTH. Both must return PASS to merge.
3. Otherwise:
   - Spawn `/codex-review <PR#>` only.
   - PASS required to merge.
4. If either FAIL or NEEDS_REVISION: do NOT merge. Add a PR comment with the verdict + evidence. Worker lane retries.

When Codex CLI is unavailable: fall back to the existing `code-reviewer` agent step. Print a one-line warning that the cross-provider check was skipped.

**When NOT to use strict mode:** trivial one-file tasks · pure-research sessions · anything where the owner is actively pair-programming. The overhead doesn't amortize.

### MANDATORY — BEGIN block + execute verbs

Starter prompts ending in *"Then begin: <goal>"* leave room for the worker to pause for confirmation, clarification, or summary instead of executing. The fix is the pair below — both halves required:

**(1) Every T*.md MUST end with a `## BEGIN` section** containing:
- Identity statement: *"You are T<N> on split `<session-id>`. Model: <model>. Worktree: `<ABS_WORKTREE_PATH>`. Branch: `splittasks/<session-id>/t<N>`."*
- **STEP -1 — Worktree sanity check (FIRST tool call, before STEP 0 if any):** the worker runs the bash snippet below to verify it's in its assigned worktree on its assigned branch. If either check fails, the worker writes a one-line note to `<ABS_SESSION_DIR>/T<N>-WORKTREE-ERROR.md` and exits cleanly. **Skill writer MUST emit this block literally with the worktree path + branch name interpolated.** Skip ONLY in SHARED_CWD_MODE — and then emit a one-line `echo "⚠ shared-cwd mode — contamination risk"` warning in place.

  ```bash
  # STEP -1 — Worktree sanity (run BEFORE anything else)
  EXPECTED_WT="<ABS_WORKTREE_PATH>"
  EXPECTED_BRANCH="splittasks/<SESSION_ID>/t<N>"
  ACTUAL_WT="$(git rev-parse --show-toplevel 2>/dev/null || echo NOT-A-GIT-REPO)"
  ACTUAL_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo NONE)"
  if [ "$ACTUAL_WT" != "$EXPECTED_WT" ] || [ "$ACTUAL_BRANCH" != "$EXPECTED_BRANCH" ]; then
    {
      echo "WORKTREE SANITY FAILED at $(date -u +%FT%TZ)"
      echo "  expected worktree: $EXPECTED_WT"
      echo "  actual worktree:   $ACTUAL_WT"
      echo "  expected branch:   $EXPECTED_BRANCH"
      echo "  actual branch:     $ACTUAL_BRANCH"
    } > "<ABS_SESSION_DIR>/T<N>-WORKTREE-ERROR.md"
    exit 1
  fi

  # STEP -1b — Base-branch sanity for downstream lanes ONLY (skip if PR_BASE_BRANCH is unset or "main").
  # Verifies HEAD is based at the DECLARED parent's current tip, so this lane's eventual PR
  # will show only its incremental delta and won't bundle unmerged upstream code.
  # Observed in a client-repo session — T3.2 opened against main with 76 files of
  # unmerged T2 code because its local branch was lagging the T2.2 parent tip.
  if [ -n "${PR_BASE_BRANCH:-}" ] && [ "$PR_BASE_BRANCH" != "main" ] && [ "$PR_BASE_BRANCH" != "master" ]; then
    # Fetch must succeed — a swallowed failure would let this gate PASS against a
    # stale remote-tracking ref while the lane is actually lagging. Fail closed.
    if ! git fetch "$REMOTE" "$PR_BASE_BRANCH" --quiet; then
      {
        echo "BASE-BRANCH SANITY FAILED at $(date -u +%FT%TZ)"
        echo "  reason: git fetch $REMOTE $PR_BASE_BRANCH failed"
        echo "  cannot verify HEAD is at parent's tip without an authoritative fetch."
        echo "  fix the network/auth issue and re-run this brief."
      } > "<ABS_SESSION_DIR>/T<N>-BASE-BRANCH-ERROR.md"
      exit 1
    fi
    PARENT_TIP="$(git rev-parse "$REMOTE/$PR_BASE_BRANCH" 2>/dev/null || echo NONE)"
    MB="$(git merge-base HEAD "$REMOTE/$PR_BASE_BRANCH" 2>/dev/null || echo NONE)"
    if [ "$PARENT_TIP" = "NONE" ] || [ "$MB" = "NONE" ] || [ "$MB" != "$PARENT_TIP" ]; then
      {
        echo "BASE-BRANCH SANITY FAILED at $(date -u +%FT%TZ)"
        echo "  declared parent:      $REMOTE/$PR_BASE_BRANCH"
        echo "  parent tip:           $PARENT_TIP"
        echo "  merge-base with HEAD: $MB"
        echo ""
        echo "This lane is lagging its parent. Opening a PR now would bundle unmerged"
        echo "upstream code and pollute the delta. Rebase before continuing:"
        echo "    git fetch $REMOTE $PR_BASE_BRANCH"
        echo "    git rebase $REMOTE/$PR_BASE_BRANCH"
        echo "then re-run this brief."
      } > "<ABS_SESSION_DIR>/T<N>-BASE-BRANCH-ERROR.md"
      exit 1
    fi
  fi
  ```

- Explicit "without stopping" wording: *"Execute every step / phase in this file end-to-end without stopping for confirmation, clarification, summary, recap, or 'should I proceed?' questions."*
- Reading discipline: *"Read the listed reference files AS YOU GO during your work, not as a pre-flight gate."*
- Entry point: *"Begin STEP -1 — Worktree sanity immediately. On pass, proceed to STEP 0 (if downstream) or Step 1."*
- **Closed-enum exit condition** (matches the Verdict discipline section above — reproduce this verbatim in every emitted T*.md's BEGIN block): *"You have exactly two exit states — no third. (a) Push another head SHA in response to T1's gate comment (state: iterating), OR (b) write done-report with `state: self-abort` frontmatter and stop. Writing done-report while declaring your own verdict (PASS / FAIL / PASS-WITH-NOTES / anything verdict-shaped), or going silent without a state field, is a protocol violation — T1 will reject the done-report and keep treating your PR as active. On completion: write `<absolute path>/T<N>-done.md` with the two-state enum frontmatter and exit cleanly. Push your branch with `git push -u <REMOTE> splittasks/<session-id>/t<N>` BEFORE writing the done-report. Do NOT run `git worktree remove` — T1 handles worktree cleanup after merge."*
- Stop-condition pointer: *"Pause ONLY on a Stop Condition listed above."*
- Final word: a literal *"Begin."* at the very end.

**(2) The starter prompt MUST use execute-don't-ask verbs.**
- Good (works): *"Read `<ABS_SESSION_DIR>/T<N>.md` end-to-end, then execute the BEGIN block at the bottom of that file without stopping for confirmation, clarification, or summary."*
- Bad (failed 2026-05-19): *"Read `T<N>.md` and begin: <one-line goal>."* — the verb "begin" allows pausing.

**Verify before sending:**
1. Open each T*.md and confirm the `## BEGIN` section exists at the bottom and contains "without stopping" or equivalent wording.
2. Re-read each starter prompt and confirm it contains "execute" (not "begin") and "without stopping" (or "without asking").
3. For every downstream lane, confirm a `## STEP 0 — Verify upstream` section exists above Step 1 and cites the absolute upstream-output path + minimum-lines threshold. See below.
4. For every lane (including T1), confirm the STEP -1 worktree-sanity bash block exists with `<ABS_WORKTREE_PATH>` and `<SESSION_ID>` literally interpolated (not placeholders). In SHARED_CWD_MODE, confirm the warning-echo replacement is present.
5. Confirm T1's polling loop also watches for `*-WORKTREE-ERROR.md` files; on detection, log + surface in T1-done.md "Flags still open" and do not relaunch automatically.

### Mandatory upstream verification (STEP 0) — bounded poll via wait-for-upstream.sh

Every downstream lane (any T*.md that depends on another lane's output) MUST open its work with a STEP 0 — Verify upstream block, executed as the worker's first tool call before any other action.

The spec is bounded-poll via a shared helper script `wait-for-upstream.sh` shipped into every session dir. It distinguishes "upstream still working" (wait) from "upstream broken / never started" (hard timeout → abort). Prose polling loops and cat-on-miss-ABORT patterns both proved unreliable in practice — workers skip prose loops, and ABORT-on-miss overshoots when downstream spawns within seconds of upstream.

**Skill writer ships `<SESSION_DIR>/wait-for-upstream.sh`** (see "wait-for-upstream.sh template" below) and emits this block into every downstream T*.md, above Step 1:

```markdown
## STEP 0 — Verify upstream (mandatory, FIRST tool call sequence)

**Your FIRST tool call must be this Bash invocation (set Bash tool timeout to 600000 ms):**

  bash <ABS_SESSION_DIR>/wait-for-upstream.sh T<UPSTREAM-N> --hard-timeout-min <N> --min-lines <N> --sentinel "<!-- T<UPSTREAM-N>-DONE -->"

Interpret the exit code:
- Exit 0 → upstream verified; the script cats the upstream done-report. Proceed to Step 1.
- Exit 2 → soft timeout (9 min in this single call); re-invoke the SAME command. Up to ~6 retries (~60 min total).
- Exit 1 → hard timeout exhausted; write <ABS_SESSION_DIR>/T<N>-NEEDS-UPSTREAM.md with failure record + tail of .wait-T<UPSTREAM-N>.log and exit cleanly.
- Exit 3 → HELPER INFRASTRUCTURE ERROR (log unwritable, stat failed, cat failed, bad args). NOT a timeout. DO NOT write NEEDS-UPSTREAM. Read .wait-T<UPSTREAM-N>.log to diagnose. If fixable, re-invoke. If not, write T<N>-HELPER-ERROR.md and exit.
- Exit 130 → SIGINT/SIGTERM. State preserved. DO NOT write NEEDS-UPSTREAM. Just exit cleanly.

After exit 0, run a content integrity check (grep for specific exports/sections the upstream's spec promised — skill writer fills in concrete grep targets).

Record the verification timestamp in your done-report frontmatter as `upstream_gate_observed_at: <ISO-8601>` — use the timestamp from wait-for-upstream.sh's final UPSTREAM-READY log line.

When both the helper exits 0 and the content integrity check passes, proceed to Step 1.
```

**Substitutions the skill writer fills in:**
- `<ABS_SESSION_DIR>` — literal absolute path of the session dir.
- `<UPSTREAM-N>` — the upstream lane's id (e.g. `T2`).
- (No `--merge-gate` flag — retired per the top-line rule in DELTA-gate contract. For an OUTPUT gate, no extra flag; the helper polls for the done-report + sentinel.)
**DELTA gate — inline bash poll (native helper flag is a future revision).** The helper does NOT currently have a `--delta-gate` mode; downstream lanes poll the session-dir mirror file directly in STEP 0 with this bash one-liner in place of the helper call:
  ```bash
  MARKER="$SESSION_DIR/T<UPSTREAM-N>-DELTA-APPROVED-<pr>"
  DEADLINE=$(( $(date +%s) + 60*60 ))     # 60-min hard timeout
  until [ -f "$MARKER" ] && grep -q "^FACTORY-DELTA-APPROVED sha=" "$MARKER"; do
    [ "$(date +%s)" -ge "$DEADLINE" ] && { echo "hard timeout on delta gate"; exit 1; }
    sleep 30
  done
  # Verify sha binding: extract sha= field and confirm it matches the upstream PR's current head SHA.
  SHA=$(grep -oE 'sha=[a-f0-9]+' "$MARKER" | head -1 | cut -d= -f2)
  UPSTREAM_HEAD=$(gh pr view <upstream-pr> --json headRefOid --jq .headRefOid)
  [ "$SHA" = "$UPSTREAM_HEAD" ] || { echo "stale delta-approval — sha mismatch"; exit 1; }
  ```
  When a future SKILL revision adds native helper support, briefs replace this inline poll with the helper call — the marker-file contract (`<SESSION_DIR>/T<UPSTREAM-N>-DELTA-APPROVED-<pr>` containing `FACTORY-DELTA-APPROVED sha=... base=...`) stays identical.
- `--hard-timeout-min` — default 60 min. Increase to 90 for long-running schema migrations or CI-heavy lanes; decrease to 15 for trivial doc-only upstreams.
- `--min-lines` — default 25. Set to ~50% of the upstream's documented done-report target (so a stub done-report doesn't satisfy the gate).
- `--sentinel "<!-- T<UPSTREAM-N>-DONE -->"` — **MANDATORY for fresh sessions.** Pairs with the atomic-write contract in the "Report back" template: upstream lanes write the sentinel as the last line of their done-report via `mv`, downstream gates reject any file whose last non-empty line doesn't match. Omit ONLY when the upstream lane's done-report predates the sentinel contract (transitional sessions like 2026-06-03 M4).
- Content integrity grep targets — the skill writer extracts these from the upstream T*.md's "Done when" section + the upstream's "Exports T<downstream> will call" subsection in its done-report template.

**Why bounded poll (not abort-on-miss):** Spawning downstream within seconds of upstream is the COMMON CASE for LAUNCH.sh — both lanes get an osascript spawn in the same second. The downstream's first tool call legitimately runs before the upstream has even branched. ABORT-on-miss would fail in this common case; only a wait that DISTINGUISHES "still working" from "exceeded a hard deadline" survives both failure modes (workers-skip-polling AND downstream-spawned-too-fast).

**T1's role:** When reviewing each downstream lane's `T<N>-done.md`, T1 verifies `upstream_gate_observed_at` is present and the timestamp postdates the upstream lane's output-file mtime. Missing timestamp OR pre-output timestamp = the lane bypassed the gate — flag in T1-done.md and reject the lane's deliverable.

**T1's NEEDS-UPSTREAM detection:** T1's polling loop also watches for `T<N>-NEEDS-UPSTREAM.md` files. On detection: cat the file, log to MASTER.md merge log as `<ISO> · T<N> · ABORTED · upstream timeout`, `touch T<N>-REVIEWED` to stop re-processing, and surface in T1-done.md's "Flags still open" section. Do NOT auto-relaunch — that's the owner's decision via `bash RELAUNCH-T<N>.sh` after the upstream issue resolves.

### wait-for-upstream.sh template

The skill writer ships a hardened helper into `<SESSION_DIR>/wait-for-upstream.sh` whenever any lane has a downstream dependency. `chmod +x` after writing.

If you already have a hardened copy of this helper from an earlier session, copy it verbatim into the new session's dir rather than regenerating it from memory. If you do not, write it from the behavioural contract and the template below, and keep the four hardening points (stat portability, exit-code distinction, SIGINT trap, sentinel check).

Behavioural contract (must match the source-of-truth):

- **Exit 0** — upstream ready (done-report present, ≥ min_lines, sentinel matches if specified). Helper `cat`s the done-report to stdout.
- **Exit 2** — soft timeout (9 min elapsed in this invocation). Worker re-invokes. State file mtime tracks hard deadline across re-invocations.
- **Exit 1** — hard timeout exhausted (default 60 min cumulative). Worker writes `T<N>-NEEDS-UPSTREAM.md` and aborts.
- **Exit 3** — HELPER INFRASTRUCTURE ERROR (log unwritable, cat failed, stat failed, bad args). NOT a timeout — worker MUST NOT write NEEDS-UPSTREAM on exit 3; investigate the helper log.
- **Exit 130** — SIGINT/SIGTERM. State preserved for resume.
- **Sentinel check** — if `--sentinel "<line>"` is passed, `ready()` additionally requires the file's LAST non-empty line to equal that string exactly. Pairs with the atomic-write contract: workers append `<!-- T<N>-DONE -->` as the last line of the done-report after `mv`, downstream lanes pass that sentinel to the helper.

CLI:

```
bash wait-for-upstream.sh <upstream-lane-id> [--hard-timeout-min N] [--min-lines N] [--sentinel <line>]
```

For the full implementation (log/ready/trap helpers, stat portability, ERR + INT trap routing, sentinel matching via awk): if you have a hardened copy from an earlier session, copy it byte-for-byte into the new session dir; if you do not, write it from the template and the behavioural contract above, and do not skip any of those hardening points.

**Chat output format** — one box per terminal. Each box self-contains the model command, the start condition, and the read+execute instruction. Boxes are the only output the owner copy-pastes; no thin prompts, no preamble lines, no role bullet lists outside the boxes.

**This REPLACES Step 4's default box format.** Strict-mode runs emit only the strict-mode header + per-terminal boxes below — never both formats.

**Per-terminal box template** (use literal Unicode glyphs `╭ ╮ ╰ ╯ ─ │ · ▶ ⏸ ◆`):

```
╭─ T<N> · <Model> · <short role> ─────────────────────────────╮
│  $ claude --model <model-id>                                │
│  <start-state>                                              │
│  Read <ABS_PATH_TO_T<N>.md> end-to-end, then execute the    │
│  BEGIN block — no pause for confirm/summary/clarification.  │
╰─────────────────────────────────────────────────────────────╯
```

Substitutions:
- `<Model>` — display label: `Opus`, `Sonnet`, or `Haiku`
- `<model-id>` — exact CLI flag value: `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`. In strict mode T1 defaults to `claude-opus-4-7` (rule 1 above). In non-strict mode T1 uses bare `$ claude` (no flag).
- `<short role>` — 2–5 word role name, e.g. `Orchestrator`, `meta-corrections GATE`, `ecosystem.config fixes`, `discord-claude-bot`, `housekeeping`
- `<start-state>` — exactly one of:
  - `▶ start immediately` — no upstream dependency
  - `⏸ polls for T<M>-MERGED` — downstream of a gate
  - `◆ reviews done-reports as they land` — T1 in gated runs
  - `◆ waits for all *-done.md` — T1 in non-gated runs
- `<ABS_PATH_TO_T<N>.md>` — literal absolute path. If it overflows 63 cols, let the row widen — do not split the path.

The "no pause for confirm/summary/clarification" phrasing is the condensed equivalent of the full "without stopping for confirmation, clarification, summary, recap, or 'should I proceed?'" wording required by rule (2) above. Keep this exact short phrasing in the box — it's the minimum that reliably suppresses the worker LLM's "should I pause to summarize?" reflex.

**Box ordering in chat output:**
1. Strict-mode header box (shown below) — printed once at the top
2. Workers (T2, T3, T4, T5) — `▶ start immediately` boxes first, then `⏸ polls …` boxes
3. T1 box LAST (so when the owner copy-pastes top-to-bottom, T1's prompt lands in the last terminal they open, which is the one that needs to start latest)
4. Exactly one blank line between boxes — no prose, no headers, no separators
5. After the T1 box (one blank line below), print the closing line. **The closing line depends on invocation mode** (see "Programmatic invocation contract" section near the end of this file):
   - **Direct invocation** (the owner typed `/splittasks` themselves) — print the auto-launch line, then the skill execs LAUNCH.sh as its final tool call (no `begin` handshake, no abort window):
     ```
     ▶ Auto-launching all <N> terminals via <ABS_SESSION_DIR>/LAUNCH.sh.
     ```
   - **Programmatic invocation** (caller skill like `/audit-fix` invoked /splittasks) — print the caller-readiness line instead (the caller, not /splittasks, fires LAUNCH.sh):
     ```
     [splittasks] Session files written at <ABS_SESSION_DIR>. Caller skill must execute: bash <ABS_SESSION_DIR>/LAUNCH.sh
     ```
   See "Auto-launch wiring" section below for the LAUNCH.sh contents + direct-mode final-step exec.

**Strict-mode briefing header (the only header — printed once at the top, before any per-terminal box):**

```
╭─ SPLIT PLAN (strict mode) ──────────────────────────────────╮
│  Goal      [goal summary]                                   │
│  Session   <SESSION_ID>                                     │
│  Dir       ./splits/<SESSION_ID>/                           │
│  Mode      strict gated · codex+verifier per PR · Opus T1   │
╰─────────────────────────────────────────────────────────────╯
```

**Example output** (3-worker gated run, goal "Fix all 9 client-repo audit findings"):

```
╭─ SPLIT PLAN (strict mode) ──────────────────────────────────╮
│  Goal      Fix all 9 client-repo audit findings             │
│  Session   20260602-1259-audit-9fixes                       │
│  Dir       ./splits/20260602-1259-audit-9fixes/             │
│  Mode      strict gated · codex+verifier per PR · Opus T1   │
╰─────────────────────────────────────────────────────────────╯

╭─ T2 · Opus · meta-corrections GATE ─────────────────────────╮
│  $ claude --model claude-opus-4-7                           │
│  ▶ start immediately                                        │
│  Read /Users/you/dev/client-repo/splits/20260602-1259-audit-9fixes/T2.md end-to-end, then execute the
│  BEGIN block — no pause for confirm/summary/clarification.  │
╰─────────────────────────────────────────────────────────────╯

╭─ T4 · Opus · discord-claude-bot ────────────────────────────╮
│  $ claude --model claude-opus-4-7                           │
│  ▶ start immediately                                        │
│  Read /Users/you/dev/client-repo/splits/20260602-1259-audit-9fixes/T4.md end-to-end, then execute the
│  BEGIN block — no pause for confirm/summary/clarification.  │
╰─────────────────────────────────────────────────────────────╯

╭─ T5 · Sonnet · housekeeping ────────────────────────────────╮
│  $ claude --model claude-sonnet-4-6                         │
│  ▶ start immediately                                        │
│  Read /Users/you/dev/client-repo/splits/20260602-1259-audit-9fixes/T5.md end-to-end, then execute the
│  BEGIN block — no pause for confirm/summary/clarification.  │
╰─────────────────────────────────────────────────────────────╯

╭─ T3 · Opus · ecosystem.config fixes ────────────────────────╮
│  $ claude --model claude-opus-4-7                           │
│  ⏸ polls for T2-MERGED                                      │
│  Read /Users/you/dev/client-repo/splits/20260602-1259-audit-9fixes/T3.md end-to-end, then execute the
│  BEGIN block — no pause for confirm/summary/clarification.  │
╰─────────────────────────────────────────────────────────────╯

╭─ T1 · Opus · Orchestrator + gated reviewer ─────────────────╮
│  $ claude --model claude-opus-4-7                           │
│  ◆ reviews done-reports as they land                        │
│  Read /Users/you/dev/client-repo/splits/20260602-1259-audit-9fixes/T1.md end-to-end, then execute the
│  BEGIN block — no pause for confirm/summary/clarification.  │
╰─────────────────────────────────────────────────────────────╯
```

(Notice the Read line is allowed to overflow 63 cols for real abs paths — do not split the path to fit.)

---

## Auto-launch wiring (applies to default + strict modes)

After the briefing boxes are written to chat, the skill ALSO writes `<SESSION_DIR>/LAUNCH.sh` and — in direct invocation — execs it as the skill's final tool call. No `begin` handshake, no abort window: `/splittasks <goal>` is one turn, terminals open immediately. Manual paste of the boxes still works if osascript fails or the user prefers it.

The exec path is a Terminal.app dispatch: `claude --model <id> --permission-mode auto "<prompt>"` wrapped in `osascript -e 'tell application "Terminal" to do script ...'`. Lanes run in `--permission-mode auto`, never with `--dangerously-skip-permissions`: auto mode approves the routine work and still refuses what it should refuse. T1 never merges with `--admin` (rule 8).

### LAUNCH.sh template

The skill writer fills in the `<…>` placeholders + emits one `spawn …` line per lane in this order: ▶ workers first, then ⏸ downstream workers, then T1 last (with a 2s delay so its first poll observes workers spawning).

```bash
#!/usr/bin/env bash
# Auto-launcher for /splittasks session <SESSION_ID>
# Generated <ISO-TIMESTAMP>
# Manual run:    bash "<ABS_SESSION_DIR>/LAUNCH.sh"
# Auto-trigger:  /splittasks execs this as its final tool call (direct mode).

set -euo pipefail

SESSION_ID="<SESSION_ID>"
SESSION_DIR="<ABS_SESSION_DIR>"
PROJECT_ROOT="<ABS_PROJECT_ROOT>"

# Worktree-mode session facts (written by the skill writer in Step 3).
# SESSION.env contains: BASE_SHA, BASE_BRANCH, REMOTE, WT_ROOT, SHARED_CWD_MODE.
if [ -f "$SESSION_DIR/SESSION.env" ]; then
  # shellcheck disable=SC1091
  . "$SESSION_DIR/SESSION.env"
else
  echo "[splittasks-launch] FATAL: $SESSION_DIR/SESSION.env not found — re-run /splittasks." >&2
  exit 3
fi

# ── Safe quoting helpers (declared early so worktree setup can use them in error messages).
shell_quote() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }
applescript_quote() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

# ── Idempotency guard: refuse double-launch (codex 2026-06-04 HIGH item).
if [ -f "$SESSION_DIR/LAUNCHED" ] && [ "${SPLITTASKS_FORCE_RELAUNCH:-0}" != "1" ]; then
  echo "[splittasks-launch] LAUNCHED sentinel exists at $SESSION_DIR/LAUNCHED" >&2
  echo "  set SPLITTASKS_FORCE_RELAUNCH=1 to override, or use the per-lane RELAUNCH-T<N>.sh." >&2
  exit 2
fi

# ── Per-lane lane registry. Bash 3.2 — no associative arrays / namerefs.
# Skill writer emits a space-separated LANES list (spawn order = first to last)
# and two case functions:
#   LANES="T2 T3 T4 T5 T1"
#   lane_model() { case "$1" in T1) echo "claude-sonnet-4-6" ;; T2) echo "claude-opus-4-7" ;; ... esac }
#   lane_role()  { case "$1" in T1) echo "Orchestrator" ;; T2) echo "M5 Proposer skeleton" ;; ... esac }
# <LANE_REGISTRY_PLACEHOLDER>  ← skill writer substitutes the three lines above.

# ── Worktree setup (serial, rollback on failure). Skip entirely if SHARED_CWD_MODE=1.
created_worktrees=()
created_branches=()

rollback_partial() {
  local i wt br
  echo "[splittasks-launch] rolling back partial worktree setup …" >&2
  for ((i=${#created_worktrees[@]}-1; i>=0; i--)); do
    wt="${created_worktrees[i]}"
    git -C "$PROJECT_ROOT" worktree remove --force "$wt" 2>/dev/null \
      || echo "[splittasks-launch] WARN: could not auto-remove worktree $wt — manual: git -C '$PROJECT_ROOT' worktree remove --force '$wt'" >&2
  done
  for ((i=${#created_branches[@]}-1; i>=0; i--)); do
    br="${created_branches[i]}"
    git -C "$PROJECT_ROOT" branch -D "$br" 2>/dev/null \
      || echo "[splittasks-launch] WARN: could not auto-delete branch $br — manual: git -C '$PROJECT_ROOT' branch -D '$br'" >&2
  done
}

setup_worktree() {
  local lane="$1"   # e.g. T2
  local nshort="${lane#T}"
  local branch="splittasks/$SESSION_ID/t${nshort}"
  local wt="$WT_ROOT/$lane"

  # Idempotency (RELAUNCH path or re-run after partial failure).
  if [ -e "$wt/.git" ]; then
    local cur_branch
    cur_branch=$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
    if [ "$cur_branch" = "$branch" ]; then
      printf '[splittasks-launch] worktree %s already at %s — reusing\n' "$lane" "$branch"
      return 0
    else
      echo "[splittasks-launch] FATAL: $wt exists but is on branch '$cur_branch' (expected '$branch'). Inspect manually." >&2
      return 1
    fi
  fi

  mkdir -p "$(dirname "$wt")"
  if ! git -C "$PROJECT_ROOT" worktree add -b "$branch" "$wt" "$BASE_SHA"; then
    return 1
  fi
  created_worktrees+=("$wt")
  created_branches+=("$branch")

  if [ -f "$wt/.gitmodules" ]; then
    git -C "$wt" submodule update --init --recursive \
      || echo "[splittasks-launch] WARN: submodule init failed for $lane (continuing)" >&2
  fi

  printf '[splittasks-launch] worktree %s created at %s (branch %s, base %s)\n' \
    "$lane" "$wt" "$branch" "${BASE_SHA:0:12}"
}

if [ "${SHARED_CWD_MODE:-0}" = "1" ]; then
  echo "⚠ [splittasks-launch] SHARED-CWD MODE ACTIVE — lanes share working tree; contamination risk." >&2
else
  for lane in $LANES; do
    if ! setup_worktree "$lane"; then
      rollback_partial
      echo "[splittasks-launch] FATAL: worktree setup failed for $lane — aborting before any spawn." >&2
      exit 3
    fi
  done
fi

# ── Cross-platform terminal spawn helpers (macOS / Windows / Linux).
# Replaces the old macOS-only osascript guard so /splittasks works on Windows
# (Git Bash + Windows Terminal) and Linux too. The exit-code contract is preserved:
# if this OS has NO terminal launcher available, spawn() prints manual launchers and
# exits 4 (callers like /audit-fix gate on non-zero = dispatch failed → do NOT mark 'fixing').
detect_os() {
  case "$(uname -s)" in
    Darwin*)              echo "macos" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    Linux*)               echo "linux" ;;
    *)                    echo "unknown" ;;
  esac
}
# Git Bash path (/c/Users/..) -> Windows path (C:\Users\..) for native Windows programs.
to_win_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s\n' "$1"; fi; }
# The command each terminal runs; keeps the window open after claude exits (exec bash -i).
build_inner_cmd() {
  printf 'cd %q && claude --model %q --permission-mode auto %q; rc=$?; echo; echo "[claude exited: $rc]"; exec bash -i' "$1" "$2" "$3"
}
print_manual_launcher() {
  local lane="$1" model_id="$2" cwd="$3" prompt="$4" inner
  inner="$(build_inner_cmd "$cwd" "$model_id" "$prompt")"
  printf '[splittasks-launch] FATAL: no terminal launcher for %s on this OS — run manually:\n  bash -lc %q\n' "$lane" "$inner" >&2
}

spawn() {
  # Single-arg: pass the lane id. Model + role come from the registry case functions.
  # Cross-platform: opens ONE terminal per lane running the same inner command.
  local lane="$1"
  local model_id role cwd prompt os inner_cmd
  model_id=$(lane_model "$lane")
  role=$(lane_role "$lane")
  cwd="$WT_ROOT/$lane"
  [ "${SHARED_CWD_MODE:-0}" = "1" ] && cwd="$PROJECT_ROOT"
  prompt="Read ${SESSION_DIR}/${lane}.md end-to-end, then execute the BEGIN block — no pause for confirm/summary/clarification."
  os="$(detect_os)"
  inner_cmd="$(build_inner_cmd "$cwd" "$model_id" "$prompt")"

  case "$os" in
    macos)
      command -v osascript >/dev/null 2>&1 || { print_manual_launcher "$lane" "$model_id" "$cwd" "$prompt"; exit 4; }
      osascript - "bash -lc $(printf '%q' "$inner_cmd")" >/dev/null <<'APPLESCRIPT'
on run argv
  tell application "Terminal"
    activate
    do script (item 1 of argv)
  end tell
end run
APPLESCRIPT
      ;;
    windows)
      command -v cygpath >/dev/null 2>&1 || { print_manual_launcher "$lane" "$model_id" "$cwd" "$prompt"; exit 4; }
      local bash_win cwd_win
      bash_win="$(to_win_path "$(command -v bash)")"
      cwd_win="$(to_win_path "$cwd")"
      if command -v wt.exe >/dev/null 2>&1; then
        # Windows Terminal: a NEW tab in a dedicated per-session window named
        # "splittasks-<SESSION_ID>" (created on the first lane, reused by the rest) — so it
        # never hijacks a window you already have open. MSYS2_ARG_CONV_EXCL='*' stops Git Bash
        # from mangling args meant for a native exe.
        MSYS2_ARG_CONV_EXCL='*' wt.exe -w "splittasks-$SESSION_ID" new-tab --title "splittasks:$lane" \
          --startingDirectory "$cwd_win" "$bash_win" -lc "$inner_cmd" \
          || printf '[splittasks-launch] WARN: wt.exe spawn failed for %s\n' "$lane" >&2
      elif command -v powershell.exe >/dev/null 2>&1; then
        # Fallback: a separate console window running Git Bash (inner_cmd already cd's).
        MSYS2_ARG_CONV_EXCL='*' SPLITTASKS_BASH_WIN="$bash_win" SPLITTASKS_CMD="$inner_cmd" \
          powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \
          'Start-Process -FilePath $env:SPLITTASKS_BASH_WIN -ArgumentList @("-lc", $env:SPLITTASKS_CMD)' \
          || printf '[splittasks-launch] WARN: powershell spawn failed for %s\n' "$lane" >&2
      else
        print_manual_launcher "$lane" "$model_id" "$cwd" "$prompt"; exit 4
      fi
      ;;
    linux)
      if command -v gnome-terminal >/dev/null 2>&1; then
        gnome-terminal --title="splittasks:$lane" -- bash -lc "$inner_cmd" || printf '[splittasks-launch] WARN: gnome-terminal failed for %s\n' "$lane" >&2
      elif command -v konsole >/dev/null 2>&1; then
        konsole --new-tab --workdir "$cwd" -e bash -lc "$inner_cmd" || printf '[splittasks-launch] WARN: konsole failed for %s\n' "$lane" >&2
      elif command -v x-terminal-emulator >/dev/null 2>&1; then
        x-terminal-emulator -e bash -lc "$inner_cmd" || printf '[splittasks-launch] WARN: x-terminal-emulator failed for %s\n' "$lane" >&2
      else
        print_manual_launcher "$lane" "$model_id" "$cwd" "$prompt"; exit 4
      fi
      ;;
    *)
      print_manual_launcher "$lane" "$model_id" "$cwd" "$prompt"; exit 4 ;;
  esac
  printf '[splittasks-launch] spawned %s · %s · %s (cwd=%s)\n' "$lane" "$role" "$model_id" "$cwd"
}

# ── Pre-populate workspace-trust state so spawned `claude` sessions skip the
# "Do you trust the files in this folder?" dialog. Without this, every
# spawned worker (whatever its permission mode) still halts on the
# trust dialog because workspace-trust is a SEPARATE gate from tool
# permissions. The helper writes `hasTrustDialogAccepted: true` (and
# `hasCompletedProjectOnboarding: true`) into `~/.claude.json` under the
# claude.json.lock for each worktree path. In SHARED_CWD_MODE the cwd is
# $PROJECT_ROOT which is usually already trusted, so we skip pre-population.
#
# Failure handling depends on invocation mode (codex review 2026-06-04 #5):
#   - Direct /splittasks (interactive user): WARN-and-continue. User can
#     answer the dialog manually if it appears.
#   - Autonomous /audit-fix dispatch (SPLITTASKS_AUTONOMOUS=1): FATAL. If we
#     can't pre-trust, spawned workers will block on a dialog the headless
#     session can never answer, /audit-fix would still mutate index.json to
#     'fixing', and the chain wedges. Better to fail loudly before any spawn.
if [ "${SHARED_CWD_MODE:-0}" != "1" ]; then
  trust_paths=()
  for lane in $LANES; do
    trust_paths+=("$WT_ROOT/$lane")
  done
  trust_helper="$HOME/.claude/skills/splittasks/claude-trust-paths.sh"
  trust_ok=1
  if [ -f "$trust_helper" ]; then
    if ! bash "$trust_helper" "${trust_paths[@]}"; then
      trust_ok=0
      echo "[splittasks-launch] trust pre-population FAILED (helper exit non-zero)" >&2
    fi
  else
    trust_ok=0
    echo "[splittasks-launch] $trust_helper missing" >&2
  fi
  if [ "$trust_ok" -ne 1 ]; then
    if [ "${SPLITTASKS_AUTONOMOUS:-0}" = "1" ]; then
      echo "[splittasks-launch] FATAL: autonomous mode requires successful trust pre-population; aborting before spawn" >&2
      rollback_partial
      exit 5
    else
      echo "[splittasks-launch] WARN: continuing without pre-trust; spawned sessions may show the 'trust this file' dialog" >&2
    fi
  fi
fi

# Focus the terminal app once so windows surface predictably (macOS only; no-op elsewhere).
[ "$(detect_os)" = "macos" ] && osascript -e 'tell application "Terminal" to activate' >/dev/null || true

# ── workers (▶ start immediately) ──
# spawn <N> "<model-id>" "<role>"   (skill writer emits one line per ▶ worker)

# ── downstream workers (⏸ polling) ──
# spawn <N> "<model-id>" "<role>"   (one line per ⏸ worker)

# ── T1 last, after 2s ──
sleep 2
# spawn 1 "<T1-model-id>" "<T1-role>"

# ── Mark launched so a re-run doesn't double-spawn.
touch "$SESSION_DIR/LAUNCHED"

printf '[splittasks-launch] all <N> terminals dispatched for session %s\n' "$SESSION_ID"
```

Constraints the skill writer enforces while emitting LAUNCH.sh:

- **Roles can contain any text** — `shell_quote` and `applescript_quote` handle escaping. No special sanitisation needed for `"`, `'`, or `\` in role strings, paths, or prompts.
- **Paths must be absolute.** `SESSION_DIR`, `PROJECT_ROOT`, and `WT_ROOT` are absolute (Step 3 computes them; SESSION.env persists them).
- **One `spawn` line per lane**, in the order ▶ workers → ⏸ workers → T1.
- **`chmod +x LAUNCH.sh` after writing**, so `bash LAUNCH.sh` and direct `./LAUNCH.sh` both work.
- **Fallback echo block must include EVERY lane**, not just workers — useful when osascript is unavailable (e.g., a non-macOS box reading the same session dir). Each fallback `cd` target is the lane's WORKTREE path, not `$PROJECT_ROOT` (unless `SHARED_CWD_MODE=1`).
- **NEVER hard-code `claude-opus-4-7` for non-strict T1**; honour the routing table (default Sonnet, strict Opus).
- **Emit one `RELAUNCH-T<N>.sh` per lane** alongside LAUNCH.sh — see the "Per-lane RELAUNCH scripts" section below. They use the same `shell_quote`/`applescript_quote` helpers.
- **Emit `SESSION.env`** alongside LAUNCH.sh — a key=value file LAUNCH.sh + every RELAUNCH sources. Must contain (one per line, no quoting needed because values are SHA/branch/path with no spaces by construction):
  ```
  BASE_SHA=<sha-captured-in-step3>
  BASE_BRANCH=<branch-captured-in-step3>
  REMOTE=<remote-name-captured-in-step3>
  WT_ROOT=<HOME/.claude/splittasks-worktrees/<project-slug>/<session-id>>
  SHARED_CWD_MODE=<0|1>
  ```
- **Emit the LANE_REGISTRY placeholder substitution** — see the `LANE_REGISTRY_PLACEHOLDER` comment block in the template for the exact shape (bash 3.2: a `LANES="…"` string + `lane_model()` and `lane_role()` case functions). Order in `LANES` matches spawn order. Without this, the worktree-setup loop has nothing to iterate.
- **Spawn cwd MUST be the worktree.** The template's `spawn()` already resolves `cwd="$WT_ROOT/T${n}"` — do not hand-edit `cd $PROJECT_ROOT` back in. The whole point of this template is that lanes start in their isolated worktree.
- **Pre-populate workspace-trust before the spawn loop.** The template includes a block that invokes `~/.claude/skills/splittasks/claude-trust-paths.sh` (bundled with this skill) on every lane's worktree path AFTER worktree setup completes and BEFORE the `osascript` activate. Without this, every spawned worker (whatever its permission mode) stalls on Claude Code's separate workspace-trust dialog ("Do you trust the files in this folder?") on first entry to a never-seen directory. Worktree paths are fresh every session → every session hits the dialog without this pre-population. Failure of the helper is a WARN, not an abort. Skipped entirely in `SHARED_CWD_MODE=1` since the cwd is `$PROJECT_ROOT` which is usually already trusted. **If a future revision drops this block, the trust-dialog regression returns.**

### Per-lane RELAUNCH scripts (one per lane)

Each lane gets a standalone `<SESSION_DIR>/RELAUNCH-T<N>.sh` that re-spawns just that lane. Generated alongside LAUNCH.sh. Required because:

1. **Restart after abort** — if a downstream lane writes NEEDS-UPSTREAM (hard timeout) and the owner fixes the upstream issue, RELAUNCH restarts cleanly.
2. **Restart after individual crash** — a single window's claude session can error out (network, model availability); we restart just that one window.

The script MUST clear lane-local state before re-spawning, otherwise:
- A stale `T<N>-REVIEWED` from a prior abort makes T1 ignore the successor done-report.
- A stale `.wait-T<upstream>.started` makes the helper's hard deadline appear already exhausted on the relaunched worker.

**Template:**

**Substitution discipline:** the skill writer fills in every `<…>` placeholder below. Wherever the placeholder is interpolated into a shell assignment (`SDIR=…`, `ROLE=…`, etc.), the writer MUST first pass the literal value through `shell_quote` (defined below) and emit the result as `SDIR='<shell-quoted-value>'`. Raw substitution of an unsanitised path or role string breaks the script on any value containing `'`, `"`, or `\`. The template shows the placeholders inside single quotes as a syntactic reminder — replace each placeholder with a SHELL-QUOTED literal, not just the raw value.

```bash
#!/usr/bin/env bash
# Relaunch helper for T<N> · <role> · <SESSION_ID>
set -euo pipefail

# Skill writer: substitute each placeholder with a shell-quoted literal.
# Example for ROLE: if role string is "M4 fingerprint MERGE GATE", emit
#   ROLE='M4 fingerprint MERGE GATE'
# If role contained a single quote, emit (e.g.) ROLE='Bob'\''s lane'.
SDIR='<ABS_SESSION_DIR>'
PROJECT_ROOT='<ABS_PROJECT_ROOT>'
LANE='T<N>'
MODEL='<model-id>'
ROLE='<role>'
HAS_UPSTREAM='<true|false>'
UPSTREAM_LANE='<T<upstream-N> or empty>'

# Load session facts (BASE_SHA, WT_ROOT, REMOTE, SHARED_CWD_MODE).
if [ -f "$SDIR/SESSION.env" ]; then
  # shellcheck disable=SC1091
  . "$SDIR/SESSION.env"
else
  echo "[relaunch] FATAL: $SDIR/SESSION.env missing — was this a worktree-mode session?" >&2
  exit 3
fi

WORKTREE="${WT_ROOT}/${LANE}"
BRANCH_NSHORT="${LANE#T}"
BRANCH="splittasks/<SESSION_ID>/t${BRANCH_NSHORT}"

# State cleanup so a successor event reprocesses cleanly.
rm -f "$SDIR/${LANE}-NEEDS-UPSTREAM.md" "$SDIR/${LANE}-REVIEWED" "$SDIR/${LANE}-ABORTED" 2>/dev/null || true
if [ "$HAS_UPSTREAM" = "true" ] && [ -n "$UPSTREAM_LANE" ]; then
  rm -f "$SDIR/.wait-${UPSTREAM_LANE}.started" "$SDIR/.wait-${UPSTREAM_LANE}.log" 2>/dev/null || true
fi

# Worktree idempotency: re-create only if missing. NEVER auto-delete a worktree
# with uncommitted changes — that's the original incident class.
if [ "${SHARED_CWD_MODE:-0}" != "1" ]; then
  if [ -e "$WORKTREE/.git" ]; then
    cur_branch=$(git -C "$WORKTREE" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
    if [ "$cur_branch" != "$BRANCH" ]; then
      echo "[relaunch] FATAL: $WORKTREE exists but is on '$cur_branch', not '$BRANCH'. Manual check required." >&2
      exit 3
    fi
    echo "[relaunch] reusing existing worktree at $WORKTREE on $BRANCH"
  else
    mkdir -p "$(dirname "$WORKTREE")"
    if ! git -C "$PROJECT_ROOT" worktree add -b "$BRANCH" "$WORKTREE" "$BASE_SHA"; then
      echo "[relaunch] FATAL: git worktree add failed for $LANE" >&2
      exit 3
    fi
    [ -f "$WORKTREE/.gitmodules" ] && git -C "$WORKTREE" submodule update --init --recursive \
      || true
    echo "[relaunch] created worktree at $WORKTREE on $BRANCH (base ${BASE_SHA:0:12})"
  fi
fi

shell_quote() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }
applescript_quote() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

# Pre-populate workspace-trust for the lane's worktree so the relaunched
# `claude` session skips the "trust this file" dialog. Same rationale as
# LAUNCH.sh's pre-spawn block. WARN on failure; do not abort.
if [ "${SHARED_CWD_MODE:-0}" != "1" ] && [ -f "$HOME/.claude/skills/splittasks/claude-trust-paths.sh" ]; then
  bash "$HOME/.claude/skills/splittasks/claude-trust-paths.sh" "$WORKTREE" \
    || echo "[relaunch] WARN: trust pre-population failed; relaunched session may show the 'trust this file' dialog" >&2
fi

CWD="$WORKTREE"
[ "${SHARED_CWD_MODE:-0}" = "1" ] && CWD="$PROJECT_ROOT"

PROMPT="Read $SDIR/${LANE}.md end-to-end, then execute the BEGIN block — no pause for confirm/summary/clarification."
INNER=$(printf 'cd %q && claude --model %q --permission-mode auto %q; rc=$?; echo; echo "[claude exited: $rc]"; exec bash -i' "$CWD" "$MODEL" "$PROMPT")

# Cross-platform relaunch (same OS branches as LAUNCH.sh's spawn()).
case "$(uname -s)" in
  Darwin*)
    osascript - "bash -lc $(printf '%q' "$INNER")" >/dev/null <<'APPLESCRIPT'
on run argv
  tell application "Terminal"
    activate
    do script (item 1 of argv)
  end tell
end run
APPLESCRIPT
    ;;
  MINGW*|MSYS*|CYGWIN*)
    BASH_WIN=$(cygpath -w "$(command -v bash)"); CWD_WIN=$(cygpath -w "$CWD")
    if command -v wt.exe >/dev/null 2>&1; then
      MSYS2_ARG_CONV_EXCL='*' wt.exe -w "splittasks-$(basename "$SDIR")" new-tab --title "splittasks:$LANE (relaunch)" \
        --startingDirectory "$CWD_WIN" "$BASH_WIN" -lc "$INNER" || echo "[relaunch] WARN: wt.exe failed" >&2
    elif command -v powershell.exe >/dev/null 2>&1; then
      MSYS2_ARG_CONV_EXCL='*' SPLITTASKS_BASH_WIN="$BASH_WIN" SPLITTASKS_CMD="$INNER" \
        powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \
        'Start-Process -FilePath $env:SPLITTASKS_BASH_WIN -ArgumentList @("-lc", $env:SPLITTASKS_CMD)' \
        || echo "[relaunch] WARN: powershell failed" >&2
    else
      echo "[relaunch] FATAL: no terminal launcher — run manually: bash -lc $(printf '%q' "$INNER")" >&2; exit 4
    fi
    ;;
  Linux*)
    if command -v gnome-terminal >/dev/null 2>&1; then gnome-terminal --title="splittasks:$LANE (relaunch)" -- bash -lc "$INNER" || echo "[relaunch] WARN: gnome-terminal failed" >&2
    elif command -v x-terminal-emulator >/dev/null 2>&1; then x-terminal-emulator -e bash -lc "$INNER" || echo "[relaunch] WARN: x-terminal-emulator failed" >&2
    else echo "[relaunch] FATAL: no terminal launcher — run manually: bash -lc $(printf '%q' "$INNER")" >&2; exit 4; fi
    ;;
  *)
    echo "[relaunch] FATAL: unknown OS — run manually: bash -lc $(printf '%q' "$INNER")" >&2; exit 4 ;;
esac
echo "[relaunch] ${LANE} spawned (cwd=$CWD)"
```

Reference implementations: the `RELAUNCH-T<n>.sh` files of your own earlier sessions, if you have any; otherwise the template above is complete. `chmod +x` after writing.

### Final-step auto-launch (direct invocation, single turn)

In direct invocation, `/splittasks` execs `bash <ABS_SESSION_DIR>/LAUNCH.sh` as the final tool call of the same turn. No `begin` handshake, no abort window — the user already invoked `/splittasks`, that's the consent. Sequence inside the skill turn:

1. **Print briefing boxes** (Step 4 / strict-mode rule #5).
2. **Print one closing line**: `▶ Auto-launching all <N> terminals via <ABS_SESSION_DIR>/LAUNCH.sh.`
3. **Exec** `bash <ABS_SESSION_DIR>/LAUNCH.sh`. Stream stdout to chat (each `spawned T<N>` line surfaces).
4. **Confirm**: `All <N> terminals dispatched. T1 is reviewing as done-reports land.`

If LAUNCH.sh's exit code is non-zero, print captured stderr verbatim and surface the manual launchers from the fallback echo block — do NOT silently succeed.

Aborting after dispatch is per-window (Cmd-W or Ctrl-C inside each Terminal). The `LAUNCHED` sentinel inside the session dir prevents accidental double-spawn on re-run; override with `SPLITTASKS_FORCE_RELAUNCH=1`.

### Permissions policy

- Every dispatched lane, T1 included, runs with `--permission-mode auto`. Never `--dangerously-skip-permissions`: it is not something a skill can pre-authorize on your behalf.
- T1 reviews and comments; the merge is the owner's (rule 8). Never `gh pr merge --admin`.
- Terminal.app window titles set via `osascript` (no separate consent — pure cosmetics).

### What this auto-launch path does NOT do

- Does NOT push, merge, or call `gh` itself — those actions live inside the spawned worker lanes' BEGIN blocks.
- Does NOT wait for completion — worker terminals run independently; T1 writes T1-done.md when the session resolves.
- Does NOT abort spawned terminals on user change-of-mind — close each individually (Cmd-W or Ctrl-C).

---

## Programmatic invocation contract (called by /audit-fix or another caller skill)

When `/splittasks` is invoked by another skill (typically `/audit-fix`) rather than directly by the owner typing `/splittasks`, the lifecycle is different:

1. **/splittasks writes session files exactly as usual** — `T*.md`, `MASTER.md`, `SESSION.env`, `LAUNCH.sh`, `RELAUNCH-T*.sh`. The file shape is identical to the direct-invocation path.
2. **/splittasks prints the briefing boxes** — for audit-trail visibility. The owner and the calling skill both see the dispatched plan in the chat log.
3. **/splittasks SKIPS the direct-mode auto-launch line.** That line is a UX affordance for human invocation only. When a caller skill is on the stack, it's misleading (the caller is about to fire LAUNCH.sh itself).
4. **/splittasks DOES NOT execute `LAUNCH.sh` itself.** Firing the launcher is the **caller skill's responsibility**. The caller is expected to run `bash <ABS_SESSION_DIR>/LAUNCH.sh` as its next step after this skill returns.
5. **/splittasks signals readiness** by printing one literal line as its FINAL stdout:
   ```
   [splittasks] Session files written at <ABS_SESSION_DIR>. Caller skill must execute: bash <ABS_SESSION_DIR>/LAUNCH.sh
   ```
   The caller parses `<ABS_SESSION_DIR>` from this line.

### How to detect programmatic invocation

Look at the user's most recent message and the conversation context:

- The user typed `/splittasks <goal>` directly → **direct invocation**. Emit the auto-launch line and exec `bash <SESSION_DIR>/LAUNCH.sh` as the final tool call.
- The user typed `/audit-fix …` (or another caller) AND the conversation shows that caller skill's instructions are on the stack → **programmatic invocation**. SKIP the auto-launch line AND the LAUNCH.sh exec. Print the caller-readiness line instead.
- Ambiguous (e.g., a skill that says "now run /splittasks but don't auto-launch") → default to programmatic mode and let the caller decide.

### Why the contract is split this way

The caller skill (e.g. `/audit-fix`) owns the post-LAUNCH steps (mutating `index.json` to `fixing`, gating those mutations on launcher success). If `/splittasks` fired LAUNCH.sh itself in programmatic mode, the caller would have to re-check the launcher's exit code by other means. Putting `bash LAUNCH.sh` in the caller's hands lets the caller `set -e`-style chain: write files → fire launcher → mutate state, with a clean abort at any step. Direct mode has no such caller, so /splittasks fires it itself.

### What caller skills MUST do

- After /splittasks returns, execute `bash <SESSION_DIR>/LAUNCH.sh` and wait for the launcher's stdout `[splittasks-launch] all N terminals dispatched`.
- Treat a non-zero LAUNCH.sh exit as a hard failure — do NOT proceed with downstream state mutations that assume terminals are running.
- If `osascript` is unavailable and LAUNCH.sh prints the manual-launcher fallback, surface those commands to the user — do NOT silently succeed without dispatching terminals.

### Existing callers

- `/audit-fix` — see `~/.claude/skills/audit-fix/SKILL.md` step 6d. Fires LAUNCH.sh after /splittasks writes the session, then mutates `index.json` only on launcher success.

---

**Followups:** see `FOLLOWUPS.md` next to this file for the deferred-improvements queue.
