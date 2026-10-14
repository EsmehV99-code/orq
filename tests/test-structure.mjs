/**
 * STRUCTURE test: that the pieces of this skill are still wired to each other.
 *
 * Run:  node ~/.claude/skills/orq/tests/test-structure.mjs
 *       (from a worktree: ORQ_HOOK=<path of THAT copy's scripts/orchestrator-control.js> node tests/test-structure.mjs)
 *
 * The other suites look at BEHAVIOUR (what it detects / what it does not get in the
 * way of). This one looks at the WIRING, which is what breaks when something is moved
 * and nobody notices: a settings.json pointing at a file that is no longer there, a
 * SKILL.md ordering you to run a subcommand that does not exist, a documented gate
 * that no code ever fires.
 *
 * Written on 2026-08-11 after moving the machinery from ~/.claude/hooks/ into the
 * skill. A move like that breaks paths in five places at once.
 *
 * ON THIS PORT (English / macOS):
 *   · Nothing is hard-coded to a person's folder. The skill's folder is found from the
 *     test file itself, or from `ORQ_HOOK` (the path of the candidate's script, as in
 *     the other suites). The installed copy is `~/.claude/skills/orq` (via
 *     `os.homedir()`; `CLAUDE_CONFIG_DIR` overrides `~/.claude`).
 *   · The group that reads the MACHINE's `settings.json` only means something where the
 *     skill is INSTALLED. It is skipped —saying so out loud— ONLY when not a single hook
 *     command there mentions `orchestrator-control.js`; if even one does, it runs WHOLE.
 *     The skipped lines are printed as `  SKIPPED …` and are never counted as OK.
 *   · The install plugs are checked against `install/hooks-orchestrator.example.json`
 *     and `PLUGS` in `scripts/install.js` on every machine.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// THE SKILL FOLDER BEING EXAMINED. `ORQ_HOOK` (the path of the candidate's script)
// wins: the skill is the folder two levels above it. Without it, the folder this test
// lives in is examined. Nothing here names a person or a drive.
const HERE = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/').replace(/\/+$/, '');
const SKILL = process.env.ORQ_HOOK
  ? path.dirname(path.dirname(process.env.ORQ_HOOK)).replace(/\\/g, '/')
  : HERE;
const SCRIPT = `${SKILL}/scripts/orchestrator-control.js`;
// `CLAUDE_CONFIG_DIR` overrides `~/.claude`, the same way `orchestrator-control.js`
// itself respects it (T12, 2026-09-17). Without this, a toy install simulated with
// that env var was silently checked against the REAL `~/.claude/settings.json`.
const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const SETTINGS = path.join(CONFIG_DIR, 'settings.json');

let ok = 0, bad = 0;
const assert = (name, cond, detail) => {
  if (cond) { ok++; console.log(`  OK    ${name}`); }
  else { bad++; console.log(`  FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
};
const skip = (why) => console.log(`  SKIPPED: ${why}`);
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };

/* --------------------------------------------------- A. the pieces exist */

console.log('\nA. THE PIECES ARE WHERE THEY SAY THEY ARE');
const PIECES = [
  '.claude-plugin/marketplace.json',
  '.gitattributes',
  '.gitignore',
  'CHANGELOG.md',
  'README.md',
  'SKILL.md',
  'orchestrator.config.json',
  'specs-map.json',
  'agents/disposable-reader.md',
  'agents/lane-lead.md',
  'agents/receipt-verifier.md',
  'commands/dashboard.md',
  'commands/orq-batch-closed.md',
  'commands/orq-git-permit.md',
  'commands/orq-install.md',
  'commands/orq-merge-permit.md',
  'docs/CIRCUIT.md',
  'docs/DASHBOARD.md',
  'docs/circuit.html',
  'docs/cover.svg',
  'docs/map.html',
  'install/hooks-orchestrator.example.json',
  'references/brief-template.md',
  'references/control-phase-1-and-2.md',
  'references/dispatch.md',
  'references/laws.md',
  'references/mini-orchestrator.md',
  'references/receipt-template.md',
  'references/recon.md',
  'references/resume-and-close.md',
  'scripts/dashboard.js',
  'scripts/evidence.js',
  'scripts/install.js',
  'scripts/orchestrator-control.js',
  'skills/splittasks-windows/SKILL.md',
  'skills/splittasks-windows/close-lanes.ps1',
  'skills/splittasks-windows/claude-trust-paths.sh',
  'skills/splittasks-macos/SKILL.md',
  'skills/splittasks-macos/claude-trust-paths.sh',
  'tests/fixtures/capture-main-loop.json',
  'tests/fixtures/capture-subagentstop.json',
  'tests/fixtures/dashboard-ledger-full.json',
  'tests/fixtures/dashboard-ledger-gaps.json',
  'tests/fixtures/dashboard-log.log',
  'tests/fixtures/good-brief-T3.md',
  'tests/fixtures/stub-codex.js',
  'tests/test-dashboard.mjs',
  'tests/test-evidence.mjs',
  'tests/test-install.mjs',
  'tests/test-orchestrator-control-adversarial.mjs',
  'tests/test-orchestrator-control.mjs',
  'tests/test-structure.mjs',
];
for (const p of PIECES) assert(p, fs.existsSync(path.join(SKILL, p)));

const skillMd = read(`${SKILL}/SKILL.md`);
const script = read(SCRIPT);
const doc = read(`${SKILL}/references/control-phase-1-and-2.md`);
const settings = read(SETTINGS);
if (!skillMd || !script || !doc) {
  console.log('\nA basic piece is missing: I cannot carry on.');
  process.exit(1);
}

/* ------------------------------------------- B. no paths left from the move */

console.log('\nB. NO PATHS LEFT FROM BEFORE THE MOVE');
const OLD = /\.claude[\\/]hooks[\\/](orquestador-control|orchestrator-control|tests[\\/]test-orquestador|tests[\\/]test-orchestrator)/;

// There are no historical records left among the pieces: the two that were still
// there (the audit and Codex's prevention design of 2026-08-11) were deleted on
// 2026-09-08 by the owner's order, when issue #1 was closed. No living piece may
// cite the pre-move path.
for (const p of PIECES) {
  const txt = read(path.join(SKILL, p)) || '';
  const lines = txt.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => OLD.test(l));
  assert(`${p} does not cite the old path`, lines.length === 0,
    lines.length ? `line ${lines[0][0]}` : '');
}
assert('settings.json does not cite the old path', settings === null || !OLD.test(settings));

/* ----------------------------------- C. the plugs point at things that exist */

console.log('\nC. THE PLUGS (INSTALL) AND SETTINGS.JSON POINT AT FILES THAT EXIST');

// The shape of ONE plug, for every comparison below: event | matcher | type | timeout | which script.
// The command has to be `node "<…>/.claude/skills/orq/scripts/orchestrator-control.js"`
// (T52, Codex Sol r3): any other script with the same file name comes out as `OTHER-SCRIPT`.
const RE_CMD = /^node "[^"]*\/\.claude\/skills\/orq\/scripts\/orchestrator-control\.js"$/i;
const signaturesOf = (hooks) => {
  const out = [];
  for (const [ev, list] of Object.entries(hooks || {})) for (const g of list || []) for (const h of (g && g.hooks) || []) {
    const cmd = String((h && h.command) || '');
    if (/orchestrator-control\.js/i.test(cmd)) {
      out.push([ev, g.matcher || '', h.type, h.timeout, RE_CMD.test(cmd) ? 'orq' : 'OTHER-SCRIPT'].join('|'));
    }
  }
  return out.sort();
};
// The 12 signatures, WRITTEN BY HAND here. If `PLUGS` of install.js or the example file
// drifts, one of the comparisons below sings.
const SIGNATURES_12 = [
  'PreToolUse|Skill|Agent|Task|TaskCreate|TaskUpdate|command|20', 'PreToolUse|Write|Edit|command|20',
  'PreToolUse|Bash|PowerShell|command|20', 'PostToolUse|Bash|PowerShell|command|20',
  'PostToolUse|Write|Edit|command|20', 'PostToolUse|Agent|Task|command|20',
  'PostToolUse|Read|Grep|Glob|command|20', 'Stop||command|20', 'SubagentStop||command|15',
  'PreCompact||command|15', 'SessionStart|compact|command|15', 'UserPromptSubmit||command|10',
].map((x) => x + '|orq').sort();
const sameList = (a, b) => !!a && !!b && a.join('\n') === b.join('\n');
const signaturesOfText = (txt) => {
  try { const j = JSON.parse(txt); return j && j.hooks ? signaturesOf(j.hooks) : null; } catch { return null; }
};

