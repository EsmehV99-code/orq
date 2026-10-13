# Reference — STEP 2: DISPATCHING, and STEP 3: SENDING THE BRIEF

> **When to open this reference:** **every time you are about to split up work or send a brief** —
> when deciding how many lanes, to whom, with which model, and when sending it. It carries the load
> board, lane size, the named terminal, the command tiers, the disposable reader, the error axis,
> review rounds as a diagnosis, and the dispatch rules.
>
> *Text moved verbatim from `SKILL.md` on 2026-09-15, when the skill was split into two floors. Nothing
> was rewritten or summarized: the owner's rules keep their dates and their quotes. What was added
> that same day carries its own date and measurement.*

---

# STEP 2 — DISPATCHING

**Fewer lanes than would fit.** Each one costs memory, verification queue, and your attention. Start
with the ones that **depend on nobody** and unblock the rest.

For each lane decide, and write it down:

| | |
|---|---|
| **Scope** | one concern, with explicit edges |
| **EXCLUSIVE file list** | outside it, it does not write |
| **Own folder** | never two lanes in the same one |
| **Unique resources** | port, database, container — each with its own name |
| **Turn** | **provisional** — recomputed against the real diffs before integrating; the one from dispatch does not count |
| **Verification toll** | light or full (see STEP 3) — **you decide, and it goes written into its brief** |
| **Skills and commands** | the ones that came out of STEP 1, **by name** |
| **Specs affected** | the ones from the STEP 1.8 map that its file list touches, with the owner's authorization already resolved (`no change: <reason>` when it applies) |
| **Lane size** | NORMAL or **BIG** — **you measure it**, and if it is BIG the brief orders loading `references/mini-orchestrator.md` (see below) |

### Before dispatching, check the load board

**A terminal that is nearly full is not a free terminal.** It accepts the brief, starts it, gets
compacted halfway through, and verifies at the end with whatever memory it has left — and from the
outside it looks exactly like an empty one. Before handing anyone a brief:

```
node ~/.claude/skills/orq/scripts/orchestrator-control.js load
```

Out comes one row per session with its **real context** (read from its transcript, not estimated),
its percentage, where it is working, and when it was last seen; sorted from fullest to emptiest.

