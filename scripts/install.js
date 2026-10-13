#!/usr/bin/env node
'use strict';
/* ============================================================================
 * install.js — puts the `orq` skill into the Claude Code configuration of whoever
 * uses it, and checks that it ended up right. No dependencies and no network.
 *
 * WHY IT EXISTS (issue #8, the owner, 2026-09-17): until now the 12 hook plugs were
 * pasted BY HAND into `settings.json`. Whoever got the JSON wrong while pasting
 * broke their `settings.json` or, worse, was left without any watching and did not
 * notice. This puts them in by itself: it merges, never replaces, with a backup first.
 *
 * USAGE
 *   node scripts/install.js                      installs (or updates) and summarises in 5 lines
 *   node scripts/install.js --check              checks; writes NOTHING
 *   ... --config-dir <path>                      another configuration folder
 *
 * CONFIGURATION FOLDER: `--config-dir` > `CLAUDE_CONFIG_DIR` > `~/.claude`
 * (`~` is `os.homedir()`: the home folder of whoever runs this, on macOS or on Windows).
 * The skill's path is this script's (`<skill>/scripts/..`); the `command` of each
 * plug carries it with `/` slashes on Windows too.
 *
 * WHAT IT DOES WHEN INSTALLING
 *   1. settings.json: if it does not exist, it creates it. If it exists and is not
 *      valid JSON, is not an object or cannot be read/written: it STOPS with exit 1,
 *      says what is going on and touches nothing. For each of the 12 plugs it looks,
 *      in the same event and with the same `matcher`, for an entry whose command
 *      points at `orchestrator-control.js` (by the end of the path, regardless of
 *      case and slashes): if it is there, it fixes `command` and `timeout` if they
 *      differ; if not, it adds it. Everything else in the file stays (the JSON comes
 *      out indented with 2 spaces). Before writing it leaves a copy
 *      `settings.json.bak-orq-<YYYYMMDD-HHMMSS>` with the bytes it read. If there is
 *      nothing to change it neither writes nor copies: "no changes".
 *      If `settings.json` is a SYMLINK (dotfiles on macOS) the file it points to is
 *      what gets written, and the link stays a link: it never replaces the link by a file.
 *   2. agents/ and commands/: it copies them to `<config>/agents` and `<config>/commands`
 *      with THE SAME function the skill load uses (`syncSkillPieces` of
 *      orchestrator-control.js): mark `# managed-by: orq`, never deletes, does not
 *      overwrite a file with no mark.
 *   3. autocompact: it does NOT write it. If `autoCompactWindow` does not match
 *      `airbag_tokens` of orchestrator.config.json, it says so with the why and the
 *      line the person can put in themselves ("the skill warns, it does not write").
 *   4. A 5-line summary for the person.
 *
 * EXIT CODES
 *   install:   0 installed (there may be warnings) · 1 could not (cause on screen) ·
 *              2 unknown option
 *   --check:   0 everything is there · 1 something is missing or differs (named) · 2 could not check
 *
 * IT NEVER DELETES ANYTHING: neither extra plugs, nor agents or commands that are no
 * longer in the skill. Uninstalling is by hand (rule "the sync never deletes").
 *
 * KNOWN LIMITS: between re-reading settings.json and the `rename` there is a window of
 * milliseconds in which another writer (Claude Code, another terminal) could lose its
 * change: there is no lock shared with Claude Code (the same race the old airbag write accepted).
 * The backup keeps what was read; it is born with mode 0600 on POSIX, and on Windows it
 * inherits the folder's permissions (the same as that folder's settings.json, barring an ACL of its own).
 * `1e-400` arrives from `JSON.parse` as `0` and cannot be seen (same limit as `fragileNumber`).
 * Rewriting the JSON normalises its format (indentation, `1.0` → `1`, `é` escapes → `é`)
 * and a DUPLICATE key keeps its last value, as `JSON.parse` already does when reading it.
 * A number that would not survive being rewritten (`1e400`, integers above 2^53) makes
 * it leave the file alone (exit 1).
 *
 * NOT TESTED ON macOS: everything that touches a real Mac (a symlinked settings.json
 * created by a dotfiles manager, the permissions of the home `.claude` folder, mode 0600 of the
 * backup on APFS) is written from the POSIX behaviour of Node, not run on a Mac.
 * ========================================================================== */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const HOOK_SCRIPT = path.join(ROOT, 'scripts', 'orchestrator-control.js');
