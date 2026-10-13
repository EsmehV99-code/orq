# Lane receipt template

Every lane lead fills this in when finishing. Copy it and keep the section headings **exactly as
written** — `validate` parses them mechanically, and a receipt with a missing or reworded heading
goes back unread. Every factual claim carries its provenance mark per SKILL.md's law 2: **[V]** I
opened/ran it myself · **[D]** someone else said it · **[S]** assumption.

> **This receipt is [D] until the orchestrator opens the evidence.**

---

````markdown
# RECEIPT — T<N> <lane title>

## STATE

READY | READY WITH DEVIATIONS | BLOCKED
- Duration: <h:mm>
- Tokens used: <n, or "not recorded">
- Subagent calls: <n>
- Review rounds: <n>
  - Codex, per round: the literal `model:` line of its `.log` and the paths of the `.md` and the `.log`
    (for example `~/dev/codex-out/T<N>-r<k>.md` / `.log`, which are not deleted)
- Recommended next step: <one sentence: integrate / another round of X / escalate to the owner for Y / nothing>

## CLAIMED RESULT

One line per "You are done when" item from the brief, **copied verbatim**, each one with the exact
command/test that proves it and the numbers seen. **No named proof = the item was NOT MET.**

- <item verbatim> — proof: `<command>` → <numbers seen> [V]
- <item verbatim> — NOT MET: <why>

**The marker rule (`validate` reads it, not a person):** the proof has to START with a command in
backticks; up to 40 characters of prose before the first backtick are tolerated, nothing more.
" — proof: commit `abc`" passes; " — proof: I checked it by running the whole suite and then `cmd`"
does not. *(Measured by CLIENT-A on 2026-09-15: a lead wrote long prose before the command, the item
did not match, and the message did not say why.)*

**Each suite's `EXIT` goes to a separate file** (`<suite>-exit.txt`), not only to the console, and its
path is cited here: the verifier has to be able to open it *(09-22: the verifiers of T18 and T19 could
not see the EXIT)*. **And what belongs to a MEASUREMENT is not temporary:** the scripts and outputs of
a cost, a threshold or a baseline are kept in `.orchestrator/` and their path is cited here *(09-22:
T16 deleted its own and its figures could no longer be opened)*.

## FILES CHANGED

Paste the literal output of **both** commands, **run from the repo root**. Never from memory.

```
git diff --stat=200 <base>..HEAD
git diff --name-status <base>..HEAD
```

The `--stat` is the usual one (the additive rule counts its deleted lines). The `--name-status` is
the clean list: it does not abbreviate paths with `...` and it does not confuse a ` => ` inside a
name with a rename, and `validate` uses it to check against `specs-map.json`. If it is missing,
`validate` checks against the `--stat` and warns about it.

```
<paste both outputs here, one below the other>
```

## INPUTS USED

- Allowed by the brief: <list>
- ALSO READ (outside the brief — a confession, not a crime): <list, or "nothing">

## CONSTRAINTS AND DEVIATIONS

Every constraint from the brief, listed as honored or deviated-with-reason.
**This section is present even when empty.**

- <constraint>: honored | DEVIATED — <reason>

## ASSUMPTIONS AND OPEN QUESTIONS

- Interpretations made without asking: <list, or "none">
- Found, belongs to ANOTHER lane (noted, not fixed): <list, or "none">

## ESCALATIONS

Which ESCALATE-IF conditions fired, or "none".
````

**Extra section for a BIG lane.** A lane whose brief says BIG (see `references/mini-orchestrator.md`)
that delivers with `Subagent calls: 0` adds `## WHY I DID NOT SPLIT` to the receipt, with the concrete
reason it did not delegate. `validate` rejects that receipt if the section is missing (silence is not an
option). And in CLAIMED RESULT, whatever the lane only knows from a subagent's sub-receipt goes as
`NOT VERIFIED BY ME`, never as [V].

**Recommended next step is mandatory:** `validate --receipt` rejects the receipt if the field is
missing, and it names the field in the rejection. It is written by the lane lead, not the
orchestrator — whoever did the work is the one who knows what comes next. `status` shows it next to
each lane's latest receipt, so the orchestrator does not have to decide the routing from scratch.
*(Compared to Gentle-AI, 2026-09-16: its phase contract already had "recommended next phase".)*

---

## VALIDATION ORDER — for the orchestrator, not for the lane

Mechanical first (this is what `validate` does — run it before reading a word of prose):

```
node ~/.claude/skills/orq/scripts/orchestrator-control.js validate \
  --lane T<N> --receipt <path to receipt> --brief <path to brief>
```

1. Every fixed heading from this template is present.
2. Every "You are done when" item from the brief has a line in CLAIMED RESULT with a named proof.
3. FILES CHANGED actually carries real `git diff --stat` lines pasted in (not from memory).
4. The "Recommended next step" field is present and not empty.
5. Deletions match the brief's additive rule (more than 50 deleted lines requires declaring it in
   CONSTRAINTS AND DEVIATIONS).

Then human:

6. Open the evidence — the receipt is [D] until you do.
7. Sample the claims per SKILL.md's law 2 (LIGHT toll: 2 at random; FULL toll: all of them).
8. Judge each deviation: acceptable, or redo.
9. Route the open questions; nothing in them is decided by silence.

> **Adaptation made when porting this piece (issue #1, 2026-09-08):** the origin (a collaborator's branch, in the source repo)
> also checked that every file in FILES CHANGED belonged to the lane's exclusive list, against a
> ledger built by `lane register`/`lane check`. That lane guard (`ORCH_LANE`) was deliberately not
> brought over: its test uses symlinks and does not run on Windows. That is why `validate` here does
> NOT check file ownership — only that the section carries a real diff. If the lane guard is ever
> ported, this check can be added.
