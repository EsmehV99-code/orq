---
description: Opens THIS terminal's orchestration dashboard (a snapshot of the state right now) in the owner's browser. Only when they ask for it.
---
# managed-by: orq

The owner asked to see the dashboard. Do EXACTLY this, with no explanation beforehand:

1. From the root of the orchestrated repo (where the skill was loaded), run, both lines in ONE
   command (the shell forgets `$ORQ` between commands):

```
ORQ="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/orq"; P="${CLAUDE_PLUGIN_ROOT}"; case "$P" in /*) ;; [A-Za-z]:/*) case "$OSTYPE" in msys*|cygwin*) ;; *) P=;; esac;; *) P=;; esac; [ -n "$P" ] && [ -f "$P/scripts/orchestrator-control.js" ] && ORQ="$P"
node "$ORQ/scripts/dashboard.js" --open
```

   The first line finds the skill: as a plugin, Claude Code fills `${CLAUDE_PLUGIN_ROOT}` in with the
   plugin's absolute folder; installed by hand that variable is empty in the shell, so `$ORQ` is
   `~/.claude/skills/orq` (or the one under `$CLAUDE_CONFIG_DIR`). Only an absolute folder that holds
   the skill's script is taken (`/…`, or `C:/…` under Git Bash): nothing relative to the repo is ever probed.

   It generates `<repo>/.orchestrator/dashboard.html` with the state as of NOW and opens it in
   their browser. It's a snapshot: it doesn't update itself. If they want another one, they type
   `/dashboard` again.

2. If the command exits with code 2 ("no ledger"), tell them in one line that there's no
   orchestration running in this folder (the skill wasn't loaded here) and don't open anything.

3. Reply with AT MOST TWO lines: which program it is (the `DASHBOARD:` line the command prints)
   and "it's a snapshot as of now; for another one, /dashboard".

Don't leave it watching, don't open anything on your own at some other time: the dashboard shows
up ONLY when the owner types `/dashboard` (owner's rule, 2026-09-17).
