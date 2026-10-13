---
description: Grants or revokes the permit for a lane to run git commit, git push and open a PR in this orchestration.
---
# managed-by: orq

The owner asked to grant (or revoke) the GIT permit. Do EXACTLY this, without explaining anything first:

1. From the root of the orchestrated repo, run (the script lives at
   `~/.claude/skills/orq/scripts/orchestrator-control.js`; if the skill is installed somewhere else,
   use the folder where this skill's `SKILL.md` is — e.g. `$CLAUDE_CONFIG_DIR/skills/orq/`):

```
node ~/.claude/skills/orq/scripts/orchestrator-control.js allow-git --scope git --order-from-owner "<hh:mm and the owner's literal words>"
```

   If what the owner typed carries `--revoke`, run this instead (without `--order-from-owner`, revoking doesn't need it):

```
node ~/.claude/skills/orq/scripts/orchestrator-control.js allow-git --scope git --revoke
```

2. This permit authorizes `git commit`, `git push` and opening a PR (`gh pr create`). It is different from
   the merge permit (`/orq-merge-permit`): revoking one does not revoke the other.

3. Rules, in the owner's words:
   - It is not a switch: it is given ONCE per repository and per orchestration, and it holds as long as
     that orchestration stays alive. `--revoke` is the emergency exit, not the normal use.
   - It has no clock of its own: it dies when the program dies (when the orchestration is closed, when it
     is abandoned for 8 h with no events, or when a new program starts).
   - Only the owner gives it, by typing the command: it only grants if the hook saw that same command
     typed by them less than 2 minutes ago in this session. An agent cannot give it to itself. If it
     prints `NOT GRANTED`, that is what it is: there was no keystroke from the owner, ask them to type it
     themselves.
   - With a permit, a lane commits and pushes ONLY on its own exclusive branch and worktree: never with
     `--force`, never deleting branches, and never to `main`, `master` or `develop`. That warns even
     with a permit.
   - Merging stays the orchestrator's: a `git merge` or `gh pr merge` from a lane warns even with a git
     permit.
   - Lanes that are already working do not find out on their own that it was granted: the orchestrator
     tells them by message or in the next brief. Revocation, on the other hand, takes effect immediately.
   - It is independent of the Codex review lock: granting this permit does not unlock it, that one
     stands on its own.

4. If the command exits with a code other than 0, or prints `NOT GRANTED`, tell the owner exactly that
   in one line and do not make up that it was granted.

5. Show the owner that they can run:

```
node ~/.claude/skills/orq/scripts/orchestrator-control.js status
```

   and show them the permit lines that come out there. Answer in 3 lines at most.