**One single percentage, and it is the one Claude Code shows** *(owner's rule, 2026-09-15)*: the
model's window is **1,000,000 tokens = 100%**. A session at 403,353 tokens reads **40%**, period.
**Your load ceiling** is the **half-height mark** (`warn_tokens` in `orchestrator.config.json`) laid
over that million: today 500,000, i.e. **50%** — not the airbag (`airbag_tokens` = your own
`autoCompactWindow`, today 600,000 = 60%, which is only the safety net that compacts if nobody obeyed
the warning). The last line of the board reads **`terminals under 50%: N`**.

- **If N is 0** — no live terminal below your ceiling — **do not dispatch to any of them.** What you
  do next depends on the **lane size**: if it is **BIG**, open a named terminal yourself (the section
  below); if it is **NORMAL** or a short chunk, launch an `opus` subagent yourself as lane lead
  (`Agent` tool), with the full brief inside. A subagent is born with an empty context; that terminal
  is not.
- A **`?`** means "I could not measure it", not "it is empty": an unmeasured terminal **does not
  count as free**. One marked **`(inactive)`** has gone hours without a signal: it does not count
  either.
- And if you dispatch anyway to one above the ceiling, the `terminal_load` gate will tell you the
  moment you write the brief, with both numbers ("it is at 56% of the million and your ceiling is at
  50%"). It warns, it does not block. The board also comes out inside `status`. *(Fixed on 2026-09-15:
  this used to say 55%, which is the old airbag, not the acceptance ceiling. The ceiling is the
  half-height mark, 50%.)*
- **RAM is load too** *(owner's rule, 09-22)*: work is delegated in parallel, but before launching you
  measure the free RAM and launch at most **one subagent per 3 GB free**; if it does not reach, one at
  a time. Measured on 09-22: 3 lanes with suites left 4.1 GB free.

### Lane size: who measures it, and what changes

**You measure it when writing the brief. Never the lead.** A lane is **BIG** when, by its own size,
a single session would eat through its own context before finishing — and it would then verify at
the end with whatever memory is left, not with what the job needed. Signals, any one of them:

- it touches **more than one package, or more than ~15 files**, of its exclusive list;
- it has **independent pieces** that can be built and verified separately;
- it demands **reading a lot to decide little** (sweeps, long logs, whole suites);
- you estimate **more than 2 hours** of a single session's work.

If it is BIG, the brief says so in its **"Lane size"** block and the lead **loads
`references/mini-orchestrator.md`**: it splits by files with no overlap, launches subagents of equal
or cheaper tier **in parallel**, verifies their sub-receipts, and **hands you ONE receipt**. Your laws
go down one level with it; its receipt is still [D] until you open the evidence. If you do not say
so, the lead loads nothing: **a lead that reorganizes itself without you having sized it is an
ESCALATE IF.**

**Widening = a new brief** *(owner's rule, 09-22)*: a launched brief is NOT widened by message; if more
is needed, you measure the size again and write a new brief (`T<n>-b`) that goes through `validate`; if
it comes out BIG, it carries the mini-orchestrator.

### A BIG lane goes to a NAMED TERMINAL, not a subagent *(2026-09-15)*

**Subagents are for NORMAL lanes and short chunks.** A BIG lane goes to a real terminal, which
**you open and name** (`--name`), and which you talk to via `SendMessage`.

**Why, in one line:** *subagents cannot be measured or handed off* (measured on 2026-09-15) — they do
not show up on the `load` board, so you do not know how much context they have left; they do not
compact with a handoff sheet or handover, so when they fill up there is nobody to hand off to; and
they cannot request an idle notice: *"When a subagent or an agent team teammate sets
`notify_when_idle`, Claude Code makes no subscription and tells it so"* **[V]**, official Claude Code
documentation, `https://code.claude.com/docs/en/cross-session-messaging.md`, section *Get a notice
when another session goes idle → Limits*, read on 2026-09-15. A BIG lane with none of those three
things is a lane that goes dark on you without warning.

**How it is done, in five steps (rule Re11644, 2026-09-24: the orchestrator opens and names the
terminal; before that, the 09-21 decision: the owner opened it. The brief is sent by the orchestrator
through `SendMessage`, never pasted by the owner). Steps 0 to 2 go BEFORE dispatching the brief:**

0. **Once per program, and only if there are going to be lanes in separate terminals: the orchestrator
   has a name** (with subagents it is not needed). In the first dispatch sheet of the program, the
   orchestrator asks the owner: *"in THIS terminal (mine) type `/rename ORQ-<topic>`"*. That name goes
   on the `- **Orchestrator:**` line of every brief dispatched from here. Without a name, the lane has
   nobody to send `STOPPED` to (measured on 09-21: the orchestrator was called `client-app-cd`, an
   automatic name nobody knew).
1. **The orchestrator opens and names the terminal itself** *(rule Re11644, 2026-09-24; before that, the
   09-21 decision: the owner opened it)*. It is ONE command of yours, not a dispatch sheet: the owner no
   longer opens it, no longer types `/rename`, no longer pastes a waiting phrase. The tab is born with
   its name (`--name`) and with a short prompt; **the brief does NOT go in that prompt** (it still goes
   through `SendMessage` in step 3). Three pieces:

   **a) One runner per lane**, a file `.orchestrator/terminals/T<n>.sh` in the orchestrated repo (7
   lines; never the command inline with `;`: a terminal launcher can split the command at every `;`).
   The `unset` is mandatory: without it the tab inherits the child-session mark of yours and keeps no
   history ("Transcript saving is off"):

   ```bash
   #!/usr/bin/env bash
   case ":$PATH:" in *":/usr/bin:"*) ;; *) PATH="/usr/bin:/bin:/mingw64/bin:/opt/homebrew/bin:/usr/local/bin:$PATH";; esac
   unset ANTHROPIC_API_KEY CLAUDECODE CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_SESSION_ID CLAUDE_CODE_MESSAGING_SOCKET CLAUDE_CODE_MESSAGING_TOKEN CLAUDE_PID CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_EXECPATH CLAUDE_CODE_SESSION_ATTENDED
   [ -d "/Users/you/path/to/worktree-T7" ] || { echo "T7: the worktree folder does not exist"; exit 1; }
   cd "/Users/you/path/to/worktree-T7" || { echo "T7: could not enter the worktree folder"; exit 1; }
   claude --model opus --permission-mode auto --name T7-payments-migration 'You are the lead of lane T7. Your brief reaches you by message from the orchestrator ORQ-payments; answer it `READY · T7 · <the name you see in your title bar>` as soon as you receive it and work from the file it points you to. Do not load the orq skill.'
   exec "${SHELL:-/bin/zsh}" -i
   ```

   **On Windows** the runner runs in Git Bash: write its paths in Git Bash form (`/c/path/to/worktree-T7`)
   and end it with `exec bash -i` instead of the `$SHELL` line.

   That short prompt is the literal one, changing only `T7` and `ORQ-payments`. Nothing else in it.
   **Before writing the runner, the lane's name, the orchestrator's, and the window `<topic>` can only
   carry letters without accents, digits and hyphens (`[A-Za-z0-9-]`)**: they go unquoted in the opening
   command and inside single quotes in the prompt, so a space, a `'`, a `;` or a `$(...)` break the
   runner or execute something else. If it does not comply, change the name; do not escape it.

   **Paths are not free-form either (T49).** The worktree folder and the runner path go between double
   quotes: in the runner (`[ -d "…" ]` and `cd "…"`) and in the opening command. Inside bash double
   quotes, `$` and the backtick are still alive (they substitute or execute something else), and a `"`
   closes the quote and splits the argument, in the opening command too. That is why **a worktree path
   or a runner path cannot carry `"`, `$`, a backtick (`` ` ``) or a line break** — and on macOS, for the
   same reason, nor a `'` or a `\` (the AppleScript line below wraps the path in them). Spaces are fine
   (they go between quotes). If the path does not comply, another folder is chosen (another worktree,
   or, for the runner, another folder to keep it in, whose path does comply); it is not escaped. The
   `[ -d … ]` line of the runner checks that the folder exists and, if not, says "the worktree folder
   does not exist" and exits with 1 before reaching `claude`.

   **b) The opening**, from your Bash, ONE new tab/window. Use absolute paths to the system binaries.

   *Windows* (Windows Terminal + Git Bash; tested): one new tab in a window named after the program,
   launched from Git Bash:

   ```bash
   MSYS2_ARG_CONV_EXCL='*' wt.exe -w orq-<topic> new-tab --title T7-payments-migration --startingDirectory "C:\path\to\worktree-T7" "C:\Program Files\Git\usr\bin\bash.exe" -l "C:\path\to\repo\.orchestrator\terminals\T7.sh"
   ```

   `MSYS2_ARG_CONV_EXCL='*'` stops Git Bash from rewriting the paths given to `wt.exe`. On the `wt.exe`
   line the paths go in Windows form (`C:\…`); inside the runner, in Git Bash form (`/c/…`).

   *macOS* — **NOT TESTED ON macOS**: the three variants below are the macOS equivalents of the Windows
   line and nobody has run them on a real Mac yet.

   *Terminal.app* (the one every Mac has):

   ```bash
   /usr/bin/osascript <<'OSA'
   tell application "Terminal"
     activate
     set laneTab to do script "bash '/Users/you/path/to/repo/.orchestrator/terminals/T7.sh'"
     set custom title of laneTab to "T7-payments-migration"
   end tell
   OSA
   ```

   *iTerm2* (if the owner uses it):

   ```bash
   /usr/bin/osascript <<'OSA'
   tell application "iTerm"
     activate
     set laneWindow to (create window with default profile command "bash '/Users/you/path/to/repo/.orchestrator/terminals/T7.sh'")
     tell current session of laneWindow to set name to "T7-payments-migration"
   end tell
   OSA
   ```

   *Plain `open`* (no titles, but the simplest; `chmod +x` the runner first, and it must end in
   `.command` for Finder-style launching, so name it `T7.command` if you use this):

   ```bash
   /usr/bin/open -a Terminal "/Users/you/path/to/repo/.orchestrator/terminals/T7.command"
   ```

   The first time, macOS may ask the owner to allow your terminal to control Terminal/iTerm
   (System Settings → Privacy & Security → Automation); an `osascript` error `-1743` means that consent
   is missing. Read the exit code separately (never behind a `|`).

   **c) The three "nevers"** (the first one is Windows history; the other two apply everywhere):
   - *(Windows only)* never a bare `bash` on the `wt.exe` line: in Windows Terminal `bash` is the WSL
     relay and the tab dies. On macOS the equivalent care is to give the runner by its absolute path
     (`bash '<runner>'`), so the tab does not depend on the shell's `PATH`. **NOT TESTED ON macOS.**
   - **never `--dangerously-skip-permissions`** from a Claude session: the auto-mode classifier denies it
     and it is not worked around; `--permission-mode auto` is enough.
   - **never `haiku`** as the tab's model: it ends up asking for permission (measured 09-24). Lane
     leads are `opus`.

   **Emergency exit:** the opening is attempted ONCE. On Windows, if `wt.exe` fails, check
   `where.exe wt.exe`; if it is missing (or present and failed), hand the owner the exact `wt.exe` line
   from b) to paste in PowerShell (without the `MSYS2_ARG_CONV_EXCL='*'` prefix, which is Git Bash
   only). On macOS, if `osascript` fails, you hand the owner the plain line to paste in their own
   terminal (no `osascript`, no runner needed):

   ```
   cd "/Users/you/path/to/worktree-T7" && claude --model opus --permission-mode auto --name T7-payments-migration 'You are the lead of lane T7. Your brief reaches you by message from the orchestrator ORQ-payments; answer it READY · T7 · <the name you see in your title bar> as soon as you receive it and work from the file it points you to. Do not load the orq skill.'
   ```

   You do not insist. *(Tested on 2026-09-24 on the owner's Windows machine, lane T45, Claude Code
   2.1.282: an Opus tab in `--permission-mode auto` wrote its ack file without asking for permission 30 s
   after opening, and Claude Code's live-sessions registry (`~/.claude/sessions/<pid>.json`) recorded it
   with `"name":"T45-test","nameSource":"user"`, the one from `--name`. Evidence: T45's receipt, in the
   source repo.)* **That evidence is from Windows; on macOS the name, the `--permission-mode auto`, the
   short prompt and the `READY` ack are the same, but the opening command (b) is NOT TESTED ON macOS.**

   **Watch what does NOT get asked of that terminal:** it is **not** told to load this skill. Loading
   it would turn the lead into an orchestrator — and an orchestrator *does not build*, which is
   exactly the opposite of what its lane needs. Its role comes inside its brief; and if the lane is
   BIG, it is the brief itself that orders loading `references/mini-orchestrator.md`, which is the
   piece made for exactly that. *(Caught by Codex `gpt-6-astra` in the 1st round of 2026-09-15, MEDIUM:
   the sheet said "load the skill" and handed it two incompatible roles at once.)*

