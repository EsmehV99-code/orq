# Mini-orchestrator — when your lane is BIG

**Who reads this:** the **lead of a lane** (Opus) whose brief says, in the "Lane size" block,
**BIG — load `references/mini-orchestrator.md` before starting**. If your brief does not say
that, do not load it: the orchestrator measured your lane and decided it fits in one head.

**Who decides a lane is large:** the orchestrator, when writing the brief. Never you. If you think
yours is and it does not say so, that is an **ESCALATE IF**: stop and say so, do not reorganize
yourself on your own.
And a launched brief **is not widened by message**: if more is needed, the orchestrator measures again
and writes a new brief (`T<n>-b`) that goes through `validate` *(owner's rule, 09-22)*.

> **Why this exists:** a big lane done by a single session eats through its own context. Halfway
> through, the lead no longer remembers the whole brief, re-reads things, and whatever it verifies
> at the end it verifies with whatever memory is left, not with what was needed. The way out is not
> "a bigger model": it is **delegating downward** whatever does not need your head, and keeping for
> yourself what does.

---

## Your role changes name, not laws

Inside your lane you are the **mini-orchestrator**: you dispatch subtasks to subagents **equal to or
cheaper than you** (`opus` / `sonnet` / `haiku`; **`fable` never**), in parallel, and **verify what
they return to you** before assembling your lane's result.

```
ORCHESTRATOR (Fable) ── BIG brief ──▶ YOU, lead of lane T<N> (Opus) = mini-orchestrator
                                              │
                            ┌─────────────────┼─────────────────┐
                      sub A (opus/sonnet)  sub B (sonnet)   sub C (haiku)
                      build piece A        build piece B    search / list / extract
                            └────── sub-receipts ──▶ YOU verify ──▶ ONE receipt to the orchestrator
```

The orchestrator's laws **go down one level with you** and apply the same way:

- **What a subagent returns to you is [D], not [V].** Demand `path:line` from it and **open the files
  yourself** before building on top. Your receipt going up only carries **[V]** for what you opened.
- **A zero is not a fact** until it passes its control. A subagent that "found nothing" has to first
  show you its search finds something that does exist.
- **A clock on every wait**: a subagent that has not touched a file in 30 min is stuck, not thinking.
  On the **third** pass over the same piece, you stop and decide (continue / go up a tier / redo):
  there is no fourth without a decision.
- **Numbers come from counting**, not from reading a subagent's summary.

**What does NOT change:** you still do not integrate, you still do not merge, you still do not touch
files outside your exclusive list, and you still do not decide anything from "Decisions already
made". Your subagents inherit **your** exclusive list: **split it between them with no overlaps**,
and none of them writes outside its own chunk.

---

## STEP A — Split before launching anything

**The first thing you write, before the first code change, is `SPLIT-PLAN-<lane>.md`** next to your
brief (same folder), with the chunks described below. It is not paperwork: `validate` compares that
file's timestamp against the first file you touched, and **rejects the receipt of a BIG lane whose
plan comes after the code** ("a plan written at the end is a report, not a plan"). And if you deliver
with `Subagent calls: 0`, the receipt carries a `## WHY I DID NOT SPLIT` section with the reason, or
it goes back. *(Measured on 2026-09-16: two BIG lanes delivered with zero subagents and nobody
noticed.)*

Write the split **into your task list too**, not just in your head (the list survives you getting
compacted; your memory does not). For each chunk:

| | |
|---|---|
| **What** | one piece with edges, that can be verified on its own |
| **Files** | a subset of YOUR exclusive list; **two chunks never share a file** |
| **Model** | by the orchestrator's axis: *what does it cost to catch the error?* — mechanical and cheap to catch → `haiku`; standard → `sonnet`; reasoning with an expensive-to-catch error → `opus` |
| **Test** | the exact command that proves it, and **what would make it fail** |
| **Depends on** | which chunk has to come first (if none, it goes in the first batch) |

**What stays with you, never delegated:** the lane's final verification · deciding whether a test can
fail · any chunk where a false "fact" is indistinguishable from a real one · the receipt going up.

**What always gets delegated:** sweeps, searches, reading long logs, running suites, listing,
formatting, mechanical rebases, writing the standard stuff.

**And whatever gets READ goes to a disposable reader, not to you** *(owner's rule, 2026-09-15)*: you
fill up the same way the orchestrator does. A `haiku` subagent (or `sonnet` if something needs
understanding) opens the long file, runs the suite, or reads Codex's output, and returns to you
≤ 30 lines with `path:line` and the numbers it saw; then it dies. Minimal prompt for a reader:

```
Open ONLY: <exact paths>. Look for: <concrete question>. Return, in this format and nothing else:
- FINDING: <path:line> — <one sentence>       (one per finding, max 10)
- NUMBERS: <what you counted, with the command> (e.g. "npm test → 12 pass, 0 fail")
- NOT FOUND: <what, and with which pattern you searched>
Do not edit anything, do not propose fixes, do not summarize anything I did not ask for.
```

What it returns is **[D]**: you open the `path:line` that matter before building on top of it.

## STEP B — Launch in parallel, with the full brief inside

- **Several `Agent` calls in the SAME message run at the same time.** In separate messages they run
  one after another, even if you launched them "in parallel".
- **Cap by measured RAM:** before launching, measure the free RAM and launch at most **one subagent
  per 3 GB free**; if it does not reach, one at a time *(owner's rule, 09-22: 3 lanes with suites
  left 4.1 GB free)*.
- `model` takes **`haiku` / `sonnet` / `opus`**. **`fable` is forbidden** (owner's rule, 2026-09-02:
  it spends the shared quota and stops everyone).
- Every prompt carries **everything already resolved**, the same way your brief brought it to you:
  the chunk's exclusive files, the verification command with the port/resource already substituted,
  the toll, the gates, the decisions already made, and **how to wait** if it launches something long
  (*"in the background, check it ONCE when notified, do not re-read the log in a loop"*).
- And every prompt asks for the **sub-receipt** below, with those exact headings. Without it, you do
  not read its prose.

## STEP C — Receive, verify, and only then build on top

Each subagent closes with this **sub-receipt** (this is your manual `validate`, there is no command
for it):

```markdown
## SUB-RECEIPT — <chunk>
- STATE: READY | READY WITH DEVIATIONS | BLOCKED
- DONE: <one line per item asked for> — proof: `<command>` → <numbers seen>
- FILES: <literal output of git diff --stat, or the list with path:line>
- OUTSIDE MY CHUNK (seen, not touched): <list, or "none">
- ASSUMPTIONS: <list, or "none">
- Temporaries deleted: yes/no + <list>
```

Before accepting one:

**A "no" is not accepted:** whoever makes the mess cleans it up. A sub-receipt with "Temporaries
deleted: no" goes back to the subagent, it does not go into your receipt.

1. **Open 2 claims** against their proof. Both hold → accept. One fails → open everything, and **that
   subagent's next sub-receipt goes to full verification**.
2. **Open its most important test** and ask yourself what would make it fail. If nothing can, it is
   decoration.
3. If it touched a file outside its chunk, **it goes back**: "just this once" is not accepted.

A rejected sub-receipt gets relaunched **with the failure cited** (`path:line`), not with "do it
better".

## STEP D — Your receipt going up is ONE, and it is yours

The orchestrator receives **a single receipt** from your lane, using `references/receipt-template.md`
as is. What a big lane adds to it:

- In **STATE**, `Subagent calls: <n>` is the real, counted number.
- In **INPUTS USED**, list **which chunks you delegated, and to which model**, one line per chunk.
- In **CLAIMED RESULT**, only **[V]** goes in: what **you** opened or ran yourself. An item you only
  know from a subagent's sub-receipt goes as **NOT VERIFIED BY ME**, never as [V].
- **If you deliver with `Subagent calls: 0`** on a BIG lane, the receipt carries a section
  **`## WHY I DID NOT SPLIT`** with the concrete reason (what made delegating worse than doing it
  yourself). Without that section `validate` sends the receipt back (silence is not an option);
  and reading the reason is your orchestrator's job, not the script's.
- **FILES CHANGED** is **both** commands for the whole lane, pasted by you, from the repo root and
  against the same base: `git diff --stat=200` **and** `git diff --name-status` (the bare `--stat`
  abbreviates paths and confuses names containing `=>` with renames; see `receipt-template.md`).

And if your brief carries **"## Affected specs"**, the specs are **your** chunk or a specific
subagent's — never "someone will get to it" — the orchestrator's `validate` rejects the receipt if
the diff does not bring them.

---

## ESCALATE IF (in addition to your brief's own)

- The split gives you **more than 5 chunks in parallel**: the lane probably should have been two
  lanes. Stop and say so to the orchestrator.
- Two chunks **need the same file**. It is not solved by "coordinating them": the split gets redone
  or escalated.
- A subagent has gone **3 rounds** and its failures are **basic** (cited the wrong file, did not run
  the obvious): the model was not up to it. **Go up a tier and redo**, do not keep iterating.
- You have spent **80%** of your budget and you are not on the last chunk.

## One-line summary

> Split by files with no overlap, launch in a single message with the whole brief inside, do not
> build on anything you have not opened yourself, and hand up ONE receipt where every [V] is yours.