const COMMAND = `node "${HOOK_SCRIPT.replace(/\\/g, '/')}"`;

// THE 12 PLUGS — single source of truth (install/hooks-orchestrator.example.json shows them as
// a reference and tests/test-structure.mjs checks both agree).
// `matcher: null` = the event carries no matcher.
const PLUGS = [
  { event: 'PreToolUse', matcher: 'Skill|Agent|Task|TaskCreate|TaskUpdate', timeout: 20 },
  { event: 'PreToolUse', matcher: 'Write|Edit', timeout: 20 },
  { event: 'PreToolUse', matcher: 'Bash|PowerShell', timeout: 20 },
  { event: 'PostToolUse', matcher: 'Bash|PowerShell', timeout: 20 },
  { event: 'PostToolUse', matcher: 'Write|Edit', timeout: 20 },
  { event: 'PostToolUse', matcher: 'Agent|Task', timeout: 20 },
  { event: 'PostToolUse', matcher: 'Read|Grep|Glob', timeout: 20 },
  { event: 'Stop', matcher: null, timeout: 20 },
  { event: 'SubagentStop', matcher: null, timeout: 15 },
  { event: 'PreCompact', matcher: null, timeout: 15 },
  { event: 'SessionStart', matcher: 'compact', timeout: 15 },
  { event: 'UserPromptSubmit', matcher: null, timeout: 10 },
];

const plugName = (e) => `${e.event} ${e.matcher === null ? '-' : e.matcher}`;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const msg = (e) => (e && (e.code ? `${e.code}: ${e.message}` : e.message)) || String(e);

/* ------------------------------------------------------------------ arguments */

function readArgs(argv) {
  const o = { check: false, configDir: null, help: false, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') o.check = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--config-dir') {
      // An option is not taken for a path (Codex Sol r1 T57: `--config-dir --check` installed into "./--check").
      if (i + 1 >= argv.length || !argv[i + 1] || argv[i + 1].startsWith('-')) { o.error = '--config-dir needs a path'; break; }
      o.configDir = argv[++i];
    } else if (a.startsWith('--config-dir=')) {
      o.configDir = a.slice('--config-dir='.length);
      if (!o.configDir) { o.error = '--config-dir needs a path'; break; }   // with "=" there is no possible confusion
    } else { o.error = `unknown option: ${a}`; break; }
  }
  return o;
}

function configFolder(o) {
  if (o.configDir) return path.resolve(o.configDir);
  if (process.env.CLAUDE_CONFIG_DIR) return path.resolve(process.env.CLAUDE_CONFIG_DIR);
  return path.join(os.homedir(), '.claude');
}

/* ------------------------------------------------------------- settings.json */

/** Reads settings.json. `{ exists:false }` if it is not there; `{ error }` if it cannot be read
 *  or is not a JSON object; otherwise `{ exists:true, bytes, text, bom, s }`. */
function readSettings(file) {
  let bytes;
  try { bytes = fs.readFileSync(file); }
  catch (e) {
    if (e && e.code === 'ENOENT') return { exists: false };
    return { error: `I cannot read ${file} (${msg(e)})` };
  }
  let text = bytes.toString('utf8');
  const bom = text.charCodeAt(0) === 0xfeff;
  if (bom) text = text.slice(1);
  let s;
  try { s = JSON.parse(text); }
  catch (e) { return { error: `${file} is not valid JSON (${e.message}). I am not touching it: fix it yourself and run this again.` }; }
  if (!isObject(s)) return { error: `${file} is not a JSON object (it is ${Array.isArray(s) ? 'a list' : JSON.stringify(s)}). I am not touching it.` };
  return { exists: true, bytes, text, bom, s };
}