2. **The orchestrator records and links.** `node
   ~/.claude/skills/orq/scripts/orchestrator-control.js terminal --lane T7
   --name T7-payments-migration`; then `ListAgents` until that name shows up (with a clock, law 4: the
   terminal only appears once it has bound its inbox). If the name that comes out is not the one it
   asked for, send the one that comes out, and that is the one recorded. *(Subcommand `terminal`: built
   by T4.)*
3. **The brief is sent by the orchestrator through `SendMessage`, with `notify_when_idle: true`.** The
   message carries: the absolute path of the brief on disk, the order to open it whole, the lane's
   size, and **the order to answer `READY · T<n> · <name>` before working**. The `READY` ack
   **replaces** the old "test message": it is the channel's positive control (law 3, a zero is not a
   fact until it passes its control). Without `READY` within the deadline you set (say it in the message
   itself), the channel does not exist: it is not assumed, the owner is warned. When the first signal
   from that terminal arrives, `terminal --link T7 --session <id>` (the id comes out in `load`: before
   linking, `terminal --list` only shows "NOT linked", not the id).
4. **Every later message to that lane carries `notify_when_idle: true`.** It is already written in
   "When dispatching to another terminal, subscribe to its idle event" (further down): on 09-21 seven
   later messages were sent to a lane without that flag on any of them.