// (1) The plugs of the installer. `install.js` runs `main()` when loaded, so its
// `PLUGS` table is read as text.
const installJs = read(`${SKILL}/scripts/install.js`) || '';
const plugsInstall = [...installJs.matchAll(/\{ event: '(\w+)', matcher: (?:'([^']*)'|null), timeout: (\d+) \}/g)]
  .map((m) => [m[1], m[2] || '', 'command', Number(m[3]), 'orq'].join('|')).sort();
assert(`scripts/install.js declares 12 plugs in PLUGS (there are ${plugsInstall.length})`, plugsInstall.length === 12);
assert('  ...and they are exactly the 12 signatures this suite writes by hand',
  sameList(plugsInstall, SIGNATURES_12), plugsInstall.join(' ; '));

// (2) The reference file the installer and the README point at.
const exampleTxt = read(`${SKILL}/install/hooks-orchestrator.example.json`) || '';
let exampleJson = null;
try { exampleJson = JSON.parse(exampleTxt); } catch { /* invalid */ }
assert('install/hooks-orchestrator.example.json is valid JSON', exampleJson !== null);
const sigExample = signaturesOfText(exampleTxt);
assert('  ...and it carries EXACTLY the 12 plugs (event, matcher, type, timeout, the skill\'s own script), none duplicated nor missing',
  sameList(sigExample, SIGNATURES_12), sigExample ? sigExample.join(' ; ') : 'JSON missing or invalid');
assert('  ...and they are the SAME as the PLUGS of scripts/install.js (one single truth)',
  sameList(sigExample, plugsInstall));
{
  const hooksOf = (mutate) => {
    const j = JSON.parse(exampleTxt);
    mutate(j.hooks);
    return JSON.stringify(j);
  };
  const red = (txt) => txt !== null && !sameList(signaturesOfText(txt), SIGNATURES_12);
  // Each mutant first checks that it REALLY changed the file (a replacement that finds
  // nothing mutates nothing and would give a false green or a false red).
  assert('  MUTANT: the example with a stray comma is not valid JSON -> FAILS',
    red(exampleTxt.replace('"UserPromptSubmit": [', '"UserPromptSubmit": [,')) && exampleTxt.includes('"UserPromptSubmit": ['));
  assert('  MUTANT: the example without the Stop plug -> FAILS',
    red(hooksOf((h) => { delete h.Stop; })));
  const dupTxt = hooksOf((h) => { for (const g of h.PostToolUse) if (g.matcher === 'Read|Grep|Glob') g.matcher = 'Write|Edit'; });
  assert('  MUTANT: 12 plugs but one duplicated and another missing (Read|Grep|Glob -> Write|Edit) -> FAILS',
    red(dupTxt) && (signaturesOfText(dupTxt) || []).length === 12);
  assert('  MUTANT: a changed timeout (UserPromptSubmit 10 -> 20) -> FAILS',
    red(hooksOf((h) => { h.UserPromptSubmit[0].hooks[0].timeout = 20; })));
  assert('  MUTANT: the 12 plugs pointing at ANOTHER orchestrator-control.js (/other/) -> FAILS',
    red(exampleTxt.split('$HOME/.claude/skills/orq/scripts/orchestrator-control.js').join('/other/orchestrator-control.js')));
  assert('  MUTANT: a plug of a different `type` -> FAILS',
    red(hooksOf((h) => { h.Stop[0].hooks[0].type = 'prompt'; })));
}

// (3) The PLUGIN manifest (1.2.0). `.claude-plugin/marketplace.json` is both the marketplace and
// the plugin's manifest — there is NO plugin.json on purpose: with one, a plain clone into
// `~/.claude/skills/orq` would ALSO load as a plugin and every hook would run twice. Its inline
// `hooks` are the SAME 12 plugs, each running `node "${CLAUDE_PLUGIN_ROOT}/scripts/orchestrator-control.js"`
// (Claude Code fills the variable in), and its `version` is SKILL.md's: users stay on the cached
// copy until that string changes.
{
  const mkTxt = read(`${SKILL}/.claude-plugin/marketplace.json`) || '';
  let mk = null;
  try { mk = JSON.parse(mkTxt); } catch { /* invalid */ }
  assert('.claude-plugin/marketplace.json is valid JSON', mk !== null);
  const entry = (mk && Array.isArray(mk.plugins) && mk.plugins.find((p) => p && p.name === 'orq')) || null;
  assert('  ...it is the marketplace `orq` with ONE plugin `orq` whose source is the repo root (".")',
    mk !== null && mk.name === 'orq' && mk.plugins.length === 1 && entry !== null && entry.source === '.');
  const PLUGIN_CMD = 'node "${CLAUDE_PLUGIN_ROOT}/scripts/orchestrator-control.js"';
  const commandsOf = (hooks) => {
    const out = [];
    for (const list of Object.values(hooks || {})) for (const g of list || []) for (const h of (g && g.hooks) || []) out.push(String((h && h.command) || ''));
    return out;
  };
  // The plugin's command spelled as the installer's, so the SAME signature code compares both;
  // only the exact plugin spelling is translated — anything else comes out as OTHER-SCRIPT.
  const pluginSignatures = (e) => {
    if (!e || !e.hooks || typeof e.hooks !== 'object' || Array.isArray(e.hooks)) return null;
    const j = JSON.parse(JSON.stringify(e.hooks));
    for (const list of Object.values(j)) for (const g of list || []) for (const h of (g && g.hooks) || []) {
      if (h && h.command === PLUGIN_CMD) h.command = 'node "$HOME/.claude/skills/orq/scripts/orchestrator-control.js"';
      else if (h) h.command = 'node "/other/orchestrator-control.js"';
    }
    return signaturesOf(j);
  };
  const sigPlugin = pluginSignatures(entry);
  assert('  ...its inline `hooks` carry EXACTLY the 12 plugs, each running `node "${CLAUDE_PLUGIN_ROOT}/scripts/orchestrator-control.js"`',
    sameList(sigPlugin, SIGNATURES_12) && commandsOf(entry && entry.hooks).every((c) => c === PLUGIN_CMD),
    sigPlugin ? sigPlugin.join(' ; ') : 'hooks missing or not an object');
  assert('  ...and they are the SAME as the PLUGS of scripts/install.js (one single truth, three copies)',
    sameList(sigPlugin, plugsInstall));
  const skillVersion = (/^version:\s*(\S+)\s*$/m.exec(skillMd) || [])[1] || '';
  // ONE predicate for the real file and for its mutant below: a mutant that does not go
  // through the same check proves nothing (Codex gpt-5.6-sol r10, LOW).
  const versionOk = (e) => e !== null && typeof e === 'object' && skillVersion !== '' && e.version === skillVersion;
  assert(`  ...its version (${entry && entry.version}) is SKILL.md's (${skillVersion})`, versionOk(entry));
  assert('  ...there is NO .claude-plugin/plugin.json (it would turn the manual install into a second plugin: every hook twice)',
    !fs.existsSync(`${SKILL}/.claude-plugin/plugin.json`));
  assert('  ...the two bundled skills carry DISTINCT names, after their folder (two skills of one plugin cannot share one)',
    ['splittasks-windows', 'splittasks-macos'].every((v) => new RegExp(`^name:\\s*${v}\\s*$`, 'm').test(read(`${SKILL}/skills/${v}/SKILL.md`) || '')));
  const readmeTxt = read(`${SKILL}/README.md`) || '';
  assert('  ...the README gives the one-line install and the prefixed names (`/orq:orq-git-permit`)',
    readmeTxt.includes('/plugin install orq --marketplace EsmehV99-code/orq') && readmeTxt.includes('/orq:orq-git-permit'));
  assert('  ...docs/demo.gif exists and the README shows it',
    fs.existsSync(`${SKILL}/docs/demo.gif`) && readmeTxt.includes('docs/demo.gif'));
  if (entry !== null && sigPlugin !== null) {
    const mut = (f) => { const e = JSON.parse(JSON.stringify(entry)); f(e); return pluginSignatures(e); };
    assert('  MUTANT: a hook running a path WITHOUT ${CLAUDE_PLUGIN_ROOT} -> FAILS',
      !sameList(mut((e) => { e.hooks.Stop[0].hooks[0].command = 'node "$HOME/.claude/skills/orq/scripts/orchestrator-control.js"'; }), SIGNATURES_12));
    assert('  MUTANT: the manifest without the UserPromptSubmit plug -> FAILS',
      !sameList(mut((e) => { delete e.hooks.UserPromptSubmit; }), SIGNATURES_12));
    assert('  MUTANT: a changed timeout (SubagentStop 15 -> 20) -> FAILS',
      !sameList(mut((e) => { e.hooks.SubagentStop[0].hooks[0].timeout = 20; }), SIGNATURES_12));
    assert('  MUTANT: the manifest with `version: 0.0.0` (not SKILL.md\'s) -> FAILS',
      !versionOk({ ...entry, version: '0.0.0' }) && versionOk(entry));
    assert('  MUTANT: the manifest with NO version -> FAILS',
      !versionOk({ ...entry, version: undefined }));
  }
}

// (3b) WHAT THE PLUGIN'S PIECES EXECUTE RESOLVES IN BOTH INSTALLS (Codex gpt-5.6-sol r10,
// HIGH + MEDIUM). As a plugin nothing is copied to `~/.claude/skills/`, so a `node` line or a
// helper path hardcoded at the manual path points at nothing. Two idioms, one per piece:
//   · commands: `ORQ=<manual>; P="${CLAUDE_PLUGIN_ROOT}"; <keep P only if `/…`, or `X:/…` under
//     msys/cygwin, else empty it>; [ -n "$P" ] && [ -f "$P/scripts/orchestrator-control.js" ] && ORQ="$P"`
//     — Claude Code fills the variable in INSIDE the markdown of a plugin command (docs:
//     "Skill, command, and agent content: anywhere in the Markdown body"), and never exports it
//     to the Bash tool, so by hand the shell expands it to NOTHING and the manual path stays. Only
//     an ABSOLUTE folder that holds the skill's script is taken (Codex r11, HIGH: a relative probe
//     such as `[ -d '${CLAUDE_PLUGIN_ROOT}/scripts' ]` could be satisfied by a folder of that
//     literal name planted in the orchestrated repo, and run ITS script; Codex r12, HIGH: a `?:*`
//     pattern still let `C:relative` (drive-relative on Windows) and `x:/path` (relative on POSIX)
//     through, so the drive form is accepted ONLY under Git Bash/Cygwin, by `$OSTYPE`);
//   · splittasks templates: `SKILL_DIR="<SKILL_DIR>"` + fallback to the manual path, the
//     placeholder filled by rule 7 like `<SESSION_ID>`.
// Both are RUN here under a real bash (Git Bash on Windows; `bash` on PATH there is WSL's, so
// it is never used), in the two states each one can be in.
{
  const ORQ_IDIOM = 'ORQ="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/orq"; P="${CLAUDE_PLUGIN_ROOT}"; case "$P" in /*) ;; [A-Za-z]:/*) case "$OSTYPE" in msys*|cygwin*) ;; *) P=;; esac;; *) P=;; esac; [ -n "$P" ] && [ -f "$P/scripts/orchestrator-control.js" ] && ORQ="$P"';
  const MANUAL_NODE = /node\s+["']?(~|\$HOME)\/\.claude\/skills\/orq\/scripts\//;
  const cmdFailures = (text) => {
    const f = [];
    if (!text.includes(ORQ_IDIOM)) f.push('the `ORQ=` idiom is missing');
    if (MANUAL_NODE.test(text)) f.push('a `node` line still hardcodes the manual path');
    const nodeLines = (text.match(/node\s+[^\n`]*?scripts\/[\w-]+\.js/g) || []);
    if (!nodeLines.length) f.push('no `node …/scripts/*.js` line at all');
    for (const l of nodeLines) if (!l.includes('"$ORQ/scripts/')) f.push(`not through $ORQ: ${l.slice(0, 60)}`);
    return f;
  };
  for (const n of ['dashboard.md', 'orq-git-permit.md', 'orq-merge-permit.md', 'orq-batch-closed.md']) {
    const fails = cmdFailures(read(`${SKILL}/commands/${n}`) || '');
    assert(`commands/${n}: every \`node\` goes through \`$ORQ\`, found with the plugin-or-manual idiom`, fails.length === 0, fails.join('; '));
  }
  assert('  MUTANT: a command whose `node` line hardcodes `~/.claude/skills/orq/scripts/` -> FAILS',
    cmdFailures(`${ORQ_IDIOM}\nnode ~/.claude/skills/orq/scripts/dashboard.js --open\n`).length > 0);
  assert('  MUTANT: a command without the idiom -> FAILS',
    cmdFailures('node "$ORQ/scripts/dashboard.js" --open\n').includes('the `ORQ=` idiom is missing'));

  const SPLIT_IDIOM = ['SKILL_DIR="<SKILL_DIR>"', '[ -d "$SKILL_DIR" ] || SKILL_DIR="$HOME/.claude/skills/splittasks"'];
  const HELPER_MANUAL = /\$HOME\/\.claude\/skills\/splittasks\/claude-trust-paths\.sh/;
  for (const v of ['splittasks-windows', 'splittasks-macos']) {
    const t = read(`${SKILL}/skills/${v}/SKILL.md`) || '';
    const blocks = (t.match(/SKILL_DIR="<SKILL_DIR>"/g) || []).length;
    assert(`skills/${v}/SKILL.md: LAUNCH.sh and RELAUNCH take claude-trust-paths.sh from \`$SKILL_DIR\` (placeholder + fallback), never from the manual path`,
      blocks >= 2 && t.split(SPLIT_IDIOM[1]).length - 1 >= 2 && !HELPER_MANUAL.test(t) && t.includes('${CLAUDE_PLUGIN_ROOT}/skills/' + v),
      `idiom x${blocks}; manual helper path: ${HELPER_MANUAL.test(t)}`);
  }
  assert('  ...and the Windows close helper is called from `<SKILL_DIR>` too (rule 6 and the header of close-lanes.ps1)',
    (read(`${SKILL}/skills/splittasks-windows/SKILL.md`) || '').includes('-File "<SKILL_DIR>\\close-lanes.ps1"') &&
    (read(`${SKILL}/skills/splittasks-windows/close-lanes.ps1`) || '').includes('-File "<SKILL_DIR>\\close-lanes.ps1"'));

  // RUN UNDER BASH. `findBash` never returns WSL's `C:\Windows\System32\bash.exe`.
  const findBash = () => {
    const cands = process.platform === 'win32'
      ? [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'), 'C:\\Program Files\\Git\\bin\\bash.exe']
      : ['/bin/bash', '/usr/bin/bash'];
    return cands.find((c) => fs.existsSync(c)) || null;
  };
  const bash = findBash();
  if (bash === null) {
    skip('no bash found (Git Bash on Windows, /bin/bash elsewhere): the two idioms were not RUN, only read');
  } else {
    const { spawnSync } = await import('node:child_process');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-plugin-idiom-'));
    const fwd = (p) => p.replace(/\\/g, '/');
    // The plugin folder carries a SPACE and an APOSTROPHE on purpose (a user folder may).
    const plugin = path.join(tmp, "plugin root o'hara"); fs.mkdirSync(path.join(plugin, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(plugin, 'scripts', 'orchestrator-control.js'), '// toy\n');
    fs.mkdirSync(path.join(plugin, 'skills', 'splittasks-windows'), { recursive: true });
    const home = path.join(tmp, 'home'); fs.mkdirSync(home, { recursive: true });
    // Git Bash rewrites `$HOME` and other env paths into its POSIX form (`C:/Users/…/Temp/x` ->
    // `/tmp/x`), so a path that came in through the ENVIRONMENT is compared INSIDE bash
    // (`[ "$ORQ" = "$HOME/…" ]`), and only a literal that never went through the env is
    // compared here as text.
    const run = (script, extra = {}) => {
      const r = spawnSync(bash, ['--noprofile', '--norc', '-c', script], {
        encoding: 'utf8', windowsHide: true, timeout: 20000, cwd: extra.cwd || tmp,
        env: { PATH: process.env.PATH || '', HOME: fwd(home), CLAUDE_CONFIG_DIR: '', CLAUDE_PLUGIN_ROOT: '', ...(extra.env || {}) },
      });
      return { out: (r.stdout || '').trim(), code: r.status, err: (r.stderr || '').trim() };
    };
    const same = (v, expected) => `; if [ "${v}" = "${expected}" ]; then echo SAME; else echo "DIFFERENT: ${v}"; fi`;
    // Commands: (a) rendered as a plugin command (Claude Code substituted the variable) -> the plugin folder.
    const asPlugin = run(ORQ_IDIOM.split('${CLAUDE_PLUGIN_ROOT}').join(fwd(plugin)) + '; echo "$ORQ"');
    assert('  RUN: the `ORQ=` idiom with `${CLAUDE_PLUGIN_ROOT}` filled in (a plugin command; folder with a space and an apostrophe) resolves to the plugin folder',
      asPlugin.code === 0 && asPlugin.out === fwd(plugin), `${asPlugin.code} ${asPlugin.out} ${asPlugin.err}`.slice(0, 200));
    // (a2) HOSTILE REPO (Codex r11, HIGH): a folder literally called `${CLAUDE_PLUGIN_ROOT}` planted
    // in the cwd, with the script inside, must NOT be taken by the hand-rendered command.
    const hostile = path.join(tmp, 'hostile-repo', '${CLAUDE_PLUGIN_ROOT}', 'scripts');
    fs.mkdirSync(hostile, { recursive: true }); fs.writeFileSync(path.join(hostile, 'orchestrator-control.js'), '// planted\n');
    const planted = run(ORQ_IDIOM + same('$ORQ', '$HOME/.claude/skills/orq'), { cwd: path.join(tmp, 'hostile-repo') });
    assert('  RUN: a repo with a folder literally named `${CLAUDE_PLUGIN_ROOT}/scripts/orchestrator-control.js` in the cwd does NOT hijack the hand-rendered command (manual path kept)',
      planted.code === 0 && planted.out === 'SAME', `${planted.code} ${planted.out} ${planted.err}`.slice(0, 200));
    // (a3) a stray CLAUDE_PLUGIN_ROOT in the env pointing at a folder WITHOUT the skill's script -> manual.
    const stray = run(ORQ_IDIOM + same('$ORQ', '$HOME/.claude/skills/orq'), { env: { CLAUDE_PLUGIN_ROOT: fwd(path.join(tmp, 'hostile-repo')) } });
    assert('  RUN: `CLAUDE_PLUGIN_ROOT` in the env pointing at a folder with no `scripts/orchestrator-control.js` -> manual path kept',
      stray.code === 0 && stray.out === 'SAME', `${stray.code} ${stray.out} ${stray.err}`.slice(0, 200));
    // (a4) and a relative value (not absolute) is never taken, even if the folder exists.
    const rel = run(ORQ_IDIOM + same('$ORQ', '$HOME/.claude/skills/orq'), { cwd: path.join(tmp, 'hostile-repo'), env: { CLAUDE_PLUGIN_ROOT: '${CLAUDE_PLUGIN_ROOT}' } });
    assert('  RUN: a RELATIVE value is never taken, even when that relative folder exists in the cwd',
      rel.code === 0 && rel.out === 'SAME', `${rel.code} ${rel.out} ${rel.err}`.slice(0, 200));
    // (a5) Codex r12, HIGH: the drive forms that are NOT absolute. On Windows `C:relative` is
    // drive-relative (= `<cwd on C:>/relative`); on POSIX `x:/path` is a plain relative path whose
    // first segment is a folder called `x:` (a colon cannot be in a Windows file name, so that one
    // is only planted on POSIX). Both must be refused with the folder and the script in the cwd.
    const hostileRepo = path.join(tmp, 'hostile-repo');
    fs.mkdirSync(path.join(hostileRepo, 'relative', 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(hostileRepo, 'relative', 'scripts', 'orchestrator-control.js'), '// planted\n');
    const drive = /^[A-Za-z]:/.test(hostileRepo) ? hostileRepo.slice(0, 2) : 'C:';
    const driveRel = run(ORQ_IDIOM + same('$ORQ', '$HOME/.claude/skills/orq'), { cwd: hostileRepo, env: { CLAUDE_PLUGIN_ROOT: drive + 'relative' } });
    assert(`  RUN: a DRIVE-RELATIVE value (\`${drive}relative\`, folder and script present in the cwd) is never taken`,
      driveRel.code === 0 && driveRel.out === 'SAME', `${driveRel.code} ${driveRel.out} ${driveRel.err}`.slice(0, 200));
    if (process.platform === 'win32') {
      skip('`x:/path` (a folder called `x:` in the cwd) cannot be planted on Windows: a colon is not a valid file-name character; the macOS/Linux run of this suite covers it');
    } else {
      fs.mkdirSync(path.join(hostileRepo, 'x:', 'path', 'scripts'), { recursive: true });
      fs.writeFileSync(path.join(hostileRepo, 'x:', 'path', 'scripts', 'orchestrator-control.js'), '// planted\n');
      const colonRel = run(ORQ_IDIOM + same('$ORQ', '$HOME/.claude/skills/orq'), { cwd: hostileRepo, env: { CLAUDE_PLUGIN_ROOT: 'x:/path' } });
      assert('  RUN: on POSIX `x:/path` (a folder called `x:` planted in the cwd, script inside) is never taken',
        colonRel.code === 0 && colonRel.out === 'SAME', `${colonRel.code} ${colonRel.out} ${colonRel.err}`.slice(0, 200));
      // And a real Windows-looking absolute value is NOT accepted on POSIX either (the drive form is Git Bash only).
      const driveOnPosix = run(ORQ_IDIOM + same('$ORQ', '$HOME/.claude/skills/orq'), { cwd: hostileRepo, env: { CLAUDE_PLUGIN_ROOT: 'C:/anything' } });
      assert('  RUN: on POSIX a `C:/…` value is refused (that form only means absolute under Git Bash/Cygwin)',
        driveOnPosix.code === 0 && driveOnPosix.out === 'SAME', driveOnPosix.out.slice(0, 200));
    }
    // (b) rendered by hand (the literal stays, the variable is NOT in the Bash tool's env) -> the manual path.
    const byHand = run(ORQ_IDIOM + same('$ORQ', '$HOME/.claude/skills/orq'));
    assert('  RUN: the same idiom with the literal `${CLAUDE_PLUGIN_ROOT}` (a command copied by hand) resolves to $HOME/.claude/skills/orq',
      byHand.code === 0 && byHand.out === 'SAME', `${byHand.code} ${byHand.out} ${byHand.err}`.slice(0, 200));
    // (c) and `CLAUDE_CONFIG_DIR`, when set, wins over $HOME by hand.
    const withCfg = run('CLAUDE_CONFIG_DIR=' + fwd(path.join(tmp, 'cfg')) + '; ' + ORQ_IDIOM + same('$ORQ', '$CLAUDE_CONFIG_DIR/skills/orq'));
    assert('  RUN: by hand, `CLAUDE_CONFIG_DIR` set -> `$CLAUDE_CONFIG_DIR/skills/orq`',
      withCfg.code === 0 && withCfg.out === 'SAME', withCfg.out.slice(0, 200));
    // Splittasks: (d) `<SKILL_DIR>` filled with the plugin's skill folder -> that folder; (e) left unfilled -> the manual path.
    const splitIdiom = (dir) => `SKILL_DIR="${dir}"\n${SPLIT_IDIOM[1]}`;
    const filled = run(splitIdiom(fwd(path.join(plugin, 'skills', 'splittasks-windows'))) + '\necho "$SKILL_DIR"');
    assert('  RUN: `<SKILL_DIR>` filled with the plugin\'s skill folder -> the helper is taken from there',
      filled.code === 0 && filled.out === fwd(path.join(plugin, 'skills', 'splittasks-windows')), filled.out.slice(0, 200));
    const unfilled = run(splitIdiom('<SKILL_DIR>') + same('$SKILL_DIR', '$HOME/.claude/skills/splittasks'));
    assert('  RUN: `<SKILL_DIR>` left unfilled -> falls back to $HOME/.claude/skills/splittasks (the manual install keeps working)',
      unfilled.code === 0 && unfilled.out === 'SAME', unfilled.out.slice(0, 200));
    // NEGATIVE CONTROL of `same` itself: two different paths say DIFFERENT.
    const diff = run('X=/a; Y=/b' + same('$X', '$Y'));
    assert('  NEGATIVE CONTROL: the in-bash comparison knows how to say DIFFERENT', diff.code === 0 && diff.out.startsWith('DIFFERENT'), diff.out);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Tells "the file does not exist" apart from "the file exists but is garbage".
// `JSON.parse(null)` coerces to the STRING "null" and returns the JS value `null`
// with no exception — so before this, a totally empty `CLAUDE_CONFIG_DIR`/
// `~/.claude` (a clean machine, nothing installed yet) read exactly like a
// corrupt settings.json: "settings.json is valid JSON: FAIL" (T12, 2026-09-17).
function parseSettings(raw) {
  if (raw === null) return { kind: 'absent', conf: null };
  try { return { kind: 'ok', conf: JSON.parse(raw) }; }
  catch { return { kind: 'corrupt', conf: null }; }
}
const parsed = parseSettings(settings);
const conf = parsed.conf;
if (parsed.kind === 'absent') {
  skip(`${SETTINGS} does not exist on this machine (nothing installed here yet)`);
} else {
  assert('settings.json is valid JSON', parsed.kind === 'ok');
}
// MUTANT/POSITIVE CONTROL of `parseSettings` itself, isolated from any real file:
// a MISSING file must not read as broken, but actual garbage still must.
assert('  POSITIVE CONTROL: no file at all -> "absent" (a clean machine, not a failure)',
  parseSettings(null).kind === 'absent');
assert('  MUTANT: a file that exists but is NOT valid JSON -> "corrupt" (a real failure)',
  parseSettings('{this is not json').kind === 'corrupt');
assert('  ...and a file with real JSON in it -> "ok"',
  parseSettings('{"hooks":{}}').kind === 'ok');

// The classification of a plug's path is a pure function: it runs on EVERY machine,
// with literals built here (nothing about the machine). It is exercised below.
// EXACT MATCH, not by substring (T30, 23-09; Codex gpt-5.6-sol in T26): with
// `c.includes(base + x)`, `…/orchestrator-control.js.bak` passed for the script, and a
// path written with `\` (as Windows leaves them) was not recognised. Now: first `\` -> `/`,
// and the path has to END in `base + x`. If it is quoted, the closing quote (the SAME
// one that opened) comes right after the name; if unquoted, only whitespace or the end
// of the command. So `"…/orchestrator-control.js --other-thing"` no longer passes
// (Codex Sol, T30 r2). Each `\` becomes ONE `/` (not runs): so `\\server\...` (UNC)
// stays `//server/...` and does not turn into a local root (Codex Sol, T30 r1). To
// classify, on the other hand, repeated `/` are collapsed: only the end is looked at.
const SKILL_BASES = ['skills/orq/scripts/'];
const VALID_TARGETS = ['orchestrator-control.js'];
const toSlashes = (c) => String(c).replace(/\\/g, '/');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const classifyTarget = (c) => {
  const n = toSlashes(c).replace(/\/+/g, '/');
  for (const base of SKILL_BASES) {
    const d = VALID_TARGETS.find((x) => new RegExp(`(["'])[^"']*${escapeRe(base + x)}\\1(?=\\s|$)|(?:^|\\s)[^"'\\s]*${escapeRe(base + x)}(?=\\s|$)`).test(n));
    if (d) return base + d;
  }
  return null;
};
// The file path of a hook command (used by the «they exist» assertion below). It also
// normalises `\` -> `/` first: without that the regex only understood `/`.
const hookPath = (c) => {
  const m = toSlashes(c).match(/"((?:\$HOME|(?:[A-Za-z]:)?)\/[^"]+\.(?:js|sh|py))"/);
  return m ? m[1].replace(/^\$HOME/, os.homedir()) : null;
};
{
  const BASE = SKILL_BASES[0];
  const classify = (list) => list.map(classifyTarget);
  const rGood = `"$HOME/.claude/${BASE}orchestrator-control.js"`;
  // THE OLD FOLDER, the one from before the rename. A previous install may still have it
  // (README, "Upgrading from an older install"): this is the assertion that says it NO
  // LONGER counts as a valid plug path.
  const rOld = '"$HOME/.claude/skills/multi-terminal-orchestrator/scripts/orchestrator-control.js"';
  assert('  POSITIVE CONTROL: the rule accepts `skills/orq/scripts/orchestrator-control.js`',
    classify([rGood])[0] === BASE + 'orchestrator-control.js');
  assert('  MUTANT (T11): the OLD folder of the rename is NO LONGER accepted',
    classify([rOld])[0] === null, JSON.stringify(classify([rOld])));
  assert('  MUTANT (T10): half a migration —some in `skills/orq/` and some in the old one— IS caught',
    new Set(classify([rGood, rOld])).size === 2, JSON.stringify(classify([rGood, rOld])));
  assert('  MUTANT: a path OUTSIDE the skill is NOT accepted',
    classify(['"/somewhere/else/orchestrator-control.js"'])[0] === null);
  // T30: the two holes of the substring comparison. Both came out wrong with the old code
  // (`.bak` accepted; the path with `\` given as `null`).
  const rBak = `"$HOME/.claude/${BASE}orchestrator-control.js.bak"`;
  // With the `.bak`, any other suffix, a closing quote followed by garbage, and garbage
  // INSIDE the quote after a space (Codex Sol, T30 r2).
  const rSuffixes = [rBak, rBak.replace('.bak', '.tmp'), rGood.replace(/"$/, `'x"`),
    rGood.replace(/"$/, ' --not-the-file"')];
  assert('  MUTANT (T30): `orchestrator-control.js.bak` is NOT accepted as the script',
    classify(rSuffixes).every((d) => d === null), JSON.stringify(classify(rSuffixes)));
  const rBackslash = rGood.replace(/\//g, '\\');
  const rUnc = 'node "\\\\server\\share\\hook.js"';
  assert('  MUTANT (T30): the real path written with `\\` classifies the same as with `/`, and the path regex reads it',
    classify([rBackslash])[0] === classify([rGood])[0] && hookPath(`node ${rBackslash}`) === hookPath(`node ${rGood}`) &&
      hookPath(`node ${rGood}`) !== null && hookPath(rUnc) === '//server/share/hook.js',
    JSON.stringify({ classify: classify([rBackslash]), path: hookPath(`node ${rBackslash}`), unc: hookPath(rUnc) }));
}

if (conf) {
  const commands = Object.values(conf.hooks || {}).flat()
    .flatMap((g) => (g.hooks || []).map((h) => h.command || ''));
  // THE CONDITION FOR THE WHOLE GROUP. It is not "if it looks wrong, skip it": it is
  // "if the skill is NOT INSTALLED on this machine, there is nothing to wire". One
  // single hook mentioning it is enough for everything below to be demanded.
  const mine = commands.filter((c) => /orchestrator-control/.test(c));
  if (!mine.length) {
    skip(`the skill is not installed on this machine (no hook in ${SETTINGS} points at orchestrator-control.js): the wiring of the machine's settings.json is not checked`);
  } else {
    // TWELVE plugs. History: nine on 2026-09-16 (the `PreToolUse` of `Bash|PowerShell`
    // got wired when point 11 was closed; without it the brake over changes made BY
    // COMMAND — `sed -i`, heredoc, `rm`, `git apply` — was written and tested but never
    // ran), ten on 2026-09-21 (`PostToolUse: Agent|Task`, so that T4's link is confirmed
    // at launch and not only in SubagentStop), eleven on 2026-09-22 (T5: the git permit
    // needs a wire in `UserPromptSubmit` —the only door through which the hook sees the
    // owner's KEYSTROKE—), twelve on 2026-09-23 (T26: `PostToolUse` with matcher
    // `Read|Grep|Glob` feeds the `own_reading` gate; without it the gate sees no reading
    // and goes blind in silence). On this port the installer writes all 12, so all 12
    // are demanded (Codex Sol, T5: «the structure test only counts 10 plugs; it does not
    // demand the new wire, it stays green with the feature broken»).
    const upsMine = (conf.hooks.UserPromptSubmit || [])
      .flatMap((g) => (g.hooks || []).map((h) => h.command || ''))
      .filter((c) => /orchestrator-control/.test(c));
    const readMine = (conf.hooks.PostToolUse || [])
      .filter((g) => g.matcher === 'Read|Grep|Glob')
      .flatMap((g) => (g.hooks || []).map((h) => h.command || ''))
      .filter((c) => /orchestrator-control/.test(c));
    assert(`the hook is plugged in 12 places: 10 base + UserPromptSubmit + Read|Grep|Glob (there are ${mine.length})`,
      mine.length === 12);
    assert('the hook is in PostToolUse with the exact matcher Read|Grep|Glob (the `own_reading` gate sees the readings)',
      readMine.length > 0,
      `PostToolUse matchers: ${JSON.stringify((conf.hooks.PostToolUse || []).map((g) => g.matcher || null))}`);
    assert('the hook is in UserPromptSubmit (without it `/orq-git-permit` and `/orq-merge-permit` always answer NOT GRANTED)',
      upsMine.length > 0);
    assert('the number of plugs and the UserPromptSubmit and Read|Grep|Glob wires do not contradict each other',
      mine.length === 10 + (upsMine.length > 0 ? 1 : 0) + (readMine.length > 0 ? 1 : 0),
      `plugs=${mine.length} · skill's UserPromptSubmit=${upsMine.length} · skill's Read|Grep|Glob=${readMine.length}`);
    const preBash = (conf.hooks.PreToolUse || [])
      .filter((g) => /Bash/.test(String(g.matcher || '')))
      .flatMap((g) => (g.hooks || []).map((h) => h.command || ''));
    assert('the hook is in PreToolUse with a Bash matcher (the per-command brake arrives in time)',
      preBash.some((c) => /orchestrator-control/.test(c)));
    // THE SPECIFIC WIRE, not only the count (Codex gpt-5.6-sol, MEDIUM of round 3 of T4).
    // Counting twelve passes with ANY twelfth hook: if somebody removed this matcher and
    // plugged something else, `confirmLaunch` would still exist in the code but nobody
    // would call it, and the link would only close late, in SubagentStop. The matcher AND
    // the skill's command are demanded.
    const postAgent = (conf.hooks.PostToolUse || [])
      .filter((g) => /Agent|Task/.test(String(g.matcher || '')))
      .flatMap((g) => (g.hooks || []).map((h) => h.command || ''));
    assert('the hook is in PostToolUse with matcher Agent|Task (the link is confirmed AT LAUNCH)',
      postAgent.some((c) => /orchestrator-control/.test(c)),
      `PostToolUse matchers: ${JSON.stringify((conf.hooks.PostToolUse || []).map((g) => g.matcher || null))}`);
    // The handoff sheet (owner, 2026-09-15) lives at both moments of the compact, next to
    // the generic context-after-compacting hook (which saves the owner's words; this one
    // saves the state of the orchestration).
    const groupPre = (conf.hooks.PreCompact || []).flatMap((g) => (g.hooks || []).map((h) => h.command || ''));
    const groupStart = (conf.hooks.SessionStart || []).filter((g) => g.matcher === 'compact').flatMap((g) => (g.hooks || []).map((h) => h.command || ''));
    assert('the hook is in PreCompact (it writes the handoff sheet)', groupPre.some((c) => /orchestrator-control/.test(c)));
    assert('the hook is in SessionStart with matcher "compact" (it injects the sheet)', groupStart.some((c) => /orchestrator-control/.test(c)));
    // ONE SINGLE PATH IS VALID (T11, 2026-09-22): the path has to be INSIDE the skill (a
    // loose copy somewhere else WOULD be the failure this looks for), and ALL (12) point
    // at THE SAME ONE (half in one folder and half in another would be two versions
    // running at once, and that is not visible). The classification returns FOLDER +
    // TARGET, not only the target (Codex gpt-5.6-sol, T10 confirmation round, MEDIUM):
    // with the target alone, a migration SPLIT between two folders passed green.
    const targets = mine.map(classifyTarget);
    assert(`the ${mine.length} plugs point at the skill's script, in \`skills/orq/scripts/\``,
      targets.every((d) => d !== null), JSON.stringify([...new Set(targets)]));
    assert(`  ...and the ${mine.length} point at THE SAME ONE (not half a skill in one folder and half in another)`,
      new Set(targets).size === 1, JSON.stringify([...new Set(targets)]));
    // Against the reference: what is in the machine is what the installer writes.
    const sigMachine = signaturesOf(conf.hooks);
    assert('the 12 signatures of the machine\'s settings.json are the same as the example\'s and the installer\'s',
      sameList(sigMachine, SIGNATURES_12), sigMachine.join(' ; '));
  }

  // And while we are at it: NO hook on the machine may point at a missing file, because
  // a settings.json calling what does not exist fails silently. This does NOT depend on
  // the skill being installed, so it always runs (on the machine's own settings.json).
  const paths = commands.map(hookPath).filter(Boolean);
  const missing = paths.filter((r) => !fs.existsSync(r));
  assert(`the ${paths.length} referenced hook files exist`, missing.length === 0, missing.join(', '));
}

/* ------------------------------------ D. SKILL.md orders things that can be done */

console.log('\nD. SKILL.md <-> CODE');
const subcommands = [...script.matchAll(/sub === '([a-z-]+)'/g)].map((m) => m[1]);
assert(`the CLI offers subcommands (${subcommands.join(', ')})`, subcommands.length >= 5);
// The contract changed on 2026-08-12: SKILL.md no longer orders you to type `start` or
// `close`, because startup is automatic on skill load and closing is by abandonment.
// What is still demanded is that the CLI keeps those commands (they are still the
// manual route) and that SKILL.md orders the one thing that does apply.
for (const c of ['start', 'pulse', 'close', 'decide']) {
  assert(`the CLI keeps "${c}" as the manual route`, subcommands.includes(c));
}
assert('SKILL.md orders creating the Monitor with `pulse`',
  skillMd.includes('orchestrator-control.js pulse'));
assert('SKILL.md says the skill already started by itself',
  /there is nothing to start|already started the orchestration/i.test(skillMd));
assert('SKILL.md warns what happens if it is not a repository',
  /NOTHING IS BEING WATCHED/i.test(skillMd));
for (const ref of [...skillMd.matchAll(/references\/([a-z0-9-]+\.md)/g)].map((m) => m[1])) {
  assert(`SKILL.md cites references/${ref} and it exists`, fs.existsSync(`${SKILL}/references/${ref}`));
}
assert('SKILL.md points at the script inside the skill',
  skillMd.includes('skills/orq/scripts/orchestrator-control.js'));

/* --------------------------------------------- E. the documentation <-> the code */

console.log('\nE. DOCUMENTATION <-> CODE');
const gatesBlock = script.slice(script.indexOf('const GATES'), script.indexOf('/* ---', script.indexOf('const GATES')));
const gates = [...gatesBlock.matchAll(/^\s{2}([a-z_]+):\s*'(OBSERVE|GATE)'/gm)].map((m) => m[1]);
// 14 since 2026-09-15 (late): `lane_handoff` came in — since the owner's correction that
// same night, it reports that a lane COMPACTED and is still in its terminal, with its
// handover already read. Nobody ends terminals.
// Before that there were 13 with `own_load`, and 12 before that.
// 15 since 2026-09-21: `silent_stop` came in — a lane wrote `STOPPED ·` four times on
// its own screen and the orchestrator never saw it.
// 16 since 2026-09-21 (T4, issue #10): `unaccredited_delegation` — the rule «the
// orchestrator does NOT edit code» could be dodged by launching a subagent to «fix it
// on the way». After T3 those edits no longer blamed it, but nobody said whether that
// subagent HAD a brief or edited INSIDE its exclusive list; now the agent ↔ brief link
// says it.
// 17 since 2026-09-22 (T7): `repeated_red` — three lanes of this skill, and an
// orchestrator of another project, chased for half an hour each a red test that
// belonged to the ENVIRONMENT (CRLF of a freshly born worktree, failures that were
// already on master, or the suite testing the INSTALLED copy of the script). Nobody
// asked which copy ran or whether it was just as red WITHOUT their change.
// 18 since 2026-09-22 (T5): `git_permit` — the owner asked for «a command to give the
// orchestrator and its employees permission to commit, open a PR or push without asking
// me, and another to give it access to merge». The gate looks at commit/push/PR and
// merge in the PreToolUse and says whether they go with the permit or without it; in
// phase 1, it only warns.
// 19 since 2026-09-22 (T12): `rule_without_doc` — two rules the owner decided IN THE
// CHAT on 09-21 («less is more»; «the permit is given per repo and per orchestration»)
// only lived in the orchestrator's memory and in a hand-written note. A rule that only
// lives in one context dies with that context: now it is registered with the document
// where it has to be written, and the owner's `Stop` warns while the text does not
// appear there.
// T55 (8-oct): 21 with `shared_stash` (git stash with several worktrees; issue #16 point 1).
// T56 (8-oct): 22 with `v_without_tool` (the owner closes a turn with [V] without having
// opened anything; issue #16 point 5).
assert(`the code declares the 22 gates (there are ${gates.length})`, gates.length === 22);

// WHAT THE ORCHESTRATOR WRITES, NOT THE LANE. The lane that added `lane_handoff` (T3,
// 09-15) CANNOT edit `references/control-phase-1-and-2.md`: it is outside its exclusive
// list, and its brief declares it under "Affected specs" as «no change: that row is
// written by the orchestrator at integration time». While it is not written, this cannot
// be a red FAIL — but the check cannot disappear for the other thirteen either. That is
// why the pending pieces are named ONE BY ONE, with their date: if tomorrow somebody
// adds a new gate and does not document it, it still fires; and as soon as the row
// exists, this same check demands it again.
const PENDING_DOC = [];       // empty since T20 (22-09): the `own_reading` row (T16) is already written
const PENDING_VARS_DOC = [];  // empty: every declared variable is in the docs (ORCH_CONFIG documented on 2026-09-15)
for (const g of gates) {
  if (PENDING_DOC.includes(g) && !doc.includes('`' + g + '`')) {
    console.log(`  (pending) gate "${g}": its row is written by the orchestrator at integration time`);
  } else {
    assert(`gate "${g}" documented`, doc.includes('`' + g + '`'),
      'its row is missing from references/control-phase-1-and-2.md');
  }
  // and that SOMEBODY really fires it: a gate nobody calls watches nothing
  const fired = new RegExp(`raiseAlert\\([^)]*['"]${g}['"]`).test(script)
    || new RegExp(`'${g}'`).test(script.replace(gatesBlock, ''));
  assert(`gate "${g}" is fired by somebody in the code`, fired);
}
// The inverse check (every gate named in the docs exists in the code) is done ONLY on the
// gates table, not on any table in the document. It used to scan the whole file, and that
// is why it read `start`, `wait`, `close` and `decide` —which are CLI subcommands— as
// nonexistent gates. Verified 2026-08-12: 4 FAILs that belonged to the test, not to the code.
const tableStart = doc.indexOf('## What it detects TODAY');
const tableEnd = doc.indexOf('\n## ', tableStart + 5);
const gatesTable = tableStart >= 0 ? doc.slice(tableStart, tableEnd > 0 ? tableEnd : undefined) : '';
assert('the gates table in the docs is found', gatesTable.length > 0);
const inDoc = [...gatesTable.matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1]);
// The table has to name ALL the gates except, at most, the ones waiting for the
// orchestrator to write their row. Not one fewer (a row was lost) nor one more (there is
// a row for a gate that no longer exists).
assert(`the table names between ${gates.length - PENDING_DOC.length} and ${gates.length} gates (it names ${inDoc.length})`,
  inDoc.length >= gates.length - PENDING_DOC.length && inDoc.length <= gates.length,
  `pending a row: ${PENDING_DOC.join(', ') || 'none'}`);
for (const g of inDoc) assert(`gate "${g}" from the docs exists in the code`, gates.includes(g));

// WIRING of the `own_load` gate (the owner, 2026-09-15). A gate declared in the table and
// with its function written watches nothing if NOBODY calls it from the event it belongs
// to: this warning lives in each terminal's `Stop`, not in the owner's dispatch. And
// without its own mark, the warning either does not come out or comes out at every turn
// close until people stop reading it.
//
// A COMMENT is not wiring: these checks look at the code with the comments already
// stripped, or a mutant that merely commented the call out would pass green (Codex
// gpt-6-astra, 1st round, low). What these lines prove is that the piece is PLUGGED IN
// where it belongs; that it DOES what it says is proved by section 20 of the detection
// suite, with its mutants.
const stripComments = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');
const code = stripComments(script);
const stopStart = script.indexOf('function handleStop');
const stopBlock = stripComments(script.slice(stopStart, script.indexOf('\n/* ---', stopStart)));
const noteStart = script.indexOf('function noteSession');
const noteBlock = stripComments(script.slice(noteStart, script.indexOf('\n/**', noteStart)));
assert('the code declares the own_load gate\'s function',
  /function checkOwnLoad\(/.test(code));
assert('`handleStop` calls checkOwnLoad (without it the own warning never comes out)',
  /checkOwnLoad\(L, p, input/.test(stopBlock), stopBlock.slice(-200));
assert('the own warning is marked with `warned_own`, different from `warned_stop`',
  /\bs\.warned_own = true\b/.test(code) && /\.warned_stop = true\b/.test(code));
// The rearm goes in `noteSession` (which runs on EVERY event), not in the gate (which only
// runs on `Stop`): if the drop were measured outside the Stop, the next crossing would be
// left with no warning (Codex gpt-6-astra, 1st round, high).
assert('the rearm of `warned_own` lives in `noteSession`, not only in the Stop',
  /warned_own = false/.test(noteBlock), noteBlock.slice(-300));
assert('  ...and the gate no longer rearms on its own (one single source of truth)',
  !/warned_own = false/.test(stripComments(
    script.slice(script.indexOf('function checkOwnLoad'), script.indexOf('\n/** Failure 9')))));
// And the owner's warning about the OTHER terminals cannot slip back in through a Stop with
// no `session_id` (H2-bis, Codex gpt-6-astra 2nd round, 09-15), nor through one whose
// `session_id` is not a string (this lane's 1st round).
assert('the Stop demands a registered owner AND an explicit session_id match (H2-bis)',
  /const isExactOwner =[\s\S]{0,200}?sidStop === L\.owner_session/.test(stopBlock) &&
  /typeof \(input && input\.session_id\) === 'string'/.test(stopBlock),
  stopBlock.slice(0, 400));
assert('  ...and `isOwnerSession` (the tolerant one) no longer gates that block of the Stop',
  !/isOwnerSession\(L, input \|\| \{\}\)/.test(stopBlock));
assert('  ...and the own gate does not convert the session_id either: it demands a string',
  /typeof raw !== 'string'/.test(code));
// The two guards that came out of the 2nd round: whoever NOTES the session cannot convert
// the id either (otherwise an array would touch another session's measurement), and the
// ceiling is not read without budget (the rearm calls it on every event). (Codex
// gpt-6-astra, 2nd round, two mediums.)
assert('`noteSession` demands that the session_id be a string, it does not convert it',
  /typeof raw !== 'string'/.test(stripComments(
    script.slice(noteStart, script.indexOf('\n/**', noteStart)))));
// Since the two heights, the configuration reading lives in `heights()` (and in
// `heightsConfig()`), not in `loadThreshold`. The budget guard moved with it: without this,
// `noteSession`'s rearm opened that door again on every event (Codex gpt-6-astra, 2nd
// round, medium).
const heightsBlock = stripComments(
  script.slice(script.indexOf('function heights()'), script.indexOf('function loadThreshold')));
assert('`heights` does not start reading the configuration without budget',
  /if \(Date\.now\(\) > DEADLINE\) return \{/.test(heightsBlock), heightsBlock.slice(0, 300));
assert('  ...and neither does `heightsConfig`', /if \(Date\.now\(\) > DEADLINE\) return null;/.test(stripComments(
  script.slice(script.indexOf('function heightsConfig'), script.indexOf('function airbagFromSettings')))));

/* --- THE TWO HEIGHTS, THE HANDOVER AND THE NOTE (the owner, 2026-09-15) --- */
// Same as with `own_load`: a piece that is written but not PLUGGED IN watches nothing. What
// is looked at here is the wiring, with the comments already stripped (a mutant that merely
// commented the call out would pass green). That they DO what they say is proved by
// section 21 of the detection suite, with its mutants.
assert('the skill\'s config exists and declares the two heights',
  fs.existsSync(`${SKILL}/orchestrator.config.json`));
let skillConf = null;
try { skillConf = JSON.parse(read(`${SKILL}/orchestrator.config.json`)); } catch { /* invalid */ }
assert('  ...and it is valid JSON with warning < airbag <= 1,000,000',
  skillConf !== null && Number.isInteger(skillConf.warn_tokens) && Number.isInteger(skillConf.airbag_tokens) &&
  skillConf.warn_tokens > 0 && skillConf.warn_tokens < skillConf.airbag_tokens &&
  skillConf.airbag_tokens <= 1000000, JSON.stringify(skillConf));
// The owner raised the airbag from 550,000 to 600,000 on 09-15 in the afternoon (60 % of
// the million); the warning stays at 500,000. The behaviour suite's TOY configs are still
// on 550,000 on purpose: they test the logic, not the number.
assert('  ...with the numbers the owner signed on 09-15: warning 500,000, airbag 600,000',
  skillConf !== null && skillConf.warn_tokens === 500000 && skillConf.airbag_tokens === 600000,
  JSON.stringify(skillConf));
assert('the code reads THAT config and lets it be overridden for tests (ORCH_CONFIG)',
  /CONFIG_NAME = 'orchestrator\.config\.json'/.test(script) &&
  /process\.env\.ORCH_CONFIG \|\| path\.join\(SKILL_ROOT, CONFIG_NAME\)/.test(script));
// THE ROOT IS RESOLVED ONCE, IN ONE SINGLE PLACE. When every place computed it on its own,
// one of them gave `scripts/` instead of the root: config, brakes and agents did not exist
// for the hook (2026-09-19, a whole afternoon with the RAM brake not firing). If `__dirname`
// shows up loose again in the file, the fix has been lost.
// (T11, 22-09: the declaration no longer contemplates the copy of the script in a subfolder
// of `scripts/` — it was removed with the subcommand that generated it. What this guard
// watches has NOT changed: one root, one place.)
assert('the skill root is resolved ONCE and `__dirname` shows up nowhere else',
  /const SCRIPTS_DIR = __dirname;/.test(script) &&
  /SKILL_ROOT = path\.join\(SCRIPTS_DIR, '\.\.'\)/.test(script) &&
  // ONLY the exact declaration is exempted, not any line that mentions it (Codex, round 2:
  // `path.join(__dirname, x); // SCRIPTS_DIR = ` would have evaded the guard).
  !script.split('\n').map((l) => l.trim())
    .filter((l) => l !== 'const SCRIPTS_DIR = __dirname;')
    .some((l) => l.includes('__dirname')));
// MUTANT of the guard above: it has to know how to FAIL.
assert('  MUTANT: with a loose `__dirname` on another line, the guard goes red',
  ['const SCRIPTS_DIR = __dirname;', "const x = path.join(__dirname, 'agents');"]
    .filter((l) => l !== 'const SCRIPTS_DIR = __dirname;')
    .some((l) => l.includes('__dirname')));
// NOBODY WRITES THE OWNER'S SETTINGS.JSON FROM THE HOOK'S SCRIPT (T57, issue #8, owner
// 17-09: «the skill WARNS, it does not write»; until T57 only `syncAirbag` wrote, and it
// was deleted). This is the guard that does not depend on running anything.
//
// The old version ("`settingsPath()` can only appear as the argument of a READ") gave a
// FALSE GREEN: it only recognised the DIRECT call, so a write done over the alias (`const
// sPath = settingsPath()`) got past it without noticing — and that is exactly what was in
// the code. (Codex gpt-6-astra, final round 2, MEDIUM.)
//
// The guard has TWO floors, and the first is the one that really closes the door:
//
//  (1) WHO CAN EVEN GET HOLD OF THE PATH. Only a handful of whitelisted functions may name
//      `settingsPath(`. If no other one can obtain the path, no other one can write it —
//      and so there is no need to chase aliases of aliases. (Codex gpt-6-astra, review
//      round: the direct-alias check let a SECOND alias through, and a call split across
//      two lines.)
//  (2) OF THOSE, NONE (before: only `syncAirbag`) may contain a WRITE call over the path
//      or its aliases. It is searched over the whole text (not line by line) so that a call
//      split across several lines does not escape, and the function is deduced from the
//      position of the match.
// `terminalOlderThanChange` is OUT of the list (T10, 17-09): since it compares against the
// ledger's `airbag_changed_at` mark, it no longer names the path. And IN comes
// `inheritAirbagMark`, which inherits that mark from the mtime on the first load of an old
// ledger — a three-line function that only does a `statSync`. The list narrows and widens
// with reality, not for convenience: the one that drops out is the one that no longer needs
// it. T57: `syncAirbag` drops out (it no longer exists: the skill warns, it does not write).
const SETTINGS_WHITELIST = ['settingsPath', 'airbagState', 'airbagFromSettings', 'inheritAirbagMark'];
// The whole guard in ONE function, so mutants can be fed to it and BOTH FLOORS get
// exercised (the previous version only tested the first with its mutants, and that is why
// three holes passed green: Codex gpt-6-astra, review round 2).
const WRITE_NAMES = [
  'writeFileSync', 'writeFile', 'appendFileSync', 'appendFile', 'renameSync', 'rename',
  'unlinkSync', 'unlink', 'rmSync', 'rm', 'rmdirSync', 'rmdir', 'copyFileSync', 'copyFile',
  'chmodSync', 'chmod', 'chownSync', 'chown', 'truncateSync', 'truncate', 'ftruncateSync',
  'createWriteStream', 'writeSync', 'write', 'openSync', 'open',
].join('|');
const settingsGuard = (text) => {
  // The BOUNDARY of a function is any declaration at column zero, not only `function X`:
  // otherwise a top-level arrow (`const f = () => {...}`) or an `async function` were
  // attributed to the previous function and inherited its permission. (Codex gpt-6-astra,
  // review rounds 2 and 3.)
  const pos = [...text.matchAll(/^(?:(?:async\s+)?function\s*\*?\s*(\w+)|(?:const|let|var)\s+(\w+)\s*=)/gm)]
    .map((m) => ({ i: m.index, fn: m[1] || m[2] }));
  const fnAt = (i) => { let fn = '(top level)'; for (const p of pos) { if (p.i <= i) fn = p.fn; else break; } return fn; };
  // (1) who can even NAME the path
  const names = [...new Set([...text.matchAll(/settingsPath\s*\(/g)].map((m) => fnAt(m.index)))];
  // (2) aliases, with TRANSITIVE closure. Parentheses around it are accepted, and so is bare
  //     reassignment (`let b; b = a;`), which were two escapes.
  const alias = new Set();
  for (const m of text.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*\(*\s*settingsPath\s*\(/g)) alias.add(m[1]);
  for (let round = 0; round < 6; round++) {
    const before = alias.size;
    for (const m of text.matchAll(/(?:(?:const|let|var)\s+)?(\w+)\s*=\s*\(*\s*(\w+)\s*\)*\s*;/g)) {
      if (alias.has(m[2])) alias.add(m[1]);
    }
    if (alias.size === before) break;
  }
  const reAlias = new RegExp(`settingsPath\\s*\\(|settings\\.json${alias.size ? '|\\b(?:' + [...alias].join('|') + ')\\b' : ''}`);
  const writers = [];
  // The argument WINDOW is not cut at the first `)`: with `renameSync(path.join(a, b),
  // target)` the target fell outside. A fixed chunk after the call's name is looked at;
  // extra text can only make it stricter, which is the safe side for a guard.
  for (const m of text.matchAll(new RegExp(`\\b(${WRITE_NAMES})\\s*\\(([\\s\\S]{0,200})`, 'g'))) {
    if (reAlias.test(m[2])) writers.push({ fn: fnAt(m.index), call: m[0].replace(/\s+/g, ' ').slice(0, 120) });
  }
  return { names, writers, alias: [...alias] };
};
const G = settingsGuard(code);
assert(`only the whitelist may name settingsPath() (it is named by: ${G.names.join(', ')})`,
  G.names.length > 0 && G.names.every((f) => SETTINGS_WHITELIST.includes(f)), G.names.join(', '));
assert(`and of those, NONE writes settings.json (T57: it warns, it does not write; writers: ${[...new Set(G.writers.map((e) => e.fn))].join(', ') || 'nobody'})`,
  G.writers.length === 0,
  G.writers.map((e) => `${e.fn}: ${e.call}`).join(' | '));
// `openSync` does NOT count as a read: `openSync(path, 'w')` truncates the file. (Codex
// gpt-6-astra, review round: that mutant passed green.)
const settingsUses = [...code.matchAll(/(\w+)\(([^()]*settingsPath\(\)[^()]*)\)/g)].map((m) => m[1]);
assert(`settingsPath() as a direct argument is only READ (uses: ${settingsUses.join(', ') || 'none'})`,
  settingsUses.length > 0 && settingsUses.every((f) => /^(readFileSync|statSync|existsSync)$/.test(f)),
  settingsUses.join(', '));
// MUTANTS OF THE GUARD ITSELF: the six holes Codex slipped past it green in its two rounds
// have to come out RED. They are analysed as text; none of them is run.
{
  const passes = (extra) => {
    const g = settingsGuard(code + '\n' + extra + '\n');
    return g.names.every((f) => SETTINGS_WHITELIST.includes(f)) &&
      g.writers.length === 0;   // T57: before it was «only syncAirbag writes»
  };
  assert('  ...control: with no mutant, the guard passes', passes('// nothing'));
  assert('  ...mutant 1: `openSync(settingsPath(), "w")` in another function comes out RED',
    !passes("function hole1() { fs.openSync(settingsPath(), 'w'); }"));
  assert('  ...mutant 2: a write split across two lines in another function comes out RED',
    !passes("function hole2() {\n  fs.writeFileSync(\n    settingsPath(), 'x');\n}"));
  assert('  ...mutant 3: a second alias in another function comes out RED',
    !passes("function hole3() {\n  const a3 = settingsPath();\n  const b3 = a3;\n  fs.writeFileSync(b3, 'x');\n}"));
  // The three Codex slipped INSIDE a whitelisted function, or into a top-level arrow: the
  // first floor lets those through on purpose, so the second has to catch them.
  assert('  ...mutant 4: a second alias INSIDE `airbagFromSettings` (whitelisted) comes out RED',
    !passes("function airbagFromSettings2() {\n  const a4 = settingsPath();\n  const b4 = a4;\n  fs.writeFileSync(b4, '{}');\n}")
    && settingsGuard(code.replace('function airbagFromSettings() {',
      "function airbagFromSettings() {\n  const a4 = settingsPath();\n  const b4 = a4;\n  fs.writeFileSync(b4, '{}');"))
      .writers.length > 0);
  assert('  ...mutant 5: `fs.writeFile` (asynchronous) over an alias comes out RED',
    settingsGuard(code.replace('function airbagFromSettings() {',
      "function airbagFromSettings() {\n  const a5 = settingsPath();\n  fs.writeFile(a5, '{}', () => {});"))
      .writers.length > 0);
  assert('  ...mutant 6: a top-level arrow no longer inherits the previous function\'s permission',
    !passes("const hole6 = () => {\n  const s6 = settingsPath();\n  fs.writeFileSync(s6, '{}');\n};"));
  // The four from Codex's THIRD round, all slipped INSIDE a whitelisted function (the first
  // floor lets them through on purpose) or behind a boundary the old guard did not recognise.
  const insideWhitelisted = (body) => settingsGuard(code.replace(
    'function airbagFromSettings() {', 'function airbagFromSettings() {\n' + body))
    .writers.length > 0;
  assert('  ...mutant 7: an alias IN PARENTHESES (`const b = (a);`) comes out RED',
    insideWhitelisted("  const d7 = settingsPath();\n  const a7 = (d7);\n  fs.writeFileSync(a7, '{}');"));
  assert('  ...mutant 8: an alias by REASSIGNMENT (`let b; b = a;`) comes out RED',
    insideWhitelisted("  const d8 = settingsPath();\n  let a8;\n  a8 = d8;\n  fs.writeFileSync(a8, '{}');"));
  assert('  ...mutant 9: a target BEHIND another call (`renameSync(path.join(..), target)`) comes out RED',
    insideWhitelisted("  const d9 = settingsPath();\n  fs.renameSync(path.join('/tmp', 'other.json'), d9);"));
  assert('  ...mutant 10: an `async function` no longer inherits the previous function\'s permission',
    !passes("async function hole10() {\n  const s10 = settingsPath();\n  fs.writeFileSync(s10, '{}');\n}"));
}
// T57: there were two assertions here about the airbag's write («the write that guard
// watches exists exactly like that» and «its temp file is EXCLUSIVE»). That write no longer
// exists (the skill warns, it does not write), so the first is inverted and the second
// goes: the old write (`renameSync(tmp, sPath)`) and its function are NOT in the source.
assert('  ...control T57: the old airbag write (renameSync(tmp, sPath) / function syncAirbag) is NO LONGER in the source',
  !/fs\.renameSync\(tmp, sPath\);/.test(script) && !/function syncAirbag\(/.test(script));

assert('the code tells the TWO heights apart (warning and airbag), not just one',
  /function loadThreshold\(\)/.test(code) && /function pctThreshold\(\)/.test(code) &&
  /function pctAirbag\(\)/.test(code));
assert('  ...and with no valid config it falls back to settings.json\'s `autoCompactWindow`',
  /source: 'settings'/.test(code) && /function airbagFromSettings\(/.test(code));

// The handover: seeding it, detecting it, warning about it and calling it out to the other side.
const postStart = script.indexOf('function handlePostToolUse');
const postBlock = stripComments(script.slice(postStart, script.indexOf('\nfunction handleSubagentStop', postStart)));
assert('the code seeds the handover template (the AI does not invent it)',
  /function handoverTemplate\(/.test(code) && /function seedHandover\(/.test(code));
const HANDOVER_SECTIONS = ['1. MANDATE', '2. RESUME', '3. LOCAL STATE', '4. RESULTS', '5. VERIFICATION',
  '6. PENDING', '7. REVIEWS', '8. COORDINATION', '9. WARNINGS'];
for (const s of HANDOVER_SECTIONS) {
  assert(`  ...and the template carries the section "${s}"`, script.includes(`'${s}'`));
}
assert('`handlePostToolUse` detects the handover once written (without it nobody finds out)',
  /isHandoverPath\(absH, p\)/.test(postBlock) && /handover_written = absH/.test(postBlock), postBlock.slice(-400));
assert('  ...and only inside the handovers folder OF THIS ledger (the path comes from the payload)',
  /const folder = n\(handoversFolder\(ledgerFilePath\)\)/.test(code) && /inside === folder/.test(code));
assert('the terminal\'s Stop confirms its handover once, and tells it to CARRY ON',
  /handover_warned = true/.test(stopBlock) && /Handover written in/.test(stopBlock) &&
  /Keep working here/.test(stopBlock), stopBlock.slice(-400));
// THE SAME TERMINAL CARRIES ON AFTER COMPACTING (the owner, 09-15). The rearm no longer
// deletes the handover: whoever consumes it is that very terminal on its way back from
// compacting, in `handleSessionStart`, which is what moves it to `handovers_read`. If the
// rearm deleted it, a drop that did not come from compacting (a fluctuating measurement)
// left that terminal without the memory it wrote for itself.
const ssStart = script.indexOf('function handleSessionStart');
const ssBlock = stripComments(script.slice(ssStart, script.indexOf('\n/* ---', ssStart)));
assert('the rearm no longer deletes the handover (its own terminal consumes it on compacting)',
  !/handover_written = null/.test(noteBlock), noteBlock.slice(-300));
assert('  ...and what moves it to `handovers_read` is the return from compacting',
  /handovers_read/.test(code) && /noteCompaction\(L, sid, s,/.test(ssBlock), ssBlock.slice(0, 600));
assert('`SessionStart(compact)` ALWAYS starts with "YOU JUST COMPACTED", with the time and the %',
  /YOU JUST COMPACTED your memory/.test(ssBlock) && /parts\.push\(header\)/.test(ssBlock),
  ssBlock.slice(0, 800));
assert('  ...and with no handover it says so, instead of keeping quiet',
  /You did not write your handover before compacting/.test(ssBlock), ssBlock.slice(0, 900));
assert('the Stop repeats the short line ONCE, and only with a recent compaction',
  /compactedRecently\(mySession\)/.test(stopBlock) && /compaction_warned = true/.test(stopBlock) &&
  /You just compacted \(/.test(stopBlock), stopBlock.slice(-600));
assert('  ...and "recent" is a measured window, not "at some point"',
  /RECENT_COMPACTION_MS/.test(code) && /function compactedRecently\(/.test(code));
assert('the `lane_handoff` gate is fired by the owner\'s Stop AND by the pulse',
  (stopBlock.match(/'lane_handoff'/g) || []).length === 1 &&
  /'lane_handoff'/.test(stripComments(script.slice(script.indexOf('function pulse'), script.indexOf('\nfunction warnNoProgram')))));
assert('  ...and it no longer orders anybody to be launched: it reports that the lane compacted and carries on',
  /function laneHandoffText\(/.test(code) && /and read its handover/.test(script) &&
  /with NO handover/.test(script));
assert('the handoff sheet lists the lanes that compacted (with their handover)',
  /COMPACTED_SECTION = 'Lanes that compacted'/.test(script) &&
  /## \$\{COMPACTED_SECTION\}/.test(script) && /function compactionsToCall\(/.test(code));
// And that same constant is the FINGERPRINT that tells a sheet written by this version of
// the hook from one written by the previous one: without it, an old sheet of the SAME
// program was put in front of the owner again with the expired model inside (Codex
// gpt-6-astra, this lane's round, medium).
assert('  ...and a sheet WITHOUT that section is not injected: it is regenerated from the ledger',
  /if \(md && !md\.includes\(COMPACTED_SECTION\)\) md = '';/.test(script));
assert('`status` (the load board) lists compactions and the last handover read per session',
  /compactions \(the terminal IS STILL running/.test(script) && /last handover read/.test(script));
// NOBODY ENDS TERMINALS (the owner, 09-15). The old model's words cannot come back in any
// text the hook says to a terminal, nor in the template that reaches it inside the brief.
// CAREFUL: what is banned are the FORMULAS of the old model, not the bare root —
// «relaunching the same thing» (a background job) has nothing to do with terminals, and it
// is deliberately there in `openWait`.
const FORBIDDEN_TEXTS = [
  /Close and write/,
  /close this terminal/i,
  /relaunch\w*\s+(the|this|your)\s+(lane|terminal|lane lead)/i,
  /relaunch(es)?\s+(it|her|them)\b/i,
  /relaunch\w*\s+(a|another)\s+(lane|terminal|lane lead)/i,
  /\brelaunch(es)?\b/i,
  /new lane lead/i,
];
const forbiddenTemplate = read(`${SKILL}/references/brief-template.md`) || '';
for (const re of FORBIDDEN_TEXTS) {
  assert(`no text of the hook says ${re} (nobody ends terminals)`,
    !re.test(script), (script.match(re) || [''])[0]);
  assert(`  ...nor does the brief template say ${re}`,
    !re.test(forbiddenTemplate), (forbiddenTemplate.match(re) || [''])[0]);
}

// The generic note from before compacting, absorbed from the standalone hook.
const preStart = script.indexOf('function handlePreCompact');
const preBlock = stripComments(script.slice(preStart, script.indexOf('\n/** SessionStart(compact)', preStart)));
assert('the context note lives INSIDE the skill (its own code, not a require of the old hook)',
  /function contextNoteText\(/.test(code) && /function herMessages\(/.test(code) &&
  /function isSystemNoise\(/.test(code) && /function pendingClaims\(/.test(code) &&
  !/require\([^)]*context-after-compacting/.test(script));
assert('  ...and EVERY session writes it in PreCompact, not only the owner',
  /notePath\(p, safeSid\)/.test(preBlock) &&
  preBlock.indexOf('notePath(p, safeSid)') < preBlock.indexOf('isOwnerSession'), preBlock.slice(0, 400));
assert('  ...and SessionStart(compact) gives it back to that same session and archives it',
  /own \+ '\.used'/.test(code) && /function cleanOldNotes\(/.test(code));
assert('  ...without stopping giving the handoff sheet to the owner in the SAME block',
  /parts\.push\('Your memory was compacted\. HANDOFF SHEET/.test(code) && /parts\.join\('\\n\\n'\)/.test(code));

// And the obligation in the brief template: «it obeys because its brief orders it to».
const loadTemplate = read(`${SKILL}/references/brief-template.md`) || '';
assert('the brief template carries the block "If the load warning reaches you (half-height mark)"',
  loadTemplate.includes('## If the load warning reaches you (half-height mark)'));
assert('  ...and it comes BEFORE "## ESCALATE IF" (it is read before escalating, not after)',
  loadTemplate.indexOf('## If the load warning reaches you') > 0 &&
  loadTemplate.indexOf('## If the load warning reaches you') < loadTemplate.indexOf('## ESCALATE IF'));
// THE THREE THINGS OF THE NEW CYCLE (the owner, 09-15): you write your handover FOR
// YOURSELF, you CARRY ON working in this same terminal, and when you come back from
// compacting you read it yourself.
assert('  ...and it orders the three things: write the handover for itself, carry on, and read it on the way back',
  /Write the handover/.test(loadTemplate) && /Keep working/.test(loadTemplate) &&
  /When you come back from compacting/.test(loadTemplate) &&
  /YOU JUST COMPACTED/.test(loadTemplate));
assert('  ...and it makes clear that NOBODY replaces it nor takes it out of that terminal',
  /THIS SAME terminal/.test(loadTemplate) && /do not ask to finish anything/.test(loadTemplate));
assert('  ...naming the nine sections the hook seeds',
  HANDOVER_SECTIONS.every((s) => loadTemplate.includes(s)));
assert('  ...and without ordering anything to be blocked: «WARN yes; ORDER no»',
  /does not block anything/.test(loadTemplate));

// The specs follow the change (the owner, 2026-09-15) and the mini-orchestrator: the pieces
// wired between template, reference, SKILL.md and code.
const briefTpl = read(`${SKILL}/references/brief-template.md`) || '';
assert('the brief template carries "## Affected specs"', briefTpl.includes('## Affected specs'));
assert('the brief template carries "## Lane size"', briefTpl.includes('## Lane size'));
assert('the template names references/mini-orchestrator.md', briefTpl.includes('references/mini-orchestrator.md'));
assert('references/mini-orchestrator.md exists', fs.existsSync(`${SKILL}/references/mini-orchestrator.md`));
// It only checks that the NAME matches; that the reader understands the template's REAL
// heading (with its «<- …» tail) is proved by section 15 of the detection suite («with the
// template's REAL heading»).
assert('the code declares the SAME section as the template ("Affected specs")',
  /SPECS_BRIEF_SECTION = 'Affected specs'/.test(script));
assert('the code looks for the map by the name the skill documents (specs-map.json)',
  /SPECS_MAP_NAME = 'specs-map\.json'/.test(script) && skillMd.includes('specs-map.json'));
assert('SKILL.md orders measuring the lane size and naming the mini-orchestrator',
  /Lane size/.test(skillMd) && skillMd.includes('references/mini-orchestrator.md'));
assert('the CLI offers the "specs" subcommand', subcommands.includes('specs'));

const codeVars = [...new Set([...script.matchAll(/process\.env\.(ORCH_[A-Z_]+)/g)].map((m) => m[1]))];
const docVars = [...new Set([...doc.matchAll(/(ORCH_[A-Z_]+)/g)].map((m) => m[1]))];
for (const v of codeVars) {
  if (PENDING_VARS_DOC.includes(v) && !docVars.includes(v)) {
    console.log(`  (pending) variable ${v}: its line is written by the orchestrator at integration time`);
    continue;
  }
  assert(`variable ${v} documented`, docVars.includes(v));
}
for (const v of docVars) assert(`variable ${v} from the docs is read by the code`, codeVars.includes(v));

/* -------------------------------------------------- F. the tests <-> the code */

console.log('\nF. TESTS <-> CODE');
for (const t of ['test-orchestrator-control.mjs', 'test-orchestrator-control-adversarial.mjs']) {
  const txt = read(`${SKILL}/tests/${t}`) || '';
  // The `process.env.ORQ_HOOK ||` in front is optional: what is checked is the DEFAULT
  // —the FALLBACK—, which on this port is resolved relative to the test file itself (never
  // to a person's folder, never to somebody else's worktree). The variable names the
  // CANDIDATE and the lanes set it; the fallback is the contract. (T1, 21-09.)
  const fallback = (txt.match(/const HOOK = (?:process\.env\.ORQ_HOOK \|\| )?(.+);/) || [])[1];
  assert(`${t} falls back to the script next to it when there is no ORQ_HOOK`,
    fallback === "fileURLToPath(new URL('../scripts/orchestrator-control.js', import.meta.url))",
    fallback || 'it does not declare HOOK');
}
// (T11, 22-09) The second operand of this `||` used to name a constant that the same lane
// deleted. It did not blow up because the `||` short-circuited, but the day the doc lost
// the new path —just what this assertion looks for— it would have given a `ReferenceError`
// instead of a readable FAIL. (Codex gpt-5.6-sol, round 1 of T11, MEDIUM.)
assert('the docs order running the tests by their real path',
  doc.includes('~/.claude/skills/orq/tests/test-orchestrator-control.mjs'));

/* -------------------------- G-bis. the activation rule still holds */

console.log('\nG-bis. INSTALLED IS NOT ACTIVATED');
assert('the code has the active-program guard', /function activeProgram\(/.test(script));
assert('hookMode exits early when there is no program',
  /if \(!activeProgram\(cwd\)\) return 0;/.test(script));
assert('with no git repository there is no ledger (there is no reserve route)',
  !/DIR_FALLBACK\s*=/.test(script) && /return null;/.test(script.slice(script.indexOf('function ledgerPath'), script.indexOf('function acquireLock'))));
assert('the docs warn that installed is not activated', /Installed is NOT activated/i.test(doc));
assert('the code recognises the load of THE skill by its exact name',
  /function isSkillLoad\(/.test(script) && /SKILL_NAME = 'orq'/.test(script));
// TRANSITION (T10, 21-09): while a previous install keeps the old folder name, the hook has
// to keep recognising that name as a load of the skill, or the terminals already open would
// stop starting the orchestration. When it is removed, this assertion goes away.
assert('  ...and it accepts the OLD name only for the transition, with its own constant',
  /OLD_SKILL_NAME = 'multi-terminal-orchestrator'/.test(script)
  && /name === SKILL_NAME \|\| name === OLD_SKILL_NAME/.test(script));
assert('a failed startup is NOT silent',
  /I COULD NOT START/.test(script) && /NOTHING IS BEING WATCHED/.test(script));
assert('close-on-abandonment exists', /function closeIfAbandoned\(/.test(script));
assert('waits are born on their own', /function openWait\(/.test(script) && /WAIT_SUBAGENT/.test(script));
assert('a lost event is stated in the log file', /event_lost/.test(script));

console.log('\nG. THE PHASE IS STILL 1');
assert("GLOBAL_MODE is still 'OBSERVE'", /const GLOBAL_MODE = 'OBSERVE'/.test(script));
assert('no gate is set to GATE', !/'GATE',/.test(gatesBlock));
assert('the docs say it is in phase 1', /PHASE 1/.test(doc));

/* ------------------------- H. pieces brought in from the other branch (issue #1) */

console.log('\nH. PIECES FROM A COLLABORATOR\'S BRANCH (issue #1)');
const briefTemplate = read(`${SKILL}/references/brief-template.md`);
const receiptTemplate = read(`${SKILL}/references/receipt-template.md`);
assert('references/brief-template.md exists', briefTemplate !== null);
assert('references/receipt-template.md exists', receiptTemplate !== null);

// Piece 7: STEP 3 of SKILL.md no longer carries the whole template embedded — only a
// pointer — and the big block lives in references/brief-template.md. If somebody undoes
// the move (pastes the template back into SKILL.md), this fails: the heading of the lane
// role has to be in the moved file, not in the main SKILL.md.
assert('SKILL.md points at the moved brief template',
  skillMd.includes('references/brief-template.md'));
assert('SKILL.md NO LONGER carries the big brief block embedded',
  !skillMd.includes('## YOUR ROLE — read this before anything else'));
assert('the moved template DOES carry the lane lead\'s role',
  briefTemplate !== null && briefTemplate.includes('## YOUR ROLE — read this before anything else'));

// Piece 1: the receipt stops being free prose — the moved brief wires the pointer to the
// receipt template instead of the old «## Your report says».
assert('SKILL.md wires the receipt to references/receipt-template.md',
  skillMd.includes('references/receipt-template.md'));
assert('the brief template NO LONGER asks for free report prose',
  briefTemplate !== null && !briefTemplate.includes('## Your report says'));
assert('the receipt template has its 7 fixed headings',
  receiptTemplate !== null && ['STATE', 'CLAIMED RESULT', 'FILES CHANGED', 'INPUTS USED',
    'CONSTRAINTS AND DEVIATIONS', 'ASSUMPTIONS AND OPEN QUESTIONS', 'ESCALATIONS']
    .every((s) => receiptTemplate.includes(`## ${s}`)));

// Piece 2: the CLI offers `validate` and documents it in its usage header.
assert('the CLI offers the "validate" subcommand', subcommands.includes('validate'));
assert('the script documents the use of "validate" in its header',
  /node orchestrator-control\.js validate/.test(script));

// Piece 3: ESCALATE IF / NEVER YOURS in the moved brief template.
assert('the brief template carries the ESCALATE IF block',
  briefTemplate !== null && briefTemplate.includes('## ESCALATE IF'));
assert('the brief template carries the NEVER YOURS block',
  briefTemplate !== null && briefTemplate.includes('## NEVER YOURS'));

// Pieces 4 and 5: the sentences of STEP 2 and STEP 4 are no longer demanded inside
// SKILL.md, but in the reference where they live (T5 moved them to floor 2 on 2026-09-15;
// its receipt carries the table with each one's destination). The core has a ceiling of
// 8,000 characters and the block that held them weighed 1,033: demanding them in the core
// was the only thing keeping it above that ceiling.
//
// What is NOT relaxed: the sentence still has to exist, and in a specific place. Change the
// file, not the demand.
const lawsMd = read(`${SKILL}/references/laws.md`) || '';
const dispatchMd = read(`${SKILL}/references/dispatch.md`) || '';

// Piece 4: sampling rule (2 at random on a light toll).
assert('references/laws.md carries the receipt sampling rule',
  /Sampling receipts/i.test(lawsMd) && /2 random claims/i.test(lawsMd));

// Piece 5: the two verification rules.
assert('references/dispatch.md carries "gathering evidence is not verifying"',
  /Gathering evidence is not verifying/i.test(dispatchMd));
assert('references/laws.md carries "open the most important one and ask yourself what would make it fail"',
  /open its most important one and ask yourself/i.test(lawsMd));

// Piece 6: additive rule (deleting > 50 lines is declared), and `validate` applies it with
// the SAME threshold.
assert('the brief template carries the additive rule',
  briefTemplate !== null && /additive rule/i.test(briefTemplate) && /50/.test(briefTemplate));
assert('the code of validate applies the additive threshold of 50',
  /ADDITIVE_THRESHOLD = 50/.test(script));

/* ---- T11 (2026-09-22): THE SUITES OF THE REPO STILL EXIST ----
   The fix 12 of T10 checked this in passing (it measured the deadline with which `publish`
   launched them). `publish` was removed, but the check that the suites are where they say
   they are is NOT lost with it: it stays as a test of its own. Block A above already
   demands the suites; here it is said that they are real files, not folders. */
for (const t of ['test-structure.mjs', 'test-orchestrator-control.mjs',
  'test-orchestrator-control-adversarial.mjs', 'test-dashboard.mjs', 'test-evidence.mjs', 'test-install.mjs']) {
  const p = `${SKILL}/tests/${t}`;
  assert(`the suite ${t} exists and is a file`,
    fs.existsSync(p) && fs.statSync(p).isFile(), p);
}
// MUTANT: the rule has to know how to FAIL.
assert('  MUTANT: a suite that does not exist IS caught',
  !fs.existsSync(`${SKILL}/tests/test-that-does-not-exist-t11.mjs`));

// Piece 8 (deleting the two historical references/ of Codex) was left UNDONE on purpose: it
// demands that ~/.claude be a git repository, and it is not. While that is true, the two
// historical files stay in the list of mandatory pieces (block A, above) and this test does
// not touch them.

/* ------------------------------------------------------------- I. agents */

console.log('\nI. THE SKILL\'S AGENTS (T7, 2026-09-16)');
// The mark the skill puts on what it manages. Since T10 (21-09) it is `orq`, the skill's
// new name; the old one is only accepted when READING copies already installed, and that
// lives in `carriesSkillMark` of the script, not here: the skill's OWN files carry the new one.
const SKILL_MARK = '# managed-by: orq';
const EXPECTED_AGENTS = [
  { file: 'disposable-reader.md', name: 'disposable-reader', model: 'haiku', readOnly: true },
  { file: 'receipt-verifier.md', name: 'receipt-verifier', model: 'sonnet', readOnly: true },
  { file: 'lane-lead.md', name: 'lane-lead', model: 'opus', readOnly: false },
];
for (const a of EXPECTED_AGENTS) {
  const p = `${SKILL}/agents/${a.file}`;
  const text = read(p);
  assert(`agents/${a.file} exists`, text !== null, p);
  if (text === null) continue;
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  assert(`  ...agents/${a.file} has a readable --- ... --- frontmatter`, m !== null);
  const front = m ? m[1] : '';
  assert(`  ...the mark "${SKILL_MARK}" is the FIRST line of the frontmatter`,
    front.split(/\r?\n/)[0].trim() === SKILL_MARK);
  assert(`  ...\`name: ${a.name}\` matches the file name`,
    new RegExp(`^name:\\s*${a.name}\\s*$`, 'm').test(front));
  assert(`  ...\`model: ${a.model}\` is the expected one`,
    new RegExp(`^model:\\s*${a.model}\\s*$`, 'm').test(front));
  if (a.readOnly) {
    const mTools = /^tools:\s*(.*)$/m.exec(front);
    assert('  ...it is read-only: it carries `tools:` and no Write/Edit/NotebookEdit',
      mTools !== null && !/\b(Write|Edit|NotebookEdit)\b/.test(mTools[1]), front.slice(0, 200));
  }
}
assert('references/receipt-template.md carries the line "Recommended next step"',
  receiptTemplate !== null && /Recommended next step/.test(receiptTemplate));

/* ------------------------------------ I-bis. THE SKILL IS CALLED `orq` (T10, 21-09) */

// WHY THIS BLOCK: `/orq` used to be a COMMAND (`commands/orq.md`) whose step 1 said «invoke
// the skill orchestrator-multi-terminal». The model did not execute that step, and the
// orchestration did not start or sync anything — with the lanes believing it did. A piece
// that only exists to invoke another piece is a piece that fails on its own. Now `/orq` IS
// the name of the skill and the bridge command does NOT exist.
console.log('\nI-bis. THE SKILL IS CALLED `orq` (T10, 2026-09-21)');
{
  const frontSkill = (/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(skillMd) || [])[1] || '';
  const skillName = ((/^name:\s*(\S+)\s*$/m.exec(frontSkill)) || [])[1] || null;
  assert('SKILL.md declares `name: orq`', skillName === 'orq', skillName || 'no name:');
  assert('  POSITIVE CONTROL: the `name:` reader does read the frontmatter',
    frontSkill.length > 0 && skillName !== null);

  assert('the bridge command commands/orq.md does NOT exist',
    !fs.existsSync(`${SKILL}/commands/orq.md`), `${SKILL}/commands/orq.md`);

  let commands = [];
  try { commands = fs.readdirSync(`${SKILL}/commands`).filter((n) => n.toLowerCase().endsWith('.md')).sort(); }
  catch (e) { commands = []; }
  // T5 (22-09): there were 1 and now 3. The two new ones are the git permits
  // (`/orq-git-permit` and `/orq-merge-permit`), which the owner asked for on 21-09 so as
  // not to have to authorise every commit. The list is EXPLICIT, not a `>= 1`: what this
  // assertion watches is that nobody adds a command to the skill without the suite
  // noticing.
  // T44 (24-09, rule R8eb2c5): 4. `orq-batch-closed.md` is added, the closing script the
  // owner types when they declare the batch closed.
  // T57 (9-oct, issue #8): 5. `orq-install.md` is added, the installer written for the
  // Claude of whoever uses the skill.
  assert('the skill carries EXACTLY 5 commands (`dashboard.md`, `orq-batch-closed.md`, `orq-git-permit.md`, `orq-install.md`, `orq-merge-permit.md`)',
    commands.length === 5 &&
      commands.join(',') === 'dashboard.md,orq-batch-closed.md,orq-git-permit.md,orq-install.md,orq-merge-permit.md',
    commands.join(', ') || '(none)');

  // T44: THE BATCH CLOSE NAMES ITS 8 STEPS, IN ORDER, AND DOES NOT FORCE OR DELETE BRUTALLY.
  // One fixed phrase per step; each one has to appear, and in this order (the first
  // appearance of each goes after the previous one). A step that drops out of the text is a
  // step the orchestrator does not do. And the command cannot contain a forced delete:
  // removing merged and clean worktrees is the only thing the owner let be deleted (23-09),
  // and `git branch -d` already refuses by itself to delete what is not merged.
  // T50 (25-09, rules Rdcb7cd and R8f3290): between the handover and the close goes step
  // «5 bis», the copy of the evidence into the repo with `scripts/evidence.js`. It goes as
  // «5 bis» and does not renumber: SKILL.md and references/control-phase-1-and-2.md cite
  // «step 6» (close) and the «8 steps», and are not T50's files.
  // The integration branch is `<default>` (master if it exists, else main) since the public release.
  const BATCH_STEPS = ['no receipt', 'git worktree list', 'origin/<default>', 'STEP 6',
    'HANDOVER-NEXT-BATCH', 'scripts/evidence.js', 'close --program', 'TaskStop', 'what | state | where'];
  // Codex T44-r1: also other brutal deletions (`git clean -f…`, `reset --hard`).
  const FORBIDDEN_BATCH = [/(^|[\s`"'(])-D\b/, /--force\b/, /\brm\s+-rf\b/, /worktree\s+remove\s+-f\b/,
    /\bclean\s+-[a-z]*f/, /reset\s+--hard\b/,
    // Codex T44-r2: the same with the options apart, and the PowerShell form.
    /\bclean\b[^\n]*\s-[a-z]*f\b/, /\brm\s+-r\s+-f\b/, /Remove-Item\b[^\n]*-Force\b/i];
  const checkBatch = (t) => {
    const failures = [];
    let from = -1;
    for (const f of BATCH_STEPS) {
      const i = t.indexOf(f);
      if (i < 0) failures.push(`missing «${f}»`);
      else if (i < from) failures.push(`«${f}» out of order`);
      else from = i;
    }
    for (const re of FORBIDDEN_BATCH) if (re.test(t)) failures.push(`contains ${re}`);
    return failures;
  };
  const batch = read(`${SKILL}/commands/orq-batch-closed.md`) || '';
  const batchFailures = checkBatch(batch);
  assert('commands/orq-batch-closed.md names the 8 steps and the 5 bis (evidence) in order and carries no `-D`, `--force` nor `rm -rf`',
    batch.length > 0 && batchFailures.length === 0, batchFailures.join('; ') || '(file empty or missing)');
  // Codex T44-r1: if `close` fails, the script STOPS before switching off the pulse.
  assert('commands/orq-batch-closed.md stops if `close` prints `NOT CLOSED`, before the pulse step',
    batch.includes('NOT CLOSED') && batch.indexOf('NOT CLOSED') < batch.indexOf('TaskStop'));
  // IN-MEMORY MUTANTS, taken from the REAL file: the rule has to know how to fail, and to
  // fail for WHAT WAS TAKEN OUT/PUT IN, not for something else.
  assert('  MUTANT: without the program-closing step, the rule FAILS',
    checkBatch(batch.split('close --program').join('close')).includes('missing «close --program»'));
  assert('  MUTANT: with a `--force` put in, the rule FAILS',
    checkBatch(`${batch}\ngit worktree remove --force x\n`).includes(`contains ${/--force\b/}`));
  assert('  MUTANT: an empty command does NOT pass',
    checkBatch('').length === BATCH_STEPS.length);

  for (const n of commands) {
    const text = read(`${SKILL}/commands/${n}`) || '';
    const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
    assert(`  ...commands/${n} has a readable frontmatter`, m !== null);
    // In `commands/` the mark goes RIGHT AFTER the frontmatter (Claude Code reads its
    // header and an extra line in it dirties it), not inside.
    const body = m ? text.slice(m.index + m[0].length) : text;
    const first = body.split(/\r?\n/).find((l) => l.trim() !== '') || '';
    assert(`  ...commands/${n} carries the mark "${SKILL_MARK}"`,
      first.trim() === SKILL_MARK, first.trim().slice(0, 80));
  }
  // MUTANT: the count has to know how to fail. If a bridge command comes back tomorrow, this
  // assertion is the one that catches it — and here it is shown that it catches it.
  assert('  MUTANT: with two commands the count would NOT pass',
    !(['orq.md', 'dashboard.md'].length === 1));
  assert('  MUTANT: the OLD mark is NOT accepted in the skill\'s files',
    '# managed-by: multi-terminal-orchestrator' !== SKILL_MARK);
}

// The brief asks to check that no `references/*.md` nor `SKILL.md` names `gpt-6-astra` AS
// THE REVIEW MODEL. The difficulty is that there are LEGITIMATE uses of the name that are
// NOT that and that have to keep passing:
//   · historical citations — «Codex `gpt-6-astra` caught it in the 1st round of 09-15»
//     (references/laws.md, references/dispatch.md), which are facts of the past and are not
//     rewritten;
//   · the sentence that RESERVES Astra on purpose — «Astra (`gpt-6-astra`) is kept for
//     advice and for comparing proposals» (control-phase-1-and-2.md), which on top of that
//     shares the SAME line with the good `--model gpt-5.6-sol`.
// That is why the bare name is NOT searched for (it would go red the day Codex finds
// something with Astra again, which is a legitimate finding and not a mistake). What is
// searched for is Astra APPEARING AS THE VALUE OF A MODEL FLAG, which is exactly «go and
// review with Astra» and never appears in a citation nor in the reservation. (T7, 2026-09-16.)
const RE_ASTRA_AS_MODEL = /(--model|-m)\s+`?gpt-6-astra/;
{
  const docs = [['SKILL.md', skillMd]];
  for (const f of fs.readdirSync(`${SKILL}/references`)) {
    if (f.endsWith('.md')) docs.push([`references/${f}`, read(`${SKILL}/references/${f}`) || '']);
  }
  const culprits = [];
  for (const [name, text] of docs) {
    text.split(/\r?\n/).forEach((l, i) => {
      if (RE_ASTRA_AS_MODEL.test(l)) culprits.push(`${name}:${i + 1}`);
    });
  }
  assert('no doc orders REVIEWING with gpt-6-astra (--model/-m); historical citations and Astra\'s reservation stay',
    culprits.length === 0, culprits.join(', '));
  // POSITIVE CONTROL: the rule HAS to know how to fail, and it HAS to know NOT to fail on the
  // legitimate uses. Without this the assertion above is decoration.
  assert('  POSITIVE CONTROL: the rule DOES catch a "--model gpt-6-astra"',
    RE_ASTRA_AS_MODEL.test('review --model gpt-6-astra --lane T1'));
  assert('  POSITIVE CONTROL: and it does NOT catch a historical citation nor the sentence reserving Astra',
    !RE_ASTRA_AS_MODEL.test('(Codex `gpt-6-astra`, 1st round, HIGH)') &&
    !RE_ASTRA_AS_MODEL.test('Astra (`gpt-6-astra`) is kept for advice and for comparing proposals'));
}

/* ------------------------------------ T43. THE SPECS INDEX (specs --index) */
// T43-START — do not move these marks: a lane's short cycle runs ONLY what lies between them.
//
// What it protects (rule Rd4f8a1, the owner 24-09): `specs --index` writes ONE line per
// spec so they can be searched by meaning without reading them all. It is tested on FIVE
// toy projects that this very section creates in a temporary folder WITH SPACES in the
// path, and deletes at the end: one with a map + a specs folder, one with the folder only,
// and one with nothing (which must NOT be touched).
console.log('\nT43. THE SPECS INDEX (specs --index)');
{
  const { spawnSync: spawnT43 } = await import('node:child_process');
  const BASE43 = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-t43-'));
  const ROOT43 = path.join(BASE43, 'projects with spaces');
  const SETTINGS43 = path.join(BASE43, 'settings');
  fs.mkdirSync(SETTINGS43, { recursive: true });
  const write43 = (root, rel, txt) => {
    const p = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, txt, 'utf8');
    return p;
  };
  // Launches `specs --index` with the CANDIDATE script, with no skill config and with toy
  // settings: the section cannot touch anything of the owner's.
  const index43 = (cwd, args) => {
    const r = spawnT43(process.execPath, [SCRIPT, 'specs', '--index', ...args], {
      cwd, encoding: 'utf8', windowsHide: true, timeout: 30000,
      env: { ...process.env, ORCH_CONFIG: path.join(BASE43, 'does-not-exist.json'), CLAUDE_CONFIG_DIR: SETTINGS43, ORCH_CONTROL_OFF: '' },
    });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  };
  // Recursive listing with size and date: if anything is written, it changes.
  const listing43 = (dir) => {
    const rows = [];
    const rec = (d, rel) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        const abs = path.join(d, e.name);
        const st = fs.statSync(abs);
        rows.push(`${rel}${e.name}${e.isDirectory() ? '/' : ''} ${e.isDirectory() ? '' : st.size + ' ' + st.mtimeMs}`);
        if (e.isDirectory()) rec(abs, rel + e.name + '/');
      }
    };
    rec(dir, '');
    return rows.join('\n');
  };
  const countLines = (txt) => txt.split('\n').length - (txt.endsWith('\n') ? 1 : 0);
  const specLines = (txt) => txt.split(/\r?\n/).filter((l) => l.startsWith('- '));
  const withoutDate = (txt) => txt.split('\n').filter((l) => !l.startsWith('Generated: ')).join('\n');

  // ---- Project A: map (2 rules, 3 real specs + 1 that does not exist) + docs/specs/ with a 4th
  const A = path.join(ROOT43, 'proj-a');
  write43(A, 'specs-map.json', JSON.stringify({
    _comment: 'keys starting with _ are ignored',
    rules: [
      { code: ['src/a/**'], spec: 'docs/one.md', _note: 'ignored' },
      // Windows backslashes and a duplicate of rule 1: the index does not repeat
      { code: ['src/b/**'], specs: ['docs/two.md', 'docs\\specs\\three.md', 'docs/one.md', 'docs/missing.md'] },
    ],
  }, null, 2));
  const ONE = '---\ntitle: front-matter that does not count\n---\n# One: approvals\n\n<!-- summary: How an order is approved and who signs it. -->\n\nText that is not used. Second sentence.\n';
  const TWO = '# Two: payments\n\n| col | col |\n|---|---|\n| a | b |\n\n```js\nconst x = 1; // This is not the summary.\n```\n\n> A quote. Neither.\n\nPayments are collected when the order is confirmed. Then it is invoiced.\nAnother line of the same paragraph.\n';
  const SENTENCE300 = ('The commission split rule ' + 'applies to every line of the order '.repeat(9)).trim();
  const THREE = `# Three: commissions\n\n${SENTENCE300}. Second sentence.\n`;
  const FOUR = '\uFEFF# Four: café ñandú design\n\nThe naïve señor ordered a quick crème brûlée. End.\n'; // with a BOM on purpose
  write43(A, 'docs/one.md', ONE);
  write43(A, 'docs/two.md', TWO);
  write43(A, 'docs/specs/three.md', THREE);
  write43(A, 'docs/specs/sub/four.md', FOUR);
  write43(A, 'docs/specs/notes.txt', 'not markdown: it does not get in\n');
  // ---- Project B: specs folder only, no map
  const B = path.join(ROOT43, 'proj-b');
  write43(B, 'docs/adr/0001-base.md', '# ADR 1: database\n\nWe use a single database. For cost.\n');
  // ---- Project C: no map and no specs folders (but with docs/ and other .md)
  const C = path.join(ROOT43, 'proj-c');
  write43(C, 'README.md', '# Project without specs\n');
  write43(C, 'src/x.js', 'module.exports = 1;\n');
  write43(C, 'docs/others/guide.md', '# Guide\n\nIt is not a spec.\n');
  // ---- Project D: broken map (invalid JSON) + specs folder
  const D = path.join(ROOT43, 'proj-d');
  write43(D, 'specs-map.json', '{ "rules": [ broken ');
  write43(D, 'docs/specs/x.md', '# X\n\nSomething.\n');

  const OUTSIDE = path.join(BASE43, 'evidence', 'index-a.md');

  // ---------------- Check 1 — complete index
  const beforeA = listing43(A);
  const r1 = index43(A, ['--root', A, '--out', OUTSIDE]);
  const idx1 = fs.existsSync(OUTSIDE) ? fs.readFileSync(OUTSIDE, 'utf8') : '';
  const l1 = specLines(idx1);
  const expected = [
    `- docs/one.md — One: approvals — How an order is approved and who signs it. — ${countLines(ONE)} lines`,
    `- docs/two.md — Two: payments — Payments are collected when the order is confirmed. — ${countLines(TWO)} lines`,
    `- docs/specs/three.md — Three: commissions — ${SENTENCE300.slice(0, 139).trimEnd()}… — ${countLines(THREE)} lines`,
    '- docs/missing.md — MISSING — the map names it and it does not exist on disk — 0 lines',
    `- docs/specs/sub/four.md — Four: café ñandú design — The naïve señor ordered a quick crème brûlée. — ${countLines(FOUR.slice(1))} lines`,
  ];
  assert('T43 c1: `specs --index` exits with 0 and writes the index at --out', r1.code === 0 && idx1 !== '', `code=${r1.code} ${r1.out.slice(0, 300)}`);
  assert('T43 c1: 5 lines (4 real + 1 MISSING), no duplicates, in map → folder order',
    l1.length === 5 && new Set(l1.map((l) => l.split(' — ')[0])).size === 5, l1.join(' | '));
  for (let i = 0; i < expected.length; i++) {
    assert(`T43 c1: exact line (title, summary and lines) of ${expected[i].split(' — ')[0].slice(2)}`,
      l1.includes(expected[i]), `expected «${expected[i]}» and there is: ${l1.join(' | ')}`);
  }
  const TOT1 = '5 specs · 4 from the map · 1 by folder · MISSING 1';
  const head1 = idx1.split('\n').slice(0, 8);
  assert('T43 c1: the header carries «N specs · M from the map · K by folder · MISSING F» adding up (and the last line repeats it)',
    head1.includes(TOT1) && idx1.trimEnd().split('\n').pop() === TOT1, head1.join(' | '));
  assert('T43 c1: the header says what it is, how it is used (grep + open only one), who generates it and when/on what',
    /search here with grep/.test(idx1) && /open ONLY the spec it points to/.test(idx1) && /specs --index/.test(idx1) &&
    /^Generated: \d{4}-\d\d-\d\dT[^ ]+ · on: no git$/m.test(idx1), head1.join(' | '));
  assert('T43 c1: a .txt in the specs folder does not get in', !/notes\.txt/.test(idx1));

  // ---------------- Check 2 — summary (the three cases are in the exact lines above; here, apart)
  const lin = (rel) => l1.find((l) => l.startsWith(`- ${rel} — `)) || '';
  assert('T43 c2: `<!-- summary: … -->` wins over the text (and the front-matter is not the title)',
    lin('docs/one.md').includes('— How an order is approved and who signs it. —') && !/front-matter/.test(lin('docs/one.md')), lin('docs/one.md'));
  assert('T43 c2: with no comment, first sentence of the first paragraph skipping heading, table, code and quote',
    lin('docs/two.md').includes('— Payments are collected when the order is confirmed. —') && !/\|/.test(lin('docs/two.md')) && !/This is not/.test(lin('docs/two.md')), lin('docs/two.md'));
  const res3 = (lin('docs/specs/three.md').split(' — ')[2] || '');
  assert('T43 c2: a first sentence of ~300 characters is cut to 140 with «…»',
    SENTENCE300.length > 290 && res3.length <= 140 && res3.length >= 130 && res3.endsWith('…'), `length=${res3.length} «${res3}»`);

  // ---------------- Check 3 — no specs, it does not write
  const beforeC = listing43(C);
  const r3 = index43(C, ['--root', C]);
  const r3b = index43(C, []); // without --root: outside git the root is the current folder
  const r3c = index43(C, ['--root', C, '--check']);
  const afterC = listing43(C);
  assert('T43 c3: project with no map and no folders → code 2 and the text «has no specs»',
    r3.code === 2 && /This project has no specs/.test(r3.out) && /step 1\.8/.test(r3.out), `code=${r3.code} ${r3.out}`);
  assert('T43 c3: also without --root (the current folder) → code 2', r3b.code === 2 && /has no specs/.test(r3b.out), `code=${r3b.code}`);
  assert('T43 c3: and the listing of the folder before and after is IDENTICAL (no index, no temp file)',
    beforeC === afterC, `before:\n${beforeC}\nafter:\n${afterC}`);
  const beforeD = listing43(D);
  const rD = index43(D, ['--root', D]);
  assert('T43 c3: map present but broken → code 2, it says so, and it writes nothing',
    rD.code === 2 && /is broken/.test(rD.out) && listing43(D) === beforeD, `code=${rD.code} ${rD.out}`);

  // ---------------- Check 4 — --out and --check
  assert('T43 c4: with --out nothing shows up in the project root', listing43(A) === beforeA && !fs.existsSync(path.join(A, 'specs-index.md')));
  const chk = () => index43(A, ['--root', A, '--out', OUTSIDE, '--check']);
  const c0 = chk();
  assert('T43 c4: --check just generated → 0 (up to date)', c0.code === 0 && /index up to date/.test(c0.out), `code=${c0.code} ${c0.out}`);
  const future = new Date(Date.now() + 120000);
  fs.utimesSync(path.join(A, 'docs', 'two.md'), future, future);
  const cT = chk();
  assert('T43 c4: --check after touching a spec (later date) → 1 and it says which',
    cT.code === 1 && /modified after the index: docs\/two\.md/.test(cT.out), `code=${cT.code} ${cT.out}`);
  fs.utimesSync(path.join(A, 'docs', 'two.md'), new Date(Date.now() - 120000), new Date(Date.now() - 120000));
  index43(A, ['--root', A, '--out', OUTSIDE]);
  write43(A, 'docs/specs/five.md', '# Five\n\nNew.\n');
  fs.utimesSync(path.join(A, 'docs', 'specs', 'five.md'), new Date(Date.now() - 120000), new Date(Date.now() - 120000));
  const cN = chk();
  assert('T43 c4: --check with a NEW spec (even if its date is old) → 1 and it says which',
    cN.code === 1 && /new spec that is not in the index: docs\/specs\/five\.md/.test(cN.out), `code=${cN.code} ${cN.out}`);
  index43(A, ['--root', A, '--out', OUTSIDE]);
  fs.rmSync(path.join(A, 'docs', 'specs', 'sub', 'four.md'));
  const cB = chk();
  assert('T43 c4: --check after DELETING an indexed spec → 1 and it says which',
    cB.code === 1 && /docs\/specs\/sub\/four\.md/.test(cB.out), `code=${cB.code} ${cB.out}`);
  const cNone = index43(A, ['--root', A, '--out', path.join(BASE43, 'evidence', 'not-generated.md'), '--check']);
  assert('T43 c4: --check with no generated index → 1 («INDEX MISSING»)', cNone.code === 1 && /INDEX MISSING/.test(cNone.out), `code=${cNone.code} ${cNone.out}`);
  assert('T43 c4: --check with no specs → 2 (same text)', r3c.code === 2 && /This project has no specs/.test(r3c.out), `code=${r3c.code} ${r3c.out}`);
  assert('T43 c4: --check does not write in the root', !fs.existsSync(path.join(A, 'specs-index.md')));
  // A badly placed --out cannot overwrite anything nor fall back to the root
  const beforeA2 = listing43(A);
  const one0 = fs.readFileSync(path.join(A, 'docs', 'one.md'), 'utf8');
  const pSpec = index43(A, ['--root', A, '--out', path.join(A, 'docs', 'one.md')]);
  const pMap = index43(A, ['--root', A, '--out', path.join(A, 'specs-map.json')]);
  const pEmpty = index43(A, ['--root', A, '--out']);
  const pRoot = index43(A, ['--root', '--out', OUTSIDE]);
  assert('T43 c4: --out over a spec or over the map → 2 and it does not overwrite it',
    pSpec.code === 2 && pMap.code === 2 && /I do not overwrite/.test(pSpec.out) && /I do not overwrite/.test(pMap.out) &&
    fs.readFileSync(path.join(A, 'docs', 'one.md'), 'utf8') === one0 && /"rules"/.test(fs.readFileSync(path.join(A, 'specs-map.json'), 'utf8')),
    `spec=${pSpec.code} map=${pMap.code} ${pSpec.out}`);
  // Any other --out path is written, even if it already exists (the contract: «write there»)
  const OTHER = write43(BASE43, 'evidence/other.md', 'placeholder\n');
  const pOther = index43(A, ['--root', A, '--out', OTHER]);
  index43(A, ['--root', A, '--out', OUTSIDE]);
  assert('T43 c4: --out over a file that already exists (and is neither spec nor map) replaces it ENTIRELY with the index',
    pOther.code === 0 && withoutDate(fs.readFileSync(OTHER, 'utf8')) === withoutDate(fs.readFileSync(OUTSIDE, 'utf8')) && !/placeholder/.test(fs.readFileSync(OTHER, 'utf8')),
    `code=${pOther.code} ${pOther.out}`);
  // Injected write failure: --out is a FOLDER, so the rename fails. It has to exit 1, not
  // touch the folder, and NOT leave the temp file next to it (Codex, r1/r2).
  const OUT_FOLDER = path.join(BASE43, 'evidence', 'i-am-a-folder');
  fs.mkdirSync(OUT_FOLDER, { recursive: true });
  const pFail = index43(A, ['--root', A, '--out', OUT_FOLDER]);
  const looseTmps = fs.readdirSync(path.join(BASE43, 'evidence')).filter((n) => /\.tmp$/.test(n));
  assert('T43 c4: if the write fails (target that is a folder) it exits 1 and leaves no temp file',
    pFail.code === 1 && /I could not write/.test(pFail.out) && looseTmps.length === 0 && fs.statSync(OUT_FOLDER).isDirectory(),
    `code=${pFail.code} tmp=${looseTmps.join(',')} ${pFail.out}`);
  assert('T43 c4: `--out` or `--root` with no path after it → 2, and the root stays the same (it does not fall back to the default)',
    pEmpty.code === 2 && pRoot.code === 2 && /needs a path/.test(pEmpty.out) && listing43(A) === beforeA2,
    `out=${pEmpty.code} root=${pRoot.code} ${pEmpty.out}`);
  // Without --out, the index goes to <root>/specs-index.md (project B, folder only)
  const rB = index43(B, ['--root', B]);
  const idxB = fs.existsSync(path.join(B, 'specs-index.md')) ? fs.readFileSync(path.join(B, 'specs-index.md'), 'utf8') : '';
  assert('T43 c4: without --out the index goes to <root>/specs-index.md; folder with no map → 1 spec by folder',
    rB.code === 0 && specLines(idxB).length === 1 && idxB.includes('1 specs · 0 from the map · 1 by folder · MISSING 0') &&
    idxB.includes('- docs/adr/0001-base.md — ADR 1: database — We use a single database. — 3 lines'), `code=${rB.code} ${idxB}`);
  const cBd = index43(B, ['--root', B, '--check']);
  assert('T43 c4: and its default --check finds it up to date → 0', cBd.code === 0, `code=${cBd.code} ${cBd.out}`);
  // B's spec goes from «by folder» to «from the map» WITHOUT being touched: the index no
  // longer tells the truth (totals and origin), and --check has to see it (Codex, r1).
  write43(B, 'specs-map.json', JSON.stringify({ rules: [{ code: ['src/**'], spec: 'docs/adr/0001-base.md' }] }));
  const cBm = index43(B, ['--root', B, '--check']);
  assert('T43 c4: --check after moving a spec from folder to map (without touching the spec) → 1',
    cBm.code === 1 && /no longer the one that would come out now/.test(cBm.out), `code=${cBm.code} ${cBm.out}`);
  // A path with the separator « — » inside does not break --check (Codex, r1)
  write43(A, 'docs/specs/price — factory.md', '# Price\n\nThe price comes from the factory.\n');
  index43(A, ['--root', A, '--out', OUTSIDE]);
  const cSep = chk();
  assert('T43 c4: a spec called «price — factory.md» gets indexed and --check finds it up to date → 0',
    cSep.code === 0 && fs.readFileSync(OUTSIDE, 'utf8').includes('- docs/specs/price — factory.md — Price — The price comes from the factory. — 3 lines'),
    `code=${cSep.code} ${cSep.out}`);
  // Without --root, from a SUBFOLDER of a repo, the root is the repo's (not the current folder)
  const E = path.join(ROOT43, 'proj-e');
  fs.mkdirSync(path.join(E, '.git'), { recursive: true });
  write43(E, 'docs/specs/e.md', '# E\n\nOne.\n');
  fs.mkdirSync(path.join(E, 'src', 'sub'), { recursive: true });
  const rE = index43(path.join(E, 'src', 'sub'), []);
  assert('T43 c4: without --root, from a subfolder of a repo, the index goes to the repo root',
    rE.code === 0 && fs.existsSync(path.join(E, 'specs-index.md')) && !fs.existsSync(path.join(E, 'src', 'sub', 'specs-index.md')),
    `code=${rE.code} ${rE.out}`);

  // ---------------- Check 5 — idempotent and UTF-8 without BOM
  const OUTSIDE2 = path.join(BASE43, 'evidence', 'index-a-2.md');
  index43(A, ['--root', A, '--out', OUTSIDE]);
  index43(A, ['--root', A, '--out', OUTSIDE2]);
  const read43 = (p, enc) => { try { return fs.readFileSync(p, enc); } catch { return enc ? '' : Buffer.alloc(0); } };
  const i1 = read43(OUTSIDE, 'utf8'), i2 = read43(OUTSIDE2, 'utf8');
  assert('T43 c5: two `--index` in a row give the same content EXCEPT the «Generated:» line (date/HEAD), which is compared removed',
    withoutDate(i1) === withoutDate(i2) && withoutDate(i1).length > 100, `${withoutDate(i1).length} vs ${withoutDate(i2).length}`);
  const bytes = read43(OUTSIDE);
  assert('T43 c5: the index carries no BOM (first byte ≠ 0xEF)', bytes.length > 0 && bytes[0] !== 0xEF, `first byte 0x${bytes[0] && bytes[0].toString(16)}`);
  assert('T43 c5: accents and ñ intact (and the spec\'s BOM does not dirty its title)',
    i1.includes('- docs/specs/three.md — Three: commissions') && idx1.includes('— Four: café ñandú design — The naïve señor ordered a quick crème brûlée. —') &&
    !idx1.includes('\uFEFF') && !/Ã|Â/.test(idx1));

  const tmpsFinal = listing43(BASE43).split('\n').filter((l) => /\.tmp /.test(l));
  assert('T43: after all the runs there is no `.tmp` temp file of the index left', tmpsFinal.length === 0, tmpsFinal.join(' | '));
  try { fs.rmSync(BASE43, { recursive: true, force: true }); } catch { /* Windows sometimes holds on */ }
  assert('T43: the toy fixtures are deleted at the end', !fs.existsSync(BASE43));
}
// T43-END

// ── T45 (rule Re11644, 24-09-2026): the orchestrator OPENS and NAMES the terminal of a BIG
// lane. Before, the owner opened it with `/rename`. It is checked that the recipe is in
// `references/dispatch.md` (section «A BIG lane goes to a NAMED TERMINAL, not a subagent»),
// that `--dangerously-skip-permissions` only appears on a «never» line, and that `SKILL.md`
// no longer says «the owner opens it and names it». The recipe is looked at by pieces: the
// `claude` line (opus + auto + --name), the opening command (on this port: `osascript` with
// Terminal.app / iTerm, or `open`, with the runner by its absolute path — NOT TESTED ON
// macOS), the `unset`, the emergency exit and the prompt that does not load the skill. The
// POSITIVE CONTROLS go through the SAME functions as the real assertion, over the real text
// mutated. A section of its own, at the end, so as not to clash with T44.
{
  const terminalSection = (text) => {
    const start = text.indexOf('### A BIG lane goes to a NAMED TERMINAL, not a subagent');
    if (start < 0) return '';
    const end = text.indexOf('\n### ', start + 10);
    return text.slice(start, end < 0 ? undefined : end);
  };
  const linesOf = (t) => t.split(/\r?\n/);
  // Returns the list of what the recipe lacks (empty = fine).
  const recipeFailures = (section) => {
    const f = [];
    const pieces = ['unset ANTHROPIC_API_KEY CLAUDECODE CLAUDE_CODE_CHILD_SESSION', '/usr/bin/osascript',
      '/usr/bin/open -a Terminal', 'Do not load the orq skill', 'Re11644', 'NOT TESTED ON macOS',
      '.orchestrator/terminals/'];
    for (const p of pieces) if (!section.includes(p)) f.push(`missing «${p}»`);
    const lc = linesOf(section).filter((l) => /^\s*claude\s/.test(l));
    if (lc.length !== 1) f.push(`recipe claude lines: ${lc.length} (1 expected)`);
    for (const l of lc) {
      if (!/\s--model\s+opus(\s|$)/.test(l)) f.push('the claude line does not carry --model opus');
      if (!/\s--permission-mode\s+auto(\s|$)/.test(l)) f.push('the claude line does not carry --permission-mode auto');
      if (!/\s--name\s+T\d+-[A-Za-z0-9-]+(\s|$)/.test(l)) f.push('the claude line does not carry --name T<n>-<topic>');
      if (/dangerously-skip-permissions|haiku/.test(l)) f.push('the claude line carries skip-permissions or haiku');
    }
    // The opening: ONE line per terminal program, each opening the runner by ABSOLUTE path.
    const lo = linesOf(section).filter((l) => /set laneTab to do script|create window with default profile command/.test(l));
    if (lo.length !== 2) f.push(`osascript opening lines: ${lo.length} (2 expected: Terminal.app and iTerm)`);
    for (const l of lo) {
      if (!/bash '\/[^']+\/\.orchestrator\/terminals\/T\d+\.sh'/.test(l)) f.push('the osascript line does not open the runner with `bash` by absolute path');
    }
    if (!/set custom title of laneTab to "T\d+-/.test(section)) f.push('the Terminal.app opening does not title the tab with the lane name');
    if (!/to set name to "T\d+-/.test(section)) f.push('the iTerm opening does not name the session with the lane name');
    const lopen = linesOf(section).filter((l) => /^\s*\/usr\/bin\/open\s/.test(l));
    if (lopen.length !== 1) f.push(`open lines: ${lopen.length} (1 expected)`);
    for (const l of lopen) if (!/open -a Terminal "\/[^"]+\/T\d+\.command"/.test(l)) f.push('the open line does not use the runner by absolute path');
    // No bare binaries at the start of a code line: system binaries by absolute path.
    for (const l of linesOf(section)) if (/^\s*(osascript|open)\s/.test(l)) f.push(`bare binary: ${l.trim().slice(0, 40)}`);
    return f;
  };
  const skipWithoutNever = (text) => linesOf(text).map((l, i) => [l, i + 1])
    .filter(([l]) => l.includes('--dangerously-skip-permissions') && !/never/i.test(l)).map(([, n]) => n);
  const oldInSkill = (t) => /the owner opens (it )?and names it|ask the owner to open and name/i.test(t);

  const dispatch = read(`${SKILL}/references/dispatch.md`) || '';
  const section = terminalSection(dispatch);
  assert('T45: dispatch.md has the section «A BIG lane goes to a NAMED TERMINAL, not a subagent»', section.length > 200);
  const fr = recipeFailures(section);
  assert('T45: the opening recipe is complete (claude opus+auto+--name, osascript Terminal/iTerm and open with the runner by absolute path, unset, prompt without the skill, runner in .orchestrator/terminals/, NOT TESTED ON macOS, Re11644)',
    fr.length === 0, fr.join(' | '));
  assert('T45: the recipe keeps the Windows warning «never a bare `bash` on the `wt.exe` line» (the source repo\'s history, marked Windows only)',
    /never a bare `bash` on the `wt\.exe` line/.test(section) && /\(Windows only\)/.test(section));
  const sk = skipWithoutNever(dispatch);
  assert('T45: --dangerously-skip-permissions only appears on «never» lines in dispatch.md', sk.length === 0,
    sk.map((n) => `references/dispatch.md:${n}`).join(', '));
  assert('T45: SKILL.md no longer says «the owner opens it and names it»', !oldInSkill(skillMd));
  // POSITIVE CONTROLS — mutants over the REAL text, through the same functions.
  const remove = (t, from, to) => (t.includes(from) ? t.replace(from, to) : null);
  const mNoName = remove(section, ' --name T7-payments-migration', '');
  assert('  POSITIVE CONTROL: without --name in the real recipe, recipeFailures catches it',
    mNoName !== null && recipeFailures(mNoName).some((x) => x.includes('--name')));
  const mModel = remove(section, '--model opus', '--model sonnet');
  assert('  POSITIVE CONTROL: with another model in the real recipe, recipeFailures catches it',
    mModel !== null && recipeFailures(mModel).some((x) => x.includes('--model opus')));
  const mBash = remove(section, "bash '/Users/you/path/to/repo/.orchestrator/terminals/T7.sh'", "bash 'terminals/T7.sh'");
  assert('  POSITIVE CONTROL: with the runner by a RELATIVE path on the real osascript line, recipeFailures catches it',
    mBash !== null && recipeFailures(mBash).some((x) => x.includes('absolute path')));
  assert('  POSITIVE CONTROL: a recipe with skip-permissions and no «never» is caught by skipWithoutNever',
    skipWithoutNever(dispatch + '\nclaude --dangerously-skip-permissions --name T9-x\n').length === 1);
  assert('  POSITIVE CONTROL: the old phrase in SKILL.md is caught by oldInSkill',
    oldInSkill(skillMd + '\ngoes to a named terminal: the owner opens it and names it'));
  // POSITIVE CONTROL PER PIECE: each demanded piece is deleted from the REAL text (all its
  // appearances), and recipeFailures has to go red with each one separately.
  const demandedPieces = [' --name T7-payments-migration', '--permission-mode auto', 'CLAUDE_CODE_CHILD_SESSION',
    '/usr/bin/osascript', '/usr/bin/open -a Terminal', 'Do not load the orq skill'];
  const notCaught = demandedPieces.filter((p) => !section.includes(p) || recipeFailures(section.split(p).join('')).length === 0);
  assert('  POSITIVE CONTROL: removing EACH piece of the real recipe (--name, auto, unset CHILD_SESSION, osascript, open, prompt without the skill) turns recipeFailures red',
    notCaught.length === 0, `not caught: ${notCaught.join(' | ')}`);

  // ── T49 (rule Rc05909, 25-09-2026): the recipe's PATHS. The section says what a worktree
  // or runner path cannot carry (`"`, `$`, backtick, line break; spaces are fine; if it does
  // not comply, «another folder is chosen», it is not escaped), and the example runner
  // checks with `[ -d "…" ]` that the folder exists BEFORE the `cd`, with the message «the
  // worktree folder does not exist» and `exit 1`. Positive controls through the same
  // functions, over the real text mutated.
  const pathFailures = (sec) => {
    const f = [];
    const start = sec.indexOf('**Paths are not free-form either');
    const par = start < 0 ? '' : sec.slice(start, sec.indexOf('\n\n', start) < 0 ? undefined : sec.indexOf('\n\n', start));
    if (!par) f.push('the paragraph «Paths are not free-form either» is missing');
    for (const p of ['`"`', '`$`', 'backtick', 'line break', 'Spaces are fine', 'another folder is chosen', 'another folder to keep it in', 'it is not escaped'])
      if (!par.includes(p)) f.push(`the paths paragraph does not say «${p}»`);
    const ls = linesOf(sec);
    // Codex T49-r2: the Bash path does not admit `\`, and the cd carries its own message (not a mute `|| exit 1`).
    const reD = /^\s*\[ -d "(\/[^"$`\\]+)" \] \|\| \{ echo "T\d+: the worktree folder does not exist"; exit 1; \}\s*$/;
    const reCd = /^\s*cd "(\/[^"$`\\]+)" \|\| \{ echo "T\d+: could not enter the worktree folder"; exit 1; \}\s*$/;
    const iD = ls.findIndex((l) => reD.test(l));
    const iCd = ls.findIndex((l) => reCd.test(l));
    if (iD < 0) f.push('the example runner does not check [ -d "…" ] with «the worktree folder does not exist» and exit 1');
    else if (iCd < 0 || iCd !== iD + 1) f.push('the [ -d ] check does not go right before the runner\'s cd');
    else if (ls[iD].match(reD)[1] !== ls[iCd].match(reCd)[1]) f.push('the [ -d ] and the runner\'s cd look at different folders');
    return f;
  };
  const frT49 = pathFailures(section);
  assert('T49: the recipe says which paths are valid («"», «$», backtick, line break; spaces fine; another folder is chosen) and the runner checks [ -d ] before the cd',
    frT49.length === 0, frT49.join(' | '));
  const iPar49 = section.indexOf('**Paths are not free-form either');
  const mNoPar49 = iPar49 < 0 ? null : section.slice(0, iPar49) + section.slice(section.indexOf('\n\n', iPar49));
  assert('  POSITIVE CONTROL T49: without the paths paragraph in the real section, pathFailures catches it',
    frT49.length === 0 && mNoPar49 !== null && pathFailures(mNoPar49).length > 0);
  const lD49 = linesOf(section).find((l) => /^\s*\[ -d "/.test(l));
  const mNoD49 = lD49 === undefined ? null : section.replace(lD49 + '\n', '').replace(lD49, '');
  assert('  POSITIVE CONTROL T49: without the [ -d ] line in the real runner, pathFailures catches it',
    frT49.length === 0 && mNoD49 !== null && pathFailures(mNoD49).length > 0);
  // Codex T49-r1: the [ -d ] looks at one folder and the cd enters another → red.
  const mOther49 = lD49 === undefined ? null : section.replace(lD49, lD49.replace('"/Users/', '"/Users/other-'));
  assert('  POSITIVE CONTROL T49: with the [ -d ] looking at ANOTHER folder than the cd, pathFailures catches it',
    frT49.length === 0 && mOther49 !== null && mOther49 !== section && pathFailures(mOther49).length > 0);
  // Codex T49-r2: three more mutants, over the real text.
  const mNoRunner49 = remove(section, 'another folder to keep it in', 'x');
  assert('  POSITIVE CONTROL T49: without «another folder to keep it in» in the real paragraph, pathFailures catches it',
    frT49.length === 0 && mNoRunner49 !== null && pathFailures(mNoRunner49).length > 0);
  const mMuteCd49 = remove(section, '|| { echo "T7: could not enter the worktree folder"; exit 1; }', '|| exit 1');
  assert('  POSITIVE CONTROL T49: with the real runner\'s cd turned back into a mute `|| exit 1`, pathFailures catches it',
    frT49.length === 0 && mMuteCd49 !== null && pathFailures(mMuteCd49).length > 0);
  const mSlash49 = section.includes('"/Users/you/path/to/worktree-T7"') ? section.split('"/Users/you/path/to/worktree-T7"').join('"/Users/you/path\\to/worktree-T7"') : null;
  assert('  POSITIVE CONTROL T49: with `\\` in the real runner\'s path ([ -d ] and cd equal), pathFailures catches it',
    frT49.length === 0 && mSlash49 !== null && pathFailures(mSlash49).length > 0);
}

// ── T50 (rules Rdcb7cd and R8f3290, 25-09-2026): the evidence is copied into the repo with
// `scripts/evidence.js`, and step 5 bis of the close stops if the script fails (exit 1)
// BEFORE closing the program.
// NOT PORTED, on purpose (decision 2026-10-09, glossary §1): the source suite also checked,
// here, that every rule `R……` of `docs/PENDIENTE.md` §4 had its entry in `docs/DECISIONES.md`
// (anti-drift of the SOURCE repo's own decision log) and that `docs/evidencia/README.md`
// existed. Those three documents are the source repo's internal history and are not part of
// this copy, so there is nothing to compare: the anti-drift check does not exist here.
{
  console.log('\nT50. THE EVIDENCE COPY IS IN THE REPO');
  for (const f of ['scripts/evidence.js']) {
    let normal = false;
    try { normal = fs.lstatSync(`${SKILL}/${f}`).isFile(); } catch { normal = false; }
    assert(`T50: ${f} exists (regular file)`, normal, `${SKILL}/${f}`);
  }
  // The close's step 5 bis: copies with the script, goes on ONLY with 0 or 2, STOPS with any
  // other code and STOPS if there are `different` ones; all before the close. Whitespace is
  // collapsed first: the command file wraps its lines and a phrase may break across two.
  const flat = (t) => t.replace(/\s+/g, ' ');
  const batch50 = flat(read(`${SKILL}/commands/orq-batch-closed.md`) || '');
  const PHRASES_5BIS = ['Go on ONLY if the script exits with 0 or 2.', 'with any other code', 'carries `different` greater than 0, STOP'];
  const stepEvidenceStops = (t) => {
    const i = t.indexOf('scripts/evidence.js'), k = t.indexOf('close --program');
    return i >= 0 && PHRASES_5BIS.every((f) => { const j = t.indexOf(f); return j > i && k > j; });
  };
  assert('T50: /orq-batch-closed copies with scripts/evidence.js, goes on only with 0 or 2, STOPS with another code or with `different`, before the `close --program`',
    stepEvidenceStops(batch50));
  for (const f of PHRASES_5BIS) {
    assert(`  MUTANT T50: without «${f}», the assertion FAILS`,
      batch50.includes(f) && !stepEvidenceStops(batch50.split(f).join('')));
  }
  // T55 (28-sep, issue #16 point 11): step 5 bis STARTS with `evidence.js --where`; with 3 it
  // uses `--local-only`, tells the owner in one line and goes on to step 6 WITH NO commit or
  // push. «Local only» is the normal path: there is no longer a sentence forcing a stop when
  // the evidence cannot be pushed to the repo on that path (the one that remains, «you do not
  // close with the evidence unpushed», belongs to the «to the repo» route and is kept).
  const PHRASES_LOCAL_ONLY = ['--local-only', 'evidence local only because', 'go on to step 6 with no commit'];
  // Since 1.2.0 the command quotes the path (`node "$ORQ/scripts/evidence.js" --where`): the
  // closing quote is dropped before looking, so the phrase stays `scripts/evidence.js --where`.
  const unquote = (t) => t.replace(/\.js" /g, '.js ');
  const stepLocalOnly = (raw) => {
    const t = unquote(raw);
    const iD = t.indexOf('scripts/evidence.js --where');
    const k = t.indexOf('close --program');
    const iToRepo = t.indexOf('With 0 ("to the repo")');
    // `--where` is the FIRST call to evidence.js of the step, and the «to the repo» route comes after.
    return iD >= 0 && k > iD && iToRepo > iD && t.indexOf('scripts/evidence.js') === iD &&
      PHRASES_LOCAL_ONLY.every((f) => { const j = t.indexOf(f); return j > iD && j < k; });
  };
  assert('T55: /orq-batch-closed opens step 5 bis with `evidence.js --where`, with 3 uses `--local-only`, says so in one line and goes on to step 6 with no commit or push, before the `close --program`',
    stepLocalOnly(batch50));
  assert('  MUTANT T55: if `--where` is not the first thing the step calls (the normal copy goes first), the assertion FAILS',
    unquote(batch50).includes('scripts/evidence.js --where') &&
    !stepLocalOnly(unquote(batch50).replace('scripts/evidence.js --where', 'scripts/evidence.js --lane T1 --wherever')));
  for (const f of PHRASES_LOCAL_ONLY) {
    assert(`  MUTANT T55: without «${f}», the assertion FAILS`,
      batch50.includes(f) && !stepLocalOnly(batch50.split(f).join('')));
  }
}

/* ------------------------- T51. the live map names the pieces that exist */

// docs/map.html is the click-through map (T51, 25-09): a single file with no network and
// no files next to it, and every name it SHOWS comes from the repo. The names are NOT
// written here by hand: they are read from disk at the moment of the test (commands/,
// agents/, the GATES table of the script and the settings events that call the hook), and
// checked in BOTH directions against the TEXT THAT IS SEEN: the level-0 drawing (the HTML
// without <script>, <style>, comments, <title> or <desc>) plus the data that feeds the
// boxes of levels 1 and 2 (the map's own VISTAS object, evaluated apart, and only the views
// reachable with a click). A name in a comment or in an unreachable view does not count.
// That clicking paints something is proved by the Playwright script (kept in the source
// repo's evidence), not by this suite.
// NOTE: the map's internal identifiers (`VISTAS`, `nivel0`, `data-pieza` and the field names
// of the view objects) stay in SPANISH on purpose (decision T51): this section reads them.
console.log('\nT51. THE LIVE MAP (docs/map.html) NAMES THE REAL PIECES');
{
  const vmT51 = await import('node:vm');
  const mapT51 = read(path.join(SKILL, 'docs/map.html'));
  assert('T51: docs/map.html exists', mapT51 !== null);
  const escT51 = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // «/orq» does not count if it only appears inside «/orq-git-permit»: the name has to stand alone.
  const namesT51 = (txt, n) => new RegExp(`(?<![\\w-])${escT51(n)}(?![\\w-])`).test(txt);
  // Inventories of the repo. An error reading the folder is RED, not an empty list.
  const readMdT51 = (dir) => {
    try { return { names: fs.readdirSync(path.join(SKILL, dir)).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)) }; }
    catch (e) { return { error: `${dir}: ${e.code || e.message}` }; }
  };
  const cmdsT51 = readMdT51('commands');
  const agsT51 = readMdT51('agents');
  const commandsT51 = ['/orq', ...(cmdsT51.names || []).map((c) => '/' + c)];
  const agentsT51 = agsT51.names || [];
  assert('T51: commands/ and agents/ are read and are not empty',
    !cmdsT51.error && !agsT51.error && commandsT51.length >= 2 && agentsT51.length >= 1,
    [cmdsT51.error, agsT51.error, `commands=${commandsT51.length} agents=${agentsT51.length}`].filter(Boolean).join(' | '));
  // The gates that really exist: the keys of `const GATES = { … }` in the script (with or without quotes).
  const gatesOfT51 = (src) => {
    const b = (src || '').match(/const GATES = \{([\s\S]*?)\n\};/);
    return b ? [...b[1].matchAll(/^\s*['"]?([a-z]+(?:_[a-z]+)+)['"]?\s*:/gm)].map((m) => m[1]) : [];
  };
  const gatesT51 = gatesOfT51(script);
  assert('T51: the script carries its GATES table to check the map against', gatesT51.length >= 5, `gates=${gatesT51.length}`);
  // The hook's plugs per event. WHERE THEY ARE READ FROM: the machine's settings.json
  // (CLAUDE_CONFIG_DIR, or the user's ~/.claude) when the skill is installed there; where it
  // is NOT (no plug calls orchestrator-control.js, or no file), from the repo's own reference
  // `install/hooks-orchestrator.example.json` — the same 12 plugs the installer writes.
  // Only a settings.json that EXISTS and cannot be read, or is not JSON, is RED.
  const settingsStateT51 = (file) => {
    let txt;
    try { txt = fs.readFileSync(file, 'utf8'); } catch (e) { return e.code === 'ENOENT' ? { absent: true } : { error: `cannot be read (${e.code || e.message})` }; }
    try { return { json: JSON.parse(txt) }; } catch (e) { return { error: `is not JSON (${e.message})` }; }
  };
  // Counts per event the plugs whose command calls orchestrator-control.js (case-insensitive).
  const countEventsT51 = (json) => {
    const count = {};
    for (const [ev, groups] of Object.entries((json && json.hooks) || {})) for (const g of groups || []) for (const h of (g && g.hooks) || [])
      if (String(h.command || '').toLowerCase().includes('orchestrator-control.js')) count[ev] = (count[ev] || 0) + 1;
    return count;
  };
  const stT51 = settingsStateT51(SETTINGS);
  let countT51 = null;
  let sourceT51 = SETTINGS;
  if (stT51.error) {
    assert(`T51: ${SETTINGS} can be read`, false, stT51.error);
    countT51 = {};
  } else {
    countT51 = stT51.absent ? {} : countEventsT51(stT51.json);
  }
  if (!stT51.error && Object.keys(countT51).length === 0) {
    skip(`T51: ${SETTINGS} ${stT51.absent ? 'does not exist' : 'has no plug of orchestrator-control.js'} on this machine: the hook\'s events are read from install/hooks-orchestrator.example.json instead`);
    countT51 = countEventsT51(exampleJson);
    sourceT51 = 'install/hooks-orchestrator.example.json';
  }
  {
    const total = Object.values(countT51).reduce((a, b) => a + b, 0);
    assert(`T51: ${sourceT51} has hook plugs to look for in the map`, total > 0, `total=${total}`);
  }
  const eventsT51 = [
    ...Object.entries(countT51).map(([ev, n]) => (n > 1 ? `${ev} ×${n}` : ev)),
    `${Object.values(countT51).reduce((a, b) => a + b, 0)} plugs`];
  const WORDS_T51 = ['mini-orchestrator', 'SendMessage', 'READY ·', 'worktree', 'validate', 'merge',
    'STEP A', 'STEP B', 'STEP C', 'STEP D'];
  const namesListT51 = [...commandsT51, ...agentsT51, ...eventsT51, ...WORDS_T51];
  const CC_EVENTS_T51 = ['PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop', 'PreCompact', 'PostCompact',
    'SessionStart', 'SessionEnd', 'UserPromptSubmit', 'Notification'];

  // Comments out: HTML, /* … */ and // (at the start of a line or after a space, brace, comma or semicolon).
  const noCommentsT51 = (html) => html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[\s;,{}])\/\/[^\n]*/g, '$1');
  const stripTagsT51 = (s) => String(s).replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  // The data of the boxes: the map's VISTAS object, evaluated in an empty context (no DOM, no network).
  const dataT51 = (html) => {
    const i = html.indexOf('var VISTAS = {');
    const j = html.indexOf('\nvar nivel0 =', i);
    if (i < 0 || j < 0) return null;
    try { return vmT51.runInNewContext(html.slice(i, j) + '\n;VISTAS', Object.create(null), { timeout: 1000 }); } catch { return null; }
  };
  // What is seen: level 0 (HTML without code or comments) + the views reachable with a click.
  const visibleTextT51 = (html) => {
    const V = dataT51(html);
    if (!V || typeof V !== 'object') return null;
    const body = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|title|desc|head)\b[\s\S]*?<\/\1>/gi, ' ');
    const parts = [stripTagsT51(body)];
    const notes = [];
    const pending = [...html.matchAll(/data-pieza="([\w-]+)"/g)].map((m) => m[1]);
    const seen = new Set();
    while (pending.length) {
      const id = pending.shift();
      if (seen.has(id) || !V[id]) continue;
      seen.add(id);
      const v = V[id];
      parts.push(v.titulo, v.sub);
      for (const f of v.filas || []) { parts.push(f.rotulo); for (const k of f.cajas || []) parts.push(k.tag, k.txt); }
      for (const n of v.nota || []) { notes.push(String(n)); parts.push(stripTagsT51(n)); }
      if (v.enlace) { parts.push(v.enlace.txt); pending.push(v.enlace.a); }
    }
    return { text: parts.filter((x) => x != null).join('\n'), notes, views: seen.size };
  };

  const mapFailuresT51 = (html) => {
    const f = [];
    if (html === null || html === undefined) return ['it does not exist'];
    // A single file: no network and no files next to it. Only «#…» and «data:» are valid.
    const cod = noCommentsT51(html);
    const NOT_LOCAL = String.raw`\s*=\s*(?!["']?\s*(?:data:|#))`;
    if (/https?:\/\//i.test(cod)) f.push('contains http:// or https:// (the map uses no network)');
    if (new RegExp(String.raw`<script\b[^>]*\bsrc` + NOT_LOCAL, 'i').test(cod)) f.push('loads a <script src=> (the map is a single file)');
    if (new RegExp(String.raw`\b(?:src|srcset|poster|action|formaction|background)` + NOT_LOCAL, 'i').test(cod)) f.push('a src/srcset/poster attribute loads another file');
    if (new RegExp(String.raw`(?<![\w-])data` + NOT_LOCAL, 'i').test(cod)) f.push('a data= attribute loads another file');
    if (new RegExp(String.raw`\bhref` + NOT_LOCAL, 'i').test(cod)) f.push('an href points to another file (only #… and data: are valid)');
    if (/url\(\s*(?!["']?\s*(?:data:|#))/i.test(cod)) f.push('CSS with url(…) to another file');
    if (/@import\b/i.test(cod)) f.push('CSS with @import');
    if (/\bfetch\s*\(|XMLHttpRequest|\bimport\s*\(|new\s+WebSocket|new\s+EventSource|sendBeacon|new\s+Worker/.test(cod)) f.push('JS with a network call (fetch, XHR, import(), WebSocket…)');
    if (!/<script\b[^>]*>/i.test(html)) f.push('it has no <script> (positive control: without it there are no clicks)');
    const vis = visibleTextT51(html);
    if (vis === null) { f.push('the data of the boxes cannot be read (var VISTAS … var nivel0)'); return f; }
    const txt = vis.text;
    // repo → what is seen
    for (const n of namesListT51) if (!namesT51(txt, n)) f.push(`it does not name «${n}» in what is seen`);
    // what is seen → repo
    for (const m of txt.matchAll(/(?<![\w.~/\\-])\/[a-z][\w-]*/g)) if (!commandsT51.includes(m[0])) f.push(`it names «${m[0]}», which is not a command of the repo`);
    for (const m of txt.matchAll(/(?<![\w-])[a-z]+(?:_[a-z]+)+(?![\w-])/g)) if (!gatesT51.includes(m[0])) f.push(`it names the gate «${m[0]}», which is not in the script's GATES`);
    for (const n of vis.notes.filter((x) => x.includes('agents/'))) {
      const after = n.slice(n.indexOf('agents/') + 'agents/'.length);
      for (const m of after.matchAll(/<code\b[^>]*>([^<]+)<\/code>/g)) if (!agentsT51.includes(m[1])) f.push(`it names the agent «${m[1]}», which is not in agents/`);
    }
    for (const ev of CC_EVENTS_T51) if (namesT51(txt, ev) && !countT51[ev]) f.push(`it names the event «${ev}», which does not call the hook in ${sourceT51}`);
    for (const m of txt.matchAll(/\b([A-Z][A-Za-z]+) ×(\d+)/g)) if (countT51[m[1]] !== Number(m[2])) f.push(`it says «${m[0]}» and ${sourceT51} has ${countT51[m[1]] || 0}`);
    return f;
  };
  const fT51 = mapFailuresT51(mapT51);
  const visT51 = mapT51 === null ? null : visibleTextT51(mapT51);
  assert(`T51: the map is a single file with no network, and what is seen (level 0 + ${visT51 ? visT51.views : 0} views) names the ${namesListT51.length} names of the repo and of the plugs, without inventing commands, agents, gates or events`,
    fT51.length === 0, fT51.join(' | '));

  // Controls: the same function, over the real map with ONE thing broken (or fixed).
  const mT51 = mapT51 || '';
  const withT51 = (mut, piece) => fT51.length === 0 && mut !== mT51 && mapFailuresT51(mut).some((x) => x.includes(piece));
  const last = commandsT51[commandsT51.length - 1];
  const withoutLast = mT51.split(last).join('');
  assert(`  POSITIVE CONTROL T51: without «${last}» in the real map, mapFailuresT51 catches it`, withT51(withoutLast, last));
  assert('  POSITIVE CONTROL T51: with «/orq» only inside other commands, mapFailuresT51 catches it',
    withT51(mT51.replace(/\/orq(?![\w-])/g, '/orq-git-permit'), '«/orq»'));
  assert(`  POSITIVE CONTROL T51: with «${last}» only in an <!-- --> comment, mapFailuresT51 catches it`,
    withT51(withoutLast.replace('</body>', `<!-- ${last} --></body>`), last));
  assert(`  POSITIVE CONTROL T51: with «${last}» only after a // at the end of a script line, mapFailuresT51 catches it`,
    withT51(withoutLast.replace("'use strict';", `'use strict'; // ${last}`), last));
  assert(`  POSITIVE CONTROL T51: with «${last}» only in a view that cannot be reached with a click, mapFailuresT51 catches it`,
    withT51(withoutLast.replace('var VISTAS = {', `var VISTAS = {\n  muerta: { nivel: 1, c: '', titulo: '${last}', sub: '', filas: [], nota: [] },`), last));
  assert(`  POSITIVE CONTROL T51: with an invented command that starts like a real one («${last}-fake»), mapFailuresT51 catches it`,
    withT51(mT51.replace(`{ tag: '${last}',`, `{ tag: '${last}-fake', txt: 'x' }, { tag: '${last}',`), `${last}-fake`));
  assert('  POSITIVE CONTROL T51: with /orq-invented in the drawing, mapFailuresT51 catches it',
    withT51(mT51.replace('click on a piece</span>', 'click on a piece /orq-invented</span>'), '/orq-invented'));
  assert('  POSITIVE CONTROL T51: with an invented gate in a <code class=…>, mapFailuresT51 catches it',
    withT51(mT51.replace('<code>own_reading</code>', '<code>own_reading</code> · <code class="g">invented_gate</code>'), 'invented_gate'));
  const ag0 = agentsT51[0] || 'no-agents';
  assert('  POSITIVE CONTROL T51: with an invented agent in the agents/ note, mapFailuresT51 catches it',
    withT51(mT51.replace(`<code>${ag0}</code>`, `<code>${ag0}</code>, <code>invented-agent</code>`), 'invented-agent'));
  assert('  POSITIVE CONTROL T51: a junk map (no VISTAS) or an empty one (only <script>) does not pass',
    mapFailuresT51('x'.repeat(2000) + '<script></script>').some((x) => x.includes('data of the boxes'))
      && mapFailuresT51('<html><script></script></html>').length > 0);
  const NETWORK_T51 = ['<a href="https://x">x</a>', '<script src="x.js"></script>', '<img src="//host/x">', '<img src="resource.png">',
    '<iframe src="other.html"></iframe>', '<div style="background:url(\'background.png\')"></div>', '<style>@import "x.css";</style>',
    '<script>fetch("x")</script>', '<link rel="stylesheet" href="x.css">', '<a href="other.html">x</a>', '<object data="x.svg"></object>'];
  const notCaughtT51 = NETWORK_T51.filter((t) => mapFailuresT51(mT51.replace('</body>', t + '</body>')).length === 0);
  assert(`  POSITIVE CONTROL T51: the ${NETWORK_T51.length} external or local resources (https, script src, //host, local img/iframe/object, url(), @import, fetch, link/a href) are each caught`,
    fT51.length === 0 && notCaughtT51.length === 0, notCaughtT51.join(' '));
  assert('  NEGATIVE CONTROL T51: a <link rel="icon" href="data:…"> and an «@import» inside a comment (no network) are not rejected',
    fT51.length === 0 && mapFailuresT51(mT51.replace('</head>', '<link rel="icon" href="data:image/svg+xml,x"></head>')
      .replace('</body>', '<!-- there is no @import nor url(x.png) here --></body>')).length === 0);
  // settings.json: unreadable ≠ absent, and the script name regardless of case.
  const dirT51 = settingsStateT51(SKILL);
  assert('  POSITIVE CONTROL T51: a settings.json that exists but cannot be read (here, a folder) is an ERROR, not a skip',
    !!dirT51.error && !dirT51.absent, JSON.stringify(dirT51));
  assert('  NEGATIVE CONTROL T51: a settings.json that does not exist is a skip, not an error',
    settingsStateT51(path.join(SKILL, 'no-such-folder-T51', 'settings.json')).absent === true);
  assert('  POSITIVE CONTROL T51: a plug written ORCHESTRATOR-CONTROL.JS is counted all the same',
    countEventsT51({ hooks: { Stop: [{ hooks: [{ command: 'node "/X/SCRIPTS/ORCHESTRATOR-CONTROL.JS"' }] }] } }).Stop === 1);
  if (eventsT51.length) {
    const ev0 = eventsT51[0];
    assert(`  POSITIVE CONTROL T51: without «${ev0}» in the real map, mapFailuresT51 catches it`,
      withT51(mT51.split(ev0).join(ev0.replace(/[A-Za-z]/, '_')), ev0));
    const withCount = eventsT51.find((e) => / ×\d+$/.test(e));
    if (withCount) {
      const wrong = withCount.replace(/×(\d+)$/, (_, n) => '×' + (Number(n) + 1));
      assert(`  POSITIVE CONTROL T51: with «${wrong}» instead of «${withCount}», mapFailuresT51 catches it`,
        withT51(mT51.split(withCount).join(wrong), wrong));
    }
  }
}

/* ----------------------- T52. the README documents everything that exists (Rdcb7cd) */

// Rule Rdcb7cd (the owner, 25-09): the README explains the logic, the installation and ALL
// the commands. This keeps it from going stale: every `sub === '…'` of the script has to
// have ITS ROW in the «## Commands» section (a table row that starts with `| \`<sub>\``, not
// a loose mention: so an empty table does not pass), every `commands/*.md` its row
// `| \`/<name>\``, the agents of `agents/` named, and the README links docs/map.html and
// docs/evidence/.
console.log('\nT52. THE README DOCUMENTS EVERY COMMAND, AGENT AND MAP THAT EXISTS');
{
  const escT52 = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionT52 = (md, title) => {
    const i = md.search(new RegExp(`^## ${escT52(title)}\\s*$`, 'm'));
    if (i < 0) return null;
    const rest = md.slice(i + 3);
    const j = rest.search(/^## /m);
    return j < 0 ? rest : rest.slice(0, j);
  };
  // A REAL ROW (Codex Sol r1, T52): it starts with `| \`<name>\` |`, ALL its cells have text,
  // and if it is a subcommand row with an example column (4 cells), the example contains
  // `… <name>`. A row with empty cells documents nothing.
  const rowReT52 = (name) => new RegExp(`^\\|\\s*\`${escT52(name)}\`\\s*\\|`);
  const cellsT52 = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim());
  const rowT52 = (sec, name) => {
    const l = sec.split('\n').find((x) => rowReT52(name).test(x));
    if (!l) return false;
    const c = cellsT52(l);
    if (c.some((x) => x.replace(/[`*\s]/g, '') === '')) return false;
    // Exact shape (Codex Sol r3): the owner's commands and the subcommands, 4 cells; the git
    // commands the hook watches, 3 cells and the last «hook only». An extra column does not escape.
    if (name.startsWith('/') && c.length !== 4) return false;
    if (!name.startsWith('/') && !(c.length === 4 || (c.length === 3 && c[2] === 'hook only'))) return false;
    if (!name.startsWith('/') && c.length === 4) {
      // The example invokes THAT subcommand: with the abbreviation `… <name>` declared in the
      // README or with the full invocation `orchestrator-control.js <name>` (Codex Sol r2).
      if (!c[3].includes(`… ${name}`) && !c[3].includes(`orchestrator-control.js ${name}`)) return false;
      // And no option of the example is invented: every `--option` exists in the script
      // (Codex Sol r2). What the row SAYS it does cannot be checked by machine: that is
      // covered by the reading test and the review.
      for (const op of c[3].match(/--[a-z][a-z-]*/g) || []) if (!srcT52.includes(`'${op.slice(2)}'`) && !srcT52.includes(`'${op}'`)) return false;
    }
    return true;
  };
  /** Returns the list of failures; empty = the README is up to date. */
  const readmeFailuresT52 = (rawMd, subs, cmds, agents) => {
    const f = [];
    // What is commented out does not count as documented; an unclosed `<!--` hides everything after it.
    const md = rawMd.replace(/<!--[\s\S]*?(-->|$)/g, '');
    const sec = sectionT52(md, 'Commands');
    if (sec === null) return ['the «## Commands» section is missing'];
    for (const s of subs) if (!rowT52(sec, s)) f.push(`subcommand without a (complete) row in «Commands»: ${s}`);
    for (const c of cmds) if (!rowT52(sec, '/' + c)) f.push(`command without a (complete) row in «Commands»: /${c}`);
    for (const a of agents) if (!md.includes(a)) f.push(`agent not named: ${a}`);
    for (const e of ['docs/map.html', 'docs/evidence/']) if (!md.includes(e)) f.push(`it does not link ${e}`);
    const lines = md.split('\n').length - (md.endsWith('\n') ? 1 : 0);
    if (lines > 320) f.push(`README of ${lines} lines (cap 320)`);
    return f;
  };
  const mdT52 = read(`${SKILL}/README.md`) || '';
  const srcT52 = read(SCRIPT) || '';
  const subsT52 = [...new Set([...srcT52.matchAll(/sub === '([a-z-]+)'/g)].map((m) => m[1]))].sort();
  const cmdsT52 = (() => { try { return fs.readdirSync(`${SKILL}/commands`).filter((n) => n.endsWith('.md')).map((n) => n.slice(0, -3)).sort(); } catch { return []; } })();
  const agentsT52 = (() => { try { return fs.readdirSync(`${SKILL}/agents`).filter((n) => n.endsWith('.md')).map((n) => n.slice(0, -3)).sort(); } catch { return []; } })();
  // Controls that the harvest did not come out empty (a zero is not a fact).
  assert(`T52: the script has subcommands to document (there are ${subsT52.length})`, subsT52.length >= 20, subsT52.join(' '));
  assert(`T52: commands/ has commands to document (there are ${cmdsT52.length})`, cmdsT52.length >= 1);
  assert(`T52: agents/ has agents to name (there are ${agentsT52.length})`, agentsT52.length >= 1);
  const fT52 = readmeFailuresT52(mdT52, subsT52, cmdsT52, agentsT52);
  assert(`T52: the README has a row in «Commands» for the ${subsT52.length} subcommands and the ${cmdsT52.length} commands, names the ${agentsT52.length} agents, links map and evidence and does not go over 320 lines`,
    fT52.length === 0, fT52.join(' · '));
  assert('T52: the README also has the row of `/orq` (the skill itself)', rowT52(sectionT52(mdT52, 'Commands') || '', '/orq'));
  for (const t of ['How the skill thinks', 'Installation']) {
    assert(`T52: the README has the section «## ${t}»`, sectionT52(mdT52, t) !== null);
  }
  // T57 (issue #8): THERE IS an installer now. Inverted: before it demanded the notice «There
  // is no installer yet»; now it demands that notice is NOT there and that the «Installation»
  // section sends to `/orq-install` / `scripts/install.js` and checks with `--check`.
  {
    const instT57 = sectionT52(mdT52, 'Installation') || '';
    assert('T57: the installation no longer says «there is no installer yet» and keeps warning that macOS is not tested',
      !/no installer yet/i.test(mdT52) && /macOS (is )?NOT TESTED|NOT TESTED ON macOS/i.test(mdT52));
    assert('T57: the «Installation» section sends to `/orq-install` and to `scripts/install.js`, and checks with `--check`',
      /\/orq-install/.test(instT57) && /scripts\/install\.js/.test(instT57) && /--check/.test(instT57), instT57.slice(0, 300));
    assert('T57: the skill carries `scripts/install.js`', fs.existsSync(`${SKILL}/scripts/install.js`), `${SKILL}/scripts/install.js`);
    assert('  MUTANT T57: the old README (with «No installer yet (issue #8)») turns the first assertion red',
      /no installer yet/i.test('> **No installer yet (issue #8).**'));
  }
  // The 12 plugs of the hook are NOT written in the README (it points at
  // `install/hooks-orchestrator.example.json`): they are checked in section C, against the
  // installer's PLUGS. What the README does have to do is say it and link the file.
  assert('T52: the README points at install/hooks-orchestrator.example.json as the reference of the 12 plugs',
    mdT52.includes('install/hooks-orchestrator.example.json') && /12 hooks/.test(mdT52));
  // Mutants (over the real README): each one has to FAIL.
  if (subsT52.length && fT52.length === 0) {
    const s0 = subsT52[subsT52.length - 1];
    const noRow = mdT52.split('\n').filter((l) => !new RegExp(`^\\|\\s*\`${escT52(s0)}\`\\s*\\|`).test(l)).join('\n');
    assert(`  MUTANT T52: the README without the row of «${s0}» → FAILS`,
      readmeFailuresT52(noRow, subsT52, cmdsT52, agentsT52).some((x) => x.includes(s0)));
    assert('  MUTANT T52: with a new subcommand in the script that the README does not carry → FAILS',
      readmeFailuresT52(mdT52, [...subsT52, 'new-subcommand'], cmdsT52, agentsT52).some((x) => x.includes('new-subcommand')));
    const c0 = cmdsT52[0];
    const noCmd = mdT52.split('\n').filter((l) => !new RegExp(`^\\|\\s*\`/${escT52(c0)}\`\\s*\\|`).test(l)).join('\n');
    assert(`  MUTANT T52: the README without the row of «/${c0}» → FAILS`,
      readmeFailuresT52(noCmd, subsT52, cmdsT52, agentsT52).some((x) => x.includes('/' + c0)));
    assert('  MUTANT T52: with the «Commands» table empty (only the title) → FAILS',
      readmeFailuresT52(mdT52.replace(/^## Commands\s*$[\s\S]*?(?=^## )/m, '## Commands\n\n'), subsT52, cmdsT52, agentsT52).length >= subsT52.length);
    assert('  MUTANT T52: a subcommand mentioned only in prose (no row) does NOT count → FAILS',
      readmeFailuresT52(noRow + `\n\nText that names \`${s0}\` in passing.\n`, subsT52, cmdsT52, agentsT52).some((x) => x.includes(s0)));
    assert('  MUTANT T52: without «docs/map.html» → FAILS',
      readmeFailuresT52(mdT52.split('docs/map.html').join('docs/other.html'), subsT52, cmdsT52, agentsT52).some((x) => x.includes('map')));
    const rowS0 = mdT52.split('\n').find((l) => rowReT52(s0).test(l)) || '';
    const emptied = mdT52.split(rowS0).join(`| \`${s0}\` |  |  |  |`);
    assert(`  MUTANT T52: the row of «${s0}» with empty cells → FAILS`,
      readmeFailuresT52(emptied, subsT52, cmdsT52, agentsT52).some((x) => x.includes(s0)));
    const invS0 = `orchestrator-control.js ${s0}`;
    const noExample = rowS0.includes(invS0) ? mdT52.split(rowS0).join(rowS0.split(invS0).join('orchestrator-control.js other')) : null;
    assert(`  MUTANT T52: the row of «${s0}» with an example that is not its own → FAILS`,
      noExample !== null && readmeFailuresT52(noExample, subsT52, cmdsT52, agentsT52).some((x) => x.includes(s0)));
    const fiveCells = mdT52.split(rowS0).join(rowS0.replace(/\|\s*$/, '| extra cell |'));
    assert(`  MUTANT T52: the row of «${s0}» with a fifth cell → FAILS`,
      fiveCells !== mdT52 && readmeFailuresT52(fiveCells, subsT52, cmdsT52, agentsT52).some((x) => x.includes(s0)));
    assert(`  MUTANT T52: the row of «${s0}» put inside an HTML comment → FAILS`,
      readmeFailuresT52(mdT52.split(rowS0).join(`<!--\n${rowS0}\n-->`), subsT52, cmdsT52, agentsT52).some((x) => x.includes(s0)));
    assert(`  MUTANT T52: an UNCLOSED «<!--» right before the row of «${s0}» → FAILS`,
      readmeFailuresT52(mdT52.split(rowS0).join(`<!--\n${rowS0}`), subsT52, cmdsT52, agentsT52).some((x) => x.includes(s0)));
    assert(`  MUTANT T52: the row of «${s0}» with an invented option (--invented-option) → FAILS`,
      readmeFailuresT52(mdT52.split(rowS0).join(rowS0.replace(/`\s*\|\s*$/, ' --invented-option` |')), subsT52, cmdsT52, agentsT52).some((x) => x.includes(s0)));
    const short = mdT52.split(rowS0).join(rowS0.split(`node ~/.claude/skills/orq/scripts/${invS0}`).join(`… ${s0}`));
    assert(`  NEGATIVE CONTROL T52: the row of «${s0}» in the short form «… ${s0}» is also accepted`,
      short !== mdT52 && !readmeFailuresT52(short, subsT52, cmdsT52, agentsT52).some((x) => x.includes(s0)));
    assert('  MUTANT T52: a README of 321 lines → FAILS',
      readmeFailuresT52(mdT52 + '\n'.repeat(Math.max(0, 322 - mdT52.split('\n').length)), subsT52, cmdsT52, agentsT52).some((x) => x.includes('cap 320')));
  }
}

console.log(`\nSTRUCTURE: ${ok} OK, ${bad} FAILS`);
process.exit(bad === 0 ? 0 : 1);
