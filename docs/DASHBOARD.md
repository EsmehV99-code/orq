# The dashboard — watching the orchestration without reading anything

The orchestration ledger (`.git/orchestrator-state.json`) knows everything, but it is half a
megabyte of JSON. **The dashboard turns it into ONE page you can just look at**: big boxes, green
for finished / red for cut-or-expired / gray for working. Same picture as
[`docs/circuit.html`](circuit.html), but with what is happening RIGHT NOW instead of the general
way it works.

It reads everything and **writes nothing to the ledger**. A dashboard that changes what it measures
is not a dashboard.

## Seeing it

**Type `/dashboard` in the orchestrator terminal.** A SNAPSHOT of right now opens in the browser.
For another snapshot, `/dashboard` again. That is all; nothing needs to be left running.

> The page is a snapshot **on purpose**: it does not reload itself. A page that refreshes every
> minute promises a freshness it does not have once the generator has already finished — it would
> show the same image over and over. When you want the new state, you ask for it.

## Whose data you are looking at

**The dashboard is THAT terminal's own**: the one that loaded the skill in that repository. The
first thing the page says is which one it is, with its folder and its session number. If you have
another terminal working somewhere else, that one has its own dashboard and **does not show up
here**. If there is another terminal with the skill loaded in the SAME repository, it shows up
listed separately, under "Other terminals in this repo".

## What you see, in order

| Block | What it shows |
|---|---|
| **Six words** | a collapsed glossary: lane, agent, named terminal, wait, gate, compact |
| **Circuit 1 — what is running** | **the first box is the terminal you are reading** (ORCHESTRATOR, with its memory, its compactions and its program); after it, one box per LIVE agent, and the single-use readers together in ONE box. Below, the summary line. Whatever is finished or stopped, collapsed |
| **Circuit 2 — the waits** | only what is still waiting; expired ones in red. Closed ones are a collapsed number |
| **Circuit 3 — today's gates** | which rules fired, how many times, and when. In red, the ones that cut |
| **Under review** | the artifacts with rounds logged (5 at most; the rest, collapsed). On the third round, in red: the rule is to stop and decide |
| **Warnings for the owner** | from the last 24 h, only what a person has to decide |
| **Log** | the last 20 lines, collapsed |
| **Where everything lives** | a collapsed table with the paths. Inside the boxes there are NO paths: they make them unreadable |

Every live box introduces itself in **a single sentence**: who it is, since when and for what —
"T11 — Opus agent I launched at 11:34 (26 min ago) for: port of the skill to English and macOS" —
and ends with **last movement: hh:mm**. Memory is only drawn for what is live; for what is finished
it is not, because it no longer changes.

And below the circuit, the line that answers at a glance who is working:

```
Right now: the orchestrator + 1 agent working (T11) · 2 delivered today (T8, T10) · 4 reading helpers
```

**What counts as "live":** it is NOT closed **and** it moved **less** than half an hour ago (exactly
30 minutes already counts as stalled). The **status rules over the clock**: a closed lane (READY,
READY WITH DEVIATIONS, BLOCKED, CLOSED) does not go back to the grid because its conversation file
was touched a moment ago.

Below, in the fold, goes **everything else**, and each row says what happened to it:

| What you see | What it means |
|---|---|
| `delivered at hh:mm · receipt OK` | it finished and left a receipt |
| `closed with no receipt` | its status says it is closed (BLOCKED, CLOSED…) but **nobody delivered a receipt**: that is not the same as having delivered |
| `STALLED · no receipt · last movement hh:mm` | it is still open, but it has been quiet for more than half an hour: it was left halfway |

And "today" is **today, the calendar day**, not "the last 24 hours": something from yesterday
afternoon does not count as today. In the summary, "delivered today" is only whoever has **a receipt
from today**; what was closed with no receipt is counted separately.

**Whose memory the first box shows:** that of the session the ledger names as the orchestrator, and
of no other. If the ledger does not say, the box says "no data: I don't know who the orchestrator
is" instead of putting another terminal's memory there.