**The name is `T<n>-<topic>`** — short, no spaces, hyphens. It is the name that the `--name` of step 1 sets
(or `/rename`, which is how the orchestrator gets named) and the one you are going to see: *"A session answers to the name you set with the `/rename` command or the
`--name` flag"* and *"Running `/rename` followed by an unused name at a session's own keyboard gives
that session a name that appears in the output"* **[V]** (same page, section *See which sessions
Claude can reach*). `ListAgents` shows you that same name and `SendMessage` addresses **by name**.
Three measured things that bite:

- **If the name is already held by another live session, Claude Code leaves it with the one that
  already had it and renames the new one to a variant** [V, same section]. That is why the name
  carries the lane number: `T7-…` does not collide with `T3-…`. And that is why step 2 links **the
  name you see**, not the one you asked for: if they do not match, send the one you see.
- **The terminal only appears in the list once it has bound its inbox socket** [V, *"A session
  appears only when it binds an inbox socket"*]. A freshly opened terminal that has not shown up yet
  is not broken: wait and look again, with a clock (law 4).
- **It needs Claude Code v2.1.234 or later** [V, section *Availability*]. If `/list-agents` does not
  exist in that terminal, the whole channel is unavailable: check it with `claude --version`
  **before** building the dispatch on top of it.

### Two command levels: you, and the lane leads

**You do not dispatch tasks to workers: you dispatch LANES to leads.** A lane lead **decomposes its
own task and delegates downward, in parallel**, to cheaper subagents.

**The lead's model is not chosen lane by lane: by default it is Opus** *(owner's rule, 2026-09-02)*,
because its value is in deciding and verifying, not in typing. The tier table below is for **the
subagents it delegates to**, not for it. *(If a lane is purely mechanical — relaunching something,
applying an already-written recipe — it does go down a tier: say so explicitly in its brief and say
why.)*

