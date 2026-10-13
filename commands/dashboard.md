---
description: Opens THIS terminal's orchestration dashboard (a snapshot of the state right now) in the owner's browser. Only when they ask for it.
---
# managed-by: orq

The owner asked to see the dashboard. Do EXACTLY this, with no explanation beforehand:

1. From the root of the orchestrated repo (where the skill was loaded), run:

```
node "$HOME/.claude/skills/orq/scripts/dashboard.js" --open
```

   It generates `<repo>/.orchestrator/dashboard.html` with the state as of NOW and opens it in
   their browser. It's a snapshot: it doesn't update itself. If they want another one, they type
   `/dashboard` again.

2. If the command exits with code 2 ("no ledger"), tell them in one line that there's no
   orchestration running in this folder (the skill wasn't loaded here) and don't open anything.

3. Reply with AT MOST TWO lines: which program it is (the `DASHBOARD:` line the command prints)
   and "it's a snapshot as of now; for another one, /dashboard".

Don't leave it watching, don't open anything on your own at some other time: the dashboard shows
up ONLY when the owner types `/dashboard` (owner's rule, 2026-09-17).
