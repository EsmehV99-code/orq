# Reference — STEP 5: RESUMING someone else's work, and STEP 6: CLOSING

> **When to open this reference:** **when inheriting work someone else left** (a handover, a handoff
> sheet, a document from days ago), and **when closing a batch**, before saying anything to the
> human.
>
> *Text moved verbatim from `SKILL.md` on 2026-09-15, when the skill was split into two floors.
> Nothing was rewritten or summarized: the owner's rules keep their dates and their quotes.*

---

# STEP 5 — RESUMING SOMEONE ELSE'S WORK

A handover is **expired from the moment it was written**. Before believing a single line:

1. **Check the real state**, not the narrated one: what is published, integrated, running.
2. **Date every claim** against what you see. Whatever no longer holds, **mark it** — do not delete
   it: knowing it *was* true once explains why things were done the way they were.
3. **Look for what the document cannot know:** what happened *after* it was written.
4. **Distrust "green" and "done" above everything.** Check what actually **ran**, not what the
   summary says. A green summary over zero executions is the most common state of abandoned work.

If you inherit a program in progress, the previous orchestrator is not a lane of yours: the handoff
sheet lists it under "Previous orchestrators" and the hook does not ask you to write briefs for it.

**And you are not going to find eight handovers with no way to tell which one is good: the skill
cleans up after itself** *(the owner, 2026-09-16: "I don't see the point in leaving junk behind for
whoever reads the skill next to also have to clean up"*). **Since that same day they live outside
`.git/`**: in `<repo root>/.orchestrator/handovers/` — look there first. (They used to live in
`<git-common-dir>/orchestrator-handovers/`; the ledger and the log stay where they were.) Nobody
writes a cleanup command. The hook does it as things happen: **when a lane closes** — its receipt
passes `validate` — it deletes its handovers **except the last one** (that terminal is still alive
and can compact right now); **when a program gets archived** — 8 h with no activity, or a fresh
`start` — it takes away the closed lanes' handovers, the context notes for sessions inactive for
24 h, and the Codex reviews older than 7 days, and it rotates the log. **The owner's handovers are
kept** until the next archiving: there is always one left to resume from. And the handoff sheet
lists **one handover per lane**, the latest one, with "+n older" if there are more. If it is ever
needed by hand, the escape hatch is `close-lane --lane T<n>` — but you should not have to use it.

When you come back from compacting, the handover goes in whole if it fits in 16 KB
(`injected_handover_kb` in `orchestrator.config.json`). If it does not fit, it is trimmed by sections:
MANDATE, RESUME, STATE, PENDING and WARNINGS stay whole; RESULTS, VERIFICATION and PATHS are removed
first; the last line says `TRIMMED: missing …`. If the handover says of one same lane that it is
integrated and that it is pending, in front comes "contradictory handover about T<n>: trust the ledger,
not the handover". `status` shows per terminal `handoffs`: compactions, contradictory handovers and
trimmed ones. If you left a handover, the handoff sheet brings "Receipts since your handover": the
receipts `.orchestrator/receipts/T<n>.md` written afterwards, with their time and path ("Since your
handover (hh:mm) these arrived: T5 (receipt, 16:20), …"), or "no receipt since your handover". Open
them before asking anyone.

---

# STEP 5.5 — INTEGRATE: what you resolve by hand is new text, and it gets reviewed

Integrating a lane is: `validate --lane` on its receipt → receipt verifier → you open the evidence
yourself → commit in its worktree (with the lane's Codex review recorded in the gate) →
`git merge --no-ff <branch>` in the live folder → suites on `master` with the live script → push.
One `git` command per message, or `git -C <path>`: two different `cd` in one message make the second
one run where it should not (09-25: a commit did not happen).

**When the merge brings conflicts, what you resolve is text nobody has reviewed.** The lane's r1/r2/r3
review covers ITS diff, not your resolution; recording it in the gate for the merge commit is skipping
the review, not meeting it. So, on every merge with conflicts resolved by hand:

1. Resolve with a direct edit or with a replacement **function**. Never `replace` with a string: if
   the text carries `$` (a `` `$` `` followed by a backtick, for example), the replacement string is
   interpreted and the file ends up corrupt (2026-09-25, `CHANGELOG.md` when merging T46 onto T49: the
   header showed up duplicated inside an entry; the orchestrator saw it by looking at the file, not a
   guard).
2. Check, by counting: **0 markers** (`<<<<<<<`, `=======`, `>>>>>>>`; careful, after
   `git checkout -m` they are called `ours`/`theirs`), **each entry only once**, and a **line count
   consistent** with what you put together. `node --check` on every `.js`/`.mjs` touched.
3. **One targeted Codex round on the resolved files** (`review --model gpt-5.6-sol` with the diff of
   the merge in progress) and record THAT review in the gate before the merge commit.
4. Only then the merge commit, and afterwards the suites on `master`.

No automatic guard and no new command for this (decision of the owner and of Codex Sol, 2026-09-25:
procedure in writing first; if it fails again, it is measured and decided).

---

# STEP 6 — CLOSE: audit yourself out loud

Before calling a batch closed, **out loud, to the human**:

- What did I claim as **[V]** without having opened it?
- What number did I give without counting it?
- Which brief did I write that breaks one of its own rules?
- What did I call "waiting" that was actually "broken"?
- What did I state as mandatory without being able to name its consequence?
- What was I corrected on — and was my second version also wrong?
- Is there any recorded rule left undocumented? (`rule --view`)

**And say who caught each failure.** If someone else caught all of yours, the network works **and
you are one of the nodes to be verified**, not the one verifying the others. That is operational
information: it tells the human where to press.

---

## One-line summary

> **Your job is not to dispatch: it is that nothing false passes through you.** Recon the
> environment once and feed it into every brief; mark the provenance of every fact; count instead of
> looking; check your own briefs against your own rules; put a clock on every wait; and verify before
> answering a correction.