**Fable is NOT a tier on this scale: it is only the orchestrator** — that is, you. Fable is never
launched to build, either as lane lead or as subagent, **unless the owner orders it in the chat,
recorded with `allow-edit`** (a brief written by you does not replace it). It shares the house's weekly quota: spending it building for everyone is a
waste. *(Measured on 2026-09-02: three lanes launched on Fable, stalled after 3 minutes.)*

```
YOU  (program orchestrator, Fable) — you do not build, you verify and dispatch
 ├── T1 lane lead (OPUS) ──┬── sonnet subagent (build)
 │                          └── haiku  subagent (search, list, extract)
 └── T2 lane lead (OPUS) ──┴── …
```

**Gathering evidence is not verifying.** Sweeps, scans, running the suite, reading files go down a
tier; the only thing that stays with you is the judgment on what they found. An Opus terminal spent
searching files and reading logs is money thrown away, and it is also slower than a cheap subagent
doing it in parallel. Its value is in **deciding, reasoning, and verifying** — not in typing.

| Tier | Model | Who | For | Never for |
|---|---|---|---|---|
| **Top** | `opus` | the lane **lead** | decomposing, reasoning through the hard part (concurrency, permissions, money invariants, deciding whether a test can fail), **verifying what comes back to it**, and assembling ITS lane's result with it | listing, searching, formatting, reading logs · **merging its lane with another one: that is the integration turn, and the orchestrator decides it and does it** (merge only with the owner's recorded permit) |
| **Mid** | `sonnet` | subagent | building the standard stuff, tests, rebases, writing | — |
| **Fast** | `haiku` | subagent | listing, searching, moving, formatting, pulling the errors out of a long log | reasoning about logic, permissions, or money |
| *(off the scale)* | `fable` | **the orchestrator only** | orchestrating and overseeing | **building — unless the owner orders it in the chat, recorded with `allow-edit`** |

**And the lane lead inherits your laws one level down:** what a subagent returns to it is **[D]**,
not **[V]**. It demands `path:line` and **opens the files itself** before building on top.