## What it looks like inside

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Orchestration dashboard                                              │
  │  This dashboard belongs to THIS terminal (…/your-repo…,              │
  │  session d0f51539). Everything below was launched by it.             │
  │  ▸ Six words, in case any of them sound odd                          │
  │  [Program orch-d2cc] [Mode OBSERVE] [Since 09/16] [Snapshot 10:36:11]│
  │  ▢ green: finished  ▢ red: cut or expired  ▢ gray: working           │
  │  CIRCUIT 1 — WHAT IS RUNNING                                         │
  │   ┏━━━━━━━━━━━━━━━━━━━━━━━━━┓ ┌─────────────────────┐ ┌────────────┐ │
  │   ┃ ORCHESTRATOR — this      ┃ │ T11 — Opus agent    │ │ READING    │ │
  │   ┃ terminal (you are        ┃ │ I launched at       │ │ HELPERS    │ │
  │   ┃ reading it)              ┃ │ 11:34 (26 min ago)  │ │ 4 today    │ │
  │   ┃ Memory: 53% ▓▓▓▓▓░░      ┃ │ for: port to English│ │ Total: 21  │ │
  │   ┃ Compacted: 3 times       ┃ │ Status: OPEN        │ │            │ │
  │   ┃ Program: orch-d2cce47b   ┃ │ Memory: 16% ▓░░░░   │ │            │ │
  │   ┗━━━━━━━━━━━━━━━━━━━━━━━━━┛ └─────────────────────┘ └────────────┘ │
  │   Right now: the orchestrator + 1 agent working (T11) ·              │
  │   2 delivered today (T8, T10) · 4 reading helpers                    │
  │   ▸ 10 already finished or stopped                                   │
  │                                                                      │
  │  CIRCUIT 2 — THE WAITS                                               │
  │   ┌───────────────────────┐ ┌──────────────┐                         │
  │   │ EXPIRED                │ │  16 h ago    │  ← red: no longer coming│
  │   └───────────────────────┘ └──────────────┘                         │
  │   ▸ 30 already closed (0 today)                                      │
  │                                                                      │
  │  CIRCUIT 3 — TODAY'S GATES                                           │
  │   ┌════════════════════════════════┐ ┌──────────────┐                │
  │   ║ the orchestrator tried to build  ║ │ 375 times  │  ← red: cuts   │
  │   └════════════════════════════════┘ └──────────────┘                │
  │                                                                      │
  │  UNDER REVIEW · WARNINGS FOR THE OWNER                               │
  │  ▸ Log — the last 20 lines                                           │
  │  ▸ Where everything lives (paths)                                    │
  │  Snapshot taken at 10:36:11. For another one, type /dashboard        │
  └──────────────────────────────────────────────────────────────────────┘
```

## Three things worth knowing

1. **"Lane" means whatever carries a lane name** (T1, T8…). Single-use readers that nobody
   dispatched are not lanes: they get counted in a single box. Without that, twenty helper boxes
   would show up, burying the two that matter.
2. **Warnings for the owner can come out empty, and that is not a bug.** The dashboard looks for the
   alerts the main program marks as "a person has to decide this" (`for_human`), and today the
   ledger stores its alerts **without** that mark: it comes out of `raiseAlert()` in
   `scripts/orchestrator-control.js`, which does not copy it on saving. While that stays that way,
   the section says so in plain words and points to the log. Fixing it means touching the main
   program, and that is another lane.
3. **The page has neither JavaScript nor web addresses.** It collapses with `<details>`, which is
   plain HTML, and any address that shows up in the ledger gets defused (`link→…`): it is a local
   file that still has to open even with the Wi-Fi down.

## Testing it

```
node tests/test-dashboard.mjs
```

Takes about 8 seconds. Includes six **mutants**: it deliberately breaks the program (strips the red
off an expired wait, changes where the log gets cut, sends closed items back into the grid,
un-groups the readers, lets the clock rule over the status —tested with the four closed statuses—
and removes the escaping from the summary line) and checks that the assertions **turn red**. An
assertion that cannot fail proves nothing.

And no test depends on the time of day it is run: the edge cases (midnight, the exact half-hour
limit, "today") pin the snapshot time, so they pass at 00:03 just like at 12:00.

**NOT TESTED ON macOS:** the browser launch on macOS (`/usr/bin/open <file>`) is only checked with a
fake platform and a fake process launcher; it was never run on a real Mac.

---

## Advanced: leaving it watching

```
node scripts/dashboard.js --open --watch
```

Regenerates the page **every 60 seconds** and, only in that case, the page carries an auto-refresh:
you leave a tab open and it keeps updating itself.

**Warnings, before using it** (raised by Codex `gpt-5.6-sol` in the 09-17 review):

- **It occupies the console**: that terminal stays stuck until you kill it (Ctrl-C), and **it dies
  when you close it.** It is not a service.
- Without `--watch`, `--open` opens a snapshot that does NOT refresh. If you want to watch it change
  on its own, the two have to go together.

The rest of the options:

| Option | What for |
|---|---|
| `--ledger <path.json>` | read ANOTHER ledger (default: this repo's `.git/orchestrator-state.json`) |
| `--out <path.html>` | write the page somewhere else (default: the repo's `.orchestrator/dashboard.html`) |
| `--open` | open it in the default browser |
| `--watch` | regenerate every 60 s (with auto-refresh on the page) |

Every pass answers with **a single line**:

```
DASHBOARD: /Users/you/.../.orchestrator/dashboard.html · 1 lanes · 3 open waits · 10:36:11
```

It exits with **0** if it painted the page and with **2** if there was no ledger to read — and it
still writes a page that **says** there is none, so nobody is left staring at a blank tab.
