---
description: Grants or revokes the permit for the orchestrator to run git merge or gh pr merge in this orchestration; a lane never merges.
---
# managed-by: orq

The owner asked to grant (or revoke) the MERGE permit. Do EXACTLY this, without explaining anything first:

1. From the root of the orchestrated repo, run, both lines in ONE command (the first one finds the
   skill: as a plugin, Claude Code fills `${CLAUDE_PLUGIN_ROOT}` in with the plugin's absolute folder;
   installed by hand that variable is empty in the shell, so `$ORQ` is `~/.claude/skills/orq`, or the one
   under `$CLAUDE_CONFIG_DIR`; only an absolute folder holding the skill's script is taken (`/…`, or
   `C:/…` under Git Bash), nothing relative to the repo is probed; the shell forgets `$ORQ` between commands, so the line goes in front
   of every `node` below):

```
ORQ="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/orq"; P="${CLAUDE_PLUGIN_ROOT}"; case "$P" in /*) ;; [A-Za-z]:/*) case "$OSTYPE" in msys*|cygwin*) ;; *) P=;; esac;; *) P=;; esac; [ -n "$P" ] && [ -f "$P/scripts/orchestrator-control.js" ] && ORQ="$P"
node "$ORQ/scripts/orchestrator-control.js" allow-git --scope merge --order-from-owner "<hh:mm and the owner's literal words>"
```

   If what the owner typed carries `--revoke`, run this instead (without `--order-from-owner`, revoking doesn't need it):

```
ORQ="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/orq"; P="${CLAUDE_PLUGIN_ROOT}"; case "$P" in /*) ;; [A-Za-z]:/*) case "$OSTYPE" in msys*|cygwin*) ;; *) P=;; esac;; *) P=;; esac; [ -n "$P" ] && [ -f "$P/scripts/orchestrator-control.js" ] && ORQ="$P"
node "$ORQ/scripts/orchestrator-control.js" allow-git --scope merge --revoke
```

2. This permit authorizes the orchestrator to run `git merge` and `gh pr merge`. It is different from the
   git permit (`/orq-git-permit`, which covers commit/push/PR): revoking one does not revoke the other.

3. Rules, in the owner's words:
   - It is not a switch: it is given ONCE per repository and per orchestration, and it holds as long as
     that orchestration stays alive. `--revoke` is the emergency exit, not the normal use.
   - It has no clock of its own: it dies when the program dies (when the orchestration is closed, when it
     is abandoned for 8 h with no events, or when a new program starts).
   - Only the owner gives it, by typing the command: it only grants if the hook saw that same command
     typed by them less than 2 minutes ago in this session. An agent cannot give it to itself. If it
     prints `NOT GRANTED`, that is what it is: there was no keystroke from the owner, ask them to type it
     themselves.
   - Merging is the orchestrator's alone, even with this permit given: a lane never merges, and a
     `git merge` or `gh pr merge` from a lane warns all the same.
   - With a permit, a lane that happened to commit/push does so ONLY on its own exclusive branch and
     worktree: never with `--force`, never deleting branches, and never to `main`, `master` or `develop`.
     That warns even with a permit.
   - This permit is not communicated to the lanes: only the orchestrator uses it, and knowing about it is
     no use to a lane. Revocation takes effect immediately in the gate.
   - It is independent of the Codex review lock: granting this permit does not unlock it, that one
     stands on its own.

4. If the command exits with a code other than 0, or prints `NOT GRANTED`, tell the owner exactly that
   in one line and do not make up that it was granted.

5. Show the owner that they can run:

```
ORQ="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/orq"; P="${CLAUDE_PLUGIN_ROOT}"; case "$P" in /*) ;; [A-Za-z]:/*) case "$OSTYPE" in msys*|cygwin*) ;; *) P=;; esac;; *) P=;; esac; [ -n "$P" ] && [ -f "$P/scripts/orchestrator-control.js" ] && ORQ="$P"
node "$ORQ/scripts/orchestrator-control.js" status
```

   and show them the permit lines that come out there. Answer in 3 lines at most.