### Who READS what: the disposable reader *(owner's rule, 2026-09-15)*

Context is the workbench, and it fills up with what gets read, not only with what gets decided.
Neither you nor the lane lead can afford to over-read: **you both fill up the same way.** That is why
whatever has to be read, run, or pasted in full goes to a **disposable reader subagent**: it is born,
it reads, it returns a short summary with paths, and it dies. If it fills up, that is fine.

| Who | Does | Does NOT do |
|---|---|---|
| **Orchestrator** (you) | decide, sample receipts, dispatch, write briefs | run suites, read long logs, read Codex's output in full |
| **Lane lead** (Opus) | decide inside its lane, verify what comes back to it, write the receipt | read long files or run suites itself |
| **Disposable reader** (`haiku`, or `sonnet` if something needs understanding) | open the long file, run the suite, read Codex's or CI's output; return **≤ 30 lines** with `path:line` and the numbers seen | decide anything; never "fix it along the way" |

The prompt for a disposable reader always carries: **what to open** (exact paths), **what to look
for** (the concrete question), **what to return** (fixed format: findings with `path:line`, counted
numbers, and an explicit "not found" with which pattern was used), and **what not to do** (no
editing, no proposing, no summarizing what was not asked for). What it returns is **[D]**: you or the
lead open whichever `path:line` matters before acting on it. **The only reading that stays with the
lead is the final verification of its own lane** (STEP 4.1: if it delegates it, it has to verify
the verifier).

**Say it explicitly in every brief** — it is the first block of the template, not a footnote.

### The right axis is NOT "how hard is it", it is "what does it cost to catch the error"

**A cheap model that needs five review rounds is not cheap.** The real cost of a piece of work is:

> **model × (1 + review rounds) + your time reading each round + the delay to everyone waiting behind
> it**

Going down a tier to "save money" and causing three extra rounds is **more expensive and slower**
than having done it right the first time. And the delay is not paid by that lane alone: it is paid by
the whole queue.

That is why the question when assigning **is not "is this a simple task?"** but **"if it gets it
wrong, does it surface on its own, or does someone have to go looking for it?"**

