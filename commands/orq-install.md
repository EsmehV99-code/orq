---
description: Installs or checks the orq skill in the Claude Code configuration of whoever uses it (hook plugs, agents and commands).
---
# managed-by: orq

Its owner asked to install (or check) the `orq` skill. Do EXACTLY this, without explaining anything first.

`<skill>` is the skill's folder: `~/.claude/skills/orq`, or `$CLAUDE_CONFIG_DIR/skills/orq` if that variable is set. On macOS `~` is `/Users/<you>`; on Windows write the full path with `/` slashes and between quotes.

1. Run:

```
node "<skill>/scripts/install.js"
```

   First time: this command is not yet in `~/.claude/commands/`, so follow this same file by reading it from `<skill>/commands/orq-install.md`, or have its owner run that `node` from their terminal.

2. If it exits with code 1 (broken JSON, no permission, the file changed while it was being read; the cause is on the `STOP: ...` line, or, if it could not copy agents or commands, on the `3. Not done:` line of the summary): do NOT try to fix `settings.json` or any other file. Tell its owner that line, literally, and stop there.

3. If it exits with code 0, run:

```
node "<skill>/scripts/install.js" --check
```

   and paste its result as is. Its code: 0 everything is there, 1 something is missing or differs, 2 could not check.

4. Tell its owner the 5 lines of the `SUMMARY (for you):` block of the installer, copied, without rewriting them. Add that they should open a NEW terminal inside a git repo and type `/orq` to see "Orchestration RUNNING" (a terminal that is already open does not re-read `settings.json`).

5. If its owner only asks "check the installation" (or similar), do NOT install: run only the `--check` of point 3 and paste the result.

6. Autocompact: the installer does NOT write it. If its output carries the autocompact warning, do NOT edit `settings.json` yourself: pass the warning on to its owner; the decision is theirs.

7. If `settings.json` is a symbolic link (common with dotfiles on macOS), the installer writes the file the link points to and leaves the link as it is; do not replace the link by a file yourself.

8. Uninstalling or `--revoke` does NOT exist. If you are asked for it, say that the skill deletes nothing from `settings.json` (neither plugs, nor installed agents, nor commands) and that it is removed by hand: the sync never deletes.
