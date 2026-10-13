# `orchestrator-control.js` — what it detects today, and what it will block in phase 2

**File:** `~/.claude/skills/orq/scripts/orchestrator-control.js`
**Tests:** `~/.claude/skills/orq/tests/test-orchestrator-control.mjs`
**Ledger:** `<git-common-dir>/orchestrator-state.json` + `orchestrator-state.log` beside it
**Written:** 2026-08-11 · **Status:** PHASE 1 (observes, does not block)

> It exists because on 2026-08-11 an orchestration workday racked up nine failures, and **five of
> them were caught by the owner looking at their screen**, not by the agent. Codex's verdict was:
> *"none of the nine are reliably prevented by text alone."* This is what replaces the text that gets
> forgotten.

---

## 🔴 Installed is NOT activated

**The hook does absolutely nothing until someone runs `start`, and it goes quiet again the moment
`close` runs.** It is opt-in, per terminal and per repository:

| Situation | What the hook does |
|---|---|
| Folder that is not a git repository | **nothing** — with nowhere to share state there is no orchestration |
| Git repo, but nobody ran `start` | **nothing** — it writes nothing, prints nothing, spawns no `git` |
| Git repo with `start` done | watches and warns (phase 1) |
| After `close` | **nothing** again |

**Why this is written in red:** on 2026-08-11 it got wired into the global `settings.json` and
started talking to the owner's 8 terminals, in projects that were not orchestrating anything. Another
terminal got confused receiving warnings from an orchestrator nobody had started, and had to stop and
explain what that program was. **A hook that talks without being called is a bug, not a feature.** It
is tested in all three states and in both directions (section 0 of the detection suite).

---

## There is nothing to type

**It activates on its own when the skill loads.** Nothing else. The four commands you used to have
to remember are no longer needed:

| Used to have to type | Now |
|---|---|
| `start` | fires on **loading the skill** — verified by capturing the real payload: it arrives as `tool_name: "Skill"` with `tool_input: {"skill":"orq"}`. The old long name `multi-terminal-orchestrator` is also accepted (constant `OLD_SKILL_NAME`): the folder is called `orq` (the Spanish source renamed it on 2026-09-22; the previous English port was installed as `multi-terminal-orchestrator`), but this is **compatibility that stays**, because the copies installed in `~/.claude/agents/` and `~/.claude/commands/` carry the old mark and they must be updatable. It goes away the day no installed piece carries that mark, not before. Loading any other skill activates nothing |
| `wait` | the wait **is born from the thing being waited on**: launching a subagent opens its own clock (30 min), a background job its own (45 min), and it closes itself when the thing arrives |
| `close` | **closes by abandonment**: 8 hours with not a single event, and the hook itself closes it the next time anyone passes through the repo. Nothing installed patrols for this |
| `decide` | at the close of a turn, the warning is addressed **to the agent**, with the command already assembled: it records it itself. The only human part is choosing, and only if a choice is needed |

**The only rule left for you:** load the skill **inside the repository** you are going to
orchestrate. If you do it outside one, it tells you to your face — *"this folder is NOT a git
repository, NOTHING is being watched"* — instead of letting you believe it is working.

And if startup fails (ledger busy), **it shouts it**: `I COULD NOT START... RIGHT NOW NOTHING IS
BEING WATCHED`. It used to stay silent, which was the worst possible failure for a tool whose job is
that you not trust your memory.

---

## How to drive it by hand (if ever needed)

```
node ~/.claude/skills/orq/scripts/orchestrator-control.js start          # returns program_id; if it fails, do NOT open lanes
node ~/.claude/skills/orq/scripts/orchestrator-control.js pulse --program <id>   # the 5-min Monitor calls this
node ~/.claude/skills/orq/scripts/orchestrator-control.js status         # what is open right now (the board comes inside it)
node ~/.claude/skills/orq/scripts/orchestrator-control.js load           # ONLY the board: how much context each terminal has left
node ~/.claude/skills/orq/scripts/orchestrator-control.js close --program <id>   # close, with the day's tally (it REFUSES with live lanes, see below)
node ~/.claude/skills/orq/scripts/orchestrator-control.js close --program <id> --even-if-left-open   # ONLY if the owner answers to close anyway
node ~/.claude/skills/orq/scripts/orchestrator-control.js rule --text "<the rule, literal>" --doc <path relative to the root>   # saves a durable norm the owner decided in the chat
node ~/.claude/skills/orq/scripts/orchestrator-control.js rule --documented <id> --reason "<where and how it was written down>"      # if you paraphrased it in the document
node ~/.claude/skills/orq/scripts/orchestrator-control.js rule --view                                                          # the program's rules and their status
```

**`close` REFUSES to close with live lanes (T46, 09-25, rule Rc05909).** If the program has **open
waits** (every wait that is not `CLOSED`, the `EXPIRED` ones too) or **lanes with no receipt**,
`close` does not close: it prints

```
NOT CLOSED: <n> open wait(s): <the first 3, trimmed> · <m> lane(s) with no receipt: T<a>, T<b>
```