|  | **CHEAP to catch** <br>(the compiler, the linter, a test catches it, or it is visible at a glance) | **EXPENSIVE to catch** <br>(silent, indirect, or only shows up combined) |
|---|---|---|
| **Mechanical** | **fast** (`haiku`) ✅ | **mid** (`sonnet`) — never fast |
| **Reasoning** | **mid** (`sonnet`) | **top = `opus`** — no exceptions. *Top is Opus, not Fable (owner's rule, 2026-09-02).* |

**What makes an error EXPENSIVE to catch** — if any of these apply, go up a tier:
- **It is silent.** A check that passes without checking, a guardrail that does not guard, a test
  against an empty set. *A false green is worse than a red.*
- **Verification is indirect**: permissions, security, money invariants, concurrency.
- **It only shows up combined** with another lane's work.
- **No tool catches it**: it takes domain understanding to notice.

**And never delegated downward, however mechanical it looks:**
- **Final verification.** If you delegate it, you have to verify the verifier — you have not saved
  anything.
- **Deciding whether a test can fail.** It is the easiest question to get confidently wrong.
- **Anything where a false "fact" is indistinguishable from a real one.**

### Review rounds are a DIAGNOSIS, not just a cost

If review keeps finding things round after round, **look at WHAT KIND of things it finds**:

| What it finds | Means | What you do |
|---|---|---|
| **Basic** misses: cited the wrong file, a test that cannot fail, misread the brief, did not check the obvious | **the model was not up to the task** | **Go up a tier and redo it**, do not keep iterating |
| **Progressively deeper** finds: subtle attack vectors, interactions nobody foresaw | **the task is hard** and the process is working | Keep going — the rounds are the right price |

**Circuit breakers:** starting from the **third round on the same artifact**, stop and decide which of
the two cases it is. Keeping on iterating with a model that is not up to it is the most expensive way
to arrive late.

**And if you misassigned it, say so.** It is dispatch information, not a reproach: next time that
class of task goes up a tier from the start.

#### Codex's rounds do not converge on their own: ONE wide, well-briefed round + ONE targeted *(measured on CLIENT-A, 2026-09-15 and 2026-09-21)*

**[D** — measurement from the CLIENT-A lane on 09-15, collected by the orchestrator; the numbers were not
opened by whoever wrote this reference**]** The rounds were **9 → 5 → 4 → 4 → 0**. The fourth found as
much as the third: the process was not going to end on its own. What closed it on the 5th was scoping
it down to the fix diff. That was the first measurement.

**[D** — second measurement, CLIENT-A lane on 09-21, collected by the orchestrator**]** The rounds were
**7 → 4 → 2 → 0**, and the lane checked that **the 5 serious ones of rounds 2 and 3 were already in the
code of round 1**. In this very skill, T1's round 1 brought **2** findings and another round over the
**same commit** (`302fb02`), with a better brief, brought **10**. Codex does not sweep: it gives what
weighs most on it and stops. Every extra round costs quota and half an hour. Hence the house rule:

> **One wide round, well-briefed (`review --brief <your brief>`). If it brought findings, you fix them
> all and launch ONE targeted confirmation (it comes out scoped on its own). If the targeted one still
> brings findings: STOPPED with the complete list to the orchestrator; the decision (continue / widen /
> split / redo) is its own. Money, migrations or something irreversible may justify two wide ones: the
> brief says so, not the lane.**

*(The `review` subcommand does this by default: round 2 after a round 1 with findings is born scoped to the hunks on its own.)*

*(And `review --help` or `-h` only prints the options and exits: it does not look at the diff, does not write to the ledger and does not launch Codex. Like almost every subcommand, it needs an orchestration in progress: without one it answers "There is no orchestration in progress here" and does nothing.)*

#### And whoever fixes it does not decide whether there is a fourth round *(measured on CLIENT-A, 2026-09-15)*

**[D** — same source: measurement from the CLIENT-A lane on 09-15**]** Law 4 says "on the THIRD pass,
STOP and decide", but the review section of the brief template does not tell the lane that — and a
lane fixed round 3's findings and launched round 4 **before** there was a decision. The rule that
closes that gap, for the lane:

> **If the targeted confirmation still brings findings, STOPPED with the COMPLETE list to the
> orchestrator, without touching anything; the decision (continue / widen / split / redo) is its own.**

---

# STEP 3 — THE BRIEF (template)

**This is where it is won or lost.** A brief that says *"use whichever skills apply"* forces the lane
to redo STEP 1 recon — and it will do it worse, or not at all. **Everything goes resolved and by
name.**

**Full template: `references/brief-template.md`.** Copy it per lane and fill every `<…>`, deleting
nothing. It carries the lane lead's role and its delegation tiers, the exclusive file list, who else
is working, the skills and verification commands already resolved from STEP 1, the chosen toll, the
gates, the decisions already made, the additive rule, the **ESCALATE IF / NEVER YOURS** block, and
the "You are done when" checklist.

**The receipt mirrors the brief.** The lane closes by filling `references/receipt-template.md`, with
the "You are done when" items copied verbatim and their named proof. Before reading a word of prose,
run:

```
node ~/.claude/skills/orq/scripts/orchestrator-control.js validate \
  --lane T<N> --receipt <path to receipt> --brief <path to brief>
```

A receipt that does not mechanically match its brief **goes back unread**.

**Before dispatching, re-read your own brief against STEP 4.3.** That is where most mistakes happen.

**When dispatching to another terminal, subscribe to its idle event** (owner's rule, 2026-09-15): the
`SendMessage` that delivers the brief carries `notify_when_idle: true`, and you repeat that on EVERY
message you send it afterward. That way, the moment the lane finishes its turn — for whatever reason
— an "idle" notice reaches you, and you check whether it is waiting on something legitimate (a merge,
a ruling: it is left waiting) or on an OK it already has (it gets pushed). Without that, a stalled
lane is invisible until the owner looks at its terminal themselves. On the lane's side, the brief template
requires the line `STOPPED · reason · need · from whom` before it goes quiet, waiting included.
