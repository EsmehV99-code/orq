# managed-by: orq
#!/usr/bin/env bash
# claude-trust-paths.sh — pre-populate Claude Code workspace-trust for dirs so
# spawned `claude` sessions skip the "Do you trust the files in this folder?"
# dialog. Bundled with the splittasks skill (orq); run it with `bash`, it needs no exec bit.
#
# Usage: claude-trust-paths.sh <path> [<path> ...]
# Writes hasTrustDialogAccepted:true + hasCompletedProjectOnboarding:true into
# ~/.claude.json under projects[<windows-path>], holding ~/.claude.json.lock
# (a directory — proper-lockfile compatible) for the update. Preserves all other
# content and the file's 2-space pretty formatting. Exit 0 ok; non-zero = failure
# (caller decides WARN vs FATAL per SPLITTASKS_AUTONOMOUS).
#
# Test hook: set CLAUDE_TRUST_JSON to target a copy instead of the real file.
set -u

JSON="${CLAUDE_TRUST_JSON:-$HOME/.claude.json}"
LOCK="$JSON.lock"

if [ "$#" -lt 1 ]; then
  echo "[claude-trust-paths] usage: $(basename "$0") <path> [<path> ...]" >&2
  exit 2
fi
if [ ! -f "$JSON" ]; then
  echo "[claude-trust-paths] not found: $JSON" >&2
  exit 3
fi

# On Windows, Claude Code keys projects[] with native Windows paths. Observed:
# the SAME worktree appears under both a backslash form (C:\Users\..) and a
# forward-slash form (C:/Users/..) depending on how the worker's `claude` process
# resolved its cwd. To guarantee a match either way, we pre-trust BOTH forms.
# (Extra keys are harmless — Claude ignores any that don't match its actual cwd.)
to_win()   { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }  # backslash
to_mixed() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }  # forward-slash

paths_win=""
for p in "$@"; do
  paths_win+="$(to_win "$p")"$'\n'
  paths_win+="$(to_mixed "$p")"$'\n'
done
export CLAUDE_JSON_WIN="$(to_win "$JSON")"

# Acquire lock: mkdir is atomic and matches proper-lockfile's <file>.lock DIR.
acquired=0
i=0
while [ "$i" -lt 100 ]; do
  if mkdir "$LOCK" 2>/dev/null; then acquired=1; break; fi
  sleep 0.1
  i=$((i + 1))
done
if [ "$acquired" -ne 1 ]; then
  echo "[claude-trust-paths] could not acquire lock $LOCK after ~10s" >&2
  exit 4
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

printf '%s' "$paths_win" | node -e '
const fs = require("fs");
const file = process.env.CLAUDE_JSON_WIN;
let data = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", function (d) { data += d; });
process.stdin.on("end", function () {
  const paths = data.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
  let j;
  try { j = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { console.error("[claude-trust-paths] JSON parse error: " + e.message); process.exit(1); }
  if (!j.projects || typeof j.projects !== "object") j.projects = {};
  let n = 0;
  for (const p of paths) {
    if (!j.projects[p] || typeof j.projects[p] !== "object") j.projects[p] = {};
    j.projects[p].hasTrustDialogAccepted = true;
    j.projects[p].hasCompletedProjectOnboarding = true;
    n++;
  }
  const tmp = file + ".tmp-trust";
  try {
    fs.writeFileSync(tmp, JSON.stringify(j, null, 2));
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error("[claude-trust-paths] write error: " + e.message);
    try { fs.unlinkSync(tmp); } catch (_) {}
    process.exit(1);
  }
  console.error("[claude-trust-paths] trusted " + n + " path(s)");
});
'
rc=$?
[ "$rc" -eq 0 ] || { echo "[claude-trust-paths] node update failed (rc=$rc)" >&2; exit 5; }
exit 0
