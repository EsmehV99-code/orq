# Changelog

What you will notice in each release, in plain words, written for the person who uses the skill.

## 1.0.0 — 2026-10-13 — First public release

### What you can type

- `/orq` — the skill itself: turns this terminal into the orchestrator and starts the orchestration in that repository.
- `/orq-install` — installs the skill into your Claude Code setup, or only checks it with `--check` · so you do not wire anything by hand.
- `/orq-git-permit` and `/orq-merge-permit` — give or take back the permission to commit, push and open pull requests, and the permission to merge · granted once per repository and per orchestration, only by you.
- `/orq-batch-closed` — closes a batch in one command: checks nothing is still alive, cleans what was merged, audits and stops the pulse · so closing is a checklist, not memory.
- `/dashboard` — a snapshot of the orchestration in your browser · so you can look without asking.

### What the skill does on its own

- Installs its agents and commands into your setup when it loads, and tells you it did.
- Warns about context memory and about autocompact, and never rewrites your autocompact setting · it warns, you decide.
- Brakes the orchestrator when it starts building instead of coordinating · its job is to verify and hand out work.
- Lets a new orchestrator take over command, permits and rules from the previous one · so a restart does not lose the thread.
- Warns when someone runs `git stash` in a shared repository · it can swallow a colleague's work.
- Measures the overlap between lanes itself instead of trusting a lane's word.
- Keeps "I checked" ([V]) and "someone told me" ([D]) apart, and flags a [V] written without opening anything.
- Flags a "zero results" that never passed its positive control · a zero is only a fact after its control.
- Flags a lane that goes silent without a STOPPED or DONE line · silence looks the same as progress.
- Ties every launched subagent to its brief and flags an edit outside the brief's scope.
- Does not call a red test yours until it is compared with the baseline.
- Refuses to close a program while lanes are still alive.
- Runs the Codex review (optional, if you have Codex CLI) in rounds and will not count a review that skipped something as a pass.
- Opens the terminal of a BIG lane itself.
- Copies each lane's evidence (tests, measurements, the reason behind each decision) into the repository · so the proof outlives the session.

### Installation

- One installer (`scripts/install.js`) merges the 12 hooks into your `settings.json`, with a backup copy first; running it twice duplicates nothing; a broken JSON stops it without touching anything.

### Platforms

Built and tested on Windows. macOS is supported in the code and simulated in the tests, but NOT TESTED ON macOS on a real machine yet.
