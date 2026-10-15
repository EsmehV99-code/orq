# Measured, not claimed

Every number here was read from the hook's own ledgers, from `validate` outputs kept at batch close,
or from session transcripts of **real orchestrations** — most of them orchestrating this very skill
(it was built with itself). Where a number is a simulation or an estimate it says so. What has NOT
been measured is listed at the end, on purpose: by this skill's own law 2, a claim without its source
is [S], not [V].

## 1. What the hook costs an ordinary session (the "12 hooks in settings.json" question)

Every event of every session runs the hook, so this is what everybody pays. Measured on 2026-10-14
(Windows 11, Node 22.22.3, Intel Core Ultra 7 258V; 15 runs per cell, wall time of the whole process,
median / p90; the `node -e 0` row is a separate measurement of the floor, not a decomposed component):

| State of the folder | `PostToolUse` | `UserPromptSubmit` | `PostToolUse` of a `Read` |
|---|---|---|---|
| starting `node -e 0` alone (the floor) | 84 / 97 ms | — | — |
| git repo, **no orchestration** | 122 / 247 ms | 135 / 291 ms | 155 / 522 ms |
| not a git repo | 153 / 491 ms | 136 / 261 ms | 160 / 229 ms |
| git repo **with** a running orchestration | 184 / 214 ms | 140 / 262 ms | 185 / 202 ms |

With no orchestration the hook leaves through its early exits (`hookMode`), in normal operation
before any ledger read: a prompt that is not a permit command and a `Grep`/`Glob`/subagent `Read`
return after one `stat` of the working folder; any other event walks up the folders looking for
`.git` (on disk, no `git` process), tries to read the ledger file there, finds none and returns —
**no lock, no process spawned, nothing written**; its stdout is empty, so nothing is injected into the
session. The two exceptions are deliberate: a typed `/orq` (or the `Skill` tool loading it) STARTS
the orchestration, and the diagnostic capture `ORCH_CAPTURE`, when the owner sets it, writes first. The
budget for one event is 9 s (11 s for `pulse`); if it is spent, the hook stops observing rather than
blocking. Installed as the **plugin** nothing is written into `settings.json` at all.

## 2. What the hook caught in real runs

Counts of warnings per gate, read from the ledger (`status`) at the close of two programs that
orchestrated this skill's own repository:

| Program | Events | Warnings | By gate |
|---|---|---|---|
| September 2026 (lanes T41–T53, Codex rounds included) | 8,619 | 230 | unchecked zero 54 · delegation not accredited 98 · receipt missing 20 · git without permit 22 · delivery not reachable 12 · wait expired 8 · orchestrator reading in person 8 · orchestrator editing code 2 · stale spec 1 · own load 5 — plus 66 repeats suppressed |
| 2026-10-09 (lanes T54–T56) | 2,415 | 74 | delegation not accredited 47 · unchecked zero 9 · receipt missing 5 · git without permit 5 · delivery 3 · own reading 3 · stale spec 1 · terminal load 1 — plus 8 repeats suppressed |

**Not classified:** which of those 230 + 74 warnings were hits and which false positives. The only
classified sample is the first afternoon with the hook (2026-08-11): 26 events in a folder with no
repo → 3 warnings, **1 hit** (a handoff that said "ready and verified" with no source) and **2 false
positives**, both fixed that day; 36 events in a client repository → **0 warnings** (no noise in that
sample; it says nothing about latency, see §1). A third false positive showed up the same day and is fixed; all three have their control
in the suite.

## 3. What `validate` rejected or sent back

From the `validate` outputs kept in `.orchestrator/` of the private repo (lanes T42–T59):

- **3 briefs rejected before dispatch** (T46, T54, T55: one failure each), fixed and re-validated.
- **2 lanes' receipts sent back:** T55 once (1 failure, accepted on the next round); T58 three times
  (4, then 2, then 1 failure, among them "2,653 lines deleted" that the brief had not authorized).
  Caveat: part of T58's failures may be `validate` misreading its spec list; they were still sent back.

## 4. Warning noise, before and after de-duplication

- Before: on 2026-09-21 the hook put **212 warnings ≈ 31k tokens** into one 4-hour orchestrator
  session; on 2026-09-23 "stale overlap" came out 6 times in 25 minutes with nothing new.
- After (replay of a 30-minute window against the same ledger, script kept with the lane's evidence):
  **14 → 5 warnings, ≈ 706 → 320 tokens** (4 chars per token), 23 repeats suppressed. This is a
  replay, not a new live session.
- Measured composition of an orchestrator's context (lane T40): console output of `Bash`/`PowerShell`
  26.0 %, the hook's own warnings 1.1 %.

## 5. The orchestrator's own reading, with the reading gate vs. without (UNCONTROLLED)

The one pair of runs that exists (2026-09-22/23, two transcripts): the orchestrator of this skill with
the reading gate on (7 lanes launched, final context 487,201) against an orchestrator in a client
repository one day earlier without it (1 lane, 232,138). **Different repositories, different tasks,
different lane counts, different skill versions: NOT a controlled comparison. It cannot establish the
gate's effect; it is published because it is the only with/without datum there is.**

| Per launched lane | Difference |
|---|---|
| orchestrator's final context | −70 % |
| lines it read in person | −81 % (231 vs. 1,246) |
| text it wrote | −42 % |
| **total tokens (the 4 `usage` fields summed)** | **−4 %** (12.49 M vs. 13.04 M) |

**Honest reading:** in this uncontrolled pair, the final context per lane differed by −70 % and the
summed `usage` by −4 %; that is all it shows. It does not prove that the gate caused the −70 %, and it
does not make the skill cheaper. A plausible, unmeasured explanation of the −4 %: every API call
re-pays the accumulated context, which grows with receipts, verifiers and messages; and part of the
−70 % is arithmetic (a ~75k startup spread over 7 lanes instead of 1). The `cost` subcommand records
tokens per lane from the subagent transcripts, and says "unknown", never 0, for what it could not read.

## 6. Built with itself

The private repository of this skill, as of 2026-10-10: **204 commits, 57 merges, every one of them a
lane (`T<n>`)**, from 2026-08-12 on; **60 lane folders** of evidence (brief, receipt, Codex rounds,
measurements: 908 files) under its `docs/evidence/`. The 3 false positives of day one, the 400-line
reading threshold (measured over 312 turns of 4 orchestrators: only 9 went over 400) and the
de-duplication above all came out of orchestrating the skill's own repository, not from a lab.

## What is NOT measured (yet)

- A controlled with/without run of the **same task**: tokens, wall time and errors caught. It does
  not exist. The nearest thing is section 5, and it shows total spend −4 %, not a saving.
- Money or quota: the hook counts tokens, never cost.
- The hit / false-positive rate of the 230 and 74 warnings of section 2.
- Wall-clock duration per batch or per lane.
- Anything on macOS on a real machine (the CI runs the suites on `macos-latest`; the behaviour above
  was measured on Windows).