(plus three help lines), exits with **code 1** and **does not touch the ledger**: not `closed_at`,
not `git_permits`, not `human_orders`. It starts with `NOT CLOSED:` just like the refusal of "the
program running here is X, not Y", but with the causes counted. What counts as a lane with no receipt:
a brief `.orchestrator/briefs/T<n>-*.md` in the **live folder** of the orchestrated repo (the parent of
the common `.git`) **of this program** —written since it was born (file date ≥ the ledger's
`created_at`) or noted in its dispatches (`L.dispatches`, which covers the copy that keeps an old
date); the folder accumulates the briefs of all batches— with no `.orchestrator/receipts/T<n>.md`
—exact name— in that same folder. A receipt that stayed in the lane's worktree has not arrived;
`SPLIT-PLAN-*`, `H1-*`, `T<n>.md` or `T<n>_notes.md` (without the pattern's hyphen) are not lanes. The
receipt has to be a **file** (a folder called `T9.md` delivers nothing), and a brief that cannot be
looked at (its read fails for something other than "it no longer exists") **counts as having no
receipt**: not being able to look is not "nothing open". The refusal does not rewrite the ledger: it
leaves the lock without going through the write (it stays byte for byte; only the `.log` records
`close REFUSED`), unless the ledger was unreadable and the recovered one has to be saved. The
artifacts with no decision and the zeros with no control **keep being listed without blocking**, as
before.
**The check goes INSIDE the same lock (`withLedger`) that does the closing:** before, it was looked at
with `status` and closed with `close`, two processes, and between one and the other a lane could open
a wait (a HIGH finding from Codex in T44). Tested with two simultaneous `close` calls and with a wait
that opens while `close` waits for the lock (the hook suite, section T46). **Limit that remains
(declared):** the waits live in the ledger and the lock covers them; the briefs folder it does not. A
brief written in the very milliseconds in which `close` is reading the folder may go unseen. Whoever
writes briefs and whoever closes are the same orchestrator, in its own terminal, so they do not happen
at the same time. Nor does the copy of a brief that keeps a date earlier than the program's birth and
is not in its dispatches count. And the check looks at one file per brief with the lock held: today
that is some 50 briefs and 30 dispatches, milliseconds, so it is accepted. Noting the lanes inside the
ledger (which would close all three) is left for a future batch.
**Escape hatch:** `close --even-if-left-open` closes anyway and adds to the tally the block
`CLOSED WITH THINGS OPEN (--even-if-left-open):` with each wait and the lanes with no receipt. It is
only for when the owner answers to close anyway (step 6 of `/orq-batch-closed`); nothing puts it on by
itself. The **close by abandonment** (8 hours with no events) does not go through here: it stays as it
was.

**`decide` and `rule` are not the same, and both can be used.** `decide` judges ONE round on an artifact (continue / escalate / redo) and is archived with the program. `rule` saves a DURABLE NORM that the owner decided in the chat, with the document where it has to be written down: it survives `close` and the handoff as long as it is not documented. A rule is only watched if it is REGISTERED: whatever you do not register, nobody watches. And only the owner session registers it; a lane gets "only the orchestrator registers rules".

Everything else goes on its own: the hook fires with the tools and keeps recording. The subcommands
you DO have to call yourself, when the moment comes:

| When | Command |
|---|---|
| An artifact reached the 3rd round and you decide | `decide --artifact "<key>" --decision continue\|escalate\|redo` |
| You already ran a suite and want to record what was ALREADY broken | `baseline --save --suite <name> --since <output file> [--sha <sha>] [--target <path of the script tested>]` — **it does NOT run the suite**: it parses, with that suite's declared extractor, the output you already generated, and saves `sha`, tree (clean/dirty), target, `exit`, the total of tests **executed** and the list of failures. It only accepts an output that is **COMPLETE** —a summary that adds up with what was extracted, or an end mark without truncation—: a truncated one, a half one, or a suite that declares neither `summary` nor `end` **are rejected**, because saving them would make real failures vanish in the next comparison. **Declare the `--target`**: without it the later comparison comes out "unknown", which is correct but useless |
| You want to see what was broken before you started | `baseline --view` — the baseline is archived with the program, like the dispatches: yesterday's belongs to another `sha` and another tree |
| You start waiting for something | `wait --what "CI for PR 1420" --deadline +45m` |
| What you were waiting for ARRIVED (before or after expiring) | `wait --close --what "CI for PR 1420"` — a fragment of the text; if it is not closed, it gets called out on expiry even if it is already done |
| A search returned ZERO and you already ran its positive control with ANOTHER command | `zero --control --what "<fragment of the command that returned zero>"` — otherwise `status` counts it open forever (the hook only retires it if the SAME command comes back with results) |
| You are about to set the integration order | `integrate --measure --lanes T1,T2 [--base master]` (T55) — **the tool measures it**: it pairs each lane with the worktree of its `T<n>-…` branch, runs `git -c core.quotepath=off diff --name-only <base>...<HEAD>` plus the uncommitted tree, prints the files that overlap and saves `method: 'measured'`. The old way, `integrate --lanes T1,T2 --files 12 --overlap 7`, is still valid but saves `method: 'declared'` and gets called out as "DECLARED by hand, not measured" |
| You close the batch and want to know where the evidence goes | `node scripts/evidence.js --where` (T55) — 0 "to the repo" · 3 "local only" with the reason; `--local-only` copies to `.orchestrator/evidence-batch/`. **Limit:** `--where` queries `gh`'s default repo; with several remotes, check which one |
| You register a person | `identity add --node-id <github node_id> --handle <h> --name <who> --approved-by <the owner's name>` |
| You are about to write "Affected specs" in a brief, or a lead is about to close | `specs [--from <folder>] [--map <path>]` — which specs `specs-map.json` requires for what is currently changed in the tree; exits 1 if any is still UNTOUCHED |
| You want to know what the project says about X without reading all its specs (when creating the map; `--check` at the start of every batch) | `specs --index [--root <project>] [--out <path>] [--check]` (T43) — writes `<root>/specs-index.md` (with `--out`, there, and the root is not touched), one line per spec: `- <path> — <title> — <summary> — <N> lines`. Sources, without duplicating: the specs of THAT root's map (one that does not exist comes out "MISSING") and the `*.md` of `docs/specs\|adr\|decisions\|spec`. Summary = the `<!-- summary: … -->` in the first 20 lines, or the first sentence of the first paragraph (no headings, tables, code, quotes or front-matter), 140 characters at most. Exits **0** written · **2 no specs or with a broken map: it says so and writes NOTHING** (not even a temp file); also 2, without writing, if `--out`/`--root` come with no path or if `--out` would overwrite the map or a spec. `--check` does not write: **0** up to date · **1** missing or stale (a spec touched after the index, a new spec, a deleted spec, a "MISSING" that now exists, or the text is no longer what would come out now: order, map/folder provenance, totals), and it says which · **2** no specs. It does not touch the map nor the `spec_stale` gate |
| A receipt arrives | `validate --lane T<n> --receipt <path> --brief <path> [--map <path>]` — rejects (exit 1) if the diff touches mapped code without its spec. The ledger keeps in `receipts_written` the last 30 lane receipts written (lane, path, session, time), through Write/Edit or through the console; it is a list apart from `dispatches` and it accredits nobody. A file written inside `.orchestrator/receipts/` is never noted as a dispatch, whatever it is called (a `T5-brief.md` in there neither): it does not enter `dispatches` and so it does not accredit a brief (T24). Whatever a pre-T24 ledger already had noted there stays in `dispatches` until another program starts, which empties them. `receipts` is still `validate`'s map |
| **You just wrote a brief and have not dispatched it yet** | `validate --brief <path> [--lane T<n>]` — the SAME contract that will apply to the receipt, but on the brief, while you can still fix it yourself. It prints `OK`, or `BRIEF REJECTED — N failure(s)` with **field and fix** per failure (exit 1). Goal: zero receipts rejected for the brief's own formatting defects. It **WARNS** (does not reject) if a "You are done when" item carries the marker " — proof: `…` " INSIDE it (T10, 2026-09-17): that marker belongs to the RECEIPT, and in the brief it is confusing. Both sides get trimmed at their own marker before being compared, so that brief can now be graded — until 2026-09-16 NOT A SINGLE receipt passed (measured with `BRIEF-T4f`) |
| The receipt of a **BIG** lane arrives | the same `validate --lane … --receipt … --brief …`, which also **rejects** a receipt with "Subagent calls: 0" if it does not carry a `## WHY I DID NOT SPLIT` section with the reason (the section where the lane lead explains why it did not split the work into subagents), and it requires `SPLIT-PLAN-<lane>.md` to exist next to the brief, **written before the first code change** (their `mtime`s are compared: a plan written at the end is a report). Measured on 2026-09-16: two BIG lanes with an explicit order to load `mini-orchestrator.md` delivered 0 subagents and nobody noticed |
| You are about to open a **BIG** lane in a named terminal | `terminal --lane T<n> --name "<name>"`, and once that terminal shows signs of life: `terminal --link T<n> --session <session_id>`. `terminal --list` shows them. The owner's `Stop` warns **once** about a linked lane from which not a single event has arrived |
| **The owner ORDERS you in the chat to edit code yourself** | `allow-edit --file <path> --order-from-owner "<hh:mm and their words>" [--lane T<n>]` — valid for **30 minutes** and **only for that file**. Without it, with the brake set to `block`, the `Write`/`Edit` gets DENIED. The same permission lets a `fable` subagent through for that work |
| **The owner types `/orq-git-permit` or `/orq-merge-permit`** | `allow-git --scope git\|merge [--revoke] --order-from-owner "<hh:mm and their words>"` — grants (or revokes, with `--revoke`) the permit of THAT scope for the rest of the orchestration: `git` covers `git commit` / `git push` / `gh pr create`, `merge` covers `git merge` / `gh pr merge` and is used only by the orchestrator (a lane never merges), and they are revoked separately. It only grants if the human order of the same command exists, less than 2 minutes old, and it consumes it — an agent cannot grant it to itself. **It is not a switch and has no clock of its own:** it dies when the program closes, when it is abandoned (8 h with no events) or when another one starts |
| Codex's round is due | `review [--model gpt-5.6-sol] [--lane T<n>] [--risks "<text>"] [--brief <path>] [--commit <sha>] [--scope <path>] [--full] [--out <file>]` — launches Codex with the prompt in **THREE LAYERS** (1: contract, bugs, security, limits, consumers, **error and recovery paths**, sufficient tests + the two counterexamples per new test; 2: the **conditional angles** of `orchestrator.config.json`, which switch on by the surface the diff touches and not by the file's extension; 3: the brief's gap — `--risks` and the three sections of `--brief`, put in as delimited **DATA**, and always AFTER "derive first from the diff"; without those flags it is omitted and it says so; with `--brief` it demands the three sections —"What you do — and what you do NOT", "Decisions already made", "You are done when"— with text, and if any is missing it answers `BRIEF INCOMPLETE: missing «…». I have NOT launched anything.` without launching (T14, 09-22)). It asks for the output in blocks `FINDING:/SEVERITY:/WHERE:/TRIGGER:/EVIDENCE:/REMEDY:` + `ANGLES APPLIED:` + `COULD NOT CHECK:` and the `VERDICT:` line as always; an output with no blocks and no `VERDICT:` is an **UNKNOWN** round, never a clean one. **From round 2** (when round 1 brought findings) it scopes itself down to the changed **HUNKS** —the whole hunk, not loose lines— and passes it the list of findings of the wide round so it says `RESOLVED/PERSISTS/NEW EFFECT` for each one; `--full` forces a wide one. `--commit <sha>` reviews `git diff <sha>~1 <sha>`, with a FIXED and repeatable base. The ledger row stores: `prompt_version`, `findings` (title, severity, where, status), `angles_applied`, `layer3`, `commit`, `hunks_reviewed`, `covers_hunks`, `closes_with` and `does_not_close_because`. What always was is kept: stdin, read-only, output OUTSIDE the repo, deadline, checking the `model:` header against the model REQUESTED (the real Codex prints it on **stderr**), the diff's fingerprint + untracked files, and that a round from ANOTHER program approves nothing. **It does not record Codex's gate**: it prints the command for you to run yourself. What gets launched is set by `ORCH_CODEX_CMD` (default `codex`; with spaces it splits into executable + arguments, which is how the suite puts a toy Codex in front of it) |

**The reasons why `review` does NOT approve** (the first four were closed after Codex's round 3,
09-16; the next two after round 1 of the new prompt, 09-22; the last one, T13): the model Codex said
**does not match** the requested one (or it did not say any); the last line carries something **after**
the verdict ("NO OPEN FINDINGS but 2 remain"); the **diff or some new untracked file** changed while it
was reviewing (the snapshot includes the `??` from `git status -uall`, which `git diff HEAD` does not
see); the round came in **scoped by hand** with `--scope`, and then it only approves its own scope
(`partially_approved`), never the whole lane; the output is **CONTRADICTORY** (it says "NO OPEN
FINDINGS" and at the same time brings new `FINDING:` blocks or leaves a previous one on `PERSISTS`); or
the round came in scoped **by the automatic trimming** and does not meet the four closing conditions
below; or Codex says it **could not check** something: anything other than "nothing" on its `COULD NOT
CHECK:` line —or the line missing— leaves the round at `partially_approved`, the row stores it in
`could_not_check` and the output says what was left unchecked (T13, 09-22). `--scope` and `--full`
together are rejected, and `--commit` and `--scope` too: they say the opposite thing. And if the
**program changes** between launch and recording, the round stays marked and approves nothing in the
new program.

**And the FOUR conditions under which a directed confirmation DOES close the lane** (before, a scoped
round never approved globally, and with the new budget the lane was left with no possible close): (a) it
**links** to an earlier wide round of the SAME lane and the SAME program; (b) that wide round **covered
the base diff** and its `.diff` can be read; (c) **ALL** the wide round's findings come out as `RESOLVED`
in the directed one, and the wide round left nothing UNCHECKED (its `could_not_check` is "nothing"); and
(d) the new hunks since the wide round are **exactly** the ones the directed one reviewed
(`covers_hunks`). If any fails, `partially_approved` as always and the message **says which one
failed**. A round scoped by hand with `--scope` is ALWAYS partial. And **exhausting the round budget
approves nothing**.

| When | Command |
|---|---|
| You want to see, or record, a lane's tokens | `cost` (the board) · `cost --lane T<n> --tokens <n> [--id <label>] [--model <m>] [--source <where it came from>]` |
| You are about to rescue the handoff sheet by hand (after a compact that did not inject it, or before closing and continuing tomorrow) | `handoff [--write]` — prints the sheet; with `--write` it also leaves it in `orchestrator-handoff.md` |
| **You are about to dispatch a brief to a terminal** | `load` — the board: one row per session with its real context and its % of the million, sorted from fullest to emptiest, and the line `terminals under 50%: N` (the ceiling is the half-height mark, `warn_tokens` over the million; the airbag `autoCompactWindow` at 60% is only the safety net, not the dispatch ceiling). If that N is 0, do not dispatch — and what you do next depends on the **lane size**: if it is **BIG**, YOU open and name a **named terminal** (`--name T<n>-<topic>`, recipe in `references/dispatch.md`, rule Re11644 of 09-24), send it the brief through `SendMessage` with `notify_when_idle: true`, wait for its `READY · T<n>` ack (that is the channel's positive control) and link it when it gives its first sign; if it is **NORMAL** or a short chunk, launch the Opus subagent yourself as lead |

**`pulse` stays silent if nothing changed.** It only prints when there is a transition, which is
exactly what a `Monitor` needs so it does not wake you up every ten minutes for nothing. Since T22
the pulse also looks at orphan hook `node` processes (command line with `.claude\hooks\` or
`orchestrator-control.js`, a parent that no longer exists and more than 5 min of life): it warns ONCE
per process with a line ready to paste and NEVER kills anything (nobody pastes it without checking
that those PIDs are still those processes and without the owner's OK). A single query with a 3 s cap.
**Per system:** on Windows the query is PowerShell (CIM, one JSON answer) and the line is
`Stop-Process -Id <pids> -Force`; without PowerShell it stays silent. **On macOS the query is the
absolute `/bin/ps -axww -o pid=,ppid=,etime=,command=`** (no PowerShell needed), read into the same
shape — every live PID plus the `node` processes with parent, age and command line — and the line is
`kill <pids>` "in Terminal"; a `ps` answer with any line that does not parse is a BROKEN query, never
"no orphans". **NOT TESTED ON macOS** (the darwin branch, the call to `/bin/ps` and the `kill` line are
exercised on Windows with `process.platform` faked, section T58 of the hook suite). On any other
system the check stays silent. What was warned is kept in `orphans_warned` (last 50).

**Since T47 (09-25) the pulse tells three outcomes of that query apart** (before, all three were the
same silence, and a silence caused by time was read as "there are no orphans"):

| Status | What happened | What the pulse says |
|---|---|---|
| `ok` | the query finished (with or without orphans) | the `ORPHAN HOOKS` warning if there is a new one; otherwise silent, as always |
| `exhausted` | it passed its cap (3 s, `ORPHANS_CAP_MS`, which is NOT raised: the pulse cannot become slow) or it had no deadline left | `orphans: query exhausted (N ms of M), not checked this round` |
| `broken` | PowerShell failed, returned something that is not JSON, or a JSON with the wrong shape (`ids` with something that is not a PID; `node` absent, `null` or garbage: with zero `node.exe` the command emits `"node":[]`) | `orphans: query broken (N ms of M), not checked this round` |

In all three it leaves in the ledger the mark `orphans_last = { status, ms, at }`, with `at` = the
time the query FINISHED; a more recent mark (another pulse that queried later and wrote earlier) does
not get overwritten, unless its date is more than 1 min in the future. Without the ledger lock there
is no mark, but the line comes out anyway (`… (and without the lock: it was not noted)`). `status`
shows it: `orphans: last query <status> (<ms> ms, <hh:mm>)`. In `exhausted` and `broken`,
`orphans_warned` is not touched and it **never** says "no orphans": a zero with the query exhausted is
not a fact (law 3). Without PowerShell (another OS) there is no query, no line and no mark.
The T22 test reads that mark: if the query was exhausted, it retries ONCE after 2 s; if it is
exhausted again, the test comes out `OK … (query exhausted, not conclusive)` —neither FAIL nor a plain
OK— and the total is printed at the end of the section. Positive control (b) "live parent does NOT
warn" demands a query that did finish.

**Since T53 (09-25, rule R880c5c) the pulse retries ONCE if the query is exhausted**, inside the same
round: it waits `ORPHANS_RETRY_MS = 2000` and asks again with the SAME 3 s cap (`ORPHANS_CAP_MS` is
not raised). `broken` is not retried (it is not a matter of time) and there is never a third attempt.
To make it fit, the `pulse` CLI has 2 s more budget (`PULSE_EXTRA_BUDGET`: 11 s instead of the 9 s of
`TOTAL_BUDGET`; the owner's decision to give it 11 s, applied only to the pulse because
`UserPromptSubmit` cuts at 10 s (and `SessionStart` at 15) — Codex r1 T53); the hooks stay at 9 s. T47's
reserve of 3 s stays the same, so the 2nd attempt has `min(3 s, what is left − 3 s)` and, if after the
wait there is no deadline left, it is not retried and the round keeps T47's line. What changes in view:

| Case | What the pulse says | Mark |
|---|---|---|
| 2nd attempt `ok` | the normal `ok` (the warning if there are new orphans) | `{ status: 'ok', ms, at, attempts: 2 }` |
| 2nd attempt exhausted too | `orphans: query exhausted 2 times (N ms + M ms of T), not checked this round` (T = the sum of the two deadlines) | `{ status: 'exhausted', ms, at, attempts: 2 }` |
| 2nd attempt `broken` | T47's `query broken` line | `{ status: 'broken', ms, at, attempts: 2 }` |

`ms` and `at` are those of the 2nd attempt. `attempts` only appears when there are 2, and the mark
still does not overwrite a more recent one. `status` adds, below "last query…", the line `orphans: that
query cost 2 attempts (the 1st was exhausted and it was repeated after 2 s)`. Along this path the pulse
takes about ~8 s at most (3 + 2 + 3) from the moment the script starts. The tests: section T22 of the
hook test, block `T53` (a)-(d) with toy listers that count their calls, and three mutants. Since T53
the T22 test runs its retry cases against the PULSE's and accepts both forms of the line.

### What the hook cleans up, and when (nobody types a command)

The owner, 2026-09-16: *"I just want an automated cleanup system once the tasks are done; I don't see
the point of leaving junk behind that whoever reads the skill next also has to clean up for no
reason."* Measured on CLIENT-A: **8 handovers / 136 KB over two workdays** (~100 KB/day), and whoever
resumed did not know which one was the good one.

**Since 2026-09-16 handovers live OUTSIDE `.git/`** (owner's decision, 2026-09-16: "yes"): in
`<orchestrated repo root>/.orchestrator/handovers/`. They used to live in
`<git-common-dir>/orchestrator-handovers/`. **Only the handovers move** (and, later on, the generic
context notes and the Codex reviews); **the ledger (`orchestrator-state.json`) and the log stay in
`.git/`**. So that git does not see the new folder without touching the project's `.gitignore` (which
is not ours), the hook adds an `.orchestrator/` line to `<git-common-dir>/info/exclude` if it is not
there yet — **idempotent**: if it is already there, it writes nothing. **Why:** the house's GateGuard
blocks `Write` under `.git/`, and until now every terminal had to write its handover with a copy
command (measured in the owner's session on 09-15) — a workaround, not a design.

**Before deleting anything, containment is checked** (`containedFolder` + `lstat`) through **both**
deletion paths, not just one: while the folder lived inside `.git/` the risk was theoretical, but now
it sits where anyone can drop a link in the middle. And the **move never clobbers**: it copies
exclusively, deletes the original only afterward, and **rewrites the paths the ledger had pointed at**
—`handovers[].path`, `handover_written`, `handover_requested`—; without that, an OPEN handover stopped
being recognized as open and the age-based cleanup could sweep it away on the very next startup.
*(Codex `gpt-5.6-sol`, round 1 of lane T7, three HIGHs.)*

**Two known limits, accepted knowingly** *(same round)*: in a **linked worktree**, the root used is
that of the MAIN checkout, not the worktree's own — that is on purpose, so every terminal on the same
repository shares one folder; and with `--separate-git-dir` (where the git directory is not called
`.git`), `.orchestrator/` lands next to the ledger. If a project already had its own `.orchestrator/`
folder, the `info/exclude` line would hide it from git: the name was chosen so that does not happen,
but ownership is not checked.

| When | What gets cleaned up | What gets KEPT |
|---|---|---|
| **A lane's receipt passes `validate`** (or, by hand, `close-lane --lane T<n>`) | its `HANDOVER-<session>-*.md` handovers, **minus the latest one**; it gets recorded in the log | **that lane's latest handover**: its terminal is still alive and can compact right now |
| **A program gets archived** (8 h with not a single event, or a fresh `start`) | the closed lanes' handovers (the latest one too), the `orchestrator-context-<sid>.md` notes for sessions with **no activity in 24 h**, the Codex reviews in `orchestrator-reviews/` **older than 7 days**, and the log gets rotated to the last **2,000 lines** | **the OWNER's handovers**, until the next program's archiving: there always has to be one left to resume from |
| **The skill starts (`start`) and the old `<git-common-dir>/orchestrator-handovers/` folder exists with files in it** | they get **moved** to the new `<orchestrated repo root>/.orchestrator/handovers/`; the log records the migration | **all the files** — it is a one-time move, not a cleanup; the old folder is only removed if it is empty after moving |
| **Always** | — | the **handoff sheet** lists **one handover per lane** (the latest one) with "+n older" if more remain |

**Deliberately out of scope:** the session's scratchpad (the working briefs and receipts) belongs to
Claude Code, it is per session, and nobody else reads it. The skill does not touch it.

### Cost per lane: where it lives, and what it does NOT prove

Token cost lives in the **ledger**, `<git-common-dir>/orchestrator-state.json`, under
`cost["T<n>"] = { program, lane, runs: [{ id, type, model, tokens, source, at }] }`. **Single**
source: there is no second notebook or daily file. It comes out in `status`, in `cost`, and in the
**handoff sheet**, with its total per lane and its **pending measurements**.

Three hard rules:

- **What cannot be attributed is `"unknown"`, never 0.** A 0 would say "that lane spent nothing",
  which is exactly the kind of lie this hook exists to not tell.
- **One run = one entry.** The same `agent_id` does not get recorded twice (its `SubagentStop` arrives
  duplicated), and children do not get added to a total that already includes them.
- **These tokens do NOT prove money spent, nor quota percentage.** They are tokens, and they are
  stated as tokens.

Where each number comes from, and why there are two sources: the `SubagentStop` **does not carry a
token count** (measured, see `ORCH_CAPTURE`), so the hook records the subagent's **final context** by
reading its `agent_transcript_path` — and it says so in the `source` field, because occupied context
and accumulated consumption are **not the same measure**. The real accumulated total
(`subagent_tokens`) is only seen by the orchestrator, in its task notification: that is what
`cost --lane T<n> --tokens <n> --source notification` is for, which feeds it into that same single
source.

Since 09-16 that entry no longer stays half-done: the `.meta.json` that Claude Code leaves **next to**
the subagent's transcript carries its **model** and its **description** (measured:
`{"agentType":"general-purpose","description":"…","model":"sonnet","parentAgentId":"…","spawnDepth":2}`),
so the cost entry no longer says `model: unknown` when the file is there, and its `source` becomes
`transcript` (with the fine print in `note_source`: it is final context, not accumulated
consumption).

### The REAL context of subagents: `load --agents`

The owner, 09-16: *"the one thing I'd really like is to see the subagents' real context, not the one
they write; the one they write is no use to me."* A subagent **does not have its own session** — its
events arrive with its terminal's `session_id` — but it **does have its own transcript**, and that is
where the data is.

| When | Command |
|---|---|
| You want to see how much context your subagents really carry | `load --agents` (or `status`, which already includes it). With `--session <id>` / `--transcript <path>` you look at another terminal's |

Where it lives and what gets read, all measured on 09-16 on the source owner's machine:

- Folder: `<project folder>/<terminal's session_id>/subagents/agent-<id>.jsonl`, with an
  `agent-<id>.meta.json` next to it.
- **Grandchildren do NOT hang off the parent**: the 44 files in that folder are all flat. Who belongs
  to whom is known from `parentAgentId` and `spawnDepth` (1 = child of the terminal, 2 = grandchild),
  and the table says so in those words.
- **Real context** = `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` from the
  last `assistant` message (the same count as a terminal's). **Maximum** = the highest one seen. A
  **drop of more than 200,000 tokens** between two replies is a compaction, and it gets stored with
  the timestamp **of the message where it drops**, not of the reading.
- **What was written** (accumulated `output_tokens`) comes last and is labeled as not being load: it
  is exactly the number the owner said was no use to them.
- **Alive / finished**: the transcript touched less than 2 minutes ago.
- **What it costs**: these files reach 5 MB. Since a `.jsonl` only grows, the ledger stores, per
  agent, how many bytes it has already read, and every pass continues from there, with a cap per
  round (8 MB in the hook, four times that in the CLI). The first measurement can take several
  rounds; after that it is nearly free. That is why `load --agents` and `status` **write** to the
  ledger.

On the owner's `Stop`, two warnings come out, each **once**: *"your agent `<id>` '<desc>' is at
`<n>`k (`<pct>`%): tell it to write its partial receipt now"* on crossing `warn_tokens`, and *"your
agent `<id>` compacted at hh:mm: tell it to re-read its brief"* for **each drop**, identified by its
timestamp (without that, on 09-16 at 12:23 the same 12:07 compaction was called out twice, and with
the wrong time).

And the other side of the same coin: **a subagent's compaction no longer gets recorded against its
terminal.** Measured on 09-16 at 12:07 — a subagent of the owner's session compacted, and the real
ledger set IT `compactions: 1` and told it *"YOU JUST COMPACTED"* when it had not compacted at all.
A subagent's payload carries the mother's `session_id`, but it is distinguished by `agent_id`,
`agent_transcript_path`, or a `transcript_path` under `…/subagents/`; in that case the fact is
recorded separately (`subagent_compactions`, which `status` lists) and the terminal's own record is
left untouched.

### The owner's handoff: the new terminal inherits command without closing anything (T54, 10-08, issue #17)

**The measured failure (10-01, client-repo, program `orq-ca4e2261`).** The old orchestrator wrote its
handover; the new session typed `/orq` and **still was not the owner**: `rule` rejected it, `allow-git`
told it "I have not seen that key" with the key freshly pressed (the owner typed it twice) and the
`gh pr merge` warning treated it as a lane. The only way out was `close` + `start`, which **kills the
permits**. Why the owner did not change: a **typed** `/orq` does not go through the `Skill` tool, so
the hook never saw the load (the new session's transcript: `/orq` as a command, no `Skill` call; the
log has no `start` at that time); and the `start` that the AI runs afterward only sets an owner if
there is none. The reproduction is in T54's evidence (source repo).
**Since T54, a typed `/orq` (a `UserPromptSubmit` whose first line is `/orq` or starts with `/orq `,
inside a repository) does the SAME load as the `Skill` tool**, with the live/dead owner rule below, and
its warning comes out as `UserPromptSubmit`. `/orq-git-permit` and the like are not this.

**How the handoff is done now (inside the SAME program):**

```
node ~/.claude/skills/orq/scripts/orchestrator-control.js relieve --prepare   # the owner, before handing themselves over
node ~/.claude/skills/orq/scripts/orchestrator-control.js relieve --take      # the new session (its CLAUDE_CODE_SESSION_ID)
```

- `--prepare` is only run by the current owner. It leaves `pending_relief` (who, when, expires after
  **30 min**, `PENDING_RELIEF_MIN`), notes it in the log and as the event `relief_prepared`.
- `--take` accepts if there is a valid `--prepare` **or** if the owner is **not alive**: no signal of
  theirs in the ledger (`L.sessions[<owner>].last_time`, which every event of theirs sets) in the last
  **10 min** (`DEAD_OWNER_RELIEF_MIN`), with a readable `last_time`. With **no card** in the ledger, or
  with an **unreadable** `last_time` (not a date, or in the future), it **cannot be known** whether they
  are alive (the orchestrator's decision, 10-08): that blocks the unprepared handoff exactly like a live
  owner, and it says so ("the owner `<sid>` has no card in the ledger: I cannot know whether they are
  alive"); it only gets in through their `--prepare`. Exception: an owner with a reserved JavaScript name
  (`constructor`…) can never have a card nor run `relieve`, so they count as having no signal. If
  neither is met, it **does not relieve** and says who the owner is: "the owner is `<sid>` ("name"),
  alive N min ago; ask them to run `relieve --prepare`" (and, if there was one, that their prepared
  handoff expired).
- The prepared handoff is valid from `at` and for at most 30 min; an `at` in the future or an
  incoherent `expires_at` (earlier than `at`, or more than 30 min away) authorize nothing.
- A session linked to a lane's terminal (`terminal --link`) does not take a prepared handoff: a lane
  does not inherit command (the orchestrator's decision, 10-08: it closes the hatch of issue #10).
- **What the handoff does:** `owner_session` goes to the new one, the old one goes to
  `previous_owners` (they stop commanding: does not register rules, does not grant permits, does not
  merge; they stay exempt from the lane warnings by T17's design), it notes since when they command
  (`owner_since`), the new one is left with a signal (so that a third does not take it away at once) and
  the pending handoff is consumed; log tag `relieve` and event `owner_relieved`.
- **What it does NOT touch:** the `program_id`, the git permits (they are **the program's**: the owner
  gave them; the checks look at the CURRENT owner, never at who granted the permit), the rules, the
  waits, the artifacts or the lanes.
- The **orchestrator's** handover template carries in "2. RESUME" the fixed line "The new session
  inherits the owner with: `node <script> relieve --take`". A lane's does not.
- `status` and the handoff sheet show `owner: <sid> (since hh:mm; previous: n; alive N min ago)` and,
  if there is one, the prepared handoff with its expiry time. With no `owner_since` (a ledger from
  before T54, or an owner set by `start`) they say `since: unknown`: never a fabricated time.

**If the skill is loaded (the `Skill` tool or a typed `/orq`) with an open program whose owner is ANOTHER session:**
with the owner **alive** (or with no way to know: no card or an unreadable signal), command is NOT
taken from them: the session that loads stays as a lane and the owner sees on screen "This repo already
has a live orchestrator (`<sid>`, N min ago): you are NOT the owner. To relieve them: have them run
`relieve --prepare` and you `relieve --take`". With the owner **without a signal**, the load takes the
handoff in the same program and says so: "Previous owner `<sid>` no signal since hh:mm: I take the
handoff in the same program (orq-…); permits and rules are kept". Closed program or no program: as
always (new program). Both warnings are the usual startup warning (`for_human`), with another text.

**Messages with the real cause.** `allow-git`, with the owner's key fresh but typed in a session that
is not the owner, no longer says "I have not seen that key": it says "The owner DID type … in session
`<sid>`, but this session is not the owner; the owner is `<sid>` (alive N min ago / no signal since
hh:mm); to relieve them: …" (and if there is a prepared handoff, that you should run `relieve --take`).
After the handoff, the same key (valid for 2 min) grants without asking the owner for anything. If
whoever runs `allow-git` is the owner themselves and the key is in another terminal, it says that ("the
owner is you": have the owner type it in THIS terminal); if a third session runs it, it names the key's
session and the owner, promising it nothing. Without a fresh key, the usual text. `rule` says the same
after its prefix "only the orchestrator registers rules:". The `gh pr merge` warning from a session
that is not the orchestrator names the registered owner and offers `relieve --take`.

**`close` + `start` is NO LONGER the way to relieve** (it was issue #14's proposal): the permits are
lost. `close`, `start` and `handOffProgram` do not change.

**What T54's tests do not cover:** the output of a typed `/orq` is tested with the simulated
`UserPromptSubmit` event (the one measured in the 10-01 transcript), not with the real Claude Code; and
the warnings' phrases are checked by their contractual text, not by paraphrase.

---

## What it detects TODAY (phase 1: warns, never blocks)

| Gate | Fires when | Which 08-11 failure it kills | How it checks it |
|---|---|---|---|
| `third_round` | you launch a subagent on an artifact that has already gone 3 rounds | **1** — a lane reached 7 rounds and nobody looked | counts `Agent`/`Task` calls grouped by their normalized `description` |
| `delivery_published` | you mark a task `completed`, or write a handoff/brief | **4** — 90%-done work that only existed uncommitted on someone else's disk | `git status --porcelain` + `git branch -r --contains HEAD` |
| `task_identity` | you update a task with a `T<n>` different from the one it was bound to | **9** — the contents of two tasks got crossed | the ledger pins `T<n> ↔ task_id` and compares before writing |
| `receipt_missing` | you write "done / verified / cancelled / works" with no provenance mark | **3 and 7** — a personal recommendation and a git author promoted to fact | looks for `[V…] [D…] [S] [REQ…] [PROP]` in the text |
| `zero_unchecked` | a search (`rg`, `grep`, `findstr`…) returns zero. **What does NOT count as a search:** (a) since T6 (09-21), text that is only written — a heredoc to a file or an `echo "…grep…"` that mentions `grep` (the owner swallowed that false positive twice on 09-21 writing queries for Codex); (b) since T9 (09-22), **the OPERATION that filters or probes**, never the whole compound command: a `… \| grep -v x` that screens another output, a `grep -c`/`git grep -c` whose number is used in the same command (inside `$(…)` or with a `&&`/`\|\|` after it), and what is searched INSIDE a `while`/`until` loop with `sleep` (a monitor: empty is "not yet"). **What DOES still count:** `git ls-files \| grep auth`, `cat f \| grep x`, a **bare** `grep -c` or `grep -v`, `sleep 5; grep x f`, a `for … do grep … done`, a background `grep`, and **`grep -q`** (without an exit code in the payload one cannot claim it is a probe; when in doubt, the warning stays). And T9 **widened** the prefilter so that a searcher glued to the parenthesis of a substitution counts: an `x=$(grep pattern f)` or an `echo "$(grep pattern f)"` used to go unseen and their real zero was lost. **And since T11 (09-22), `isWaitOrState` does not absolve the whole command either:** it absolves the wait STRETCH —the `while`/`until … done` loop and the state command (`git status`, `docker ps`, `tasklist`…) together with what hangs off its pipe (`git status \| grep x` stays quiet)— so a search that sits OUTSIDE that stretch is still recorded: `while …; done; grep pattern src/` **does** call it out. Its test is (a-bis) in section 27-ter of the suite, which went from pinning the hole to being its positive control. Measured through the whole hook over 42 real commands from CLIENT-A's 09-21 batch, classified by hand: **before, 39 were recorded; now, 25**, and **no real search went mute** (`tests/fixtures/real-zeros-2026-09-21.json`) | **8** — four zeros taken as good that were actually a badly written pattern | looks at the command's real output; if the same pattern later DOES return results, it withdraws the warning |
| `person_identity` | you assign something to an `@handle` that is not in the approved register | **5** — two names for the same account all day | the register is indexed by GitHub's immutable `node_id`; with no approved entry → **UNKNOWN** |
| `overlap_stale` | a HEAD changed since you measured the overlap | **6** — overlap measured once: when it mattered it was 7, not 6 | stores each worktree's HEAD at measurement time and re-compares it on every pulse |
| `wait_expired` | a registered wait passes its deadline | **2** — two ready PRs sat for hours with nobody seeing them | caught by the Monitor's **`pulse`**, not the hook |
| `pr_state` | a PR got merged or closed since the last look | the orchestrator was always behind on merges (the owner, 09-01) | `gh pr list --state all --json ...` on every **`pulse`**; the first look is a baseline and stays silent; with no `gh` it warns ONCE that you are flying blind |
| `orchestrator_builds` | the **owner session** (the one that loaded the skill) does `Write`/`Edit` on product code of the orchestrated repo — the lanes, which share the program, do not count | failure #1 of the 09-11 insights report: the "you do not build" rule got read at startup and diluted halfway through the session | `PreToolUse Write\|Edit`: the file shares a git-common-dir with the cwd (worktrees included), it is not `.md`/`.txt` and, **relative to the repo root**, it is not under `.claude/`, `splits/` or `tmp/`. No exemption by size (the ≤ 3-line exemption was repealed on 09-15; today it does not exist in the code). It also covers edits by command: `Bash`/`PowerShell` that write (`sed -i`, heredoc, `Set-Content`…) go through `checkBuildingCommand`, with an undetermined scope (`git apply`, `patch`, `rm -rf`) treated the same (corrected on 09-21: this said the opposite here, Codex sol caught it). **And it is NOT the owner editing when a SUBAGENT of theirs edits (T3, 09-21):** if the event carries any of the three signals of `isFromSubagent` (non-empty `agent_id`, non-empty `agent_transcript_path`, or a `transcript_path` under `…/subagents/`) —a subagent's events arrive with the MOTHER's `session_id`, so by the id they are indistinguishable— **no alert is emitted**: `recordEvent('subagent_edit', …)` is noted with the mother session, the `agent_id`, the signal that gave it away, the real tool (`real_tool`), the file or the scope and the lines. **It does not accuse, does not count in `counters.by_gate`, does not enter `pending` and does not write a line in the log.** And since it runs in `PreToolUse`, the event says `phase: 'request'`: the subagent *asks* to edit, it has not edited yet. Measured on 09-21 in `client-repo`: 18 warnings in 15 min, 17 accusatory, all from a subagent's edits; the orchestrator had only touched two `.md`. What this gate does **not** decide is whether that subagent had a brief (issue #10) |
| `spec_stale` | **any** session of the program (owner or lane) does `Write`/`Edit` on a file that `specs-map.json` maps to a spec, and nobody edits that spec | specs go stale while working across n projects, and the next session reads a document that no longer describes the product (the owner, 09-15) | `PostToolUse Write\|Edit`: looks for `specs-map.json` going up from the file; if a rule matches, it notes the spec in `specs_pending` and **warns ONCE per spec and program**; editing the spec closes it; the `Stop` reminds ONCE about whichever are still pending. **With no map, or an unreadable one, the hook stays quiet.** The final word belongs to **`validate`**, which DOES reject (it is a CLI, not phase 1): a diff with mapped code and no its spec → rejected, unless the brief declares it "no change: <reason>" in `## Affected specs`; and every spec listed in that section has to be in the diff. Subcommand `specs`: what the map requires for the current tree. **Hard rules that came out of Codex's review (09-15):** paths are compared EXACT and relative to the root (a copy `backup/docs/spec.md` does not count as `docs/spec.md`; `../` does not exempt it); a path abbreviated with `...` in the diff is rejected (paste `git diff --stat=200` from the root); a rename counts for BOTH paths; a DELETED spec is not a touched spec; the map is looked for from the repo where `validate` runs, never from the brief's folder; the map validates types and reserved names; globs do not use RegExp (a hostile `*a*a*a…` used to hang the hook); a rename of the spec itself does not count as touching it (neither in `validate` nor in `specs`), unless it is a recreation or a case-only change; paths quoted by git get decoded (octal bytes, whole emoji) and a malformed quoted path is rejected; `specs` reads `git status -z` (a name with ` -> ` is not a rename); and the "already warned" memory (`specs_warned`) is different from the obligations (`specs_pending`): closed ones outside the map get pruned, open ones outside the map get flagged and are not claimed, and with more than 200 open, nothing gets dropped — it warns that the map is too wide instead. **And the receipt carries both diffs (Codex's 3rd round, 09-15):** `git diff --stat` is ambiguous by design (it abbreviates with `...` and uses ` => ` for renames, which can be part of a name), so the receipt template ALSO asks for `git diff --name-status`, which has no such ambiguity, and `validate` prefers it for the spec check when it is present; if it is missing, it checks against the `--stat`, warns about it, and rejects any abbreviated path (a false rejection beats a false green). The `--stat` is still mandatory because the additive rule counts its deleted lines. The two outputs are checked against each other in both directions (a file present in one and not the other rejects the receipt); the name-status carries ONE status per path applied in order (`M, M, D` = deleted; `M` then `R`/`U` = not credited) and a line that starts like name-status but does not match is a broken line. **Known limits after 5 rounds of Codex review (09-15), all on the side of false rejection or noise, none on the side of a false green:** a filename that literally contains ` => ` or ` \| ` makes the `--stat` not line up with the name-status and the receipt gets rejected (fix: the orchestrator opens it by hand); in a repo with several worktrees carrying different `specs-map.json` files, reconciliation uses the map of whichever worktree edited last; and `Stop` does not reconcile on its own (the next edit does). The review loop was stopped there: each round was finding stranger cases than the one before |
| `terminal_load` | the **owner session** writes a brief whose `- Folder: <path>` line is the folder of a registered terminal that is already past the **load ceiling** (the half-height mark: `warn_tokens` from `orchestrator.config.json` expressed over the million, today **50%** — not the airbag `autoCompactWindow`, which is only the safety net at 60%) | "the orchestrator isn't tracking other sessions' context, and keeps delegating tasks to them, instead of sending subagents to work itself if there are no low-context terminals open" (the owner, 09-15). A nearly full terminal accepts the brief, gets compacted halfway through, and verifies at the end with whatever memory is left — and from the outside it looks exactly like an empty one | the hook keeps a **per-session record** (`sessions` in the state: `first_time`, `last_time`, `invocations`, `cwd`, `role`, `context_tokens`), updated on **every** event carrying a `session_id`. Context is read from that session's **transcript** (`transcript_path` from the payload): the last `type:"assistant"` record with `message.usage`, adding up `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` — verified against a real transcript on 09-15 (32 + 2770 + 583794 = 586,596). Only the **tail** (256 KB) gets read, by position, never the whole file: some reach 5 MB and the hook has a **9 s total budget**. **ONE SINGLE PERCENTAGE, the one Claude Code shows** (the owner, 09-15, in their own words: "550k is 55% of 1 million, which is 100% — don't confuse me with some other percentage"): the model's REAL window is **1,000,000 tokens = 100%**, and the hook NEVER divides by `autoCompactWindow`. 403,353 tokens are **40%**, not 73%. The **load ceiling** is the half-height mark (`warn_tokens`, today 500,000 → **50%**); with no valid `orchestrator.config.json` it falls back to the only ceiling declared in `settings.json` (`autoCompactWindow`), and with neither of the two the ceiling stays at 100% and nothing gets warned about. The warning carries both figures: "it is at 56% of the million and your ceiling is at 50%". What could not be measured is **`?`, never 0** (a 0 would say "that terminal is empty", which is exactly the lie this gate exists to kill), and an unmeasured terminal **does not count as free**; neither does an **inactive** one (no single event in 2 h), which comes out flagged on the board. The board shows up in `status` and, alone, in the `load` subcommand. On `PostToolUse Write\|Edit` over an owner's dispatch, `Folder:` gets compared against each session's `cwd`; on `Stop` the full ones get listed **once per session and program** (`warned_stop` mark, same as the specs). Ceiling of 50 sessions, pruned by `last_time`; a new program does **not** inherit the previous one's sessions. What it does NOT see: a terminal that has not fired a single event in this program, and the template's unfilled `- Folder:` (`<absolute path>`), which is ignored on purpose |
| `own_load` | **any** session of the program (owner or lane) closes a turn (`Stop`) with its **own** context above the load ceiling | "I want that same hook for the workers too" (the owner, 09-15): a terminal that fills up without noticing compacts mid-task and whatever was not on disk gets lost; the orchestrator knew it was full (`terminal_load`), but the terminal itself did not | on `Stop`, using the same measurement as `terminal_load` (`sessions`: transcript, 256 KB tail, `?` never 0): if `context_tokens / 1,000,000 ≥ ceiling`, it warns **that terminal itself** — *"Your own terminal is at N% of the million and the owner's ceiling is at M%: put on disk NOW whatever you do not want to lose"* — **once per crossing** (`warned_own` mark per session, which **rearms** in `noteSession` as soon as a measurement sees it back under the ceiling: that way a mid-turn compaction rearms it even with no `Stop`; caught by Codex/Astra as a HIGH in T2's 1st round). The text carries the session and the tokens (`session xxxxxxxx: N of 1000000 tokens`) so it reads at a glance, but what stops two lanes at the same percentage from stepping on each other's warning is the **discriminant** passed to `raiseAlert()` — session + its `first_time` + crossing number, not the text —: two terminals at the same % do not share a dedup key, and one terminal that crosses twice (e.g. after compacting) does not reuse the previous one either. The owner receives their own and does **not** list themselves in `terminal_load`. With no declared ceiling, or with `context_tokens` at `?`, it stays quiet. **Measured limit (T2, 09-15, with a positive control):** the `Agent` tool's **subagents have no measurable own-load**: their events reach the hook with the mother session's `session_id` and `transcript_path` (their own transcript exists at `projects/<session>/subagents/agent-<id>.jsonl`, with `isSidechain: true`, but that never reaches the payload). Consequence: a subagent never gets this warning. **What this said here —that `orchestrator_builds` fires falsely when a subagent edits code— is NO LONGER true since T3 (09-21):** that gate recognizes the subagent by the three signals of `isFromSubagent` and, instead of accusing the owner, notes `recordEvent('subagent_edit', …)`. And since T4 (09-21) that event also carries the verdict of the link (`accredited` / `out_of_scope` / `pending_identity` / …) with its lane and its brief. What remains standing of this limit is only the load part: only terminals (sessions) get measured. **The two thresholds (lane T3, 09-15; spec signed by the owner at `orchestrator-multi-llm/docs/specs/DECISIONS.md:140`, 2026-09-09):** the warning fires at the **half-height mark**, `warn_tokens` from `orchestrator.config.json` (today **500,000 = 50%**), below the **airbag** (`airbag_tokens`, 600,000 = 60% since the afternoon of 09-15, before that 550,000, which is what `autoCompactWindow` should be set to). Text (T3-bis, 09-15; owner's rule: **nobody closes terminals**, compaction at 600k is meant to continue in the SAME terminal): "Your terminal is at N% of the million (warning at half-height: 50%; the airbag compacts at 60%). **Write your handover for yourself in `<path>` NOW**… you will read it yourself and continue in THIS terminal. Do not stop, do not ask to finish anything." **On returning from a compaction** (`SessionStart` with `source: compact`), the first block the terminal receives is "YOU JUST COMPACTED your memory (hh:mm). Your terminal is now at N%…" followed by its handover (only the head, ≤ 512 KB read, ≤ 16 KB injected), its generic note, and, if it is the owner, the handoff sheet, in one single `additionalContext`; the next `Stop` repeats "You just compacted (hh:mm), you are at N%, you are still here" **only once** (`compaction_warned` mark); any instruction from the summary that orders stopping or waiting for a replacement gets declared expired. With no handover written before compacting, the block adds "You did not write your handover before compacting: whatever is not in the summary was lost." The real case that motivated this (E2 = 74ce700b, 09-15, section 22 of the suite): correct warning at 509,851, compaction at 22:16Z, and the terminal at 15% asked to close itself because of the old text. The hook **seeds** the empty handover file at `<orchestrated repo root>/.orchestrator/handovers/HANDOVER-<session>-<date>.md` (before: `<ledger folder>/orchestrator-handovers/…`, moved on 2026-09-16 outside `.git/`) with the **9-section** header (MANDATE · RESUME · LOCAL STATE · RESULTS · VERIFICATION · PENDING · REVIEWS · COORDINATION · WARNINGS; refined with Codex/Astra and approved by the owner on 09-15), and `PostToolUse Write\|Edit` on that path marks `handover_written` on the session. **"WARN yes; ORDER no"**: nothing blocks; the terminal obeys because its brief orders it to (the "If the load warning reaches you" block of `brief-template.md`), and if it does not obey, the airbag prevents the crash. With no `orchestrator.config.json` (or an invalid one: integers, `0 < warn < airbag ≤ 1,000,000`) it warns 🔴 and falls back to the single `autoCompactWindow` ceiling, as before. For tests: `ORCH_CONFIG=<path>` points to a toy config |
| `lane_handoff` | a lane **compacted** (with or without a written handover) | the other half of "the two thresholds" in the skill: the orchestrator has to know that lane's memory is now "its handover + the summary", or it will keep talking to it as if it remembered everything | on the **owner's** `Stop` and on `pulse`, **once per compaction**: "Lane X compacted at hh:mm and read its handover (`<path>`): its memory is now that handover + the summary; if you send it something new, give it the whole thing, do not assume it remembers what came before" (or "compacted WITH NO handover"). **Nobody ever gets told to replace that lead with another: nobody closes or relaunches terminals** (the owner, 09-15). The owner's handoff sheet lists the lanes that compacted today with their handover; `status` lists per session compactions and the last handover read. On compacting, `handover_written` turns into `handovers_read` and `warned_own` rearms in `noteSession`. **Limits accepted with Codex (T3, 09-15):** handover pruning keeps 20 and may drop a pending one if all 20 are open at once; opening a FIFO like a transcript can block before the `fstat` (a Node limit, documented in `contextFromTranscript`); `handoff --write` writes the sheet with no lock (code that predates the lane). **A previous orchestrator is not a lane** (T17, 09-22): when another session becomes the owner (on loading the skill or with `start`), the earlier one stays in the ledger's `previous_owners` and no longer receives `lane_handoff` warnings (compacted / NEW BRIEF). On the handoff sheet it comes out apart, under "Previous orchestrators" |
| `silent_stop` | a session of the program that is **NOT the owner** closes a turn (`Stop`) without having sent any **status message** to the orchestrator. These are **two reasons inside the same gate**, not two gates: `stopped_unsent` (it **declared** its status on its own screen —a line that STARTS with `STOPPED ·`, `DONE ·` or `BLOCKED ·`, outside a code block— and did not send it; the warning QUOTES the word that was found) and `close_without_state` (it closed the turn without declaring anything AND without sending anything). **Both demand an accredited lane** since round 2 of 09-21 | a lane wrote `STOPPED · reason: … · need: … · from whom: orchestrator` **four times as text in its terminal** and the orchestrator never saw it: it does not read other people's screens, it only sees what gets SENT to it. Twenty minutes lost. And on the SAME DAY at 13:09, in another CLIENT-A lane, the variant without that word: it closed the turn with "That leaves the verdict at BLOCKED for signature with a named blocker, not at 'done'" and sent nothing; the owner had to ask it "did you tell your orchestrator?" and it answered "No. I'm sending it now". That is why the screen detector looks at the THREE status words, not just `STOPPED ·`. And the same day, in CLIENT-A, the twin case nobody was catching: a lane that closes the turn **completely silent**, which from outside is identical to one "stopped waiting for something legitimate" — a CI, a review, its subagents, a reply. That difference is what the owner wants to see (the owner, 09-21) | on `Stop`, with ONE single read shared by the two reasons: it reads the **tail** of the `transcript_path` by position and within the budget (never the whole file: some are 46 MB), skipping the `isSidechain` ones (a sidechain is another agent's conversation, not this screen), and it delimits **the turn that just closed** — from the last `type:"user"` record that is someone really speaking (`content` of text or `text` blocks; a `tool_result` is put in by the system on its behalf and does NOT open a turn, and the hook's own feedback is discarded by `isSystemNoise`, so it does not either). **STATUS MESSAGE, not any `SendMessage`** (changed on 09-21): only a `SendMessage` `tool_use` counts whose `input.message` starts with `STOPPED ·`, `DONE ·` or `BLOCKED ·`, which **did not come back with `is_error`** —a failed send has communicated nothing— and which went **TO THE ORCHESTRATOR**. **THE RECIPIENT (round 2, 09-21):** before, `input.message` was looked at and `input.to` never, so a `STOPPED ·` sent to ANOTHER lane cleared the streak and silenced the gate — the false negative exactly in the incident the gate prevents. "The orchestrator" is, in this order: **(a)** the registered name of the owner session (`sessionTerminalName`), or **(b)** the **PERSISTED identity** (`L.orchestrator_identity`), which is set once and never touched again. What it is NOT, since T4 (09-21): the `from-name` of the LAST cross-session message — with two lanes writing to each other, that turned whoever spoke last into "the orchestrator". And the identity is only persisted with PROOF: `from` = the owner session, its registered name, `terminal --link`, or a COMPLETE read of the transcript from byte 0 (with a truncated tail, "the first sender" is merely the first one that fit). Without (a) or (b) it is not known to whom the lane had to write: it is not claimed that it communicated, and `close_without_state` abstains (`stopped_unsent` can still call it out, because the written declaration is its own evidence). **THE SENDING VOCABULARY IS THE SCREEN'S:** before it said `STOPPED\|DONE\|READY`, and that cost both faces — a well-sent `BLOCKED ·` did not count (false warning) and a `READY ·` ack from the start of the turn counted as a closing status (false silence, and it also cleared the previous streak). **`READY ·` only accredits; it is never a closing status.** The LAST valid status of the turn is evaluated, not the mere existence of one. **THE SCREEN DECLARATION IS ANCHORED:** until round 2 the regex was `/STOPPED\s*·\|DONE\s*·\|BLOCKED/` against the whole text, and it matched prose ("the BLOCKED test already passes"), quotes, examples and code blocks. It was not harmless noise: every false positive left `silent_streak.warned = true` and that SILENCED the next AUTHENTIC STOPPED — the gate disarmed itself. Now a declaration is a LINE that starts (after spaces) with one of the three words with its `·`, OUTSIDE a code fence, and an ambiguous match does not consume the streak. **What is lost, said plainly:** the real CLIENT-A case (`BLOCKED` mid-sentence) no longer falls under `stopped_unsent`; it falls under `close_without_state`, which is the reason made for whoever closes without declaring anything, so it still gets its warning, without the word quote. **ACCREDITED LANE** for the `close_without_state` reason: `noteSession` sets `role: "lane"` on EVERY session that is not the owner —the owner's own personal terminal included—, so that role is no proof. Evidence of origin is needed, and any of the three counts; it is stored in `L.sessions[sid].accredited_lane = { by, at }`: **(a)** `terminal --link` pointed this session to a named lane; **(b)** the session received a cross-session message signed by the owner — and since round 2 only a **COMPLETE system tag at the START of the message** counts (`<cross-session-message from="…" from-name="…" from-mode="…">`, format verified in a real transcript on 09-21): before, the `from-name` was pulled with a regex from any point of any user text, so pasting the tag into a quote accredited the session FOR EVER. The `from-name` is the terminal's NAME, and that is why (b) only works if the owner has a registered named terminal — **known limit**, (a) and (c) remain; **(c)** the session sent the `READY ·` ack of its brief, and since round 2 that ack has to have **ARRIVED** (without `is_error`) and gone **TO THE ORCHESTRATOR**: before, any `READY ·` to anybody counted, even one that came back with an error, and that turned a personal terminal into an accredited lane for ever. **Without accreditation, NEITHER of the two reasons gives an opinion** (changed in round 2: `stopped_unsent` neither). **ONCE PER SILENT STREAK**, not once per STOPPED (changed on 09-21): the mark is `L.sessions[sid].silent_streak = { since, warned, reason, mark }`; the streak breaks **only** when a valid status message goes out, and a **NEW brief** rearms it (`resetLaneWithNewBrief`). Repeated `Stop` calls and the hook's feedback rearm nothing. Before, it was one mark per STOPPED, and four STOPPED in a row gave four warnings: a warning that repeats stops being read, which is how the zeros and the waits got lost. **HONEST ABSTENTION, BUT ONLY ABOUT ABSENCE** (round 2, 09-21): if the transcript is unreadable or the budget ran out, the result is *I don't know* and nothing is warned. And if the tail read **does not reach the start of the turn**, the read is **PARTIAL**: POSITIVE evidence —a status delivered to the orchestrator that IS visible in the tail— counts and **breaks the streak**; absence is not claimed and generates no warning. Before, that read returned *I don't know* as a whole, and that had an ugly silent consequence: an already-warned streak was not cleared even if the lane had sent its `DONE ·`, `warned` stayed at `true`, and **the next silence went without a warning**. **THE BUDGET**: a **margin** of 1500 ms is demanded before STARTING to read the 4 MB (opening and parsing is not free, and starting with milliseconds in hand goes past the hard cap of 9 s), the deadline is checked in **all** the passes after parsing, and if `contextFromTranscript` already read that same file **whole** in this same event, that read is **reused** instead of opening it again. Without `transcript_path`, with a `session_id` that is not a string, with a session that is not in `L.sessions`, or in the **owner session**, it stays quiet without giving an opinion |
| `unaccredited_delegation` | a **subagent of the owner session** writes product code and either **no launch with a brief is on record** from this terminal, or its launch **did not carry an accredited brief**, or the file (or **any** of a command's targets) falls **outside** the exclusive list of its brief | the rule "the orchestrator does NOT edit code" (09-15) could be dodged by launching a subagent to "fix it while at it": after T3 those edits no longer accuse it, but nobody said whether that subagent **had a brief** or whether it edited **within its own** (issue #10) | **THE LINK IS BORN IN THE `PreToolUse` OF `Agent`/`Task`** of the owner session and is noted in `L.launches`: `tool_use_id` (and if the payload does not carry it, the **prompt's fingerprint** — the link says which of the two was used), the **brief** and its **already parsed exclusive list**. The brief is read HERE, **once**, and on the following writes only a `stat` is looked at: the event's budget is 9 s for everything. **THE BRIEF IS ACCREDITED UNAMBIGUOUSLY:** a path in the prompt that (a) **exists on disk** and (b) is in **`L.dispatches`** —the briefs the owner wrote in this program—. **Any old `.md` that exists does NOT count**, and "some recent brief contains that file" **neither** (Codex `gpt-6-astra`, 09-21): a brief authorizes the AGENT it was given to. Without a registered brief the launch is not *forbidden*: it is **unaccredited**. **THE LIST'S GRAMMAR** (`## Your files (EXCLUSIVE)`): bullet lines, and from each one the FIRST path **between backticks**; `(new)` after it is dropped, simple globs (`*`, `**`) count, and a bullet without backticks —prose, `**bold**`— or a text between backticks that does not look like a path (has spaces, or has no slash, no extension and no wildcard) **is dropped, not guessed**. The root comes from `Folder:` in `## Where you work`. **THE `PostToolUse` OF `Agent` CONFIRMS** the link: it takes the `agentId` from the response (`outputOf` was widened to read responses as a LIST of blocks, without changing what it returns for the others) and puts it on **ITS** launch, by `tool_use_id` or by fingerprint — **never "the last one"**, because two `Agent` calls in the same message are launched at once and their responses can arrive in reverse order. **And THE FINGERPRINT IS A FALLBACK, NOT A SECOND CHANCE** (Codex `gpt-5.6-sol`, round 4, MEDIUM, fixed in T10): if the `PostToolUse` **carries** a `tool_use_id` and it matches no link, it no longer falls back to the fingerprint —two `Agent` calls with the same prompt have the same fingerprint and the `agentId` would have been glued to the other's frozen scope—: `launch_without_correlation` comes out and nobody is accredited. **And WHEN THE LAUNCH IS CLOSED AS `failed`** (its `PostToolUse` arrived without `agentId`) **the `pending_edits` queue is re-judged right then**: otherwise a write deferred by that launch stayed **mute for ever** when no `SubagentStop` arrived later. The ones that still depend on another open link stay in the queue; the others come out with their verdict. And when the cap of 40 pending is overflowed, nothing is dropped silently any more: every drop emits `pending_edit_discarded` with the agent and its files. **And THAT PATH ALREADY RUNS** (09-21): the `Agent\|Task` matcher was missing in the real `~/.claude/settings.json`'s `PostToolUse` —a HIGH finding from Codex `gpt-5.6-sol`— and **the owner installed it** that same day; `test-structure` now demands that wire by matcher AND by command, so removing it shows up in red. As a SAFETY NET —a `PostToolUse` that arrives without `agentId`, or a machine whose settings lack the matcher— the **`SubagentStop`** (which IS hooked, with no matcher) also closes the link: it adopts the orphan launch by matching the subagent's **`.meta.json` description** (the same one `closeSubagentWait` uses), and if there is no description, only when there is **a single** orphan; with several it says `ambiguous_link` and does not guess. Along that path the link arrives **at the end** of the subagent, so its writes go through `pending_identity` and are reconciled all at once — it warns late, but it warns, and does not accuse falsely. **And `pending_identity` EXPIRES** (round 3): it is only granted by a launch without identity, **not closed as `failed`**, and **less than 5 minutes** old (`PENDING_IDENTITY_MS`). Without expiry, one single orphan launch —one whose `PostToolUse` came without `agentId`— silenced `no_launch` for the whole program. **FOUR OUTCOMES on every write:** `accredited` (only T3's `subagent_edit`, with `lane` and `brief` added, **zero** alerts) · `out_of_scope` (alert, with the agent, its brief and the file) · `pending_identity` (**nobody is accused**: the write arrived before the `PostToolUse`; it is kept in `L.pending_edits` and reconciled when the `agentId` arrives —by `PostToolUse`, or by `SubagentStop`, which carries `agent_id`—, emitting whatever applies **once**) · "no launch possible" (`no_launch`; alert: "an agent edits X and no launch with a brief is on record from this terminal"). **UNDETERMINED SCOPE** (`git apply`, `patch`, `rm -rf`) stays undetermined: it is neither accredited nor accused for scope, it is noted. **THE SCOPE IS FROZEN** (the owner's decision in the chat, 09-21, on Codex `gpt-5.6-sol`'s HIGH finding 2): the exclusive list is parsed ONCE, at launch, and is **never read again** to decide. If the brief changes on disk it is recorded **only once** —`recordEvent('brief_modified')`, detected by `stat` (mtime + size) and CONFIRMED with the content `hash`, so a `touch` does not count— and **the following writes keep being judged against the old list**: a path that only appears in the new version comes out `out_of_scope`. **WHY:** a `.md` is not product code, so no gate looks at who edits a brief; with re-reading, the subagent itself could open its own, add paths to itself and edit them afterward with the gate agreeing — it widened its own permission, which is exactly what this gate exists to prevent. **WIDENING THE SCOPE DEMANDS A NEW DISPATCH:** the orchestrator rewrites the brief from the owner session (that puts it in `L.dispatches`) and **launches the agent again**. **NO DOUBLE ACCUSATION WITH T3:** one event produces at most one `subagent_edit` and **one** alert from this gate. **ABSENCE OF A LINK DOES NOT PROVE ABSENCE OF AUTHORIZATION** (Astra): that is why `pending_identity` exists and why this **never denies**, not even with `brakes` at `block`. **GRANDCHILDREN: NEITHER REGISTERED NOR ACCUSED** (round 3 + the owner's nuance, 09-21). The `session_id` does not tell the actor apart —a subagent inherits its mother's—, so registering launches, confirming them and **noting dispatches** additionally require `!subagentSignal`: without that, a child wrote a brief, put it in `L.dispatches` and accredited the grandchild that launched with it. **But legitimate grandchildren exist** —a haiku `disposable-reader`, a sonnet for fixtures or documentation: the briefs themselves order them—, and they arrive with an `agent_id` that matches no link. That is why, when an UNKNOWN agent writes there are **two more outcomes**: if the file falls **inside the frozen scope of a LIVE link** (confirmed, not `failed`, and with no `SubagentStop` that closed it), it is `probably_inherited` → **event with the candidate link, NO alert**; if it falls inside **two** live links, `ambiguously_inherited` → event, no alert; and if it falls in none, the usual "no launch possible" alert. **This is NOT "some recent brief contains the file"** (Astra rejected that, and rightly: a brief authorizes the AGENT it was given to): only links of agents that were **launched and are alive** count, never loose briefs on disk. Leads in other sessions and subagents without `agent_id`: out (see the block **"What of that issue is still PENDING, said without adornments"**, further down in this same file) |
| `repeated_red` | the **same suite** comes out again with **exactly the same failures**, for the **same actor** (session + `agent_id`) | three lanes of this skill —and an orchestrator from another project— chased for **half an hour each** on 09-21 a red test that belonged to the **ENVIRONMENT**: CRLF in a newborn worktree, failures that were already on `master`, or the suite testing the **installed** copy of the script instead of the worktree's (the owner: "don't let anyone chase a red that isn't theirs for half an hour") | `PostToolUse Bash\|PowerShell`. **There is NO universal regex for "this is a test run"**: each suite declares its extractor in the `suites` list of `orchestrator.config.json` (`name`, `command`, `failure` with the identifier in group 1, `summary` with how many passed and how many failed, `end` for the runner that gives no numbers, `output_command`, `active`), and **without a matching entry the gate gives no opinion**. The command is looked at WITHOUT the text that is only written (`withoutTextThatIsOnlyWritten`, from T6): a heredoc that mentions the suite is not a run. **The fingerprint** of the failure set normalizes ANSI, line endings and the known volatiles (`orch-…-XXXX` folders, timestamps, durations) but **does NOT erase all the numbers** —they tell parametrized tests, error codes and expected values apart (Codex `gpt-6-astra`, 09-21)—. **EPISODE:** the **second** run with an identical fingerprint gives **ONE** warning; the third identical one **does not repeat it** (a warning that repeats stops being read, as happened with `zero_unchecked`); the episode closes when the fingerprint changes or when a run **that is on record as finished** comes out with no failures. **An `Edit`/`Write` between runs is not demanded**: that would leave out the orchestrator's legitimate verifications and the changes made through the shell, so the edits go as CONTEXT in `data.recent_edits`, not as a condition. **By actor, not by session:** a subagent shares `session_id` with its mother, so the key is `<session>\|<agent_id>\|<suite>` and a grandchild inherits nobody's counter. The warning carries the two questions nobody asked themselves —**which copy was run?** (it reads `ORQ_HOOK` from the command itself, and if it is not there it warns that the installed copy may have been tested) and **is it just as red WITHOUT your change, in an isolated copy?**— and, if there is a saved baseline, the comparison by sets: **persistent / new / resolved**. **Persistent is NOT resolved** and it is **never declared green**: that a failure existed before proves the preexistence of THAT symptom, not that you did not add another. A baseline of another `sha` or another target, an unreadable `HEAD`, **or a target that is missing on either side** → **"comparison unknown"**, never "no new failures"; and if the baseline was taken with the tree **dirty**, the warning calls it out, because its failures are not the plain commit's. **What does NOT count as a failure:** a `0 failed`, an `Error` inside a log, a **truncated** output and a run with **zero tests**. **THE GOOD GUARANTEE IS TO ADD UP** (Codex `gpt-5.6-sol` round 1, three findings of the same kind): the output is parsed **trimmed to the last 256 KB**, so a failure printed BEFORE the cut with the summary at the end gave a mutilated list that passed for complete —and with that a red episode got closed or a baseline with no failures got saved—; and a `STRUCTURE: 0 OK, 0 FAILS` (zero tests discovered) erased the earlier red as if it were a green. That is why `summary` carries the two numbers: if the failures the suite declares **do not match** the extracted ones, or if `passed + failed` is **zero**, the run is noted as **incomplete** and the gate stays quiet. A suite that gives no numbers (the `adversarial` one) keeps `end`, the poor guarantee, and then a cut of its own is enough to declare it incomplete. **Known limit (background):** the `PostToolUse` of a `run_in_background` arrives **without the output** of the suite (`closeFinishedBackgrounds` only receives `background_tasks`, with the command and its status, never the text), so the launch is **ignored on purpose** —an empty output is not "zero failures"— and the gate sees that run only when someone **shows** its output file with a command that matches `output_command` (`cat`/`tail`/`type`/`Get-Content`/`more` on `…hook.out` and the like). Budget: the **last 256 KB** are parsed and `END` is checked on every pass |
| `git_permit` | a lane runs `git commit` / `git push` / `gh pr create` without a valid `git`-scope permit, or the orchestrator runs `git merge` / `gh pr merge` without a valid `merge`-scope permit — **and also when the permit IS valid but the command uses `--force`, deletes a branch, points at an integration branch (`main`, `master`, `develop` and whichever `integration_branches` lists in `orchestrator.config.json`), or the `merge`/`gh pr merge` does not come from the orchestrator (a lane never merges, with or without a `merge` permit)** | that the discipline "commit/push only with the owner's permission; the merge is always the orchestrator's, and only with the owner's registered permission" does not stay as text nobody looks at: it warns even if there is a permit, because the permit never authorizes force, deletion, an integration branch or a lane's merge | looks at the `git`/`gh` command of `Bash`/`PowerShell` against the `git_permit` state of the ledger (scope, who granted it with `allow-git`, when, whether it is still alive) and against `integration_branches`; **phase 1: it only warns, it never denies** |
| `rule_without_doc` | you close the turn (`Stop`) and a rule the owner registered with `rule` still does not appear in the document they themselves pointed to | **new (09-22)** — two of the owner's rules ("less is more", "the permit is given per repo and per orchestration") only lived in the orchestrator's memory | re-reads the document in the `worktree_root` that was saved when the rule was registered and looks for the rule's LITERAL TEXT, with whitespace collapsed; if it is not there, it warns ONCE per rule and per session |
| `own_reading` | the owner IN PERSON (not their subagents nor the lanes) adds up in one turn (`prompt_id`) 400 lines read or more with `Read` (`tool_response.file.numLines`) or with `cat`/`head`/`tail`/`sed -n`/`Get-Content`/`ReadAllText` through the console (lines of its output) | **new (09-22)** — 230k tokens spent by an orchestrator that itself read memories, issues, DECISIONS and briefs | adds up per turn in `L.own_reading`; threshold `own_reading_lines` of `orchestrator.config.json` (400, measured); warns ONCE per turn suggesting the `disposable-reader`; `Grep`/`Glob`, subagents and lanes go through the cheap door |
| `shared_stash` | `PreToolUse` of `Bash`/`PowerShell`: the command contains `git stash …` (push, save, pop, apply, drop, clear, list or bare; also with `-C <other repo>`) and the repository it operates on has **more than one live worktree** | **new (T55, issue #16 point 1, 09-28)** — `refs/stash` is shared between worktrees: whatever a lane saves with `git stash` can be seen, applied or deleted by any other lane | something is done only if the command names `git` and `stash`; the worktree count **launches no process**: it reads `<git-common-dir>/worktrees/<n>/gitdir` and does not count the entries whose directory no longer exists. **OBSERVES, never blocks**; with a single worktree, silence. Warning per session and repo (slot `shared_stash#<repo>` + a 10-minute dedup); a subagent always hears it. It suggests a temporary commit on your branch (`git commit -m wip`) or `git worktree` |
| `v_without_tool` | `Stop` of the **owner session** (the orchestrator; a `Stop` of a lane, of a subagent or without `session_id` does not trigger it): the **final message** of the last turn —the LAST assistant record; if it ends in a call with no text, it does not inherit the `[V` of an earlier message— carries a `[V` mark —`[V]`, `[V, …]` or `[V source…]`, outside a code block; `[V2]`, `[VERIFIED]` or `[VALID]` do not count: after the V there cannot come a letter of any alphabet or a number— and **in that turn there was NO call at all** to `Bash`, `PowerShell`, `Read`, `Grep`, `Glob`, `Agent` or `Monitor`. With at least one, it stays quiet (it does not judge whether they opened the right thing: that cannot be known from the transcript) | **new (T56, issue #16 point 5, rule Rbbbc05, 10-08)** — the orchestrator presented as "verified by me" things that only the other orchestrator had said through a cross-session message (Codex's 09-28 evaluation §4). Law 2 says **[V] = I opened it myself, [D] = someone else said it**; the gate cuts off the crudest case: marking [V] without having opened anything | on `Stop`. **The turn** is whatever lies between the last INPUT message —an owner's prompt, a `<cross-session-message …>` or a subagent report (`<task-notification>`; unlike `silent_stop`, here it DOES open a turn: it is the "someone else said it" case)— and this `Stop`; a `tool_result` and the hook's own feedback do not open a turn, so a repeated `Stop` inside the same turn is the same turn. **The warning** says that what is marked [V] is [D] —someone else said it— until they open it, and **names the origin** when the turn began with a cross-session message ("the turn began with a message from `<from-name>` (from `<from>`)"; the `from` only comes out if it differs from the name) or with a subagent report. **Once per turn and session** (slot `v_without_tool`, identity = session + input record, plus `raiseAlert`'s 10-min window); it raises `counters.by_gate.v_without_tool`, which `status` shows. **THE TAIL:** first the read that the same event already did (`tailAlreadyRead`, which only exists if the transcript fits in 256 KB); if not, ONE bounded read of the tail —256 KB and, only if it does not reach the start of the turn, up to 4 MB—, never the whole file, walked BACKWARDS and stopping as soon as the answer is known (a tool, or a final message without `[V`), with the deadline checked in the loop and the `TAIL_MARGIN_MS` margin (1500 ms) demanded before EACH read. **The orchestrator's decision (10-08), on the T56 lane lead's proposal:** the brief asked to reuse only `tailAlreadyRead`, but with `tailAlreadyRead` only up to 256 KB the gate would not fire in real life (a real session weighs much more); that is why it reads the bounded tail itself, 256 KB and then 4 MB (the `readLaneInItsTurn` pattern), never the whole file, with margin and trace. An unreadable JSON line before the turn is delimited counts as an incomplete tail. The turn's identity is the BYTE POSITION of its input record in the file —never its content (two equal entries are two turns) nor its `uuid`, which can repeat; the `uuid` goes in `data` only as a diagnostic—. What comes from the transcript and is shown (`from`, `from-name`, `task-id`, `uuid`) is bounded to 80 characters and stripped of control characters. If this session has already seen the identity, not even the alert is created: after the 10 min of `raiseAlert`'s window the same turn neither repeats nor counts again in `status` (it is counted as skipped as repeated). An owner's prompt that QUOTES `<task-notification>` or `[SYSTEM NOTIFICATION` anywhere other than the start of the message opens a turn of its own (it does not join the previous one). **If not even 4 MB reach the start of the turn, the gate does NOT give an opinion and traces it** (`ORCH_CONTROL_DEBUG=1` → `v_without_tool: incomplete turn`). **Limits said on purpose:** it only looks at the tool's name, not at what it opened; a `[V` mark inside an inline quote (between backticks) counts; `PowerShell` DOES count as a tool that opens something (the orchestrator's decision, 10-08: it is the owner's main shell). **OBSERVES, never blocks** |
| `own_reading` — **console output** (T42 extension) | **any** terminal of the program (owner or lane; never a subagent's events: `warningSid` → the three signals of `isFromSubagent`) adds up in one turn (`prompt_id`) `console_output_chars` characters or more of `tool_response` from `Bash`/`PowerShell` (stdout + stderr as they arrive, without separators or the command; with neither of the two, the first text field among `output`/`content`/`result`, never added together: an alias does not count double; a list of blocks adds the `text` (or `content`) of each one, the same shape `outputOf` has accepted since T4; an absent or non-text response = 0; the unit is `String.length`'s, the same as T40's and T42's measurements, so an emoji counts 2) | **new (09-24, rule R6a465f)** — T40 measured the console to be 20.9% (skill) and 32.5% (CLIENT-A) of what the orchestrator grows by up to its first lane; with 8,000 they would cross in 13 of 186 turns and 21 of 340 (`.orquestador/medidas-T42/medida-T42-consola.txt` in the source repo, original Spanish names) | `PostToolUse`, right after `own_reading`; counts per terminal in `L.sessions[sid].console_output` (turn, characters, commands, the largest one); threshold `console_output_chars` of `orchestrator.config.json` (8,000 ≈ 3,600 tokens at the 2.2 chars/token measured in T40; absent, 0, negative, decimal, text, boolean, `null`, object or list → 8,000). Text: "This turn N characters (≈T tokens) of console output have already entered your context (K commands; the largest: `<60 characters of the command>`, X characters). The long stuff is opened by a disposable-reader; to know whether it finished, EXIT to a file; to count, `grep -c`. Watch out: a blind `tail` hides the error at the start: ask for `grep -n` of the failure and its line." **Once per turn and per terminal** with T39's piece (identity = gate + session + turn, slot `console_output`): every later output in the same turn above the threshold is silenced and counted under "warnings skipped as repeated"; a new `prompt_id` warns again. `status`: "console output: N turns with a warning · M characters warned" (program total). **Limits:** without `prompt_id` it does not count; the output of a background command only counts when someone reads it through the console; one same long `cat` can trigger at once this warning (characters of the whole console) and T16's lines one (deliberate reads): they measure different things and are not discounted from each other; the shape of `PowerShell`'s `tool_response` is MEASURED, not assumed: in 436 real responses (`toolUseResult` of 8 transcripts, `.orquestador/T42-evidencia/ps-forma.out` in T42's worktree, source repo, original Spanish names) it is `{stdout, stderr, interrupted, isImage…}` or a bare string, the same as `Bash`; what could not be captured is a live PowerShell hook payload. It NEVER blocks |

**And a startup warning, through the same `spec_stale` gate:** when a program starts —on loading the skill or with `start`— in a repository that has no `specs-map.json`, or has a broken one, the hook says so ONCE per program: `NO SPECS MAP` or `BROKEN SPECS MAP: <reason>`, and reminds you that without a map that gate watches nothing. The second load of the same program does not repeat it; a new program looks again. `status` keeps showing it while it stays that way.

**And a warning (not a gate) in the `handoff` block of `SessionStart(compact)`** (T18, 09-22): contradictory handover about T<n>. It comes out once per delivered handover and adds up `handoffs.contradictory_handovers`; event `contradictory_handover` in the ledger.

### What the owner sees on screen, and what only the AI sees (09-16)

The owner's rule, said with the screen in front of them: **"all of that shouldn't show up on screen; I
don't need to see it."** Almost all of these warnings are ORDERS FOR THE AI (close the wait, record
the decision, re-read your brief), not news for a person.

| Channel | Who sees it | What it carries |
|---|---|---|
| `hookSpecificOutput.additionalContext` | **only the model** (and the `.log`) | **everything**: expired waits, rounds, specs, load, compactions, pending decisions |
| `systemMessage` | **the owner, on their screen** | **only four things**, the ones they have to type or decide: (1) "you loaded the skill but this folder is NOT a git repository" —and startup failing, which is the same case: they would believe they are watched when they are not—; (2) the **desynced airbag**: since T57 the skill does not write it, it warns with the why and the line to put in `settings.json`; (3) **"Orchestration RUNNING"**, ONE line on loading the skill; (4) the **brake** (`deny`) |

In the code: an alert shows on screen only if it carries `for_human: true`, and if it also carries
`human: '<one line>'`, that short line is what gets shown (the long text is for the model). Watch out
with `decision: "block"` + `reason` on `Stop`: that `reason` **also** shows on screen, so it is only
used if something is truly being blocked (phase 2), never just to warn. Today it is used nowhere.

**And a warning gets called out ONCE, from a single place.** An expired wait gets called out by
`checkWaits` with its "Decide: keep waiting, escalate or redo"; the `Stop` no longer adds its own
"EXPIRED wait: …" (on 09-16 **7 waits = 14 lines** came out in the same turn close). After that, it
only shows in `status`.

**A subagent's wait is closed by the subagent that finishes**, not by the last artifact touched: the
`SubagentStop` matches by the `description` of the `.meta.json` next to its `agent_transcript_path`.
If there is nothing to match, it closes the **oldest** open one and notes it in the event
(`blind: true`), because a subagent really did finish and leaving them all open guarantees the false
warning.

**And a subagent's compaction does not belong to its terminal.** Measured on 09-16: the payload of a
subagent's `SessionStart(compact)` arrives **without `agent_id`, without `agent_transcript_path` and
with the mother's `transcript_path`**, so the owner session ended up with `compactions: 2` without
having compacted once, and its `Stop` called out "You just compacted" to it. The proof is given by
the **disk**: compacting leaves a `{"type":"system","subtype":"compact_boundary"}` line at the end of
the transcript of whoever compacted. If the tail of the terminal's transcript does not carry it
recently and a subagent's of its own does, it is noted as the subagent's (`subagent_compactions`) and the
header that comes back is the subagent's. **If nothing can be read, no opinion is given**: it keeps
being counted against the terminal, which is the safe side.

### Repeated warnings: they only repeat if something changes (T39, 09-24)

A repetitive warning (stale overlap, PRs flown blind, "Orchestration RUNNING", a terminal above the
load ceiling, the same unchecked zero) **is not printed again in the same session while its identity
does not change**. The **identity** is the gate plus the data that define it, never the text: the
set of HEADs measured→current, "still no `gh`", the `program_id`, the full terminal, the zero's
command. The "already seen" lives **per session** in `L.sessions[sid].warnings_seen` (the pulse counts
as the owner's). It **comes out again** if a datum changes (another SHA), if the problem disappears
and reappears (relapse), and after compacting or `/clear` (the "already seen" goes away with the
memory; what comes out in the `PreCompact` itself does not count as seen). Without an identifiable
session —a subagent, a pulse with no owner— nothing is skipped. What is skipped **is counted**:
`status` shows `warnings skipped as repeated: N (session=n, …)`, so that a silence due to repetition
is not mistaken for a broken watcher (the sum per session equals the total). If the SAME owner
compacts and loads the skill again, "Orchestration RUNNING" comes out again. Measured over 30
simulated minutes: from 14 warnings to 5. **Accepted limits:** if writing the hook's output fails, the
warning stays as seen anyway (the hook discards write errors by design); and each session remembers at
most 200 warnings: past the cap, the oldest may come out again once. In `status`, each session is
named by its first 8 characters (two with the same prefix look alike). And the mutants that prove the
five controls are kept with the lane's receipt in `.orchestrator/` (outside git, the house's
evidence), not inside the suite.

### What this mechanism CANNOT do, and you have to know it

- **The hook does not generate time.** It only reacts to tool calls. Failure **2** can happen while no
  terminal is doing anything: that is why the 5-minute `Monitor` calling `pulse` is needed. **If
  there is no Monitor, declare `NO TIME-BASED WATCH` and run `pulse` at the start of every turn.**
- **It cannot prove that a sentence is true.** It detects that the receipt is missing; not that the
  quote backs up what the prose says.
- **In failure 5, if memory, the document and the hook all say the same false datum, no local
  mechanism can deduce the correct identity.** That is why the register is born EMPTY: only what the
  owner approves against GitHub's `node_id` counts, and absence produces `UNKNOWN`, not a guess.
- **`issues-con-duenno.js` still has a collaborator's handle wrong** (it says `<handle>`, which is
  Sharky). The owner said on 08-11 to leave it as it is, so **it has not been touched**. When someone
  wants to fix it, have it read this register instead of repeating handles. *(External hook, not part
  of this port; name kept as-is.)*

---

## The first real workday: how it is run and what is measured

No gate is switched on without data from a real workday. The owner decided on 2026-08-12 to measure
before building anything more. This is how it is done:

**Before**
1. A day when you are going to open **3 or more lanes** for real.
2. In the orchestrator terminal, **inside the repository** (not from your home folder `~`): `start`.
   If it answers *"there is no git repository here"*, you are in the wrong place.
3. Have it create the 5-minute `Monitor`.

**During:** do not change anything about how you work. **That is the experiment** — seeing whether it
gets it right with your normal way of working, not you adapting to it. The only thing: when a warning
goes off, judge on the spot whether it is a hit or a false positive.

**On closing:** `close`. It gives the tally per gate. The list of detections with their time is in
`orchestrator-state.log`, next to the ledger.

**What gets decided with that, gate by gate:**

| What was seen | What is done |
|---|---|
| It fired and **always** was right | candidate to be switched on |
| It fired and was wrong even **once** | it stays in OBSERVE and the pattern gets fixed |
| It never fired | **it says nothing**: there may have been no occasion. Another workday is needed |

**Only one** gets switched on, you live with it another workday, and then the next one. Recommendation
for which to start with: **`delivery_published`**, which does not read text —it looks at `git status`
and whether the SHA is published— and is the least capable of being wrong. The last one:
`receipt_missing`, which already has three failures.

---

## Pending: taking the manual discipline away from it

**Pending for `repeated_red` / `baseline` (T7, 09-21), said without adornments:**
- **Background.** A suite launched with `run_in_background` **does not deliver its output to the hook**: the launch's `PostToolUse` arrives empty and `closeFinishedBackgrounds` only receives `background_tasks` (command + status), never the text. It was checked and it was decided not to force it: the launch is ignored on purpose, and the run is seen when someone **shows** the output file with a command that matches that suite's `output_command`. What stays out: a background suite whose output nobody ends up looking at in this terminal.
- **Extractors for other runners.** Only the four suites of this skill are declared. The `generic-node-test` entry (`node --test` / `jest` / `vitest` / `pytest`) is **written and switched off** (`active: false`) on purpose: it is the trap the gate exists to not repeat, and turning it on without adjusting it to each project's runner would match `0 failed` and logs. Whoever wants it adjusts it and turns it on knowingly. Switched off does not mean untested: the suite **turns it on in a temporary config** over a real TAP output with two seeded failures and two decoys, and checks that it pulls out the two failures and none of the decoys.
- **The `adversarial` suite does not add up numbers.** Its closing line does not give them, so that suite keeps `end`. If someone adds a summary with counts to it, let it declare its `summary` here.
- **An episode is a coincidence, not a cause.** The gate says "this repeats identically", never "you did not cause this". The comparison against the baseline only proves the preexistence of THAT symptom.

Today the tool **depends on the human remembering** `start`, `wait`, `decide` and `close` — which is
exactly the failure it exists to cover for. Plan agreed with Codex on 2026-08-12, **waiting on the data
from workday 1** so as not to build on an imagined problem:

| Command | How it disappears | Cost |
|---|---|---|
| `start` | fires on **loading the skill** (`PreToolUse` on the `Skill` tool, filtered by its exact name). And with no startup, the first lane dispatch does not go out: never a *supposedly* watched orchestration | low |
| `wait` | the wait **is born from the thing being waited on**: a subagent, a background job, a PR. Deadline per type | low |
| `close` | **lazy close on abandonment**: the hook itself, when someone comes back to the repo, sees the last event was hours ago and closes it. *(Codex proposed a scheduled-task job (Windows Task Scheduler on the source machine; on macOS it would be launchd/cron); it was dropped: it installs a permanent piece on a machine already dragging 100+ processes, and if it gets disabled you believe you are watched when you are not. An abandoned program only bothers anyone when someone comes back to the repo — and by then the hook is already running.)* | low |
| `decide` | `Stop` asks the **agent** for the decision `continue / escalate / redo` and the hook saves it. The human chooses if needed, but does not type commands | medium |

**Linking each subagent to its lane (issue #10 of the repo) — DONE for the most part (lane T4,
09-21).** Since 09-21 the `orchestrator_builds` gate no longer accuses the orchestrator of what a
subagent of its own edits (T3); what was missing was **knowing whether that subagent had a brief**. That is
now the `unaccredited_delegation` gate: the link is born in the `PreToolUse` of `Agent` (brief +
exclusive list parsed ONCE), is confirmed in the `PostToolUse` with the `agentId`, and `SubagentStop`
reconciles whatever was left pending. See its row in both tables.

**What of that issue is still PENDING, said without adornments:**
- **Grandchildren are seen by PROBABLE INHERITANCE, they are not tracked in a chain** (decided
  09-21). A grandchild —a subagent launched by another subagent— has no link of its own: the link is
  only born on launches by the **owner session**, and whoever launches while being a subagent leaves
  only `recordEvent('subagent_launch')`. When that grandchild writes, it is checked whether the file
  falls inside the scope of a **live** link: if it falls in one, `probably_inherited`; if in two,
  `ambiguously_inherited`; if in none, the alert. **What is NOT done is rebuilding the
  parent→child→grandchild chain** (`parentAgentId` / `spawnDepth` exist in the `.meta.json`, see
  above), nor checking that the parent really did launch that grandchild. With that, two grandchildren
  of two different parents whose scopes overlap come out `ambiguously_inherited` even if each one is
  within its own. It is left like this on purpose: **when a real case asks for it**, the chain gets
  modeled.
- **Leads in OTHER sessions** (lanes in named terminals, with their own `session_id`) neither:
  `checkBuilding` filters by owner session before looking at anything, so their subagents are neither
  looked at nor accused.
- **A subagent without `agent_id`** —detected only by `agent_transcript_path` or by a
  `transcript_path` under `…/subagents/`— cannot be correlated or contradicted: it is noted
  (`delegation_no_identity`) and not accused.
- **REAL CAPTURES OF `Agent`:** the `PreToolUse`/`PostToolUse` payload on the `Agent` tool has
  **never been captured** with `ORCH_CAPTURE`. The fixtures
  `tests/fixtures/agent-pretooluse-synthetic.json` and `agent-posttooluse-synthetic.json` are
  SYNTHETIC and say so in their own text. The only thing really seen (09-21) is the TEXT of the async
  response ("Async agent launched successfully… agentId: …"). **What is not validated:** that
  `tool_use_id` really arrives in that event (if it does not, correlation falls to the prompt's
  fingerprint, and the link says so), the **synchronous** response format, and the real temporal order
  Pre / write / Post. To close it, `ORCH_CAPTURE` is needed in an owner terminal that launches an
  `Agent`.
- **THE MATCHER THAT WAS MISSING — CLOSED on 09-21.** `~/.claude/settings.json` did not wire
  `PostToolUse` to `Agent|Task`, so the link was only closed at `SubagentStop` —when the subagent
  finished— and the gate warned LATE. **The owner installed it**: today there are twelve wirings (the
  twelve that `/orq-install` writes) and one of them is `PostToolUse` with matcher `Agent|Task`. That
  file is "NEVER YOURS" for a lane, and that is why what a lane CAN do is leave the required wire in
  the suite: `test-structure` checks that that matcher exists **and** that its command points to the
  skill's script, so removing it shows up in red instead of leaving `confirmLaunch` referenced but
  unreachable. `SubagentStop` stays as a **safety net**: it closes the link when the `PostToolUse`
  arrives without `agentId` and on machines whose settings lack the matcher.
- **AN AGENT COULD WIDEN ITS OWN LIST (no longer).** A `.md` is not product code, so no gate looks
  when someone edits a brief. **CLOSED on 09-21 by the owner's decision in the chat: the scope
  gets FROZEN.** If the subagent edits its own brief and adds paths to itself, the hook marks it once
  (`brief_modified`) and **keeps judging against the old list**, so the added path comes out
  `out_of_scope`. Widening demands a NEW dispatch from the orchestrator (rewriting the brief from the
  owner session, which puts it in `L.dispatches`, and launching again). What REMAINS open from this:
  nobody prevents the edit of the `.md` itself — it just stops being useful for widening one's
  permission. (Codex `gpt-5.6-sol`, HIGH, round 2 of T4.)
- **PATHS WITH SPACES IN THE EXCLUSIVE LIST.** The BRIEF's path with spaces is already accredited
  (the paths in `L.dispatches` are matched directly against the prompt's text), but a pattern in the
  `## Your files (EXCLUSIVE)` section that carries spaces is still dropped: between backticks, a text
  with spaces is almost always prose or a command, and relaxing that lets false positives in. A lane
  that works in a folder with spaces will notice.

**Pending for `git_permit` (T5, 09-22):**
- **Phase 2: from warning to cutting.** Today `git_permit` is on OBSERVE like everything else: a
  commit, push or PR without a valid permit of its scope, or a merge that does not come from the
  orchestrator, only gets a warning. Moving to `GATE` demands, as with any other gate, a real workday
  without a single false positive.
- **The guarantee's nuance, said without adornments:** until phase 2, that the merge is only the
  orchestrator's is a WARNING, not a guarantee. An agent with command-line access could simulate the
  hook event that grants the permit. Today's real defense is not a wall: it is the trail — the log and
  `status` — not a technical impossibility.
- **And the underlying limit, which more checks do not cover up** (Codex `gpt-5.6-sol`, T5 security
  round, CRITICAL): the human order and the permit live in the SAME `orchestrator-state.json` that any
  agent can write. An agent can insert by hand a well-formed entry in `human_orders` —or straight into
  `git_permits`— and it will be indistinguishable from a genuine one, log line included. **This holds
  for all of this skill's gates, not just this one**: the ledger is not signed nor protected by any
  other identity. Really closing it demands that the proof that the owner typed something live
  OUTSIDE what the agent can write (another process, another identity, or a signature whose key the
  agent cannot read); signing it with a key stored in the repo or the environment fixes nothing. Until
  that exists, what there is is discipline and trail, and it is said here so nobody mistakes it for
  security.
- **Two more things that were checked and left as they are**, knowingly: (1) the permit denies
  nothing in phase 1, so a determined agent does not even need to grant it to itself — it commits and
  that is it, and the only thing that happens is that the warning fires; (2) if the ledger lock is busy,
  `--revoke` fails **out loud** and the previous permit stays valid: revocation is immediate against a
  slip, not against someone who holds the lock on purpose.
- **Lanes already running do not find out by themselves about a new `git` grant**: the orchestrator
  tells them by message or in the next brief. The `merge` one is not communicated to them: only the
  orchestrator uses it. **Revocation**, on the other hand, does take effect immediately in the gate,
  even if nobody sends any message.

**The underlying idea, from Codex:** separate the **program** (it belongs to the repository, every
lane sees it) from **ownership** (it belongs to the terminal that loaded the skill, and only it can
start it, renew it, or close it cleanly).

---

## What will BLOCK in phase 2 — and how it gets turned on

Turning it on = editing the file itself, right at the top:

1. `GLOBAL_MODE = 'GATE'`
2. In the `GATES` table, move **ONE** gate from `'OBSERVE'` to `'GATE'`.

**One at a time. Never all at once.** A gate only gets turned on when the ledger of at least one real
workday shows it detected correctly and **with not a single false positive.** The data to decide this
is in `orchestrator-state.log` (one line per detection) and in `status`, which gives the tally per
gate.

*"One at a time" is literal:* each alert blocks only if **its own** gate is turned on. Until
2026-08-11 that was not the case — it was enough for **any** gate to be in `GATE` for **any** alert to
block, so turning one on turned them all on. Codex caught it.

**A gate can only cut where it is wired.** Three of the eight live in places where the action has
**already happened** by the time the hook finds out, so no matter how much they get turned on they
will never cut anything: they will only warn louder. This is said here because promising an
impossible cut is worse than not promising it. *(Codex flagged this on 2026-08-11: the previous
version of this table promised three cuts the wiring does not allow.)*

| Gate | Where it lives | What it will do once turned on | What needs to be seen first |
|---|---|---|---|
| `third_round` | `PreToolUse` | cuts **the round that goes past the limit** (today it already warns on the 3rd: once turned on, the 3rd is the one that gets cut, not the 4th) | that the counted rounds are real rounds; it was already fixed once for counting bursts |
| `delivery_published` | `PreToolUse` (tasks) and `PostToolUse` (documents) | cuts `completed` with a dirty tree or an unpublished SHA. **On an already-written document it only warns** | zero warnings on deliveries that were actually fine; watch out with remote-less repos |
| `task_identity` | `PreToolUse` | cuts the crossed task write — **it does arrive in time** | that it does not fire on tasks that mention another lane in passing |
| `receipt_missing` | `PreToolUse` and `PostToolUse` | cuts the claim in tasks and briefs; on already-written documents, it only warns | **the most false-positive-prone: it has three on record.** The one that needs the most workdays |
| `zero_unchecked` | `PostToolUse` | **CANNOT cut**: the search already ran by the time the hook sees it. It only warns | — |
| `person_identity` | `PreToolUse` and `PostToolUse` | cuts assigning something to an `UNKNOWN` person in tasks and briefs | useless until the identity register has approved entries |
| `overlap_stale` | `pulse` and `Stop` | **CANNOT cut an integration**: nobody asks it before integrating. It warns on the pulse and on closing | that `integrate` is actually being called — and, since T55, with `--measure` (git measures it and saves `method: 'measured'`); `method: 'declared'` is the overlap typed in by hand and `status` calls it out as "DECLARED by hand, not measured". **Limits of `--measure` (T55):** (1) `overlap_stale` only compares the HEAD of each measured worktree, so a lane with an uncommitted tree (the normal state of a lane without git permission) can change files without the measurement going stale: that is why `dirty: [lanes]` is saved and the output and `status` say "measured with a dirty tree in T<n>: re-measure before integrating" (law 1: the orchestrator re-measures right before integrating); (2) file names containing a newline are not tested because NTFS does not allow them — they are read with `-z`, but that case has no test |
| `wait_expired` | `pulse` | **CANNOT block**: it belongs to the clock, not to the hook | — |
| `pr_state` | `pulse` | **CANNOT block**: it belongs to the clock, not to the hook. A merge has already happened by the time it is seen | — |
| `orchestrator_builds` | `PreToolUse` (of `Write`/`Edit` **and of `Bash`/`PowerShell` that write**) | **IT ALREADY CUTS**, and not because of phase 2: through its own BRAKE, `brakes: { "orchestrator_builds": "block" }` in `orchestrator.config.json` (default `"warn"`, so it does not break the terminal of anyone who did not ask for this; in the skill's own repo it is left at `"block"`). It returns `permissionDecision: "deny"` with text saying what to do instead | **There is no longer a size exception**: the old one for "1–3 obvious lines" is GONE — it was the door through which everything slipped in, because any edit can be split into three-line chunks (on 09-15, **163 warnings** to the owner were measured, and it kept editing). The owner's rule is that the orchestrator does NOT edit code: if a lane fails, it gets dispatched again (another brief or another lane) **without asking the owner**; it only touches code, or launches an agent at its own tier, when **the owner ORDERS it in the chat**, and that order gets recorded with `allow-edit --file <path> --order-from-owner "<hh:mm and their words>"` (valid 30 min, only for that file, and the `deny` cites the permissions currently in effect). Docs, briefs and receipts (`*.md`) are not code; tests and scripts are. A change via `sed -i`, a heredoc, `node -e` or `Set-Content` is a change all the same and falls under the same brake. **And only the owner IN PERSON:** measured on 2026-09-16, a subagent's events carry `agent_id` and the main loop's do not, so a lane launched as a subagent —which shares `session_id` with it— **does not receive the `deny`**; without that distinction, setting the brake to `block` would have frozen every lane. **What gets looked at is the COMMAND, not the text the command writes** (T10, 09-17): before deciding, the quoted arguments of `printf`/`echo` and the **body of heredocs** get blanked out, because on 09-17 at 19:05 a `printf '…' >> <scratchpad>/HANDOFF.md` got denied whose TEXT mentioned "rm -rf" and "git clean", and on 09-16 a lane got flagged twice for creating a temporary checker via heredoc at an absolute path OUTSIDE the repo. Only that gets blanked: `bash -c "rm -rf src"` really does run a delete and stays denied, and a quoted destination (`sed -i 's/a/b/' "scripts/h.js"`) still gets read in full. **ONE SINGLE YARDSTICK FOR THE CUT AND FOR THE WARNING (T3, 09-21):** until 09-21 the deny excluded the subagent by looking ONLY at `agent_id`, while the warning did not exclude it at all; now both ask the same thing, `isFromSubagent` with its **three** signals (`agent_id`, `agent_transcript_path`, `transcript_path` under `…/subagents/`), so a subagent that arrives with only one of the other two does not receive a deny either. And in the four branches (`Write`/`Edit` with and without permit; command with a known destination; command with an undetermined scope) **a subagent event no longer generates an `orchestrator_builds` alert**: it generates `recordEvent('subagent_edit', …)`, which neither accuses nor counts. The owner IN PERSON keeps receiving their warning and their deny just as before, and within one same session a subagent event followed by one of theirs alerts on the second. With `ORCH_CONTROL_OFF=1` there is no brake |
| `spec_stale` | `PostToolUse` and `Stop` | **CANNOT cut the edit**: by the time the hook sees it, it has already happened. It only warns. **The real cut already exists and does not depend on the phase: `validate` rejects the receipt** (exit code 1) if the diff touches mapped code without its spec | that each repo's map is well made: a glob that is too wide requires specs for everything and turns into noise; one too narrow requires nothing and looks like it works |
| `terminal_load` | `PreToolUse`, `PostToolUse` and `Stop` | **It already arrives in time to cut the brief's `Write`**: since 2026-09-16 the load check runs on the `PreToolUse` of `Write`/`Edit` over a dispatch, the same as the build check, and no longer behind the write the way it used to (it was Codex `gpt-6-astra`'s MEDIUM finding in its final r3 round on 09-15: `:2485` watched building and `:2528` watched load). The `PostToolUse` call is kept for dispatches that arrive some other way; `raiseAlert`'s deduplication (10 min, same fingerprint) keeps it from being called out twice. Phase 1 behavior does not change: it stays on OBSERVE | that reading the context is reliable over a real workday: one extra `?` turns a full terminal into "don't know", and one missing `?` turns it into free. Until a whole workday goes by with no unexpected `?`, it stays untouched |
| `own_load` | `Stop` | **Never gets turned on**: by the owner's signed decision ("WARN yes; ORDER no", the "two thresholds" spec, 2026-09-09) this warning does not block; the terminal obeys because its brief orders it to, and the airbag (`autoCompactWindow`) prevents the crash if it does not obey | nothing: it stays on OBSERVE by design, not for lack of trust |
| `lane_handoff` | Owner's `Stop` and `pulse` | **Does not get turned on**: it is a reminder to the orchestrator that a lane **compacted and keeps working in its own terminal, with its handover already read** *(owner's rule, 2026-09-15: nobody closes terminals)*. There is nothing to launch and nobody to replace; the only thing the warning asks is that the orchestrator check **how many times** that lane has compacted, because **on the 3rd over the same brief it writes it a NEW, complete BRIEF and gives it to that SAME terminal** | nothing: OBSERVE by design |
| `silent_stop` | `Stop` | **It does not block: the turn has already closed; what it does is get the lane to send it in the next turn.** There is nothing to cut — by the time the hook sees the STOPPED (or the silence), the turn is already written; the only useful thing is to tell the lane it has not got out of there yet. It holds equally for both reasons | nothing to watch before turning it on, because it does not get turned on: OBSERVE by design. What does need looking at on a real workday is that it does not call out falsely. **The two limits the first version carried are CLOSED** (lane T6, 09-21, on Codex `gpt-5.6-sol`'s review of commit `302fb02`): now it looks at **to whom** the status message goes —it only counts if it went to the orchestrator— and `validate --brief` demands an **affirmative instruction** (`SendMessage` + `orchestrator` on the same line, outside a code fence and without a negation before it), so the negative mention no longer passes. Also closed: the sending vocabulary (`STOPPED`/`DONE`/`BLOCKED`, and `READY ·` only accredits), the screen declaration **anchored and outside a fence** (a quote or an example no longer consumes the streak), the **partial** read of the tail, strict accreditation by system tag and by delivered ack, and the budget (margin before reading, deadline on all passes, one single transcript read per event). **ADDITIONALLY CLOSED BY T4 (09-21), and it was the HIGH finding of Codex's two rounds on T6: the orchestrator's identity NO LONGER hangs off whoever spoke last.** `systemSender` now returns `{from, name}` (the `from` is the session id, stable; the `from-name`, a mutable name) and the **FIRST** cross-session message a lane receives —the one that brings it the brief— gets **PERSISTED** in `L.orchestrator_identity`; `terminal --link` over the owner session also sets it, and there the `from` is its real `session_id`. The recipient `silent_stop` compares against is, in this order: **(a)** the registered name of the owner session, **(b)** the **persisted** one, and only if there is neither **(c)** the `from-name` of the last cross-session message —the old behavior, and the alert SAYS so in `data.by_target`—. Without this, as soon as ANOTHER lane wrote, a status sent to the real orchestrator looked undelivered (false warning) and one sent to the peer cleared the streak (false silence). **What stays open, said on purpose:** (1) two terminals with the **same name** are still indistinguishable: what is compared against a `SendMessage`'s recipient is a name, because `to:` is a name — the `from` is saved but not yet used to compare; (2) if there is no registered name for the owner, no persisted identity, and no cross-session messages in the tail, it is **not known** who the orchestrator is: `close_without_state` abstains and only the written declaration calls out; (3) `close_without_state` depends on accreditation, so an accredited session that truly had nothing to say in that turn gets it once per streak; (4) the CLIENT-A case (`BLOCKED` in prose) now falls under `close_without_state` instead of `stopped_unsent`: it still warns, but without quoting the word; (5) **`validate --brief` no longer leans on a blacklist as proof** (T4/G2): it demands the **CANONICAL BLOCK** of `references/brief-template.md`, read from the real file and compared ignoring whitespace, the `T<n>` and the filling of the blanks (`<what>` and `…` are the same) — the skeleton of the `STOPPED ·` line up to its first recipient; the rest of the recipient list changes from one brief to another and demanding it whole would reject good briefs. The blacklist of `isSendInstruction` stays as a **second guard**, not as proof, and the rejection brings **the block to paste**. The `STOPPED ·` line is still looked for **inside or outside** the fence, because in the template it goes inside |
| `unaccredited_delegation` | `PreToolUse Write\|Edit\|Bash\|PowerShell` | **It does not get turned on: it NEVER denies, by design decision.** "Absence of a link does not prove absence of authorization" (Codex `gpt-6-astra`, 09-21): the `PostToolUse` may not have arrived, the response may not carry `agentId`, and the `Agent` payload has not even been captured ever. Denying on that basis would freeze the work of a legitimate lane — exactly the opposite of dispatching | before trusting its numbers a real workday of looking is needed: how many edits fall in `pending_identity` and **get reconciled** (if many stay pending, the Pre/write/Post order is not what is assumed), how many fall in "no launch possible" with the owner working normally (if many, the link is not being born where it is thought), and whether the exclusive-list parser leaves out paths that were there. **And above all: capture a real `Agent` with `ORCH_CAPTURE`.** Until that is done, this gate's numbers come from synthetic fixtures |
| `git_permit` | `PreToolUse` (`Bash`/`PowerShell` running `git commit`/`git push`/`gh pr create`/`git merge`/`gh pr merge`) | would cut the command without a valid permit of its scope, and **also with a valid permit** if it uses `--force`, deletes a branch, points at an integration branch, or if the `merge`/`gh pr merge` does not come from the orchestrator | a real workday without a single false positive: that reading "valid permit" (right scope, granted by the human order of the same command and less than 2 minutes old, not expired by close/abandonment/new program) is reliable before cutting a legitimate commit |
| `repeated_red` | `PostToolUse Bash\|PowerShell` | **It does not get turned on: there is nothing to cut.** When the hook sees the output, the suite already ran; and even if it arrived in time, denying over a repeated red would stop a lane that is perhaps doing exactly the right thing. **It never denies, not even with `brakes` set to `block`** | a real workday: how many warnings come out, how many really were the environment's, and whether the declared extractors capture STABLE identifiers between two runs (if the id carries something volatile that normalization does not strip, every run opens a new episode and the gate never warns). And the background case still has to be measured in a real orchestration: today only the run whose output file someone shows is seen |
| `own_reading` | `PostToolUse` | **CANNOT cut**: the read already happened by the time the hook sees it. It only warns | — |
| `shared_stash` | `PreToolUse` of `Bash`/`PowerShell` | **It does not get turned on: OBSERVE by design.** It would cut the `git stash` in a repo with several worktrees, but a lane can have a legitimate reason to put something aside for a moment; the warning already tells it the alternative (`git commit -m wip` or `git worktree`) | a real workday: that it does not fire in single-worktree repos (the count ignores worktrees deleted by hand) |
| `v_without_tool` | `Stop` | **It does not get turned on: OBSERVE by design.** The turn has already closed when the hook sees the `[V`; there is nothing to cut, only telling the orchestrator that what is marked [V] is [D] until it opens it. Tomorrow it will not block anything either | a real workday: that it does not call out falsely on turns that did open things by a route the gate does not count (the list is `Bash`, `PowerShell`, `Read`, `Grep`, `Glob`, `Agent`, `Monitor`) and that it does not repeat within the same turn |

**Before turning anything on, run the tests:**
`node ~/.claude/skills/orq/tests/test-orchestrator-control.mjs`
They include mutation tests: they deliberately break a check and verify that it **stops detecting**.
If they pass anyway with broken code, the test is decoration, not proof.

---

## The three that were going to be left open — and why they got fixed

Codex ran a closing verification on 2026-08-12 and its verdict was **THERE ARE OPEN FINDINGS**. Four
got fixed that same day. The other three were going to be accepted as "unlikely enough", and the owner
stopped that: the first one's justification contradicted itself — it said it would matter *"if the
machine runs out of RAM and processes hang"*, and that happens on the source machine every night. The
three that got closed:

| What it was | How it got closed |
|---|---|
| **The lock race.** A lock was declared orphaned for being OLD. A live but frozen process could watch another one take its lock away, and it would end up deleting the next one's | It is no longer decided by time but by **whether the owner is still alive** (`kill(pid, 0)`, which does not kill: it asks). A live process's lock **never** gets broken; a dead one's gets broken right away. If the owner cannot be read, it waits **4× the deadline** before touching it |
| **An unreadable ledger activated the hook** even though nobody had run `start` | Now **proof that a program existed** is required: the log with its `start` line. Without it, a stray unreadable file activates nothing and is left untouched. With it, it gets recovered and keeps watching |
| **The CLI's check ran outside the lock**, so a `close` from another terminal could slip in between checking and writing | The check now happens **inside the lock**, in the five subcommands that write (`pulse`, `close`, `decide`, `wait`, `integrate`, `identity add`) |

Each one with its own test in the adversarial suite, section *D-quater*, both directions included:
that a live one's lock does **not** break and a dead one's **does**.

One limitation remains, and it is not a bug: `gitCommonDir` does not recognize **bare** repositories
(ones with no working copy). Nothing gets orchestrated there — there is nowhere to edit — so it does
not apply.

---

## If something goes wrong at eleven at night

```
ORCH_CONTROL_OFF=1        # turns off the whole hook: touches no disk, says nothing, exits 0
```

Tested in both directions: with the variable it does not write; without it, the same event does
write.

Other variables: `ORCH_CONTROL_STATE=<path>` moves the ledger (used in the tests) ·
`ORCH_CONFIG=<path>` points to another `orchestrator.config.json` (the two thresholds; used in the
tests) · `ORCH_TEMPLATE=<path>` points to another `brief-template.md`, the source of the canonical
block that `validate --brief` demands (**tests only**: the mutants are copies of the script in a temp
folder, with no `references/` beside them, and since an unreadable template REJECTS they needed to be
able to say where the real one is; without the variable it is looked for next to the script, which is
what happens in production) · `CLAUDE_CONFIG_DIR=<folder>` is Claude Code's own, and is useful for
testing with a toy `settings.json` · `ORCH_CONTROL_DEBUG=1` traces to stderr · `ORCH_CODEX_CMD=<command>`
says what gets launched as Codex in `review` (default `codex`; with spaces it splits into executable +
arguments) · `ORCH_AGENTS_BYTES=<n>` lowers the byte cap that `load --agents` reads from each transcript
per pass (default 8 MB; test-only: it lets you test the "one line longer than the cap" case with a file
a few hundred bytes long) · `ORCH_CAPTURE=<folder>` records the real payloads (see below).

> **Watch out with `CLAUDE_CONFIG_DIR` when running the tests:** until T57 (10-09), with a valid
> `orchestrator.config.json` the `start` SYNCED the `autoCompactWindow` of whichever `settings.json` it
> found; measured on 09-16, running the suite changed the owner's own setting from 600,000 to 550,000.
> Since T57 the hook no longer writes `settings.json` (it warns, it does not write), but the suite still
> points `CLAUDE_CONFIG_DIR` at a toy folder by default (a copy of the owner's): loading the skill DOES
> copy `agents/` and `commands/` there.

### `ORCH_CAPTURE`: the diagnostic recorder

With `ORCH_CAPTURE=<folder>` in the environment, every payload entering the hook gets written as
`<folder>/<event>-<date>-<n>.json`, **anonymized**: the KEYS and their TYPES are kept, along with the
identifiers needed to reason about attribution (`session_id`, `agent_id`, `agent_type`,
`transcript_path`, `agent_transcript_path`, `tool_name`, `hook_event_name`, `source`, `trigger`,
`cwd`, and the `id`/`type`/`status` of background jobs), and the **content** of `tool_input`,
`tool_response`, `prompt`, and the messages gets replaced by its length (`"<text:1234>"`). What gets
investigated is the SHAPE of the payload, not what the owner wrote. **With no variable it does
absolutely nothing:** no folder, no file, no cost. A saved capture turns into a fixture with the
`loadCapture(<path>)` helper, and there are two real captures from 2026-09-16 in `tests/fixtures/`.

**What got measured with it on 2026-09-16** (and used to just be assumed):

| Question | Measured answer |
|---|---|
| Can a SUBAGENT be told apart from the terminal that launched it? | **Yes.** Its `PreToolUse`/`PostToolUse` events arrive with the MOTHER's `session_id`, but carry `agent_id` (`"a10032d95e834c09c"`) and `agent_type` (`"general-purpose"`). The main loop's events arrive with **no** `agent_id` (positive control: 58 events from 4 different sessions) |
| Does `SubagentStop` carry the subagent's tokens? | **No.** The accumulated total (`subagent_tokens`) reaches the MODEL, in the task notification; it never reaches the hook. What it does carry is `agent_transcript_path`, from which its **final context** gets read — which is NOT the same thing |
| Is there evidence a background job finished? | **Yes.** `Stop` and `SubagentStop` carry `background_tasks`: `{id, type:"shell"\|"subagent", status:"running", description, command}`. `PostToolUse` does NOT carry it |

**The two thresholds live in the skill (T3, 09-15):** `orchestrator.config.json` at the skill's root
(`{ "warn_tokens": 500000, "airbag_tokens": 600000 }` — the owner raised the airbag from 550,000 to
600,000 on the afternoon of 09-15) is the source of truth. On loading the skill, the startup message
carries the line `two thresholds: warning 500k (50%) · airbag 600k (60%)` and **checks**
`autoCompactWindow` in `settings.json`. **Since T57 (10-09; issue #8, the owner on 09-17: "the skill
WARNS, it does not write") if it does not match it does NOT write it: it WARNS** (`airbagWarning()`),
ONCE per session (`alreadyShown`, slot `airbag`; a relapse after it matched warns again), in one single
line: the current value (or "it is not set"), the recommended one (`airbag_tokens`), the why in the
owner's words (`AIRBAG_WHY`: "The skill watches how much memory each terminal carries… if you lower it,
you will compact more times.") and the line to put (`"autoCompactWindow": 600000`), with "open a new
terminal". If it matches, silence. With no `settings.json`: `🔴 I cannot find settings.json: … and I do
not create it`; unreadable: `🔴 settings.json unreadable: I could not compare your autocompact…`; in no
case is the file touched. The same text is used by `scripts/install.js`. If the terminal was opened
before the last change of value (mark `airbag_changed_at`, which since T57 only arrives inherited from
the mtime in old ledgers), it adds `this terminal was opened before the last change: type /autocompact
600k here ONCE`.
**History of the retired write:** from 09-15 to 10-09 the hook wrote it itself (`syncAirbag()`:
re-reading before publishing, a TEXT edit of that single key, exclusive temp file + `rename`), tested in
section 23 of the suite. T57 removed it together with its three helpers and section 23 (42 calls to
`assertTrue`); the T57 section at the end tests different/same/absent, that the file stays byte for
byte the same, and the static guard of `test-structure.mjs` now demands that NO function of the script
writes settings.json. The REAL `settings.json` never changes during the tests (`realFingerprint`).

**And in phase 1 there are belt and suspenders:** the global `try/catch` swallows any exception, and
on top of that, the file's last line forces exit code 0 while `GLOBAL_MODE` is not `'GATE'`. A
failure in this hook cannot be the reason the owner cannot work.

---

## Where it is wired

The skill wires **twelve** entries in `~/.claude/settings.json` (the twelve that `/orq-install` writes
and checks; the Spanish source's own table of this file listed fewer, so the rows below are the full
set, with the older ones first):

| Event | Matcher | Who it shares the slot with |
|---|---|---|
| `PreToolUse` | `Skill\|Agent\|Task\|TaskCreate\|TaskUpdate` | its own group. **`Skill` is essential**: without it, automatic startup on loading the skill never reaches the hook |
| `PreToolUse` | `Write\|Edit` | its own group (added on 2026-09-12 for `orchestrator_builds`; may share the event with other hooks of yours). It is the only place from which that gate could ever cut |
| `PreToolUse` | `Bash\|PowerShell` | its own group (T12, 2026-09-17: **it IS wired** — see `install/hooks-orchestrator.example.json` and `tests/test-structure.mjs`'s "the hook is in PreToolUse with a Bash matcher" assert. Without it, the brake over changes made BY COMMAND — `sed -i`, a heredoc, `rm`, `git apply` — and the `git_permit` and `shared_stash` gates are written and tested but never run) |
| `PostToolUse` | `Bash\|PowerShell` | its own group (other hooks of yours may share the event) |
| `PostToolUse` | `Write\|Edit` | its own group |
| `PostToolUse` | `Agent\|Task` | its own group: it confirms the launch link with the `agentId` (`confirmLaunch`), see `unaccredited_delegation` (closed on 09-21) |
| `PostToolUse` | `Read\|Grep\|Glob` | its own group: it feeds the `own_reading` gate with the lines read (`tool_response.file.numLines`) |
| `SubagentStop` | — | its own group |
| `Stop` | — | its own group |
| `PreCompact` | — | its own group. With an active program, every session (owner or lane) writes its **generic note** (`<git-common-dir>/orchestrator-context-<sid>.md`: the owner's last messages pulled from the transcript with the system noise stripped, folder, branch, `git status --short`, last `--stat`, open claim-reality cases, "Before continuing"); the **owner** also writes the **handoff sheet** (`orchestrator-handoff.md`, with the open handovers). It fails open and silently: an exit ≠ 0 here would block compaction. A session with no active program no longer receives the note (the skill only acts where it orchestrates; a consequence accepted by the owner) |
| `SessionStart` | `compact` | after the compact, each session receives its generic note (only its own; it gets archived as `.used` and ones older than 7 days get cleaned up) and the owner receives the handoff sheet AND note in a single block. The sheet gets discarded if its first line is not from THIS program (Codex, final round 09-15). On `startup`/`resume`/`clear` it stays quiet. By hand: subcommand `handoff` |
| `UserPromptSubmit` | — | its own group (10 s timeout; the `SessionStart` one has 15 s): it reads the human order keys (`/orq-git-permit`, `/orq-merge-permit`; see `allow-git`) and, since T54, a typed `/orq` as a skill load |

*("Other hooks of yours" means any hooks you already have in `settings.json`: orq is added next to them and does not need them.)*

**No longer true, kept as history:** this used to say the hook was deliberately NOT on
`PreToolUse: Bash|PowerShell` (already the hottest path, five hooks deep, and adding a sixth on
day one was the biggest risk of leaving the machine unusable). That held only through phase 1's
first days — the row above shows where it stands now: wired, tested, and required by
`test-structure.mjs`. (The Spanish source file still carries that old paragraph; this port corrects it.)

⚠️ A malformed `settings.json` **silently disables every hook**. After each edit:
`node -e "JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.claude/settings.json','utf8'))"`

---

## How much it costs in tokens, and how much it saves (measured on 2026-09-15)

*(The owner asked for this: "leave that data in one of the skill's docs so whoever uses it knows the
benefits." The character figures are measured with `wc -c` on the real files; the tokens are an
estimate at a rate of 1 token per 3.5–4 characters of Spanish, because the measurement was made on the
Spanish source. What is marked [S] was not measured.)*

**The hook does not spend any of the model's tokens.** It is an ordinary program that reads the
session file (only the tail, 256 KB), measures, writes the handoff sheet or the empty handover, and
checks the ceiling setting (if `autoCompactWindow` does not match the skill's airbag, it says so; since
T57 it does not write in `settings.json`). It costs milliseconds of disk and zero tokens, which is
exactly what the "two thresholds" spec of the `orchestrator-multi-llm` project asks for: *"a program
that reads a file off disk: it costs zero."*

**What DOES go into the model's memory, and how much:**

| Piece | When | Approximate cost |
|---|---|---|
| "Write your handover for yourself" warning (`own_load`) | once per crossing of the half-height mark (500k) | ~120 tokens |
| "YOU JUST COMPACTED" block + own handover reinjected | on returning from a compaction | 1,500–4,000 tokens (16 KB cap) |
| Writing the handover (800–1,500 words) | once per handoff | 1,500–2,500 output tokens |
| The orchestrator's handoff sheet (`orchestrator-handoff.md`, 1,227 characters on 09-15) | after compacting | ~300 tokens |
| Generic context note (the owner's last messages, branch, changes) | after compacting | 500–1,500 tokens [S] |
| Standalone hook warnings (specs, zeros, waits, load) | every turn close where there is something | 30–60 tokens each |
| A lane's brief (filled template; T3's on 09-15: 20,680 characters) | when the lead is born | ~5,000 tokens |
| The orchestrator's `SKILL.md` — only the CORE, since it got split into two floors on 09-15: 8,850 characters *(measured on 09-15, `node -e length`)*. Before the split it weighed **40,090 bytes** (`wc -c`, same day, right before the cut) | on loading the skill, and on re-reading it after a compact | **~2,200 tokens** — before, ~9.7k, i.e. **~7,500 fewer every time it gets re-read** |
| A floor-2 reference, only if it gets opened (`recon`, `dispatch`, `laws`, `resume-and-close`, the two templates, `mini-orchestrator`) | on demand, when its trigger calls for it — not on every load | 500–5,100 tokens depending on which: `resume-and-close` ~500, `recon` ~1,800, `mini-orchestrator` ~2,100, `laws` ~3,000, `brief-template` ~4,000, `dispatch` ~5,100 |

**What really weighs a lot, and is not the hook's fault:** compacting. Claude Code summarizes 600k
tokens into a summary that goes back into the model's head — on the order of 5,000–15,000 tokens
[S] —, **opaque** (it is not visible, it does not stay on disk), and followed by re-reads of
everything the summary did not keep. That is why the design writes the handover at half-height
**before** compaction arrives, and the SAME terminal keeps going (nobody closes or relaunches
terminals; the owner, 09-15):

```
terminal at 500k ─▶ warning (~120) ─▶ writes its handover (~2,000) ─▶ keeps working
terminal at 600k ─▶ 🎈 compacts ─▶ comes back: "YOU JUST COMPACTED" + its handover (~2,000) ─▶ keeps going ✅
                                    versus (with no handover):
terminal at 600k ─▶ compacts ─▶ only the opaque summary (5,000–15,000 [S]) + re-reads + half-memory 🔴
```

**The known waste, still pending a fix:** the `zero_unchecked` warning repeats on every turn close of
the orchestrator session because the empty searches are run by the **closing auditor** (a subagent
of the `Stop` hook that searches its own transcript), not by the orchestrator. It is ~40 tokens each
time, but a hundred closes a day is thousands for nothing. Planned fix: have the hook ignore commands
that come from the auditor.

---

## Results of the 2026-08-11 verification (phase 1)

Everything checked by running the file, not by reading it:

- **Pipeline:** 6 different inputs (typical JSON, `{}`, non-JSON garbage, empty stdin, JSON that is
  not an object, unknown event) → **6/6 exit 0**, no noise.
- **Canaries:** 4th round triggered through the real pipeline → ledger with `rounds=4`,
  `status=DECISION_REQUIRED`; handoff with a dirty tree → warns citing the SHA; **negative control**
  with a clean, published tree → silence, but the check is recorded as run in the ledger.
- **Concurrency:** 24 processes writing at once → **24/24 recorded, 0 lost**, valid JSON, no orphan
  locks or stray temp files.
- **Worktrees:** a worktree writes into the parent repo's ledger and does **not** create its own one
  (this matters: client-repo has 29 live worktrees).
- **Switch:** `OFF=1` touches no disk; without the variable, the same event does write.
- **Mutation:** break the round check → it stops detecting rounds (2→0) **without** affecting the
  delivery gate; break the delivery one → it stops detecting deliveries (1→0) **without** affecting
  the rounds one.
- **The ten previous hooks:** syntax intact in all 11 files; `suite-no-background`,
  `issues-con-duenno`, and `agente-clausula-espera` still exit with 2 on their own cases, and the new
  hook exits 0 on those same payloads. (`issues-con-duenno` once blocked a real call in this very
  session: a live test, not a simulated one.)
- **Persisted suite:** `test-orchestrator-control.mjs` → **49 OK, 0 FAIL**, exit code 0 read
  separately from the pipe.
- **Live wiring:** the hook fired against this very session's own edits, so the `settings.json`
  wirings take effect without reopening the terminal. This is not an assumption: it was seen firing.

### The real numbers from the first afternoon (2026-08-11)

Pulled from the ledger, not from memory:

| | Session in the home folder (no repo) | `client-repo` repo |
|---|---:|---:|
| hook invocations | 26 | 36 |
| warnings issued | 3 | **0** |
| gates that fired | only `receipt_missing` | none |

Of those 3 warnings: **1 hit** (a handoff saying *"it's done and verified"* with no source) and **2
false positives**. Over the real repo, 36 invocations and **zero noise** — which was the other half
of what had to be proven: that it does not get in the way.

### Three false positives, caught on day one by the hook itself

All three came from the `receipt_missing` gate — the one this very sheet already flagged as the most
prone to it — and all three showed up while **actually working on the skill itself**, not in a lab
test:

1. **"the task list" read as "done".** The pattern was a bare `list[oa]` (Spanish for "done" or
   "ready"), and the noun made it fire. Now "done" only counts as a predicate: *it is done, it came
   out done, ready to merge.*
2. **The hook accused itself.** The dispatch-document detector included `orquest` in the path, so it
   matched `orchestrator-control.js`. Now a dispatch document is a `.md`/`.txt`, never a `.js`.
3. **It read "Verified: NO" as a claim with no source** — exactly the convention the owner uses to mark
   their tasks, which says the OPPOSITE. Now there is a negation guard: *unverified, not ready yet,
   Verified: NO* stay quiet.

Fixing the first one opened a gap in the opposite direction: `cancel[l]ed` did not cover *"that lane
got cancelled"*, which is literally failure 7 from 08-11. The verb forms of *cancel*, *deliver*, and
*close* got added. All 16 controls live in section 8 of the suite so they do not come back.

**This is exactly the data phase 2 needs, and it already says something clear:**

> **`receipt_missing` does NOT get turned on.** Three false positives in a single afternoon, two of
> them against the house's own conventions. The rule was not "looking good", it was "a real workday
> with not a single false positive." This gate stays on OBSERVE until it goes several workdays mute.

The other gates did not give a single warning in 62 invocations — which does **not** clear them
either: not having fired is not the same as having gotten it right. They need a workday where there
really are rounds, deliveries, and integrations to measure.

### What Codex found as second reviewer

The first pass died after ~12 minutes without writing anything; the second, with its scope cut down
to three questions, answered. **It found three things the 53 tests had not caught, and all three were
real:**

1. **The timeouts stacked up.** `checkDelivery` fires three `git` calls in a row; at 5 s each plus 2 s
   of lock wait, that added up to 17 s, with the hook wired at 15–20 s. → Now `git` is capped at 3 s
   and there is a **9 s total budget** for the whole invocation: once it runs out, not one more `git`
   gets launched and it degrades to *"I could not check it."*
2. **Two races in the lock.** The lock did not refresh its `mtime`, so a long operation could get
   declared orphaned by another process; and on finishing, the old owner would delete the new one's
   lock. Worse: the orphan check's `catch { continue }` **skipped the deadline** — with a `statSync`
   that failed persistently, it would spin forever. → Lock with an **owner mark** (only whoever set it
   can delete it) and the deadline gets checked **always**, no matter which way it exits.
3. **Executable hijacking on Windows.** `execFileSync('git', …)` with no path makes libuv search **the
   working directory first**, and that directory comes from the hook's payload: a `git.exe` left in a
   project folder would have run instead of the real one. → Now the absolute path gets resolved from
   the `PATH` (an absolute path to the real `git` executable — e.g. under `Program Files\Git\` on
   Windows, `/usr/bin/git` or `/opt/homebrew/bin/git` on macOS), never from the cwd; if it does not
   show up, it degrades instead of taking the risk. *(The hijack itself is a Windows behavior; the
   absolute-path resolution is what the port keeps on macOS. **NOT TESTED ON macOS.**)*

### The closing verification (2026-08-12): four were still open

Codex was asked to confirm, one by one, whether its nine findings were closed. It said **four** were
not, and it was right about all four. The worst one, verified by triggering it:

> **A plain `status` over a corrupted ledger silently switched off the watching.** `readLedger` set
> the unreadable file aside, but a read-only call never wrote the replacement: the ledger disappeared
> and the next hook, finding no file, went quiet forever. **Looking cannot break things.** Now
> `readLedger` only reads, recovery lives only where the write happens, and `status` warns that it is
> unreadable without touching it.

The other three: `git`'s path could be diverted if `PATH` carried relative entries · a ledger field
with a changed type (`counters: null`) passed validation and then crashed · and gate-based blocking
was already fine, but the rest was not. All three fixed, with a test pinned down.

### And three that I found myself while Codex was not answering

- **A corrupted ledger got reset silently**, losing rounds, decisions, and waits. Exactly the
  opposite of what this exists for. Now it gets set aside as `.corrupt-<date>` and warns about it.
- **The round counter had no sense of time.** The adversarial suite itself racked up **12 "rounds" in
  334 seconds** over an artifact called `adversary` that was nobody's lane, and left the gate at
  `DECISION_REQUIRED` with 10 warnings. A real review round does not last 28 seconds, nor does it
  still weigh in a week later. → Now a round needs **≥ 1 minute of separation** from the previous one
  and **expires after 12 hours**; the raw firings still get recorded in `total` for auditing. Under
  this rule, those 12 would have been **1**.
- **The fallback ledger was global and eternal.** When the cwd was not a git repo, everything went
  into one single file: unrelated sessions piling up rounds together forever. → First it got split by
  directory, and finally it was **removed entirely**: it was the path through which the hook activated
  in terminals that were not orchestrating anything. Today, **with no git repository there is no
  ledger and no activity.**

### And a test that could not fail

While fixing the rounds issue, the internal `selftest` started really failing… **and it kept exiting
with code 0.** Phase 1's safety net ("no matter what happens, exit 0") was also being applied to the
CLI, so no subcommand could ever report a failure. My own check that `selftest passes` was decoration.

The contract has two halves and now both get tested, with mutants:

| | must exit | verified |
|---|---|---|
| the **hook**, even if its handler blows up | **0** | a mutant that throws an exception → 0 |
| the **CLI**, when something fails | **1** | a mutant with a broken canary → 1 |
| the **CLI**, when everything passes | **0** | the real `selftest` → 0 |

All of this now lives in the two suites, **63 + 22 cases, all green**:
`test-orchestrator-control.mjs` checks that it **detects**;
`test-orchestrator-control-adversarial.mjs` checks that it **does not get in the way** (hostile
inputs, a broken or read-only ledger, all three lock cases, Codex's invariants, and the safety-net
mutants). The worst time measured is **2.3 s**, in the case that waits out its lock cap and degrades.

> Note: one of the invariants I wrote **failed because of me, not the code**: the pattern matched the
> very comment explaining the problem. It is the same mistake the `zero_unchecked` gate chases — the
> pattern written wrong, not the world.

**What could NOT be checked:** behavior over a genuinely real orchestration workday — five lanes, PRs,
integrations. That is what is missing before touching phase 2, and it is exactly what the `.log` is
for. Nor could I stress the time budget against a truly slow `git`: I proved that with 40 nonexistent
worktrees it takes 273 ms, not that it survives a hung one.
