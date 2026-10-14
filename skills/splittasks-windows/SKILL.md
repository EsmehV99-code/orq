---
# managed-by: orq
name: splittasks-windows
description: Split a complex goal into parallel terminal workstreams. Assigns each terminal a role and model (Sonnet/Opus; never Haiku), writes handoff .md files to ./splits/ in the project root, opens the terminals itself (wt.exe + Git Bash, lanes in --permission-mode auto) and prints a briefing. (Windows variant. Installed by hand: orq's installer copies it to ~/.claude/skills/splittasks/, so /splittasks invokes it. As a plugin: /orq:splittasks-windows)
triggers: ["/splittasks"]
---

# /splittasks — Multi-Terminal Parallel Orchestration (Windows)

> **Platform variant: Windows** (Git Bash + Windows Terminal). The macOS variant lives at
> `skills/splittasks-macos/` in the orq repo. Installed by hand, `node ~/.claude/skills/orq/scripts/install.js`
> copies the right one for your OS to `~/.claude/skills/splittasks/`, so the command is `/splittasks`.
> As the orq **plugin** nothing is copied: the skill is `/orq:splittasks-windows` and its files
> (`claude-trust-paths.sh`, `close-lanes.ps1`) stay in `${CLAUDE_PLUGIN_ROOT}/skills/splittasks-windows/`
> (Claude Code fills that variable in when it renders this skill; auto-launch rule 7 calls that folder
> `<SKILL_DIR>`). This variant has been tested on Windows (real runs; see the Changelog at the end).

Splits one big goal into parallel workstreams across multiple Claude Code terminals, each with the right model and a self-contained handoff file. Windows-only (Git Bash + Windows Terminal), unattended-safe.

---

## Why this exists — purpose, objective, and when to use it

**Mental model: an orchestrator and its employees.** **T1 is the orchestrator**; the other
terminals are its **employees**. Each employee is opened as a real, independent `claude`
session with the **model best suited to its task** — Opus for hard reasoning, Sonnet for
standard and mechanical building (never Haiku: it stalls in auto mode). The orchestrator hands each employee a
self-contained brief (`T*.md`), they work at the same time, and T1 collects their
done-reports, reviews them, and does the final integration.

**Objective:** push a large goal forward *efficiently* — split it into 2–4 independent pieces
that run **in parallel** instead of one agent grinding through everything serially, each piece
isolated so the employees never step on each other. Cheaper/faster models do the simple lanes;
Opus is spent only where the reasoning is genuinely hard.

**Why real terminals + git worktrees is what makes it work:**
- **Isolation (the core reason):** each employee works in its *own git worktree* (isolated
  branch + working directory), so lanes never overwrite each other or fight over one working
  tree. Integration happens deliberately at the end, not by accident mid-flight.
- **Right model per job:** you don't pay Opus prices for boilerplate, and you don't put Haiku
  on architecture — each lane gets the model its work deserves.
- **Visible & steerable:** every employee is a window you can watch, pause, or relaunch on its
  own (`RELAUNCH-T<n>.sh`) without touching the others.
- **Visible AND launched by the agent:** employees launch **interactive in auto mode**
  (`claude --permission-mode auto`), so you **watch each one work live** in its tab AND the
  orchestrating session can open them itself — no line for the owner to paste. Auto mode approves
  routine work through Claude Code's classifier; a lane may pause on an action the classifier
  refuses (same as the owner's own terminal). See Prerequisite below for why NOT bypass.

**Not the same as ultracode (don't confuse them):** ultracode fans out subagents *inside a
single Claude session* — shared context, no windows, ephemeral, results gathered in-process.
splittasks is its own, heavier-but-stronger tool: it opens **separate persistent terminals**,
each a full `claude` on its own branch. Use splittasks when lanes must *write code
independently without colliding*, when you want to watch/steer each employee live, or when the
work should keep running in real windows unattended.

**Account model:** this is a claude.ai **Max** login, NEVER an API key. Every spawned lane runs
`unset ANTHROPIC_API_KEY` first so an inherited (possibly invalid) key can't silently break the
lane's auth. All lanes are flat-rate — there is no per-token cost to spending Opus.

**Prerequisite / why auto mode and not bypass (decided by the owner 2026-09-24):** lanes run
interactive `claude --permission-mode auto`. Verified that day on Claude Code 2.1.282:
- The orchestrating session CANNOT spawn `claude --dangerously-skip-permissions`: the auto-mode
  classifier denies it ("Create Unsafe Agents"). With bypass, only a human could paste the launch
  line, and «the idea of splittasks is that YOU open the terminals» (the owner). So: **no bypass**.
- With `--permission-mode auto` the session CAN spawn the lane, and a Sonnet lane created its
  file in 10 s without asking anyone.
- The flag must be explicit: without it a lane starts in **manual** mode even though
  `~/.claude/settings.json` says `defaultMode: auto`, and stalls on the first "Do you want to…?".
- **Haiku lanes stall in auto mode** (kept asking permission with and without the flag). Never
  assign Haiku to a lane; use Sonnet for mechanical work or fold it into another lane.
- `skipDangerousModePermissionPrompt` is no longer required by this skill (it only mattered for
  bypass). Leaving it set does no harm.

---

## How to invoke

```
/splittasks [your goal here]
```

Run from the project root. The skill writes session files to `./splits/<SESSION_ID>/` inside
that project, not to a global directory.

---

## What Claude does when this skill runs

### Step 1 — Analyze the goal

Break the goal into 2–4 workstreams based on:
- What's independent vs. sequential
- What's complex (needs Opus) vs. standard or mechanical (Sonnet)
- What needs review vs. what needs building

By **default every lane is independent** — describe the lanes manually from the goal, one
concern each, explicit boundaries. Only make a lane depend on another lane's output when it
literally consumes that artifact (see "Optional — lane dependencies" at the end).

If the goal is too small to split (1 file, trivial), say so and do it directly instead.

### Step 2 — Assign terminals and models

| Terminal | Role | Model | Model id (CLI flag) | When to use |
|----------|------|-------|---------------------|-------------|
| T1 | Orchestrator + final reviewer | **Sonnet** | `claude-sonnet-5` | Always exists. Coordinates, waits for the worker lanes, verifies, merges them into the session integration branch, leaves a draft PR. Never merges into the base branch or the PR. |
| T2 | Primary builder | **Opus** | `claude-opus-5-5` | Complex logic, auth, architecture, hard reasoning |
| T3 | Secondary builder / researcher | **Sonnet** | `claude-sonnet-5` | Standard coding, API work, feature implementation |
| T4 | Fast mechanical work | **Sonnet** | `claude-sonnet-5` | Boilerplate, type stubs, file moves, search/lookups, formatting. (Was Haiku; Haiku stalls asking permission in auto mode — verified 2026-09-24.) |

Rules:
- **T1 is ALWAYS Sonnet** — orchestrator/reviewer, not the builder. Never hand T1 the hardest task; that goes to T2 (Opus).
- **Never Haiku in a lane** (it stalls in auto mode). Mechanical work goes to a Sonnet lane or is folded into another lane.
- Use only as many terminals as the task needs. Don't spawn T4 if there's no mechanical work.

### Step 3 — Create the session directory and write handoff files

Compute a session id, the project root, and the absolute session directory:

```
PROJECT_ROOT = $(pwd)                              # cwd where /splittasks was invoked
SESSION_ID   = YYYYMMDD-HHMMSS-<slug>              # <slug> = 2–4 word kebab-case from the goal; seconds, not minutes
SESSION_DIR  = $PROJECT_ROOT/splits/$SESSION_ID/   # absolute
PROJECT_SLUG = $(basename "$PROJECT_ROOT")
WT_ROOT      = $HOME/.claude/splittasks-worktrees/$PROJECT_SLUG/$SESSION_ID
                                                   # one worktree per lane lives under this
```

- If `./splits/` is not in `.gitignore`, add it. It's per-session scratch; don't commit it.
- Write **all** files for this run inside `$SESSION_DIR/` — never at the top of `./splits/`.
  Flat `T*.md` at the splits root is forbidden and causes cross-session collisions.
- **Create `$SESSION_DIR` exclusively before writing anything**: `mkdir "$SESSION_DIR"` (no `-p`)
  must succeed. If it already exists, this is NOT your session — regenerate the id (new
  seconds / different slug) and try again; never write into an existing session directory.

**Preflight the skill writer runs BEFORE writing any session files:**

1. `git -C "$PROJECT_ROOT" rev-parse --git-dir` — must succeed. If not a git repo: **fail
   closed.** Tell the owner: "/splittasks requires a git repository (lanes run in per-lane
   worktrees to prevent cross-lane contamination). Run `git init` first." There is no
   shared-cwd escape hatch: the whole flow (branches, push, draft PR) needs git.
2. Capture immutable session facts at generation time (NOT spawn time — HEAD could move
   between lanes):
   - `BASE_SHA=$(git -C "$PROJECT_ROOT" rev-parse HEAD)` — what every lane branches from. PIN to SHA.
   - `BASE_BRANCH=$(git -C "$PROJECT_ROOT" symbolic-ref --short HEAD)` — merge-target. **Must
     succeed**: on a detached HEAD, fail closed ("check out a branch first"); never persist
     `(detached)` as a target.
   - `REMOTE=$(git -C "$PROJECT_ROOT" config --get branch."$BASE_BRANCH".remote || echo "origin")` — for `git push -u`.
   Persist them in `$SESSION_DIR/SESSION.env` (sourced by LAUNCH.sh and every RELAUNCH-T<N>.sh).
2b. **Publishing preflight** (an unattended run must not do all the work and die at the push/PR):
   - `git -C "$PROJECT_ROOT" remote get-url "$REMOTE"` must succeed (the remote exists).
   - `gh auth status` must succeed (T1 opens the draft PR with `gh`).
   - `git -C "$PROJECT_ROOT" ls-remote --exit-code "$REMOTE" "refs/heads/$BASE_BRANCH"` must
     succeed (network + read access; push rights are only provable by pushing, so say so if
     it fails later).
   If any of these fails: fail closed with the exact command and its output. Do not start lanes.
3. If `git status --porcelain` is non-empty, print a one-line note: uncommitted changes stay in
   your cwd and do NOT bleed into lanes (worktrees isolate them), but lanes branch from HEAD, not
   from your dirty state. Do not refuse.
4. Sanitize SESSION_ID for a branch name (lowercase, non-`[a-z0-9._-]` → `-`, collapse `-`), then
   validate `git check-ref-format --branch "splittasks/$SANITIZED/t1"`. On failure regenerate the
   slug once; if still failing, abort with the exact error.

**FREEZE note (the owner's standing rule):** nothing merges to `main` without human approval. T1
never merges into the base branch and never merges the PR — it leaves a **draft PR** for review
(it does merge the lanes into the session's integration branch, which is how the PR is built).
This is baked into the T1 flow below.

Files to create in `$SESSION_DIR/`:
- `T1.md`, `T2.md`, `T3.md`, `T4.md` (only the terminals you assigned)
- `MASTER.md` (T1's full picture, session id, integration/verification plan)
- `SESSION.env`, `LAUNCH.sh`, one `RELAUNCH-T<N>.sh` per lane
- `wait-for-upstream.sh` ONLY if some lane declares a dependency (see the optional section)
- Each lane later writes its done-report `T<N>-done.md` into this same dir.

**File format for each `T*.md`:**

```markdown
# T[N] — [Role]: [Model]

## Your task
[Specific, scoped task for this terminal only]

## Boundaries — do NOT touch
[What other terminals own — be explicit]

## Context
[Relevant files, patterns, constraints]

## What other terminals are doing
- T1: [brief]
- T2: [brief]
- T3: [brief]

## Done when
[Clear completion criteria]

## Report back (ATOMIC — sentinel is the completion signal)
When done, write your summary atomically to <ABS_SESSION_DIR>/T[N]-done.md:
1. Write the body to <ABS_SESSION_DIR>/T[N]-done.md.tmp first. Its FIRST non-empty line MUST be
   exactly `Status: DONE` or `Status: FAILED` (this is the only place T1 and downstream lanes
   read your result from; mentioning "failed" elsewhere in the text means nothing). Then:
   - What you built/changed
   - Files touched
   - Anything T1 needs to know before integrating
2. **The LAST non-empty line of the .tmp file MUST be the sentinel `<!-- T[N]-DONE -->`** —
   this is the filesystem-level signal that the write is complete.
3. `mv <ABS_SESSION_DIR>/T[N]-done.md.tmp <ABS_SESSION_DIR>/T[N]-done.md` — atomic rename;
   the file appears whole or not at all.

Use the literal absolute session-dir path — never a relative path that depends on your cwd.
```

Also write `$SESSION_DIR/MASTER.md`: the goal, session id, per-lane roles/models/branches, any
**risky zones** (paths where T1 should run the `code-reviewer` subagent during review), and the
project's own verify commands (tests/build/lint) if they exist. T1 polls for `*-done.md` inside
`$SESSION_DIR/` only.

**Windows notes that go INSIDE every `T*.md` Context (learned in the first real run, 2026-09-24;
T2 lost ~10 min on each):**
- **Paths for Codex and any review gate are `C:/Users/...`, never `/c/Users/...`.** `codex
  --output-last-message` (and a review-gate script of yours that takes a file path, e.g. a `record
  --revision <file>` step) read `/c/...` as `C:\c\...`: Codex "approves" without writing anything and
  the gate rejects the record. Write the exact `C:/` paths in the brief.
- **Whitelist `.gitignore` (`/*` + `!/dir/`)**: a NEW deliverable outside the whitelisted dirs is
  ignored. The lane stages it with `git add -f <file>` and its done-report lists «add `!/<path>` to
  `.gitignore`» under human-pending. Tell the lane this up front if the repo is a whitelist repo.
- **Your own hooks apply inside the lane** (same `~/.claude/settings.json`): a review gate on
  `git commit`/`git push`, a read-before-edit guard, a merge-guard on `git merge` — whichever you have.
  A lane never works around a hook (no script wrappers, no cherry-pick instead of merge, no
  `--no-verify`): it records the block in its done-report with `Status: FAILED` and stops. See T1
  step 3 for the merge-guard case.

### The `## BEGIN` block (MANDATORY at the bottom of every T*.md)

Starter prompts ending in *"Then begin: <goal>"* leave room for the worker to pause for
confirmation instead of executing. The fix: every `T*.md` ends with a `## BEGIN` section, and
the starter prompt uses execute-don't-ask verbs.

Every `## BEGIN` section contains, in order:

1. **Identity:** *"You are T<N> on split `<session-id>`. Model: <model>. Worktree:
   `<ABS_WORKTREE_PATH>`. Branch: `splittasks/<session-id>/t<N>`."*
2. **STEP -1 — Worktree sanity (FIRST tool call, before anything else).** Emit this block
   literally with `<ABS_WORKTREE_PATH>` and `<SESSION_ID>` interpolated. Never skip it: every
   lane runs in its own worktree, there is no shared-cwd mode.

   ```bash
   # STEP -1 — Worktree sanity (run BEFORE anything else)
   # IMPORTANT (Windows): `git rev-parse --show-toplevel` returns a WINDOWS path
   # (C:/Users/...) on git-for-windows, while EXPECTED_WT is written MSYS-style
   # (/c/Users/...). Comparing them raw ALWAYS mismatches → this gate false-positives,
   # writes WORKTREE-ERROR and exits on a perfectly-good worktree. Normalize BOTH sides
   # with `cygpath -u` so the compare is path-format-agnostic.
   EXPECTED_BRANCH="splittasks/<SESSION_ID>/t<N>"
   EXPECTED_WT="$(cygpath -u '<ABS_WORKTREE_PATH>' 2>/dev/null || printf '%s' '<ABS_WORKTREE_PATH>')"
   _top="$(git rev-parse --show-toplevel 2>/dev/null)"
   ACTUAL_WT="$(cygpath -u "$_top" 2>/dev/null || printf '%s' "$_top")"
   [ -n "$ACTUAL_WT" ] || ACTUAL_WT="NOT-A-GIT-REPO"
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
   ```

3. **Execution verbs (no pausing):** *"Execute every step in this file end-to-end without
   stopping for confirmation, clarification, summary, recap, or 'should I proceed?' questions.
   Read the listed reference files AS YOU GO, not as a pre-flight gate."*
4. **Entry point:** *"Begin STEP -1 — Worktree sanity immediately. On pass, proceed to your
   task."* (If the lane is downstream, add "then STEP 0 — Verify upstream" before the task.)
5. **Exit condition:** *"On completion: push your branch with `git push -u <REMOTE>
   splittasks/<session-id>/t<N>` FIRST, then write `<ABS_SESSION_DIR>/T<N>-done.md` atomically
   with the sentinel `<!-- T<N>-DONE -->` as its last line, and exit cleanly. Do NOT run `git
   worktree remove` — T1 handles worktree cleanup. If you cannot finish, write what you did into
   the done-report anyway with `Status: FAILED` as its first line, still append the sentinel,
   and exit."*
6. A literal *"Begin."* at the very end.

**The starter prompt** (the string LAUNCH.sh passes to interactive `claude`) MUST use execute-verbs, not
"begin": *"Read `<ABS_SESSION_DIR>/T<N>.md` end-to-end, then execute the BEGIN block — no pause
for confirm/summary/clarification."*

---

## Per-lane git worktrees (MANDATORY)

Every lane (including T1) runs in its own git worktree on its own branch. The shared-cwd model —
every lane `cd`ing to `$PROJECT_ROOT` — is the root cause of cross-lane contamination: one
lane's uncommitted edits bleed into another lane's git state. Worktrees give each lane an
isolated working tree + index while sharing the same `.git` object database, so commits/pushes
still flow through one repository.

### Layout — OUTSIDE the project tree

```
$HOME/.claude/splittasks-worktrees/<PROJECT_SLUG>/<SESSION_ID>/
                                                  ├── T1/
                                                  ├── T2/
                                                  ├── T3/
                                                  └── …
```

Worktrees are **outside** `<PROJECT_ROOT>` (NOT under `splits/`) because `splits/` being
gitignored only protects `git` operations — ripgrep, IDE indexing, file watchers, and an
accidental `rm -rf splits/` would still walk into or destroy nested worktrees. Nested worktrees
also confuse some tooling (hooks resolving paths via the parent `.git`, IDE multi-root).

### Branch namespace

`splittasks/<SANITIZED_SESSION_ID>/t<N>` — lowercase, slash-separated. Always validate with
`git check-ref-format --branch` before passing to `git worktree add`.

### Creation discipline

Worktree creation is **SERIAL** (parallel `git worktree add` races on the worktree list inside
`.git/`) and **rollback-safe** (a partial failure removes the worktrees + branches it already
created). The LAUNCH.sh template below implements this. Note: in a linked worktree, `.git` is a
FILE, not a dir → test with `-e`, not `-d`.

### Push discipline

Lanes always push with explicit upstream: `git push -u "$REMOTE" "splittasks/$SESSION_ID/t<N>"`.
Never rely on `push.default`. `$REMOTE` comes from `SESSION.env`.

---

## The T1 orchestrator flow (unattended, reproducible-on-wake)

T1 runs unattended. Its job is that **when the owner wakes up there is a reproducible, inspectable
state** — not a merged main. **FREEZE, stated precisely:** T1 NEVER merges anything into the
base branch (`$BASE_BRANCH` / `main`) and NEVER merges or approves the PR. T1 DOES merge the
lane branches into the session's own integration branch (step 3 below): that merge is local
to `splittasks/<session>/integration` and is required, not forbidden. Flow, in order:

**1. Wait for every WORKER lane's done-report (bounded poll).** Workers = every lane except
T1 itself (MASTER.md lists them; never wait for `T1-done.md`, T1 writes that one at the end of
step 5). Poll `$SESSION_DIR/` every ~15s for each worker's exact `T<N>-done.md` (ignore
`T<N>-done.prev-*.md`, those are archived attempts), with a hard timeout (default 60 min per
lane; MASTER.md may override).
Distinguish four states per lane:
- **Never started** — no worktree progress, no done-report, timeout hit → record `NO-START`.
- **Started, not finished** — worktree has commits but no done-report by timeout → record `TIMED-OUT`.
- **Finished FAIL** — done-report present with valid sentinel `<!-- T<N>-DONE -->` and its first non-empty line is exactly `Status: FAILED` → record `FAIL`.
- **Finished DONE** — done-report present, first non-empty line `Status: DONE`, last non-empty line exactly `<!-- T<N>-DONE -->` → record `DONE`.
- Any other first line with a valid sentinel → record `FAIL` too (malformed report) and say why.
Only a matching sentinel counts as a complete write; a missing/wrong sentinel = treat as partial.

**2. Per-lane deterministic verification.** For each lane branch, check out or diff its branch
and run the **project's own** tests/build/lint (read from MASTER.md — do NOT hardcode any
specific project's commands). Record pass/fail per lane. This is objective, no-LLM signal.

**3. Integration + re-verify.** ALWAYS build the integration branch (step 5 pushes it, so it
must exist): in T1's own worktree, `git checkout -b "splittasks/$SESSION_ID/integration"
"$BASE_SHA"` (or `git checkout` it if a previous attempt already created it), then `git merge
--no-ff --no-edit` each worker branch that reported DONE, in lane order. Then run the project's
verify commands **again on the integrated tree**. Worktrees isolate *execution*
but NOT *composition*: two independently-green lanes can still break a shared
contract/lockfile/config once combined. Record integration pass/fail. On conflict, do NOT
force-resolve blindly; record the conflicting paths for human review.

> **Hooks and this step.** If you run a merge-guard hook of your own (one that blocks `git merge
> <work-branch>` on non-main branches), it needs ONE whitelist, which is exactly this merge: current
> branch `splittasks/<session>/integration` ← a single source `splittasks/<SAME session>/t<N>` (with
> or without `origin/`), the branch must exist, only value-less options (`--no-ff --no-edit` is fine;
> `-m`, `-X`, `-s` are not). Every `git merge` in a command is judged on its own, so `git merge …/t2
> && git merge …/t3` (two lanes of the session) passes, while `git merge …/t2 && git merge feature/x`
> is blocked by its second merge. Anything else (another session's lane, any other branch, an octopus
> merge) stays blocked; bringing `origin/main|master` into your branch stays allowed, as it always
> was. (The owner's hook got exactly this whitelist after the first real run.) **If a hook blocks the
> merge anyway** (another session id, a renamed branch, a future hook): **do NOT work around it** (no
> cherry-pick, no `git merge` inside a script, no `format-patch | am`, no asking another session to
> run it), record the step as `BLOCKED-BY-MERGE-GUARD`, still run step 4 on the union of the lane
> diffs (`git diff $BASE_SHA <lane>` per lane), skip the integration push/PR of step 5, write
> `T1-done.md` with `Status: FAILED` and the human decision spelled out, list the lane branches
> (already pushed by the workers) so the owner can inspect them, and exit. Do not sit investigating
> the hook: the first T1 spent 40 min reading it and never wrote its report.
>
> **Also known:** when the project is `~/.claude/skills` itself, the orchestrating session's
> auto-mode classifier may deny the merge as «Self-Modification» even though the hook allows it.
> Same rule: don't route around it; hand the owner the merge/push/PR commands to paste.

**4. Qualitative review (quality control, not the gate).** Run a Codex review on the
integrated diff (Codex CLI, read-only, cross-provider pass — orq's `review` subcommand or your own
review skill; when Codex CLI is unavailable, fall back to a manual checklist and say so). For
any path MASTER.md flagged as risky, ALSO spawn a `code-reviewer` subagent on that slice **if the
project defines one** (`.claude/agents/code-reviewer.md` in `$PROJECT_ROOT`); if it does not,
write "no code-reviewer agent in this repo" in the checklist instead of inventing one. Capture
findings; they inform the PR checklist.

**5. Leave a DRAFT PR for human review — NEVER merge it.** First publish the integration branch,
then open the draft PR from it against `$BASE_BRANCH` — or, if a previous attempt already opened
one for this head, update that PR instead of failing on a duplicate:
```bash
git -C "$WT_ROOT/T1" push -u "$REMOTE" "splittasks/$SESSION_ID/integration"
HEAD_BR="splittasks/$SESSION_ID/integration"
PR_NUM=$(gh pr list --state open --head "$HEAD_BR" --json number --jq '.[0].number // empty')
if [ -n "$PR_NUM" ]; then
  gh pr edit "$PR_NUM" --title "..." --body-file "$SESSION_DIR/PR-BODY.md"
else
  gh pr create --draft --base "$BASE_BRANCH" --head "$HEAD_BR" --title "..." --body-file "$SESSION_DIR/PR-BODY.md"
fi
```
(T1's own branch `splittasks/<session>/t1` is NOT what the PR is made from; the generic
"push your branch" exit condition of the BEGIN block does not apply to T1 — this step does.)
The PR body + `T1-done.md` include a checklist:
- The draft PR URL — or «no PR» and the reason (e.g. `BLOCKED-BY-MERGE-GUARD`) plus the exact
  commands the owner has to paste to finish
- Per-lane result table (DONE / FAIL / TIMED-OUT / NO-START)
- Commands run and their pass/fail (per-lane verify, integration verify)
- Codex review findings + `code-reviewer` findings (or "no code-reviewer agent")
- Explicit "human pending" items (anything unresolved, any conflict, any FAIL)
`T1-done.md`'s last non-empty line MUST be `<!-- T1-DONE -->`.

**6. Cleanup ONLY after the PR + verification record exist.** For each lane that verified clean
AND is captured in the PR: `git -C "$PROJECT_ROOT" worktree remove --force "$WT_ROOT/T<N>"` THEN
`git -C "$PROJECT_ROOT" branch -D "splittasks/$SESSION_ID/t<N>"` (remove before delete — Git
refuses to delete a branch a live worktree has checked out). After all lanes:
`git -C "$PROJECT_ROOT" worktree prune`. **If a lane FAILED / TIMED-OUT / has a conflict, KEEP
its worktree + logs** and list it in `T1-done.md` under "Surviving worktrees — human decides".
Never destroy evidence on an unattended run. **T1 cannot remove its own worktree** (it is
running inside it), so it ALWAYS lists itself under "Surviving worktrees" with the ready-to-paste
removal for after the PR is handled (PowerShell):
```powershell
git -C "<ABS_PROJECT_ROOT>" worktree remove --force "<WT_ROOT>\T1"; git -C "<ABS_PROJECT_ROOT>" branch -D "splittasks/<SESSION_ID>/t1"; git -C "<ABS_PROJECT_ROOT>" worktree prune
```
The integration branch stays (the PR needs it) until the PR is merged or closed by a human.

MASTER.md tells T1 which lanes exist, their branches, the verify commands, and the risky zones.

---

## Idempotency (every script survives a retry)

Nothing assumes a clean first run. Reruns must be safe:
- **LAUNCH.sh** writes a `LAUNCHED` sentinel and refuses to double-spawn while it exists. Below
  that, each lane gets a `.spawned-<lane>` marker the moment its terminal opens, so a re-run after
  a PARTIAL failure (no `LAUNCHED`) dispatches only the lanes that never opened — never a second
  agent on a live worktree. `SPLITTASKS_FORCE_RELAUNCH=1` ignores both guards on purpose.
- **Worktree setup** reuses an existing worktree already on the right branch (RELAUNCH path or
  re-run after partial failure); it only creates what's missing and rolls back partial creations.
- **RELAUNCH-T<N>.sh** clears lane-local state before re-spawning: it deletes
  `T<N>-NEEDS-UPSTREAM.md`, the `.wait-*` markers, the previous `.spawned-<lane>` marker and any
  stale `T<N>-done.md.tmp`, and **archives the previous attempt's `T<N>-done.md`** as
  `T<N>-done.prev-<timestamp>-<pid>.md` (unique name, never overwritten), so neither T1 nor a
  downstream lane can mistake the old report for the new attempt. It never auto-deletes a
  worktree with uncommitted work, and it re-creates `.spawned-<lane>` only if the launcher succeeded.
- **Done-reports** are atomic (`.tmp` + `mv` + sentinel), so a partial write is never mistaken
  for completion.
- **T1 cleanup** is ordered (remove → delete → prune) and skips lanes it hasn't captured.

---

## Auto-launch wiring

Once `$SESSION_DIR/LAUNCH.sh` and the per-lane runners are written (Step 3) and the briefing
boxes are printed (Step 4), the skill — in direct invocation (the owner typed `/splittasks`) —
runs `bash <ABS_SESSION_DIR>/LAUNCH.sh` as the launch step. What follows depends on its exit code:
exit 0 → the same turn continues with rule 5 (subscribe to the lanes); exit 7 → rule 2 first
(the owner approves, second run), and rule 5 only after that second run exits 0; any other failure →
rule 3 (manual fallback), and rule 5 only after the owner's «opened». The close of rule 6 happens in
a later turn, when T1's idle notice wakes the session. The agent IS allowed to do this
because lanes run `--permission-mode auto`, not bypass (verified 2026-09-24: a Sonnet lane
spawned from the session via `wt.exe` did its work in 10 s). Rules:
1. Run `bash <ABS_SESSION_DIR>/LAUNCH.sh` once (the only re-run is the exit-7 gate case in
   rule 2). `/splittasks <goal>` is one turn; terminals open immediately.
2. **Exit 7 = fidelity gate, not a failure**: LAUNCH.sh created the worktrees and printed a
   PowerShell approval one-liner. Give it to the owner, wait for their «approved», then run
   `bash LAUNCH.sh` again yourself (worktrees are reused).
3. If the tool call is denied, or LAUNCH.sh exits non-zero with a code other than 7, do NOT
   retry through pieces, PowerShell or a subagent: show stderr verbatim and hand the owner the manual
   line from **"Final-step launch"** below, then wait for their «opened».
4. Never launch a lane's `claude` inline from the session, and never add
   `--dangerously-skip-permissions` to a lane: the classifier will deny the spawn and the run dies.
5. **Talk to the lanes, don't poll them.** Once the lanes are actually open — `LAUNCH.sh` exited
   0 (in the exit-7 case: the SECOND run, after the owner's «approved»; in the manual fallback: after
   their «opened») — call `ListAgents`: each lane shows up as a peer session named after its
   worktree folder (`t1-xx`, `t2-xx`, …). Send T1 one `SendMessage` with `notify_when_idle: true`
   (and a pure subscription to each worker) — you get ONE idle notice when the lane next finishes
   a turn, no background poll loop needed. **The notice is one-shot and T1 goes idle more than
   once** (it may finish a turn while its background poll waits for workers): when T1's notice
   arrives and `T1-done.md` does NOT exist yet, ask T1 in one line where it is and re-arm
   `notify_when_idle` on it; repeat until `T1-done.md` exists. Never ask a lane to run something
   your own session was denied (permission laundering).
6. **Closing the terminals is the launching session's job, not the owner's.** Trigger: the
   `[Cross-session idle notice]` for T1 from rule 5 arrives AND `T1-done.md` exists (or the owner says
   the run is abandoned). **First relay to the owner** what there is: if `T1-done.md` exists, its
   status, the PR URL (or «no PR» + why) and every human-pending item or command it hands over (a
   FAILED report may carry the merge/push/PR commands they have to paste); if the run was abandoned
   without it, the state of each lane (which `T<N>-done.md` exist, which branches were pushed,
   `git -C $WT_ROOT/T<N> log --oneline $BASE_SHA..`). Only then close ONLY the session's window
   with the helper shipped next to this file:
   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File "<SKILL_DIR>\close-lanes.ps1" -TitlePart "splittasks-<SESSION_ID>"
   ```
   (`<SKILL_DIR>` is the folder of this file, as rule 7 resolves it: `C:\Users\you\.claude\skills\splittasks`
   installed by hand, `${CLAUDE_PLUGIN_ROOT}/skills/splittasks-windows` as the orq plugin.)
   It finds the window by literal title (WT keeps `splittasks-<SESSION_ID>` there thanks to
   `--suppressApplicationTitle`, in LAUNCH.sh and RELAUNCH alike), sends WM_CLOSE and presses the
   «Close all» button of WT's «Do you want to close all tabs?» dialog through UI Automation inside
   that window (never global keystrokes). It never touches other windows (they all share ONE
   `WindowsTerminal.exe` process, so `Stop-Process`/`taskkill` would kill the owner's other terminals
   too) and aborts if the pattern matches more than one window. Exit codes: 0 closed · 1 still
   open · 2 too many matches · 3 not found · 4 dialog button not found. Consoles opened by the
   PowerShell fallback (no `wt.exe`) are not Windows Terminal windows: report them to the owner to close
   by hand. Leave the tabs open only if the owner said «leave them open».
7. **Generate LAUNCH.sh / RELAUNCH-T<N>.sh from THIS FILE ON DISK, never from the rendered skill
   text.** When the skill is invoked as `/splittasks <goal>`, the Skill tool substitutes `$1`,
   `$2`, `$0` in the rendered text with words from the goal, which silently corrupts the templates.
   Extract each fenced block with `awk` from `<SKILL_DIR>/SKILL.md` and then `sed` the placeholders.
   **`<SKILL_DIR>` is the folder this file lives in:** `~/.claude/skills/splittasks` installed by hand;
   `${CLAUDE_PLUGIN_ROOT}/skills/splittasks-windows` as the orq plugin (Claude Code fills that variable
   in when it renders this skill; if you are reading it here as a literal `${…}`, you are the manual
   install). `<SKILL_DIR>` is also a placeholder of the templates — `sed` it like `<SESSION_ID>`:
   LAUNCH.sh and RELAUNCH take `claude-trust-paths.sh` from there, and rule 6 takes `close-lanes.ps1`
   from there. Left unfilled, the templates fall back to the manual path.

### LAUNCH.sh template (Windows-only)

Fill in the `<…>` placeholders; emit one `spawn <lane>` line per lane in order: ▶ workers first,
then ⏸ downstream workers, then T1 last (a 2s delay so its first poll sees workers spawning).

```bash
#!/usr/bin/env bash
# Auto-launcher for /splittasks session <SESSION_ID>
# Generated <ISO-TIMESTAMP>
# Correr desde PowerShell:  & "C:\Program Files\Git\bin\bash.exe" -l "<ABS_SESSION_DIR>/LAUNCH.sh"

set -euo pipefail

# PATH self-heal (Windows): si este script se abre con el bash CRUDO
# (Git\usr\bin\bash.exe) sin /usr/bin en el PATH, faltan cygpath/chmod/sleep y el
# spawn se cae en cascada (0x80070002). Prepend de las rutas MSYS.
# Causa raíz del incidente 2026-07-13.
case ":$PATH:" in *":/usr/bin:"*) ;; *) PATH="/usr/bin:/mingw64/bin:$PATH";; esac

# Windows-only guard: esta skill sólo soporta Git Bash sobre Windows.
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) ;;
  *) echo "[splittasks-launch] FATAL: /splittasks es Windows-only (Git Bash). uname=$(uname -s)." >&2; exit 6 ;;
esac

SESSION_ID="<SESSION_ID>"
SESSION_DIR="<ABS_SESSION_DIR>"
PROJECT_ROOT="<ABS_PROJECT_ROOT>"

# Worktree-mode session facts (written by the skill writer in Step 3).
# SESSION.env contains: BASE_SHA, BASE_BRANCH, REMOTE, WT_ROOT.
if [ -f "$SESSION_DIR/SESSION.env" ]; then
  # shellcheck disable=SC1091
  . "$SESSION_DIR/SESSION.env"
else
  echo "[splittasks-launch] FATAL: $SESSION_DIR/SESSION.env not found — re-run /splittasks." >&2
  exit 3
fi

# ── Idempotency guard: refuse double-launch (LAUNCHED = "completed successfully" sentinel).
if [ -f "$SESSION_DIR/LAUNCHED" ] && [ "${SPLITTASKS_FORCE_RELAUNCH:-0}" != "1" ]; then
  echo "[splittasks-launch] LAUNCHED sentinel exists at $SESSION_DIR/LAUNCHED" >&2
  echo "  set SPLITTASKS_FORCE_RELAUNCH=1 to override, or use the per-lane RELAUNCH-T<N>.sh." >&2
  exit 2
fi

# ── Atomic run-lock at the START (mkdir is atomic): stops two simultaneous launches
# or a retry from racing each other. Released on exit. LAUNCHED (written at the end
# only if every spawn succeeded) is the separate "done" sentinel.
if ! mkdir "$SESSION_DIR/.launch.lock" 2>/dev/null; then
  echo "[splittasks-launch] FATAL: another launch is in progress (lock $SESSION_DIR/.launch.lock)." >&2
  echo "  if you're sure no other run is active, remove it: rmdir '$SESSION_DIR/.launch.lock'" >&2
  exit 2
fi
trap 'rmdir "$SESSION_DIR/.launch.lock" 2>/dev/null || true' EXIT

# Count of lanes whose terminal launcher failed. If >0 at the end we exit non-zero
# and do NOT write LAUNCHED, so T1 isn't left waiting on phantom lanes.
SPAWN_FAILED=0

# ── Per-lane lane registry.
# Skill writer emits a space-separated LANES list (spawn order = first to last)
# and two case functions:
#   LANES="T2 T3 T4 T1"
#   lane_model() { case "$1" in T1) echo "claude-sonnet-5" ;; T2) echo "claude-opus-5-5" ;; ... esac }
#   lane_role()  { case "$1" in T1) echo "Orchestrator" ;; T2) echo "auth refactor" ;; ... esac }
# <LANE_REGISTRY_PLACEHOLDER>  ← skill writer substitutes the three lines above.

# ── Worktree setup (serial, rollback on failure). Always on: every lane gets its own worktree.
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
  # NOTE: in a linked worktree, .git is a FILE (not a dir) → test with -e, not -d.
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

for lane in $LANES; do
  if ! setup_worktree "$lane"; then
    rollback_partial
    echo "[splittasks-launch] FATAL: worktree setup failed for $lane — aborting before any spawn." >&2
    exit 3
  fi
done

# ── Gate de fidelidad (repos con governance de frontend, ej. un repo con un gate de fidelidad propio) ──
# Algunos repos tienen hooks require-fidelity-order.js + protect-human-flags.js que
# BLOQUEAN escribir cualquier archivo frontend (.tsx/.jsx/.vue/...) hasta que un HUMANO
# cree en el .claude/ del departamento los flags de aprobación ROUTE(=direct) +
# WIREFRAME_APPROVED. El agente NO puede crearlos (protect-human-flags). Los worktrees
# nacen SIN esos flags (son untracked → no viajan al checkout), así que cada lane de
# frontend se bloquearía a mitad de camino y no podría desbloquearse sola.
# → Lo detectamos ANTES de spawnear; si faltan los flags, imprimimos un one-liner de
#   PowerShell listo para pegar y PARAMOS. Tras aprobar, re-corre el lanzamiento (los
#   worktrees se reusan). Salta este chequeo con SPLITTASKS_SKIP_FIDELITY=1.
if [ "${SPLITTASKS_SKIP_FIDELITY:-0}" != "1" ]; then
  # Detecta el gate UNA vez en el repo original (los worktrees son copias idénticas).
  # -print -quit (NO `| head`): con `set -euo pipefail`, `find | head` puede darle SIGPIPE a
  # find → salida non-zero → `set -e` abortaría LAUNCH.sh. `-quit` para al primer match, sin pipe.
  _fg_hook=$(cd "$PROJECT_ROOT" && find . -maxdepth 6 -name node_modules -prune -o \
    -type f -name require-fidelity-order.js -path '*/.claude/hooks/*' -print -quit 2>/dev/null)
  if [ -n "${_fg_hook:-}" ]; then
    _fg_claude_rel="$(dirname "$(dirname "${_fg_hook#./}")")"   # p.ej. software-dep.../.claude
    _fg_dirs_win=""
    for lane in $LANES; do
      [ "$lane" = "T1" ] && continue   # T1 orquesta/integra, no construye frontend
      _gd="$WT_ROOT/$lane/$_fg_claude_rel"
      # ROUTE debe existir Y contener exactamente `direct` (no basta que exista): el hook exige
      # el valor, no la presencia. `grep -qxF 'direct'` tolera newline final pero nada más.
      if [ ! -f "$_gd/WIREFRAME_APPROVED" ] || ! grep -qxF 'direct' "$_gd/ROUTE" 2>/dev/null; then
        _fg_dirs_win="${_fg_dirs_win}\"$(cygpath -w "$_gd")\","
      fi
    done
    if [ -n "$_fg_dirs_win" ]; then
      {
        echo ""
        echo "════════ APROBACIÓN HUMANA REQUERIDA — gate de fidelidad ════════"
        echo "Este repo BLOQUEA escribir frontend (.tsx) sin tu aprobación; el agente NO puede darla."
        echo "Pega esto en PowerShell (crea ROUTE=direct + WIREFRAME_APPROVED en cada worktree builder):"
        echo ""
        echo "  @(${_fg_dirs_win%,}) | % { New-Item -ItemType Directory \"\$_\" -Force | Out-Null; Set-Content \"\$_\\ROUTE\" 'direct' -NoNewline; New-Item -ItemType File \"\$_\\WIREFRAME_APPROVED\" -Force | Out-Null }; 'aprobado'"
        echo ""
        echo "Luego di 'aprobado' en la sesión: el agente vuelve a ejecutar LAUNCH.sh (los worktrees se reusan). Si el gate no aplica: SPLITTASKS_SKIP_FIDELITY=1."
        echo "═════════════════════════════════════════════════════════════════"
      } >&2
      exit 7
    fi
  fi
fi

# ── Windows terminal spawn (Windows Terminal wt.exe, PowerShell fallback).
# Git Bash path (/c/Users/..) -> Windows path (C:\Users\..) for native Windows programs.
to_win_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s\n' "$1"; fi; }

# The command each terminal runs; keeps the window open after claude exits (exec bash -i).
build_inner_cmd() {
  # unset ANTHROPIC_API_KEY: usa el login de claude.ai (plan Max), no una API key
  #   heredada del entorno (una key inválida rompe la auth de la lane silenciosamente).
  # INTERACTIVO (sin -p): la pestaña muestra la TUI EN VIVO → ves al empleado trabajar.
  #   --permission-mode auto y NO --dangerously-skip-permissions: el clasificador del modo
  #   auto niega a la sesión madre lanzar un claude sin permisos ("Create Unsafe Agents"),
  #   pero sí la deja lanzar uno en modo auto (verificado 2026-09-24, Sonnet, 10 s). El flag
  #   tiene que ir explícito: sin él la lane arranca en modo MANUAL aunque settings.json
  #   diga defaultMode auto. Haiku se queda pidiendo permiso en auto → nunca en una lane.
  #   (Antes se usaba `-p` headless, pero dejaba la pestaña en negro — mala UX para observar.)
  printf 'unset ANTHROPIC_API_KEY; cd %q && claude --model %q --permission-mode auto %q; rc=$?; echo; echo "[claude exited: $rc]"; exec bash -i' "$1" "$2" "$3"
}

print_manual_launcher() {
  local lane="$1" model_id="$2" cwd="$3" prompt="$4" inner
  inner="$(build_inner_cmd "$cwd" "$model_id" "$prompt")"
  printf '[splittasks-launch] FATAL: no terminal launcher for %s — run manually:\n  bash -lc %q\n' "$lane" "$inner" >&2
}

spawn() {
  # Single-arg: pass the lane id. Model + role come from the registry case functions.
  local lane="$1"
  local model_id role cwd prompt inner_cmd
  model_id=$(lane_model "$lane")
  role=$(lane_role "$lane")
  cwd="$WT_ROOT/$lane"
  prompt="Read ${SESSION_DIR}/${lane}.md end-to-end, then execute the BEGIN block — no pause for confirm/summary/clarification."
  inner_cmd="$(build_inner_cmd "$cwd" "$model_id" "$prompt")"

  # Idempotencia por lane: si esta lane ya se despachó en una corrida anterior de LAUNCH.sh
  # (marcador .spawned-<lane>), NO se abre otra terminal — dos agentes sobre el mismo
  # worktree/rama se pisan. Reutilizar el worktree no evita el segundo agente; el marcador sí.
  # SPLITTASKS_FORCE_RELAUNCH=1 ignora los marcadores (relanzamiento consciente de TODO).
  if [ -f "$SESSION_DIR/.spawned-$lane" ] && [ "${SPLITTASKS_FORCE_RELAUNCH:-0}" != "1" ]; then
    printf '[splittasks-launch] skip %s: already dispatched (%s/.spawned-%s exists; use RELAUNCH-%s.sh for just this lane)\n' "$lane" "$SESSION_DIR" "$lane" "$lane"
    return 0
  fi
  # A launcher failure MUST propagate (return 1, never exit) so the spawn loop counts it into
  # SPAWN_FAILED and already-live lanes keep running.
  command -v cygpath >/dev/null 2>&1 || { print_manual_launcher "$lane" "$model_id" "$cwd" "$prompt"; return 1; }
  local bash_win cwd_win runsh runsh_win
  bash_win="$(to_win_path "$(command -v bash)")"
  cwd_win="$(to_win_path "$cwd")"
  # wt.exe trata ';' como SEPARADOR de comandos (Issue #13264). Si se le pasa el
  # inner_cmd inline (que lleva ';'), lo parte y el último trozo ("exec bash -i")
  # intenta lanzarse como archivo → error 0x80070002 "cannot find the file". Por eso
  # NUNCA pasamos comandos inline: escribimos un runner por lane y a wt/powershell les
  # damos SOLO "<bash> -l <runner>" (cero ';' en los argumentos). El runner lleva un
  # PATH self-heal por si se abre con el bash crudo (Git\usr\bin\bash.exe) sin /usr/bin.
  runsh="$SESSION_DIR/run-$lane.sh"
  runsh_win="$(to_win_path "$runsh")"
  # Limpia las variables heredadas de la sesión de Claude que lanzó LAUNCH.sh: si la lane
  # las hereda, Claude Code la trata como sesión hija ("Transcript saving is off — inherited
  # CLAUDE_CODE_CHILD_SESSION marker", verificado 2026-09-24 con Claude Code 2.1.282) y no
  # guarda su historial. La lane debe nacer como sesión propia.
  {
    printf '#!/usr/bin/env bash\n'
    printf 'case ":$PATH:" in *":/usr/bin:"*) ;; *) PATH="/usr/bin:/mingw64/bin:$PATH";; esac\n'
    printf 'unset CLAUDECODE CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_SESSION_ID CLAUDE_CODE_MESSAGING_SOCKET CLAUDE_CODE_MESSAGING_TOKEN CLAUDE_PID CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_EXECPATH CLAUDE_CODE_SESSION_ATTENDED\n'
    printf '%s\n' "$inner_cmd"
  } > "$runsh"
  chmod +x "$runsh"
  # A launcher failure MUST propagate (return 1) — in an unattended run a "phantom"
  # spawn would let LAUNCH.sh mark LAUNCHED and leave T1 waiting on a lane that never
  # started. The caller (spawn loop) counts these into SPAWN_FAILED.
  if command -v wt.exe >/dev/null 2>&1; then
    # Windows Terminal: a NEW tab in a dedicated per-session window named
    # "splittasks-<SESSION_ID>" (created on the first lane, reused by the rest) — so it
    # never hijacks a window you already have open. MSYS2_ARG_CONV_EXCL='*' stops Git Bash
    # from mangling args meant for a native exe. `-l` = login shell → arma el PATH.
    # --suppressApplicationTitle: claude reescribe el título de la pestaña con el resumen de la
    # sesión; sin esto el título de la ventana deja de llevar el SESSION_ID y close-lanes.ps1
    # no la encuentra (2026-09-24: hubo que buscarla por el slug que el prompt dejó en el título).
    if ! MSYS2_ARG_CONV_EXCL='*' wt.exe -w "splittasks-$SESSION_ID" new-tab --suppressApplicationTitle \
      --title "splittasks-$SESSION_ID $lane" --startingDirectory "$cwd_win" "$bash_win" -l "$runsh"; then
      printf '[splittasks-launch] ERROR: wt.exe spawn failed for %s\n' "$lane" >&2
      return 1
    fi
  elif command -v powershell.exe >/dev/null 2>&1; then
    # Fallback: a separate console window running Git Bash on the same runner.
    # -ArgumentList como UN string con la ruta entre comillas ([char]34): si el
    # SESSION_DIR tiene espacios (p.ej. proyecto "My App"), un array no garantiza
    # el quoting y bash recibiría la ruta partida. (Codex 2026-07-13, hallazgo #1.)
    if ! MSYS2_ARG_CONV_EXCL='*' SPLITTASKS_BASH_WIN="$bash_win" SPLITTASKS_RUNSH="$runsh_win" \
      powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \
      'Start-Process -FilePath $env:SPLITTASKS_BASH_WIN -ArgumentList ("-l " + [char]34 + $env:SPLITTASKS_RUNSH + [char]34)'; then
      printf '[splittasks-launch] ERROR: powershell spawn failed for %s\n' "$lane" >&2
      return 1
    fi
  else
    print_manual_launcher "$lane" "$model_id" "$cwd" "$prompt"
    return 1
  fi
  touch "$SESSION_DIR/.spawned-$lane"
  printf '[splittasks-launch] spawned %s · %s · %s (cwd=%s)\n' "$lane" "$role" "$model_id" "$cwd"
}

# ── Pre-populate workspace-trust state so spawned `claude` sessions skip the
# "Do you trust the files in this folder?" dialog. Workspace-trust is a SEPARATE
# gate from tool permissions, so even auto-mode lanes stall
# on it on first entry to a never-seen worktree path (fresh every session). The
# helper writes hasTrustDialogAccepted:true into ~/.claude.json for each path.
# WARN on failure; do not abort.
trust_paths=()
for lane in $LANES; do
  trust_paths+=("$WT_ROOT/$lane")
done
# <SKILL_DIR> = the folder of the SKILL.md these templates came from (auto-launch rule 7):
# `~/.claude/skills/splittasks` by hand, `<plugin root>/skills/splittasks-windows` as the orq plugin.
# Left unfilled (or pointing nowhere), fall back to the manual path.
SKILL_DIR="<SKILL_DIR>"
[ -d "$SKILL_DIR" ] || SKILL_DIR="$HOME/.claude/skills/splittasks"
trust_helper="$SKILL_DIR/claude-trust-paths.sh"
if [ -f "$trust_helper" ]; then
  bash "$trust_helper" "${trust_paths[@]}" \
    || echo "[splittasks-launch] WARN: trust pre-population failed; spawned sessions may show the 'trust this file' dialog" >&2
else
  echo "[splittasks-launch] WARN: $trust_helper missing; spawned sessions may show the 'trust this file' dialog" >&2
fi

# ── Each spawn is guarded: a launcher failure increments SPAWN_FAILED (spawn returns 1)
#    but does NOT abort the loop, so already-live lanes keep running. `set -e` would kill
#    the script on the first failure, so guard every call with `|| SPAWN_FAILED=$((…))`.

# ── workers (▶ start immediately) ──
# spawn T2 || SPAWN_FAILED=$((SPAWN_FAILED+1))   (skill writer emits one line per ▶ worker)

# ── downstream workers (⏸ polling) ──
# spawn T3 || SPAWN_FAILED=$((SPAWN_FAILED+1))   (one line per ⏸ worker)

# ── T1 last, after 2s ──
sleep 2
# spawn T1 || SPAWN_FAILED=$((SPAWN_FAILED+1))

# ── Only mark LAUNCHED (the "completed successfully" sentinel) if every lane spawned.
#    On any failure, exit non-zero WITHOUT LAUNCHED so a re-run can retry: lanes that DID
#    open are skipped by their .spawned-<lane> marker (spawn() returns 0 without opening a
#    second terminal), only the failed ones are dispatched, and T1 isn't left waiting on a
#    phantom lane. The EXIT trap releases the .launch.lock either way.
if [ "$SPAWN_FAILED" -ne 0 ]; then
  echo "[splittasks-launch] FATAL: $SPAWN_FAILED lane(s) failed to spawn — see ERROR lines above." >&2
  echo "  LAUNCHED NOT written. Fix the cause and re-run LAUNCH.sh (lanes with a .spawned-<lane> marker are skipped, not re-opened)," >&2
  echo "  or relaunch a single lane with RELAUNCH-T<N>.sh." >&2
  exit 4
fi
touch "$SESSION_DIR/LAUNCHED"

printf '[splittasks-launch] all <N> terminals dispatched for session %s\n' "$SESSION_ID"
```

Constraints the skill writer enforces while emitting LAUNCH.sh:

- **Paths must be absolute.** `SESSION_DIR`, `PROJECT_ROOT`, `WT_ROOT` are absolute (Step 3 /
  SESSION.env).
- **One `spawn` line per lane**, order ▶ workers → ⏸ workers → T1.
- **`chmod +x LAUNCH.sh` after writing**, so `bash LAUNCH.sh` and `./LAUNCH.sh` both work.
- **Set every lane's model via the registry** — T1 is `claude-sonnet-5`, honour the registry for
  all lanes (LAUNCH.sh launches every lane interactive with `--model`, T1 included — see next bullet).
- **Emit the LANE_REGISTRY substitution** (the `LANES="…"` string + `lane_model()` / `lane_role()`
  case functions). Without it, the worktree loop has nothing to iterate.
- **Spawn cwd MUST be the worktree** (`spawn()` resolves `cwd="$WT_ROOT/$lane"`). Never hand-edit
  `cd $PROJECT_ROOT` back in: lanes sharing the project cwd contaminate each other.
- **Emit `SESSION.env` with shell-safe quoting.** `WT_ROOT` (and in principle any path) can contain
  spaces — e.g. a project literally named `My App` → `/c/Users/you/dev/My App/...`. Since
  LAUNCH.sh and every RELAUNCH source it under `set -e` (`. "$SESSION_DIR/SESSION.env"`), an unquoted
  `WT_ROOT=/c/.../My App/...` makes bash try to run `App/...` as a command and abort. Emit EVERY
  value through `%q` so it round-trips safely:
  ```bash
  {
    printf 'BASE_SHA=%q\n'        "$BASE_SHA"
    printf 'BASE_BRANCH=%q\n'     "$BASE_BRANCH"
    printf 'REMOTE=%q\n'          "$REMOTE"
    printf 'WT_ROOT=%q\n'         "$WT_ROOT"
  } > "$SESSION_DIR/SESSION.env"
  ```
- **Emit one `RELAUNCH-T<N>.sh` per lane** (next section). `chmod +x` after writing.
- **Keep the workspace-trust pre-populate block** — if a future revision drops it, the
  trust-dialog regression returns.

### Per-lane RELAUNCH scripts (Windows-only)

Each lane gets a standalone `<SESSION_DIR>/RELAUNCH-T<N>.sh` that re-spawns just that lane — used
to restart after a crash or after the owner fixes whatever made the lane abort. It clears lane-local
state first (otherwise a stale marker makes T1 ignore the successor done-report) and never
auto-deletes a worktree with uncommitted work.

**How the owner runs it (PowerShell, ready to paste):**
```powershell
& "C:\Program Files\Git\bin\bash.exe" -l "<ABS_SESSION_DIR>/RELAUNCH-T<N>.sh"
```

```bash
#!/usr/bin/env bash
# Relaunch helper for T<N> · <role> · <SESSION_ID>
set -euo pipefail

# PATH self-heal (Windows) — ver LAUNCH.sh.
case ":$PATH:" in *":/usr/bin:"*) ;; *) PATH="/usr/bin:/mingw64/bin:$PATH";; esac

# Skill writer: substitute each placeholder with a shell-quoted literal.
# If a value contains a single quote, emit e.g. ROLE='Bob'\''s lane'.
SDIR='<ABS_SESSION_DIR>'
PROJECT_ROOT='<ABS_PROJECT_ROOT>'
LANE='T<N>'
MODEL='<model-id>'
ROLE='<role>'
HAS_UPSTREAM='<true|false>'
UPSTREAM_LANE='<T<upstream-N> or empty>'

# Load session facts (BASE_SHA, BASE_BRANCH, WT_ROOT, REMOTE).
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

# State cleanup so the new attempt starts from zero: T1 and downstream lanes poll the EXACT file
# T<N>-done.md, so the previous attempt's report must not stay there (it would be read as this
# attempt's result). Archive it, never silently delete evidence.
rm -f "$SDIR/${LANE}-NEEDS-UPSTREAM.md" 2>/dev/null || true
# El marcador .spawned-<lane> del intento anterior se retira AHORA y solo se recrea si el
# lanzador de abajo tiene éxito: si falla, un LAUNCH.sh posterior debe volver a intentar esta lane.
rm -f "$SDIR/.spawned-$LANE" 2>/dev/null || true
if [ -f "$SDIR/${LANE}-done.md" ]; then
  # Nombre de archivo único aunque se relance dos veces en el mismo segundo: sufijo -<pid> y
  # contador; nunca -f, nunca pisar un .prev existente (evidencia).
  prev="$SDIR/${LANE}-done.prev-$(date +%Y%m%d-%H%M%S)-$$.md"; n=0
  while [ -e "$prev" ]; do n=$((n+1)); prev="${prev%.md}-$n.md"; done
  mv -n "$SDIR/${LANE}-done.md" "$prev"
  echo "[relaunch] previous ${LANE}-done.md archived as $(basename "$prev")"
fi
rm -f "$SDIR/${LANE}-done.md.tmp" 2>/dev/null || true
if [ "$HAS_UPSTREAM" = "true" ] && [ -n "$UPSTREAM_LANE" ]; then
  rm -f "$SDIR/.wait-${UPSTREAM_LANE}.started" "$SDIR/.wait-${UPSTREAM_LANE}.log" 2>/dev/null || true
fi

# Worktree idempotency: re-create only if missing. NEVER auto-delete a worktree
# with uncommitted changes — that's the original incident class.
if [ -e "$WORKTREE/.git" ]; then  # worktree .git is a FILE, not a dir → -e not -d
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

# Pre-populate workspace-trust for the lane's worktree. WARN on failure; do not abort.
SKILL_DIR="<SKILL_DIR>"   # auto-launch rule 7; left unfilled -> the manual path
[ -d "$SKILL_DIR" ] || SKILL_DIR="$HOME/.claude/skills/splittasks"
if [ -f "$SKILL_DIR/claude-trust-paths.sh" ]; then
  bash "$SKILL_DIR/claude-trust-paths.sh" "$WORKTREE" \
    || echo "[relaunch] WARN: trust pre-population failed; relaunched session may show the 'trust this file' dialog" >&2
fi

CWD="$WORKTREE"

PROMPT="Read $SDIR/${LANE}.md end-to-end, then execute the BEGIN block — no pause for confirm/summary/clarification."
# unset ANTHROPIC_API_KEY → login claude.ai (Max). INTERACTIVO (sin -p) → TUI visible.
# --permission-mode auto explícito (nunca --dangerously-skip-permissions): ver build_inner_cmd en LAUNCH.sh.
INNER=$(printf 'unset ANTHROPIC_API_KEY; cd %q && claude --model %q --permission-mode auto %q; rc=$?; echo; echo "[claude exited: $rc]"; exec bash -i' "$CWD" "$MODEL" "$PROMPT")

# Windows relaunch (wt.exe, PowerShell fallback) — same runner discipline as LAUNCH.sh.
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) ;;
  *) echo "[relaunch] FATAL: /splittasks es Windows-only. uname=$(uname -s)." >&2; exit 6 ;;
esac
BASH_WIN=$(cygpath -w "$(command -v bash)"); CWD_WIN=$(cygpath -w "$CWD")
# wt.exe parte en ';' (Issue #13264) → nunca inline; runner por lane, wt sólo ve
# "<bash> -l <runner>". PATH self-heal por si abre con el bash crudo sin /usr/bin.
RUNSH="$SDIR/run-$LANE.sh"; RUNSH_WIN=$(cygpath -w "$RUNSH")
{ printf '#!/usr/bin/env bash\n'
  printf 'case ":$PATH:" in *":/usr/bin:"*) ;; *) PATH="/usr/bin:/mingw64/bin:$PATH";; esac\n'
  printf 'unset CLAUDECODE CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_SESSION_ID CLAUDE_CODE_MESSAGING_SOCKET CLAUDE_CODE_MESSAGING_TOKEN CLAUDE_PID CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_EXECPATH CLAUDE_CODE_SESSION_ATTENDED\n'
  printf '%s\n' "$INNER"; } > "$RUNSH"
chmod +x "$RUNSH"
# Un fallo del lanzador es un ERROR real (exit 5), no un WARN: si no se abrió terminal, no debe
# escribirse el marcador .spawned-<lane> (una corrida posterior de LAUNCH.sh saltaría la lane).
if command -v wt.exe >/dev/null 2>&1; then
  # Mismo título que LAUNCH.sh (prefijo splittasks-<SESSION_ID> + --suppressApplicationTitle):
  # si no, con la pestaña relanzada activa close-lanes.ps1 no encuentra la ventana.
  MSYS2_ARG_CONV_EXCL='*' wt.exe -w "splittasks-$(basename "$SDIR")" new-tab --suppressApplicationTitle \
    --title "splittasks-$(basename "$SDIR") $LANE (relaunch)" \
    --startingDirectory "$CWD_WIN" "$BASH_WIN" -l "$RUNSH" \
    || { echo "[relaunch] ERROR: wt.exe spawn failed for $LANE — no terminal opened, no marker written." >&2; exit 5; }
elif command -v powershell.exe >/dev/null 2>&1; then
  # ruta entre comillas ([char]34) por si SESSION_DIR lleva espacios. (Codex #1.)
  MSYS2_ARG_CONV_EXCL='*' SPLITTASKS_BASH_WIN="$BASH_WIN" SPLITTASKS_RUNSH="$RUNSH_WIN" \
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \
    'Start-Process -FilePath $env:SPLITTASKS_BASH_WIN -ArgumentList ("-l " + [char]34 + $env:SPLITTASKS_RUNSH + [char]34)' \
    || { echo "[relaunch] ERROR: powershell spawn failed for $LANE — no terminal opened, no marker written." >&2; exit 5; }
else
  echo "[relaunch] FATAL: no terminal launcher — run manually: bash -l $(printf '%q' "$RUNSH")" >&2; exit 4
fi
# Marcador por lane (solo tras éxito): una corrida posterior de LAUNCH.sh no abre OTRA terminal para esta lane.
touch "$SDIR/.spawned-$LANE"
echo "[relaunch] ${LANE} spawned (cwd=$CWD)"
```

### Final-step launch — the agent runs LAUNCH.sh (manual line only as fallback)

**The agent DOES auto-launch** (the owner's decision, 2026-09-24): lanes run with
`--permission-mode auto`, so the classifier lets the session execute `LAUNCH.sh`.
Sequence:

1. **Print the briefing boxes** (Step 4).
2. **Run `bash <ABS_SESSION_DIR>/LAUNCH.sh`**. A Windows Terminal window
   `splittasks-<SESSION_ID>` opens with one tab per lane. **Only if it exited 0**, in the same turn:
   `ListAgents` + `SendMessage` to T1 with `notify_when_idle` (auto-launch rule 5). If it exited 7
   or failed, first step 3 or the manual fallback; the subscription comes after the run that
   actually opened the lanes.
3. **Fidelity gate, if it applies**: if the repo has the gate (see LAUNCH.sh), the first run
   CREATES the worktrees and **stops**, printing a PowerShell approval one-liner — the owner
   pastes it, and the agent **runs LAUNCH.sh again** (the worktrees are reused).
4. **Confirm**: `Opened N terminals (window splittasks-<SESSION_ID>); T1 reviews as the done-reports land.`

**Manual fallback** — ONLY if the `bash LAUNCH.sh` call is denied by the tool or exits
non-zero with a code other than 7 (7 is the fidelity gate of step 3, not a failure):
show the stderr as-is and give the owner this line, alone in a block, and wait for their «opened»
(use LAUNCH.sh's git-bash path, `/c/Users/...`):
   ```powershell
   & "C:\Program Files\Git\bin\bash.exe" -l "<ABS_SESSION_DIR>/LAUNCH.sh"
   ```

Notes: if LAUNCH.sh exits non-zero (≠ gate), show its stderr verbatim and the manual launchers — do
not fake success. The `LAUNCHED` sentinel prevents double-spawn; force with `SPLITTASKS_FORCE_RELAUNCH=1`.
Aborting after dispatch is per-window (close the tab or Ctrl-C inside it).

> **PowerShell-first rule:** EVERY command the owner runs by hand (launch, approve flags, relaunch
> a lane) is given as a **PowerShell** one-liner ready to paste — paths with `\`,
> `$env:USERPROFILE`, `New-Item`/`Set-Content`, `& "…bash.exe"`. The owner uses PowerShell and does
> not know Git Bash. The internal `.sh` files (LAUNCH/RELAUNCH/runner) stay in bash because wt.exe/bash
> invoke them, but the human never types bash syntax.

---

### Step 4 — Print the briefing

Substitute `<SESSION_ID>`, `<ABS_SESSION_DIR>` and `<SKILL_DIR>` with their literal values everywhere (the
boxes are informational — the agent launches — but the manual fallback line must be pasteable
as-is, with nothing for the owner to fill in). Each box is 63 columns wide; use the exact
Unicode glyphs `╭ ╮ ╰ ╯ ─ │ · → ▶` (no ASCII substitutes). Drop the T4/T3 box if not assigned.
Boxes go in order ▶ workers → ⏸ downstream workers → T1 last, then the closing auto-launch line.

```
╭─ SPLIT PLAN ────────────────────────────────────────────────╮
│  Goal     [goal summary]                                    │
│  Session  <SESSION_ID>                                      │
│  Dir      ./splits/<SESSION_ID>/                            │
╰─────────────────────────────────────────────────────────────╯

╭─ T2  ·  Opus  ·  [role] ────────────────────────────────────╮
│  ▶ start immediately                                        │
│  Read <ABS_SESSION_DIR>/T2.md end-to-end, then execute the  │
│  BEGIN block — no pause for confirm/summary/clarification.  │
╰─────────────────────────────────────────────────────────────╯

╭─ T4  ·  Sonnet  ·  [role] ──────────────────────────────────╮
│  ▶ start immediately                                        │
│  Read <ABS_SESSION_DIR>/T4.md end-to-end, then execute the  │
│  BEGIN block — no pause for confirm/summary/clarification.  │
╰─────────────────────────────────────────────────────────────╯

╭─ T1  ·  Sonnet  ·  Orchestrator ────────────────────────────╮
│  ◆ waits for worker *-done.md, verifies + drafts a PR     │
│  Read <ABS_SESSION_DIR>/T1.md end-to-end, then execute the  │
│  BEGIN block — no pause for confirm/summary/clarification.  │
╰─────────────────────────────────────────────────────────────╯

▶ Opening the N terminals now (window splittasks-<SESSION_ID>). If anything fails, the manual
  line is:  & "C:\Program Files\Git\bin\bash.exe" -l "<ABS_SESSION_DIR>/LAUNCH.sh"
  (If the repo has a fidelity gate, the 1st run stops and gives you an approval command;
   approve it in PowerShell and tell me to relaunch.)
```

The model is set by LAUNCH.sh from the registry, so the boxes don't need to show the CLI flag —
but if you want it visible, the flags are: T1/Sonnet `claude --model claude-sonnet-5`, Opus
`claude --model claude-opus-5-5`. Every lane also carries `--permission-mode auto`.

---

## Model routing rules

| Work type | Model |
|-----------|-------|
| Architecture, security, auth, complex state | Opus (`claude-opus-5-5`) |
| Standard feature work, API routes, components, debugging | Sonnet (`claude-sonnet-5`) |
| File moves, boilerplate, type stubs, grep/search, renaming | Sonnet (`claude-sonnet-5`) — never Haiku, it stalls in auto mode |
| Orchestration, review, integration | Sonnet (T1 always) |

---

## Optional — lane dependencies (opt-in)

**By default lanes are independent** and T1 simply waits for all of them. Use the wait-helper
below ONLY when a lane literally consumes another lane's artifact (e.g. T3 reads a file T2
produces). When you do, ship `<SESSION_DIR>/wait-for-upstream.sh` (below, `chmod +x` after
writing) and give the downstream lane a **STEP 0 — Verify upstream** as its first tool call after
STEP -1:

```markdown
## STEP 0 — Verify upstream (FIRST tool call after STEP -1)
bash <ABS_SESSION_DIR>/wait-for-upstream.sh T<UPSTREAM-N> --min-lines <N> --hard-timeout-min <N>
- exit 0 → upstream done-report is complete (sentinel matched). The upstream's files are NOT in
  your worktree yet (worktrees isolate) and **you may NOT `git merge` its branch into yours**:
  a merge-guard hook (if you have one; the owner's does this) only whitelists merges into
  `splittasks/<session>/integration`; a lane-to-lane merge is blocked and must not be worked around
  (no rebase/cherry-pick tricks either). Read what
  you need straight from the upstream branch without touching your own: `git -C
  <ABS_WORKTREE_PATH> show splittasks/<session-id>/t<UPSTREAM-N>:<path>` (or `git show <branch>:<path>
  > <ABS_SESSION_DIR>/upstream-<file>` for a local copy). If your task genuinely needs the
  upstream's commits in your branch, that dependency does not fit this skill until the owner extends the
  whitelist: STOP as described below with reason `NEEDS-LANE-MERGE` so the
  human decides. Otherwise proceed with your task. (T1 merges every lane into integration later.)
- exit 3 → upstream finished FAILED: do NOT merge it. STOP as described below.
- exit 1 → hard timeout: STOP as described below.
- exit 2 → helper/usage error: read the log, fix, re-invoke.

STOP = write BOTH files, then exit cleanly: (a) <ABS_SESSION_DIR>/T<N>-NEEDS-UPSTREAM.md with the
reason (timeout / upstream FAILED / NEEDS-LANE-MERGE) for the human; and (b) your own
<ABS_SESSION_DIR>/T<N>-done.md, atomically, first line `Status: FAILED`, then that same reason, and
the sentinel <!-- T<N>-DONE --> as its last line — that is the file T1 polls, so T1 classifies you as
FAIL immediately instead of waiting out your timeout. Never leave only NEEDS-UPSTREAM.md.
```

Self-contained helper (Git Bash, ~30 lines) — polls for the upstream done-report whose last
non-empty line is the sentinel `<!-- T<M>-DONE -->`:

```bash
#!/usr/bin/env bash
# wait-for-upstream.sh <UPSTREAM-LANE> [--min-lines N] [--hard-timeout-min N]
# exit 0 upstream DONE · 1 hard timeout · 2 bad args / helper error · 3 upstream finished FAILED
set -uo pipefail
case ":$PATH:" in *":/usr/bin:"*) ;; *) PATH="/usr/bin:/mingw64/bin:$PATH";; esac

UP="${1:-}"; [ -z "$UP" ] && { echo "usage: wait-for-upstream.sh T<N> [--min-lines N] [--hard-timeout-min N]" >&2; exit 2; }
shift
MIN_LINES=25; HARD_MIN=60
while [ $# -gt 0 ]; do
  case "$1" in
    # Validate the value is present BEFORE taking $2 — with `set -u` a bare
    # `--min-lines` at end-of-args would abort instead of honouring the exit-2 contract.
    --min-lines)        [ $# -ge 2 ] || { echo "--min-lines needs a value" >&2; exit 2; }; MIN_LINES="$2"; shift 2 ;;
    --hard-timeout-min) [ $# -ge 2 ] || { echo "--hard-timeout-min needs a value" >&2; exit 2; }; HARD_MIN="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
# Numbers must be integers — a non-numeric value would break the arithmetic/tests below.
case "$MIN_LINES" in ''|*[!0-9]*) echo "--min-lines must be a non-negative integer, got '$MIN_LINES'" >&2; exit 2 ;; esac
case "$HARD_MIN"  in ''|*[!0-9]*) echo "--hard-timeout-min must be a non-negative integer, got '$HARD_MIN'" >&2; exit 2 ;; esac
SDIR="$(cd "$(dirname "$0")" && pwd)"
REPORT="$SDIR/${UP}-done.md"
SENTINEL="<!-- ${UP}-DONE -->"
DEADLINE=$(( $(date +%s) + HARD_MIN*60 ))

ready() {
  [ -f "$REPORT" ] || return 1
  [ "$(grep -c . "$REPORT")" -ge "$MIN_LINES" ] || return 1   # enough non-empty lines
  [ "$(awk 'NF{last=$0} END{print last}' "$REPORT")" = "$SENTINEL" ]  # last non-empty line = sentinel
}

while :; do
  if ready; then
    # A complete report is not the same as a successful one. The result lives ONLY in the first
    # non-empty line ("Status: DONE" / "Status: FAILED"), never in free text, so a DONE report
    # that mentions an earlier failed test is not misread. Downstream must never merge FAILED work.
    first_line="$(awk 'NF{print; exit}' "$REPORT")"
    if [ "$first_line" != "Status: DONE" ]; then echo "[wait] $UP finished with '$first_line' ($REPORT) — do not merge it" >&2; cat "$REPORT"; exit 3; fi
    echo "[wait] $UP ready ($REPORT)"; cat "$REPORT"; exit 0
  fi
  [ "$(date +%s)" -ge "$DEADLINE" ] && { echo "[wait] hard timeout (${HARD_MIN}m) waiting on $UP" >&2; exit 1; }
  sleep 15
done
```

The upstream lane must push its branch and write its done-report BEFORE the downstream lane
starts working with the artifact — the atomic-write + sentinel contract in the "Report back"
template is what makes this poll safe (a partial write never has the sentinel as its last line).
(The PR itself is opened later by T1, not by the workers.)
If a downstream lane truly cannot start until upstream lands on `main`, split it into a second
`/splittasks` invocation instead — cleaner than encoding a cross-merge sync in one session.

---

## Rules recap

- T1 is ALWAYS Sonnet; never assign it the hardest task (that's T2/Opus). Never Haiku in a
  lane (it stalls asking permission in auto mode); mechanical work goes to Sonnet.
- Each lane's task must be completable WITHOUT waiting for another lane (except T1, and except an
  opt-in downstream lane using the wait-helper).
- Boundaries in each handoff file must be explicit.
- Every run gets its own `./splits/<SESSION_ID>/` dir. Never reuse a session id; never write
  `T*.md` at the splits root.
- **T1 NEVER merges into the base branch nor merges the PR.** It verifies, merges the lane
  branches into the session integration branch, re-verifies, reviews, and leaves a draft PR +
  `T1-done.md` checklist for human approval (FREEZE).

---

## Changelog

**2026-09-24 (night) — first complete real run (skills repo, T2 Opus + T3 Sonnet + T1).**
What worked: LAUNCH.sh opened the 3 lanes in auto mode without asking anyone for permission; T2 and T3
delivered their file, commit and push, with a well-formed done-report; T1 verified the diffs (step 2).
What did not: (a) the owner's merge-guard hook blocked the integration merge (step 3) and T1 spent
40 min reading the hook without writing its done-report → new rule in step 3 (don't route around it,
record `BLOCKED-BY-MERGE-GUARD`, done-report FAILED, exit); the owner decided the next day on the
whitelist in their hook (see step 3);
(b) `/c/...` paths break Codex and the review gate inside the lanes → mandatory Windows notes in the
Context of every `T*.md`; (c) a whitelist `.gitignore` ignores the new deliverables → `git add
-f` + human-pending item; (d) the Skill tool substitutes `$1/$2/$0` when invoked with arguments → the
templates are extracted from the file on disk (auto-launch rule 7). New: lanes are neighbouring
sessions (`ListAgents` + `SendMessage` with `notify_when_idle`, rule 5) and the launching session closes
the session's window with `close-lanes.ps1` on receiving T1's idle notice (rule 6; tabs with
`--suppressApplicationTitle` in LAUNCH.sh and RELAUNCH so the title keeps the SESSION_ID).
Verified that night: the 3-tab window closed with WM_CLOSE + «Close all» and the unrelated windows
(the orchestrator's) stayed alive; the button is pressed through UI Automation inside the window (Codex:
a global Enter could land in another window). Codex (Sol) 2 rounds over these changes.

**2026-09-24 — lanes in auto mode, launched by the agent.** `--dangerously-skip-permissions` →
`--permission-mode auto` in `build_inner_cmd` and in the RELAUNCH; the agent runs
`LAUNCH.sh` again itself (the classifier only denied the bypass); the runners `unset` the inherited
`CLAUDE_*` variables (otherwise the lane is born as a child session and saves no history);
Haiku vetoed in lanes (it keeps asking for permission in auto). Verified with real Sonnet and Opus
lanes opened from the session (10-20 s) and a toy LAUNCH.sh. Reviewed by Codex (Sol).

**2026-09-24 (same batch) — design debt caught by Codex when the skill entered the repo.** No
shared-cwd shortcut (`SHARED_CWD_MODE` removed; without git it fails closed); `.spawned-<lane>` marker
(re-running LAUNCH.sh after a partial failure does not duplicate lanes; RELAUNCH removes it and only
recreates it after success, launcher failure = exit 5); publishing preflight (real base branch, remote, `gh
auth status`, `ls-remote`); FREEZE stated precisely (T1 never merges into the base nor the PR, it does
build `splittasks/<session>/integration` from `$BASE_SHA` and publishes it; PR: `gh pr edit` if it already
exists, `gh pr create --draft` if not); T1 waits only for the worker lanes; the result of a
done-report lives ONLY in its first line `Status: DONE|FAILED` (T1, BEGIN, STEP 0 and the helper
read that; the helper returns 3 if the upstream is not DONE; on timeout/FAILED/conflict the
downstream writes its own FAILED done-report, not only NEEDS-UPSTREAM); RELAUNCH archives the
previous done-report as `.prev-<ts>-<pid>` without overwriting; `SESSION_ID` with seconds + exclusive
`mkdir`; `spawn()` returns 1, never `exit`; `/codex-review` → a Codex review skill,
`code-reviewer` only if the project defines it. Checked: `bash -n` of LAUNCH.sh, RELAUNCH and the
helper extracted from this doc; helper FAILED→3 / DONE→0 / malformed→3; marker skip rc 0.
Codex (Sol), 5 rounds with the gate prompt, last one: NO OPEN FINDINGS.

Reduced from the 1580-line canonical SKILL for the owner's Windows-only, unattended, FREEZE workflow.
Kept: the orchestrator+employees model, interactive-visible launch
(originally `claude --dangerously-skip-permissions`; since 2026-09-24 `--permission-mode auto`, see above;
`unset ANTHROPIC_API_KEY`), per-lane git-worktree isolation, the Windows spawn/relaunch code
(PATH self-heal, per-lane runner for the wt.exe `;` bug, `[char]34` PowerShell quoting,
workspace-trust pre-populate), the atomic done-report + sentinel contract, and idempotency
(`LAUNCHED` guard + `SPLITTASKS_FORCE_RELAUNCH`). T1 rewritten as verify-integrate-review-and-
leave-a-draft-PR (never merges into the base branch or the PR). Removed: strict-mode / PR state machine / 3-strike / DELTA-MERGE
gates / auto-merge, the `.audits` Step 0 + programmatic /audit-fix contract, DEPT routing /
`_SPLITTASKS_ROUTING.md`, Gate 0 spawn-log cross-check, Discord coordination, the hardcoded
commit-author check, and all macOS/Linux code and paths.