/** Does this hook call orchestrator-control.js? It counts as the skill's ONLY a command whose
 *  real shape is `node "<path>/orchestrator-control.js"` (or unquoted): exactly TWO pieces, the
 *  FIRST is the program `node`/`node.exe` (with or without a path) and the second the script,
 *  compared by the end of the path, regardless of case and slashes (an old copy in another
 *  folder counts too). `echo orchestrator-control.js` or `echo node …/orchestrator-control.js`
 *  are somebody else's and are not touched (Codex Sol r3 and r4 T57; the orchestrator's criterion). */
const commandPieces = (c) => (String(c == null ? '' : c).trim().match(/"[^"]*"|'[^']*'|\S+/g) || [])
  .map((t) => t.replace(/^["']|["']$/g, ''));
const pathEnd = (p) => p.replace(/\\/g, '/').split('/').pop().toLowerCase();
const isSkillHook = (h) => {
  if (!isObject(h)) return false;
  const t = commandPieces(h.command);
  return t.length === 2 && /^node(\.exe)?$/.test(pathEnd(t[0])) && pathEnd(t[1]) === 'orchestrator-control.js';
};
const sameMatcher = (m, expected) => (expected === null
  ? (m === undefined || m === null || m === '' || m === '*')
  : m === expected);

/** Looks in `hooks` for the skill's entries and pairs them with the 12. Returns
 *  `{ error }` if the shape of `hooks` does not allow merging without breaking anything, or
 *  `{ paired: [{e, h, entry}|{e, h:null}], extra: [{event, matcher, h}] }`. */
function pair(hooks) {
  if (hooks === undefined) hooks = {};
  if (!isObject(hooks)) return { error: 'the "hooks" key of settings.json is not an object: I am not touching it' };
  const found = [];
  for (const [event, list] of Object.entries(hooks)) {
    if (!Array.isArray(list)) {
      if (PLUGS.some((e) => e.event === event)) return { error: `"hooks.${event}" is not a list: I am not touching it` };
      continue;
    }
    for (const entry of list) {
      if (!isObject(entry) || !Array.isArray(entry.hooks)) continue;
      for (const h of entry.hooks) if (isSkillHook(h)) found.push({ event, entry, h, used: false });
    }
  }
  const paired = PLUGS.map((e) => {
    const f = found.find((x) => !x.used && x.event === e.event && sameMatcher(x.entry.matcher, e.matcher));
    if (f) { f.used = true; return { e, h: f.h, entry: f.entry }; }
    return { e, h: null, entry: null };
  });
  const extra = found.filter((x) => !x.used)
    .map((x) => ({ event: x.event, matcher: x.entry.matcher, h: x.h }));
  return { paired, extra };
}

const extraText = (x) => `${x.event} ${x.matcher === undefined || x.matcher === '' ? '-' : x.matcher} → ${x.h.command}`;

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Backup with the EXACT bytes that were read, created exclusively
 *  (never overwrites another). Returns its path or throws. */
function backupOf(file, bytes) {
  const base = `${file}.bak-orq-${stamp()}`;
  for (let i = 1; i < 100; i++) {
    const dst = i === 1 ? base : `${base}-${i}`;
    // Mode 0600: the copy may carry keys; with the usual umask it would be born 0644 even if the
    // original were private (Codex Sol r1 T57, HIGH). On Windows the mode does not apply.
    let created = false;
    try {
      const fd = fs.openSync(dst, 'wx', 0o600);
      created = true;
      try { fs.writeFileSync(fd, bytes); } finally { try { fs.closeSync(fd); } catch (_) { /* already closed */ } }
      return dst;
    } catch (e) {
      if (!created && e && e.code === 'EEXIST') continue;
      // A half copy (disk full) is not left behind: it is deleted (Codex Sol r3 T57).
      if (created) { try { fs.unlinkSync(dst); } catch (_) { throw new Error(`${msg(e)}; and a HALF copy was left at ${dst}`); } }
      throw e;
    }
  }
  throw new Error('I did not find a free name for the backup');
}

/** Writes `text` to `file` atomically (exclusive temporary + rename). */
function writeAtomic(file, text, mode) {
  const tmp = `${file}.orq-${process.pid}-${Date.now()}.tmp`;
  let created = false, dumped = false;
  try {
    const fd = fs.openSync(tmp, 'wx', mode === null ? 0o600 : mode);
    created = true;
    try { fs.writeFileSync(fd, text); } finally { try { fs.closeSync(fd); } catch (_) { /* already closed */ } }
    fs.renameSync(tmp, file);
    dumped = true;
  } finally {
    if (created && !dumped) { try { fs.unlinkSync(tmp); } catch (_) { /* gone already */ } }
  }
}

/* --------------------------------------------- the skill's pieces and the airbag */

/** The hook module, loaded WITH NO SIDE EFFECTS (it exports only when it is not the main
 *  program). `null` if it could not be loaded. */
function hookModule() {
  try { return require(HOOK_SCRIPT); } catch (_) { return null; }
}

function version() {
  let label = null;
  try {
    const m = /^version:\s*(\S+)\s*$/m.exec(fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8'));
    if (m) label = `${m[1]} (from SKILL.md)`;
  } catch (_) { /* no readable SKILL.md */ }
  if (!label) {
    try {
      const m = /\bV-1\.\S+/.exec(fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'));
      if (m) label = `${m[0]} (from README.md)`;
    } catch (_) { /* no readable README */ }
  }
  let sha = null;
  try {
    sha = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'],
      { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim() || null;
  } catch (_) { sha = null; }
  if (label) return label + (sha ? ` · commit ${sha}` : '');
  return sha ? `no version written; commit ${sha}` : 'no version written and no git: unknown';
}

/** Compares the file's autocompact with the skill's airbag. Does NOT write. */
function autocompactState(mod, s) {
  const c = mod ? mod.heightsConfig() : null;
  if (!c) return { state: 'no-config', text: 'I could not read `airbag_tokens` from orchestrator.config.json: I am not comparing the autocompact' };
  const current = s ? s.autoCompactWindow : undefined;
  if (current === c.airbag) return { state: 'same', airbag: c.airbag, text: `autoCompactWindow = ${c.airbag}, the skill's` };
  return { state: 'different', airbag: c.airbag, current, text: mod.airbagWarning(current, c.airbag) };
}

/** State of ONE piece of the skill (agent or command) in the target folder. */
function pieceState(mod, sub, n, target) {
  let src = null, dst = null;
  try { src = fs.readFileSync(path.join(ROOT, sub, n), 'utf8'); } catch (_) { return { st: 'COULD NOT', txt: 'I could not read the skill\'s one' }; }
  try { dst = fs.readFileSync(path.join(target, n), 'utf8'); }
  catch (e) { return e && e.code === 'ENOENT' ? { st: 'MISSING', txt: 'not installed' } : { st: 'COULD NOT', txt: `I could not read it (${msg(e)})` }; }
  if (dst === src) return { st: 'OK', txt: 'same as the skill\'s' };
  if (mod && !mod.hasSkillMark(dst)) {
    return { st: 'DIFFERENT', txt: 'there is one of YOURS with that name, without the skill\'s mark: it is not touched (rename it if you want the skill\'s)' };
  }
  return { st: 'DIFFERENT', txt: 'it is an old version of the skill\'s (`install.js` updates it)' };
}

/* ---------------------------------------------------------------------- --check */

function check(dir) {
  const out = [];
  let missing = 0, couldNot = 0;
  const line = (st, txt) => {
    out.push(`${st.padEnd(9)} ${txt}`);
    if (st === 'MISSING' || st === 'DIFFERENT') missing++;
    if (st === 'COULD NOT') couldNot++;
  };
  out.push(`CHECK orq — configuration folder: ${dir} (I write nothing)`);
  out.push(`skill version: ${version()}`);
  const file = path.join(dir, 'settings.json');
  const r = readSettings(file);
  let s = null;
  if (r.error) line('COULD NOT', `settings.json: ${r.error}`);
  else if (!r.exists) {
    line('MISSING', `settings.json does not exist (${file})`);
    for (const e of PLUGS) line('MISSING', `plug ${plugName(e)}`);
  } else {
    s = r.s;
    line('OK', 'settings.json is valid JSON');
    const c = pair(s.hooks);
    if (c.error) line('COULD NOT', c.error);
    else {
      for (const { e, h, entry } of c.paired) {
        if (!h) { line('MISSING', `plug ${plugName(e)}`); continue; }
        const dif = [];
        if (e.matcher === null && entry.matcher !== undefined && entry.matcher !== null) dif.push(`carries matcher ${JSON.stringify(entry.matcher)} (this event goes without a matcher)`);
        if (h.type !== 'command') dif.push(`type ${JSON.stringify(h.type)} (it has to be "command": otherwise Claude Code does not run it)`);
        if (h.command !== COMMAND) dif.push(`points to another path (${h.command}; this skill's is ${COMMAND})`);
        if (h.timeout !== e.timeout) dif.push(`timeout ${JSON.stringify(h.timeout)} (the skill sets ${e.timeout})`);
        if (dif.length) line('DIFFERENT', `plug ${plugName(e)}: ${dif.join('; ')}`);
        else line('OK', `plug ${plugName(e)} (timeout ${e.timeout})`);
      }
      for (const x of c.extra) {
        line('DIFFERENT', `skill entry that is NOT one of the 12 (it is extra, remove it by hand; the skill does not delete): ${extraText(x)}`);
      }
    }
  }
  const mod = hookModule();
  if (!mod) line('COULD NOT', `I could not load ${HOOK_SCRIPT} to check agents, commands and autocompact`);
  else {
    for (const p of mod.SKILL_PARTS) {
      let names = [];
      try { names = fs.readdirSync(path.join(ROOT, p.sub)).filter((n) => n.toLowerCase().endsWith('.md')).sort(); }
      catch (e) { line('COULD NOT', `I could not read ${p.sub}/ of the skill (${msg(e)})`); continue; }
      const target = path.join(dir, p.sub);
      for (const n of names) {
        const ep = pieceState(mod, p.sub, n, target);
        line(ep.st, `${p.title.replace(/s$/, '')} ${n}: ${ep.txt}`);
      }
    }
    // The autocompact WARNS, it does not count as "missing": the number is each
    // person's decision ("put the number you prefer", the owner, issue #8).
    if (s) {
      const a = autocompactState(mod, s);
      if (a.state === 'no-config') line('COULD NOT', `autocompact: ${a.text}`);   // Codex Sol r2 T57: it is not "all installed"
      else out.push(`${(a.state === 'same' ? 'OK' : 'WARNING').padEnd(9)} autocompact: ${a.text}`);
    }
  }
  const code = couldNot ? 2 : (missing ? 1 : 0);
  out.push('');
  out.push(code === 0 ? 'CHECK: everything installed (exit 0).'
    : code === 1 ? `CHECK: ${missing} thing(s) missing or different, named above (exit 1). \`node "${path.join(ROOT, 'scripts', 'install.js').replace(/\\/g, '/')}"\` fixes it except what says "by hand" or "yours".`
      : `CHECK: I could not check ${couldNot} thing(s), named above (exit 2).`);
  process.stdout.write(out.join('\n') + '\n');
  return code;
}

/* -------------------------------------------------------------------- install */

function install(dir) {
  const out = [];
  const done = (code) => { process.stdout.write(out.join('\n') + '\n'); return code; };
  const stop = (cause) => {
    out.push(`STOP: ${cause}`);
    out.push('I touched nothing: neither settings.json, nor agents, nor commands. No backup (it was not needed).');
    return done(1);
  };
  out.push(`INSTALL orq — configuration folder: ${dir}`);
  out.push(`skill version: ${version()}`);
  out.push(`the plugs call: ${COMMAND}`);
  // Between double quotes, `"`, `$`, the backtick and a line break would still be special
  // for the shell: with such a path the 12 plugs would be broken or do something else (Codex Sol r3 T57).
  if (/["`$\r\n]/.test(HOOK_SCRIPT)) return stop(`the skill's path (${HOOK_SCRIPT}) carries quotes, $, a backtick or a line break: I cannot safely put it in the command. Move the skill to a folder without those characters.`);

  // 1) settings.json — everything is validated BEFORE writing anything.
  let file = path.join(dir, 'settings.json');
  // If it is a LINK (dotfiles on macOS), the file it points to is what gets worked on: a `rename`
  // over the link would replace it with a normal file (Codex Sol r2 T57). This is "writing THROUGH
  // the link": the link stays a link and the real file changes. NOT TESTED ON macOS — the suite's symlink
  // case (e4) runs only where the account may create links; on the Windows machine it was SKIPPED (EPERM).
  try {
    if (fs.lstatSync(file).isSymbolicLink()) {
      const real = fs.realpathSync(file);
      out.push(`settings.json is a link: I work on the file it points to (${real}); the link stays`);
      file = real;
    }
  } catch (e) { if (!e || e.code !== 'ENOENT') return stop(`I cannot resolve ${file} (${msg(e)})`); }
  const r = readSettings(file);
  if (r.error) return stop(r.error);
  const s = r.exists ? r.s : {};
  const c = pair(s.hooks);
  if (c.error) return stop(c.error);
  // BEFORE WRITING ANYTHING: a target agent or command that EXISTS but cannot be read (no
  // permission, a folder with that name…) the sync would treat as absent and overwrite.
  // Here only "does not exist" (ENOENT) counts; any other error STOPS (Codex Sol r3 T57, HIGH).
  const modP = hookModule();
  if (!modP) return stop(`I could not load ${HOOK_SCRIPT} (needed to copy agents and commands)`);
  for (const p of modP.SKILL_PARTS) {
    let names = [];
    try { names = fs.readdirSync(path.join(ROOT, p.sub)).filter((n) => n.toLowerCase().endsWith('.md')); }
    catch (_) { continue; }   // without that folder in the skill there is nothing to copy (the sync will say so)
    for (const n of names) {
      const dst = path.join(dir, p.sub, n);
      // `lstat` first: a DANGLING link gives ENOENT when read but EXISTS, and the sync
      // would replace it (Codex Sol r4 T57). Only the ENOENT of `lstat` means "does not exist".
      let exists = true;
      try { fs.lstatSync(dst); } catch (e) { if (e && e.code === 'ENOENT') exists = false; else return stop(`I cannot look at ${dst} (${msg(e)}): I am not overwriting it.`); }
      if (!exists) continue;
      // It exists: it has to be readable (if not —no permission, a folder, a dangling link—, it stops).
      try { fs.readFileSync(dst); }
      catch (e) {
        return stop(`I cannot read ${dst} (${msg(e)}): it exists and I do not know whether it is yours, so I am not overwriting it. Fix its permission or rename it, and run this again.`);
      }
    }
  }
  if (s.hooks === undefined) s.hooks = {};
  const added = [], fixed = [], alreadyThere = [];
  for (const { e, h, entry: paired } of c.paired) {
    if (h) {
      const dif = [];
      if (e.matcher === null && paired.matcher !== undefined && paired.matcher !== null) { dif.push(`matcher: ${JSON.stringify(paired.matcher)} → (no matcher)`); delete paired.matcher; }
      if (h.type !== 'command') { dif.push(`type: ${JSON.stringify(h.type)} → "command"`); h.type = 'command'; }
      if (h.command !== COMMAND) { dif.push(`path: ${h.command} → ${COMMAND}`); h.command = COMMAND; }
      if (h.timeout !== e.timeout) { dif.push(`timeout: ${JSON.stringify(h.timeout)} → ${e.timeout}`); h.timeout = e.timeout; }
      if (dif.length) fixed.push(`${plugName(e)} (${dif.join('; ')})`);
      else alreadyThere.push(plugName(e));
      continue;
    }
    if (!Array.isArray(s.hooks[e.event])) s.hooks[e.event] = [];
    const entry = e.matcher === null ? {} : { matcher: e.matcher };
    entry.hooks = [{ type: 'command', command: COMMAND, timeout: e.timeout }];
    s.hooks[e.event].push(entry);
    added.push(plugName(e));
  }
  const changes = !r.exists || added.length > 0 || fixed.length > 0;
  let settingsState;
  if (!changes) settingsState = 'no changes (the 12 plugs were already there; I neither write nor back up)';
  else {
    const modF = hookModule();
    if (!modF) return stop(`I could not load ${HOOK_SCRIPT} (needed to check the file before writing it)`);
    if (modF.fragileNumber(s)) return stop(`${file} has a number that would not survive rewriting the file (e.g. 1e400 or an integer above 2^53). I am not touching it.`);
    if (!r.exists) { try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { return stop(`I could not create ${dir} (${msg(e)})`); } }
    // Can it be written? It is looked at BEFORE the backup: if not, nothing changes.
    try {
      fs.accessSync(dir, fs.constants.W_OK);
      if (r.exists) fs.accessSync(file, fs.constants.W_OK);
    } catch (e) { return stop(`I do not have permission to write ${r.exists ? file : dir} (${msg(e)})`); }
    const eol = r.exists && /\r\n/.test(r.text) ? '\r\n' : '\n';
    let text = JSON.stringify(s, null, 2);
    if (eol === '\r\n') text = text.replace(/\n/g, '\r\n');
    if (!r.exists || /\r?\n$/.test(r.text)) text += eol;
    if (r.bom) text = '﻿' + text;
    let backup = null;
    if (r.exists) {
      try { backup = backupOf(file, r.bytes); }
      catch (e) { return stop(`I could not make the backup of ${file} (${msg(e)})`); }
      // Re-read just before writing: if somebody changed it in the meantime, I do not overwrite it.
      let now = null;
      try { now = fs.readFileSync(file); } catch (_) { now = null; }
      if (!now || !now.equals(r.bytes)) {
        out.push(`STOP: ${file} changed while I was reading it (another terminal or Claude Code wrote it). I am not touching it; run this again.`);
        out.push(`Backup (of what I read): ${backup}`);
        return done(1);
      }
    }
    let mode = null;
    if (r.exists) { try { mode = fs.statSync(file).mode; } catch (_) { mode = null; } }
    try { writeAtomic(file, text, mode); }
    catch (e) {
      out.push(`STOP: I could not write ${file} (${msg(e)}). The file is as it was.`);
      if (backup) out.push(`Backup: ${backup}`);
      return done(1);
    }
    settingsState = r.exists ? `updated · backup BEFORE writing: ${backup}` : `created (it did not exist: there was nothing to copy)`;
  }
  out.push(`settings.json (${file}): ${settingsState}`);
  for (const x of added) out.push(`  + added       ${x}`);
  for (const x of fixed) out.push(`  ~ fixed       ${x}`);
  for (const x of alreadyThere) out.push(`  = was there   ${x}`);
  for (const x of c.extra) out.push(`  ! extra       ${extraText(x)} (not one of the 12; the skill does not delete: remove it by hand if you do not want it)`);

  // 2) agents/ and commands/ — the same function as the skill load.
  process.env.CLAUDE_CONFIG_DIR = dir;
  const mod = hookModule();
  const gaps = [];
  let piecesDone = 0, piecesSame = 0, piecesError = false;
  if (!mod) { gaps.push(`agents and commands: I could not load ${HOOK_SCRIPT}`); piecesError = true; }
  else {
    const sync = mod.syncSkillPieces();
    for (const { part, r: p } of sync.results) {
      const made = p.copied + p.updated;
      piecesDone += made; piecesSame += p.same;
      out.push(`${part.title} (${path.join(dir, part.sub)}): ${p.copied} copied, ${p.updated} updated, ${p.same} same` +
        (p.foreign.length ? `, ${p.foreign.length} NOT touched: ${p.foreign.join(', ')}` : '') + (p.error ? ` · ERROR: ${p.error}` : ''));
      for (const a of p.foreign) gaps.push(`${part.title.replace(/s$/, '')} ${a}: you already have one of YOURS with that name, without the skill's mark, and I am not overwriting it (rename it if you want the skill's)`);
      if (p.error) { gaps.push(`${part.title}: ${p.error}`); piecesError = true; }
    }
  }
  for (const x of c.extra) gaps.push(`the entry ${extraText(x)} is extra and I am not deleting it (by hand)`);

  // 3) autocompact — WARNS, does not write.
  const a = autocompactState(mod, s);
  out.push(`autocompact: ${a.text}`);
  if (a.state === 'no-config') gaps.push('I could not compare your autocompact: the skill\'s orchestrator.config.json is missing or unreadable (run --check)');

  // 4) summary for the person: 5 lines.
  const type = a.state === 'different'
    ? `if you want the skill's autocompact, put the line "autoCompactWindow": ${a.airbag} in settings.json yourself (the skill does not touch it); nothing else.`
    : 'nothing else.';
  out.push('');
  out.push('SUMMARY (for you):');
  out.push(`1. Installed: ${added.length} new plug(s) and ${fixed.length} fixed in settings.json; ${piecesDone} agent(s)/command(s) copied or updated.`);
  out.push(`2. Already there: ${alreadyThere.length} of 12 plugs and ${piecesSame} agent(s)/command(s) the same${!changes ? ' — settings.json unchanged' : ''}.`);
  out.push(`3. Not done: ${gaps.length ? gaps.join(' · ') : 'nothing.'}`);
  out.push(`4. You have to type: ${type}`);
  out.push('5. Open a NEW terminal: one that is already open does not re-read settings.json. There, inside a git repo, type /orq and it has to show "Orchestration RUNNING".');
  return done(piecesError ? 1 : 0);
}

/* ----------------------------------------------------------------------- main */

function main() {
  const o = readArgs(process.argv.slice(2));
  if (o.help) {
    process.stdout.write('usage: node scripts/install.js [--check] [--config-dir <path>]\n' +
      '  no options: installs the 12 plugs, agents and commands (with a backup).\n' +
      '  --check: checks without writing anything (0 all there, 1 something missing, 2 could not check).\n');
    return 0;
  }
  if (o.error) { process.stderr.write(`install.js: ${o.error}\n`); return 2; }
  const dir = configFolder(o);
  return o.check ? check(dir) : install(dir);
}

let code = 2;
try { code = main(); }
catch (e) {
  try { process.stderr.write(`install.js: unexpected error (${msg(e)}). I do not know whether I got to write anything: run --check.\n`); } catch (_) { /* nothing */ }
  code = process.argv.includes('--check') ? 2 : 1;
}
process.exitCode = code;
