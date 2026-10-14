/**
 * T57 — test of the skill's INSTALLER (`scripts/install.js`, issue #8).
 *
 * Run:  node tests/test-install.mjs          (from the skill's root or from a worktree)
 *       ORCH_INSTALL=<another copy of install.js> node tests/test-install.mjs   (mutants)
 *
 * The skill under test is THIS file's (`<here>/..`), not the installed one: that way a
 * worktree tests itself without depending on ORQ_HOOK. EVERYTHING runs against TOY
 * configuration folders (`os.tmpdir()/orq-T58-config-*`, with `--config-dir` and also with
 * `CLAUDE_CONFIG_DIR` pointing at the toy), which are deleted at the end. The REAL
 * settings.json of whoever runs this is fingerprinted at the start and at the end: if it
 * changes, it FAILS.
 *
 *   (a) install from scratch: (a1) with no settings.json it creates it with the 12, copies agents
 *       and commands with the mark, exit 0, 5-line summary; (a2) with a settings.json with no
 *       hooks, it makes a backup BEFORE writing (bytes = the original ones) and names it
 *   (b) second run: "no changes", byte for byte equal, no new backup
 *   (c) settings.json with OTHER hooks and foreign keys: they stay the same, and the 12 are added
 *   (d) broken JSON / non-object / hooks.X that is not a list / no permission: exit 1, cause,
 *       untouched, no backup, no agents
 *   (e) plug with another path and another timeout: fixed, says which, no duplicates;
 *       (e4) settings.json that is a SYMLINK (macOS dotfiles): written THROUGH the link, the link stays
 *   (f) --check: 0 with everything; 1 with one removed (names it); 2 with broken JSON; writes nothing
 *   (g) different autoCompactWindow: warning with the owner's why, and the key does not change
 *   (h) agent installed WITHOUT the mark: it is not overwritten and it is warned
 *   (i) nothing in the scripts hardcodes a personal path; the default folder comes from os.homedir()
 * The mutants of the brief are run by the lane's evidence folder with ORCH_INSTALL pointing
 * at each mutated copy.
 *
 * NOT TESTED ON macOS: the mode 0600 of the backup is only checked on POSIX, and the symlink
 * case was exercised with a Node symlink, not with a real dotfiles manager on a Mac.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL = process.env.ORCH_INSTALL || path.join(SKILL, 'scripts', 'install.js');
const COMMAND = `node "${path.join(SKILL, 'scripts', 'orchestrator-control.js').replace(/\\/g, '/')}"`;
const AIRBAG = JSON.parse(fs.readFileSync(path.join(SKILL, 'orchestrator.config.json'), 'utf8')).airbag_tokens;
const MARK = '# managed-by: orq';
const WHY = 'The skill watches how much memory each terminal carries and writes a handover before it gets summarized, ' +
  'so that nothing about where it was is lost on compacting. If your autocompact is very high, the terminal gets summarized whenever ' +
  'Claude Code decides and the handover arrives late. With 600k there is time to write it. Put the number you prefer: ' +
  'if you raise it, warn yourself before it compacts; if you lower it, you will compact more often.';
const SIGNATURES = [
  'PreToolUse Skill|Agent|Task|TaskCreate|TaskUpdate 20', 'PreToolUse Write|Edit 20', 'PreToolUse Bash|PowerShell 20',
  'PostToolUse Bash|PowerShell 20', 'PostToolUse Write|Edit 20', 'PostToolUse Agent|Task 20', 'PostToolUse Read|Grep|Glob 20',
  'Stop - 20', 'SubagentStop - 15', 'PreCompact - 15', 'SessionStart compact 15', 'UserPromptSubmit - 10',
].sort();

let ok = 0, bad = 0;
const assertOk = (name, cond, detail) => {
  if (cond) { ok++; console.log(`  OK    T57 ${name}`); }
  else { bad++; console.log(`  FAIL  T57 ${name}${detail ? '  <- ' + String(detail).slice(0, 400) : ''}`); }
};

// The REAL settings.json: fingerprinted before and after. Nothing in this suite touches it.
const REAL = path.join(os.homedir(), '.claude', 'settings.json');
const fingerprint = (p) => { try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch { return 'ABSENT'; } };
const realBefore = fingerprint(REAL);

const folders = [];
// Even if the suite blows up halfway (a mutant that breaks a shape), the toys are deleted:
// measured on 9-Oct, every mutant run that crashed left ~9 folders in the temp dir.
process.on('exit', () => {
  for (const d of folders) { try { fs.chmodSync(path.join(d, 'settings.json'), 0o644); } catch { /* it was not there */ } try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* held */ } }
});
// GUARD (incident of 9-Oct: an empty variable made a run fall onto ~/.claude). Every configuration
// folder of this suite has to exist, not be empty as a path and NOT be ~/.claude nor lie inside it.
// If not, the suite ABORTS before launching anything.
const CLAUDE_REAL = path.resolve(os.homedir(), '.claude').toLowerCase();
// The written path AND its physical destination are compared (`realpath`: a link or junction to
// ~/.claude is also dangerous), and the folder has to exist (Codex Sol r4 T57).
const realOf = (p) => { try { return fs.realpathSync.native(p).toLowerCase(); } catch { return null; } };
const CLAUDE_PHYSICAL = realOf(path.join(os.homedir(), '.claude')) || CLAUDE_REAL;
const insideOf = (r, base) => r === base || r.startsWith(base + path.sep);
const dangerousToy = (d, mustExist = true) => {
  const r = d ? path.resolve(d).toLowerCase() : '';
  if (!d || !r || insideOf(r, CLAUDE_REAL) || insideOf(r, CLAUDE_PHYSICAL)) return true;
  if (!mustExist) return false;
  const f = realOf(d);
  return f === null || insideOf(f, CLAUDE_REAL) || insideOf(f, CLAUDE_PHYSICAL);
};
const guardToy = (d) => {
  if (dangerousToy(d)) {
    console.log(`  FAIL  T57 GUARD: configuration folder not valid for a test ("${d}"): ABORT without launching anything`);
    process.exit(2);
  }
  return d;
};
const conf = (settings) => {
  const d = guardToy(fs.mkdtempSync(path.join(os.tmpdir(), 'orq-T58-config-')));
  folders.push(d);
  if (settings !== undefined) fs.writeFileSync(path.join(d, 'settings.json'), settings);
  return d;
};
const run = (dir, ...args) => {
  guardToy(dir);
  const r = spawnSync(process.execPath, [INSTALL, ...args, '--config-dir', dir], {
    encoding: 'utf8', windowsHide: true, timeout: 60000,
    env: { ...process.env, CLAUDE_CONFIG_DIR: dir },
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const file = (dir) => path.join(dir, 'settings.json');
const readJ = (dir) => { try { return JSON.parse(fs.readFileSync(file(dir), 'utf8')); } catch { return null; } };
const bytes = (p) => { try { return fs.readFileSync(p); } catch { return null; } };
const baks = (dir) => fs.readdirSync(dir).filter((n) => /^settings\.json\.bak-orq-\d{8}-\d{6}(-\d+)?$/.test(n));
// A skill hook is a CALL to node with the script (an `echo orchestrator-control.js` is not).
// Same criterion as the installer: two pieces, the first the `node` program, the second the script.
const isOrq = (h) => {
  const t = (String((h && h.command) || '').trim().match(/"[^"]*"|'[^']*'|\S+/g) || []).map((x) => x.replace(/^["']|["']$/g, ''));
  const end = (p) => p.replace(/\\/g, '/').split('/').pop().toLowerCase();
  return t.length === 2 && /^node(\.exe)?$/.test(end(t[0])) && end(t[1]) === 'orchestrator-control.js';
};
// The signatures as the README's `node -e` prints them: event matcher timeout.
const signatures = (s) => {
  const o = [];
  for (const [e, a] of Object.entries((s && s.hooks) || {})) for (const m of a || []) for (const h of (m && m.hooks) || []) {
    // The `type` counts too: without "command" Claude Code does not run it (Codex Sol r1 T57).
    if (isOrq(h)) o.push(`${e} ${m.matcher || '-'} ${h.timeout}` + (h.type === 'command' ? '' : ` type=${h.type}`));
  }
  return o.sort();
};
const orqCommands = (s) => {
  const o = [];
  for (const a of Object.values((s && s.hooks) || {})) for (const m of a || []) for (const h of (m && m.hooks) || []) {
    if (isOrq(h)) o.push(h.command);
  }
  return o;
};
const pieces = (sub) => fs.readdirSync(path.join(SKILL, sub)).filter((n) => n.endsWith('.md')).sort();
const summary = (out) => {
  const ls = out.split(/\r?\n/);
  const i = ls.indexOf('SUMMARY (for you):');
  return i < 0 ? [] : ls.slice(i + 1).filter((l) => l.trim() !== '');
};
const fullOf12 = () => {
  const d = conf();
  run(d);
  return d;
};

console.log('\nT57. THE INSTALLER (scripts/install.js)');
console.log(`  (skill under test: ${SKILL}; script: ${INSTALL})`);
// The GUARD knows how to fail: it rejects empty, ~/.claude and a subfolder of it; it accepts a temp one.
assertOk('GUARD: rejects an empty configuration folder, ~/.claude or anything inside ~/.claude, and accepts a temp one',
  dangerousToy('') && dangerousToy(undefined) && dangerousToy(path.join(os.homedir(), '.claude')) &&
  dangerousToy(path.join(os.homedir(), '.Claude', 'x')) && !dangerousToy(path.join(os.tmpdir(), 'orq-T58-config-x'), false) &&
  dangerousToy(path.join(os.tmpdir(), 'orq-T58-does-not-exist-' + process.pid)) && !dangerousToy(os.tmpdir()));

/* (i) no personal path hardcoded; the default folder comes from os.homedir() */
{
  const src = fs.readFileSync(INSTALL, 'utf8');
  assertOk('(i) install.js hardcodes no personal path (no C:/Users/…, no /Users/<name>) and resolves ~/.claude with os.homedir()',
    !/[A-Za-z]:[\\/]Users[\\/]/.test(src) && !/['"`]\/Users\//.test(src) && /os\.homedir\(\)/.test(src), 'a personal path or no os.homedir()');
}

/* (a1) FROM SCRATCH: no settings.json */
{
  const d = conf();
  const r = run(d);
  const s = readJ(d);
  assertOk('(a1) from scratch exits with 0', r.code === 0, r.out);
  assertOk('(a1) creates settings.json with EXACTLY the 12 plugs', JSON.stringify(signatures(s)) === JSON.stringify(SIGNATURES), JSON.stringify(signatures(s)));
  assertOk('(a1) the 12 call THIS skill\'s script, with / slashes', orqCommands(s).length === 12 &&
    orqCommands(s).every((c) => c === COMMAND && !c.includes('\\')), JSON.stringify(orqCommands(s).slice(0, 2)));
  for (const sub of ['agents', 'commands']) {
    const ns = pieces(sub);
    const good = ns.filter((n) => {
      const dst = bytes(path.join(d, sub, n));
      return dst && dst.equals(fs.readFileSync(path.join(SKILL, sub, n))) && dst.toString('utf8').includes(MARK);
    });
    assertOk(`(a1) copies the ${ns.length} ${sub} of the skill, equal and with the mark`, ns.length > 0 && good.length === ns.length, `${good.length}/${ns.length}`);
  }
  const rs = summary(r.out);
  assertOk('(a1) ends with the 5-line summary (1. Installed … 5. NEW terminal)', rs.length === 5 &&
    /^1\. Installed: 12 new plug/.test(rs[0]) && /^2\. Already there:/.test(rs[1]) && /^3\. Not done: nothing/.test(rs[2]) &&
    /^4\. You have to type:/.test(rs[3]) && /^5\. Open a NEW terminal: one that is already open does not re-read settings\.json/.test(rs[4]), rs.join(' | '));
  assertOk('(a1) says it CREATED it and that there is no backup because there was nothing to copy (declared)',
    /settings\.json .*: created \(it did not exist: there was nothing to copy\)/.test(r.out) && baks(d).length === 0, r.out.slice(0, 600));
}

/* (a2) FROM SCRATCH with a freshly started settings.json (no hooks): BACKUP BEFORE */
let dA2 = null;
{
  const orig = '{\n  "model": "opus"\n}\n';
  const d = conf(orig);
  dA2 = d;
  const r = run(d);
  const bk = baks(d);
  assertOk('(a2) with a settings.json with no hooks it exits with 0', r.code === 0, r.out);
  assertOk('(a2) leaves ONE copy settings.json.bak-orq-<YYYYMMDD-HHMMSS>', bk.length === 1, fs.readdirSync(d).join(', '));
  assertOk('(a2) the copy has the bytes from BEFORE writing', bk.length === 1 && bytes(path.join(d, bk[0])).equals(Buffer.from(orig)));
  assertOk('(a2) and the output names the copy', bk.length === 1 && r.out.includes(path.join(d, bk[0])), r.out.slice(0, 600));
  if (process.platform === 'win32') console.log('  NOTE  T57 (a2) the 0600 mode of the copy is only checked on POSIX (it does not apply on Windows)');
  else assertOk('(a2) the copy is born with mode 0600 (it may carry keys)', bk.length === 1 && (fs.statSync(path.join(d, bk[0])).mode & 0o777) === 0o600);
  const s = readJ(d);
  assertOk('(a2) and the file ends up with the 12 and its `model` intact', s && s.model === 'opus' && JSON.stringify(signatures(s)) === JSON.stringify(SIGNATURES));
}

/* (b) SECOND RUN: no changes */
{
  const d = dA2;
  const before = bytes(file(d));
  const nBak = baks(d).length;
  const r = run(d);
  assertOk('(b) the second run exits with 0 and says "no changes"', r.code === 0 && /settings\.json .*: no changes/.test(r.out), r.out.slice(0, 600));
  assertOk('(b) settings.json stays byte for byte equal', bytes(file(d)).equals(before));
  assertOk('(b) no new backup', baks(d).length === nBak, fs.readdirSync(d).join(', '));
  assertOk('(b) and the summary says "Already there: 12 of 12"', summary(r.out)[1] && /Already there: 12 of 12/.test(summary(r.out)[1]), summary(r.out).join(' | '));
}

/* (c) FOREIGN KEYS AND HOOKS: they stay */
{
  const foreign = {
    model: 'opus',
    permissions: { allow: ['Bash(git status)'], deny: ['Read(.env)'] },
    env: { FOO: '1' },
    statusLine: { type: 'command', command: 'node line.js' },
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node C:/other/gate.js', timeout: 5 }] }],
      Notification: [{ hooks: [{ type: 'command', command: 'echo hello' }] }],
      // A FOREIGN hook that only NAMES the script (it does not call it with node): it is not the skill's (Codex Sol r3 T57).
      // And one that names `node` and the script but whose FIRST program is `echo` (the orchestrator, after Codex r4).
      Stop: [{ hooks: [{ type: 'agent', prompt: 'audit' }] }, { hooks: [{ type: 'command', command: 'echo orchestrator-control.js', timeout: 3 }] },
        { hooks: [{ type: 'command', command: 'echo node "C:/other/scripts/orchestrator-control.js"', timeout: 4 }] }],
    },
    autoCompactWindow: AIRBAG,
  };
  const d = conf(JSON.stringify(foreign, null, 4) + '\n');
  const r = run(d);
  const s = readJ(d);
  assertOk('(c) with foreign hooks and keys it exits with 0', r.code === 0, r.out);
  const keys = ['model', 'permissions', 'env', 'statusLine', 'autoCompactWindow'];
  assertOk('(c) the foreign keys stay the SAME (model, permissions, env, statusLine, autoCompactWindow)',
    s && keys.every((k) => JSON.stringify(s[k]) === JSON.stringify(foreign[k])) &&
    JSON.stringify(Object.keys(s)) === JSON.stringify(Object.keys(foreign)), s && JSON.stringify(Object.keys(s)));
  assertOk('(c) the foreign hooks are still there, in their place (first of their list) and equal',
    s && JSON.stringify(s.hooks.PreToolUse[0]) === JSON.stringify(foreign.hooks.PreToolUse[0]) &&
    JSON.stringify(s.hooks.Notification) === JSON.stringify(foreign.hooks.Notification) &&
    JSON.stringify(s.hooks.Stop[0]) === JSON.stringify(foreign.hooks.Stop[0]) &&
    JSON.stringify(s.hooks.Stop[1]) === JSON.stringify(foreign.hooks.Stop[1]), s && JSON.stringify(s.hooks.Stop.slice(0, 2)));
  assertOk('(c) and the 12 are added', s && JSON.stringify(signatures(s)) === JSON.stringify(SIGNATURES), s && JSON.stringify(signatures(s)));
  assertOk('(c) `echo orchestrator-control.js` and `echo node …/orchestrator-control.js` are NOT taken for the skill\'s plugs: they stay untouched and are not said to be fixed',
    s && JSON.stringify(s.hooks.Stop[1]) === JSON.stringify(foreign.hooks.Stop[1]) && JSON.stringify(s.hooks.Stop[2]) === JSON.stringify(foreign.hooks.Stop[2]) &&
    !/fixed +Stop/.test(r.out) && /\+ added +Stop -/.test(r.out), r.out.slice(0, 900));
}

/* (d) IT CANNOT: stops with exit 1, says the cause and touches NOTHING */
const untouched = (name, content, cause) => {
  const d = conf(content);
  const r = run(d);
  assertOk(`(d) ${name}: exit 1 and the cause (${cause})`, r.code === 1 && /STOP:/.test(r.out) && new RegExp(cause).test(r.out), r.out.slice(0, 500));
  assertOk(`(d) ${name}: the file stays byte for byte equal, with no backup and no agents or commands`,
    bytes(file(d)).equals(Buffer.from(content)) && baks(d).length === 0 &&
    !fs.existsSync(path.join(d, 'agents')) && !fs.existsSync(path.join(d, 'commands')), fs.readdirSync(d).join(', '));
};
untouched('broken JSON', '{ "hooks": { "Stop": [ ', 'is not valid JSON');
untouched('JSON that is not an object', '[1, 2]', 'is not a JSON object');
untouched('"hooks.PreToolUse" that is not a list', '{"hooks": {"PreToolUse": {"matcher": "x"}}}', '"hooks\\.PreToolUse" is not a list');
untouched('a number that would not survive rewriting', '{"x": 1e400}', 'number that would not survive');
{
  // Without write permission (on Windows, the "read-only" attribute).
  const content = '{"model": "opus"}\n';
  const d = conf(content);
  fs.chmodSync(file(d), 0o444);
  let readOnly = false;
  try { fs.accessSync(file(d), fs.constants.W_OK); } catch { readOnly = true; }
  if (!readOnly) console.log('  NOTE  T57 (d) no permission: this system lets a 0444 file be written (root?); case not applicable here');
  else {
    const r = run(d);
    assertOk('(d) without write permission: exit 1 and the cause', r.code === 1 && /STOP: I do not have permission to write/.test(r.out), r.out.slice(0, 500));
    assertOk('(d) without permission: untouched and with no backup', bytes(file(d)).equals(Buffer.from(content)) && baks(d).length === 0, fs.readdirSync(d).join(', '));
  }
  fs.chmodSync(file(d), 0o644);
}

/* (e) PLUG WITH ANOTHER PATH / ANOTHER TIMEOUT: fixed, said, not duplicated */
{
  const old = {
    hooks: {
      PreToolUse: [{ matcher: 'Write|Edit', hooks: [{ type: 'command', command: 'node "C:/old/multi-terminal-orchestrator/scripts/published/orchestrator-control.js"', timeout: 99 }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'node "C:\\Users\\x\\.claude\\skills\\orq\\scripts\\ORCHESTRATOR-CONTROL.JS"', timeout: 20 }] }],
    },
  };
  const d = conf(JSON.stringify(old, null, 2) + '\n');
  const r = run(d);
  const s = readJ(d);
  assertOk('(e) exits with 0', r.code === 0, r.out);
  assertOk('(e) says which it fixed and what (path and timeout)',
    /~ fixed +PreToolUse Write\|Edit \(path: .*published\/orchestrator-control\.js" → .*; timeout: 99 → 20\)/.test(r.out) &&
    /~ fixed +Stop - \(path: /.test(r.out), r.out.slice(0, 900));
  assertOk('(e) with no duplicates: exactly 12 plugs, all at this skill\'s path', s &&
    JSON.stringify(signatures(s)) === JSON.stringify(SIGNATURES) && orqCommands(s).every((c) => c === COMMAND), s && JSON.stringify(signatures(s)));
  assertOk('(e) the fixed entry is THE SAME one (no other was added next to it)', s && s.hooks.PreToolUse.length === 3 && s.hooks.Stop.length === 1,
    s && `${s.hooks.PreToolUse.length} / ${s.hooks.Stop.length}`);
}
/* (e2) plug with the right path and timeout but WITHOUT `type: "command"`: --check flags it, install fixes it */
{
  const d = conf();
  run(d);
  const s0 = readJ(d);
  delete s0.hooks.Stop[0].hooks[0].type;
  fs.writeFileSync(file(d), JSON.stringify(s0, null, 2) + '\n');
  const rc = run(d, '--check');
  assertOk('(e2) --check flags the plug without `type: "command"` as DIFFERENT and exits with 1',
    rc.code === 1 && /DIFFERENT +plug Stop -: type undefined/.test(rc.out), rc.out.slice(-600));
  const r = run(d);
  assertOk('(e2) install fixes it to "command" and says so', r.code === 0 && /~ fixed +Stop - \(type: undefined → "command"\)/.test(r.out) &&
    readJ(d).hooks.Stop[0].hooks[0].type === 'command', r.out.slice(0, 900));
}
/* (e3) an event with no matcher that carries `matcher: "*"`: --check flags it, install removes it without duplicating (Codex Sol r2 T57) */
{
  const d = conf();
  run(d);
  const s0 = readJ(d);
  s0.hooks.Stop[0].matcher = '*';
  fs.writeFileSync(file(d), JSON.stringify(s0, null, 2) + '\n');
  const rc = run(d, '--check');
  assertOk('(e3) --check flags `matcher: "*"` in Stop as DIFFERENT and exits with 1', rc.code === 1 && /DIFFERENT +plug Stop -: carries matcher "\*"/.test(rc.out), rc.out.slice(-600));
  const r = run(d);
  const s = readJ(d);
  assertOk('(e3) install removes the matcher, without adding another entry', r.code === 0 && s.hooks.Stop.length === 1 &&
    !('matcher' in s.hooks.Stop[0]) && JSON.stringify(signatures(s)) === JSON.stringify(SIGNATURES), r.out.slice(0, 900));
}
/* (e4) settings.json that is a SYMLINK (macOS dotfiles): the real file is updated and the link stays (Codex Sol r2 T57).
 *      It is written THROUGH the link. On Windows creating a symlink may need privileges: then it says SKIPPED with the reason. */
{
  const d = conf();
  const realDir = conf('{"model": "opus", "autoCompactWindow": 200000}\n');
  let linked = true, linkErr = '';
  try { fs.symlinkSync(file(realDir), file(d), 'file'); } catch (e) { linked = false; linkErr = (e && e.code) || String(e); }
  if (!linked) console.log(`  SKIPPED T57 (e4) cannot create a symlink on this system (${linkErr}; on Windows it needs Developer Mode or administrator): the symlinked settings.json case did NOT run here — NOT TESTED ON macOS`);
  else {
    const r = run(d);
    assertOk('(e4) with a symlinked settings.json: exit 0, the link is STILL a link and the real file has the 12',
      r.code === 0 && fs.lstatSync(file(d)).isSymbolicLink() && JSON.stringify(signatures(readJ(realDir))) === JSON.stringify(SIGNATURES) &&
      readJ(realDir).model === 'opus', r.out.slice(0, 600));
    assertOk('(e4) ...the link still points at the same file (it was not replaced by a file) and the backup sits next to the REAL file',
      path.resolve(path.dirname(file(d)), fs.readlinkSync(file(d))) === file(realDir) && baks(realDir).length === 1 && baks(d).length === 0,
      `${fs.readlinkSync(file(d))} · real baks ${baks(realDir).length} · link baks ${baks(d).length}`);
    assertOk('(e4) ...and the autocompact is only warned about: autoCompactWindow in the real file stays 200000',
      readJ(realDir).autoCompactWindow === 200000 && r.out.includes(WHY), JSON.stringify(readJ(realDir).autoCompactWindow));
    const r2 = run(d);
    assertOk('(e4) a second run through the link says "no changes" and the link survives', r2.code === 0 && /: no changes/.test(r2.out) && fs.lstatSync(file(d)).isSymbolicLink(), r2.out.slice(0, 400));
  }
}

/* (f) --check */
{
  const d = fullOf12();
  const before = bytes(file(d));
  const r0 = run(d, '--check');
  assertOk('(f) --check on a complete installation exits with 0', r0.code === 0 && /CHECK: everything installed/.test(r0.out), r0.out.slice(-600));
  assertOk('(f) --check shows the version or the SHA', /skill version: (V-1\.\S+|\d+\.\d+\.\d+\S*|no version written; commit [0-9a-f]{7,})/.test(r0.out), r0.out.slice(0, 300));
  assertOk('(f) --check writes nothing (settings.json byte for byte equal, no copies)', bytes(file(d)).equals(before) && baks(d).length === 0);
  // ONE is removed.
  const s = readJ(d);
  s.hooks.UserPromptSubmit = [];
  fs.writeFileSync(file(d), JSON.stringify(s, null, 2) + '\n');
  const r1 = run(d, '--check');
  assertOk('(f) with one plug fewer it exits with 1 and names it', r1.code === 1 && /MISSING +plug UserPromptSubmit -/.test(r1.out), r1.out.slice(-700));
  // Different timeout.
  const s2 = readJ(d);
  s2.hooks.UserPromptSubmit = [{ hooks: [{ type: 'command', command: COMMAND, timeout: 3 }] }];
  fs.writeFileSync(file(d), JSON.stringify(s2, null, 2) + '\n');
  const r2 = run(d, '--check');
  assertOk('(f) with another timeout it exits with 1 and names it', r2.code === 1 && /DIFFERENT +plug UserPromptSubmit -: timeout 3/.test(r2.out), r2.out.slice(-700));
  // One installed command fewer.
  fs.writeFileSync(file(d), JSON.stringify({ ...s2, hooks: { ...s2.hooks, UserPromptSubmit: [{ hooks: [{ type: 'command', command: COMMAND, timeout: 10 }] }] } }, null, 2) + '\n');
  fs.rmSync(path.join(d, 'commands', 'dashboard.md'));
  const r3 = run(d, '--check');
  assertOk('(f) with one command fewer it exits with 1 and names it', r3.code === 1 && /MISSING +command dashboard\.md/.test(r3.out), r3.out.slice(-700));
  // Broken JSON.
  fs.writeFileSync(file(d), '{ broken');
  const r4 = run(d, '--check');
  assertOk('(f) with broken JSON it exits with 2 (could not check)', r4.code === 2 && /COULD NOT +settings\.json: .*is not valid JSON/.test(r4.out), r4.out.slice(0, 500));
  assertOk('(f) ...and does not touch it', bytes(file(d)).equals(Buffer.from('{ broken')));
  // Empty folder: everything is missing, and it creates nothing.
  const v = conf();
  const r5 = run(v, '--check');
  assertOk('(f) --check in an empty folder exits with 1 and creates NOTHING', r5.code === 1 && fs.readdirSync(v).length === 0 && /MISSING +settings\.json does not exist/.test(r5.out), r5.out.slice(0, 400));
}

/* (g) DIFFERENT AUTOCOMPACT: warns with the why, does not write */
{
  const d = conf(JSON.stringify({ autoCompactWindow: 200000 }, null, 2) + '\n');
  const r = run(d);
  const s = readJ(d);
  assertOk('(g) with a different autoCompactWindow, the warning carries the owner\'s why AS IS', r.code === 0 && r.out.includes(WHY), r.out.slice(0, 900));
  assertOk('(g) ...the current value, the recommended one and the exact line to put',
    r.out.includes('is set to 200000') && r.out.includes(`recommends ${AIRBAG}`) && r.out.includes(`"autoCompactWindow": ${AIRBAG}`), r.out.slice(0, 900));
  assertOk('(g) ...and does NOT write it: autoCompactWindow stays at 200000', s && s.autoCompactWindow === 200000, s && JSON.stringify(s.autoCompactWindow));
  const before = bytes(file(d));
  const r2 = run(d);
  assertOk('(g) with everything installed and the autocompact different: "no changes", file byte for byte equal',
    /: no changes/.test(r2.out) && bytes(file(d)).equals(before) && r2.out.includes(WHY), r2.out.slice(0, 400));
  const rc = run(d, '--check');
  assertOk('(g) --check shows it as a WARNING with the why, without counting it as missing (exit 0)',
    rc.code === 0 && /WARNING +autocompact: /.test(rc.out) && rc.out.includes(WHY), rc.out.slice(-500));
  const same = conf(JSON.stringify({ autoCompactWindow: AIRBAG }) + '\n');
  const rsame = run(same);
  assertOk('(g) with the autocompact the SAME, neither the why nor a line to put', rsame.code === 0 && !rsame.out.includes(WHY) &&
    new RegExp(`autocompact: autoCompactWindow = ${AIRBAG}`).test(rsame.out) && readJ(same).autoCompactWindow === AIRBAG, rsame.out.slice(0, 400));
  // `false` is not the airbag even if it "sounds like nothing": strict comparison → warning (orchestrator, decision 3b).
  const fa = conf('{"autoCompactWindow": false}\n');
  const rf = run(fa);
  assertOk('(g) with `autoCompactWindow: false` it also warns (it is set to false) and does not write it',
    rf.code === 0 && rf.out.includes(`is set to false and the skill recommends ${AIRBAG}`) && readJ(fa).autoCompactWindow === false, rf.out.slice(0, 500));
}

/* (h2) A TARGET THAT EXISTS BUT CANNOT BE READ (here, a folder with the agent's name): STOPS without touching anything (Codex Sol r3 T57, HIGH) */
{
  const d = conf();
  fs.mkdirSync(path.join(d, 'agents', 'lane-lead.md'), { recursive: true });
  const r = run(d);
  assertOk('(h2) an unreadable target agent: exit 1 and the cause ("I cannot read … I am not overwriting it")',
    r.code === 1 && /STOP: I cannot read .*lane-lead\.md .*I am not overwriting it/.test(r.out), r.out.slice(0, 500));
  assertOk('(h2) ...and touches nothing: neither settings.json, nor copies, nor what was there',
    !fs.existsSync(file(d)) && fs.statSync(path.join(d, 'agents', 'lane-lead.md')).isDirectory() &&
    !fs.existsSync(path.join(d, 'commands')), fs.readdirSync(d).join(','));
}

/* (h) AGENT INSTALLED WITHOUT THE MARK: it is not overwritten */
{
  const d = conf();
  const mine = '---\nname: lane-lead\ndescription: mine\n---\nThis is MINE and carries no mark.\n';
  fs.mkdirSync(path.join(d, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(d, 'agents', 'lane-lead.md'), mine);
  const r = run(d);
  assertOk('(h) with an agent of your own without the mark, it installs anyway (exit 0)', r.code === 0, r.out.slice(0, 400));
  assertOk('(h) ...does NOT overwrite it (byte for byte equal)', bytes(path.join(d, 'agents', 'lane-lead.md')).equals(Buffer.from(mine)));
  assertOk('(h) ...and warns it in "3. Not done:"', /^3\. Not done: .*lane-lead\.md.*YOURS/.test(summary(r.out)[2] || ''), summary(r.out).join(' | '));
  const rc = run(d, '--check');
  assertOk('(h) --check names it as DIFFERENT (yours, without the mark) and exits with 1',
    rc.code === 1 && /DIFFERENT +agent lane-lead\.md: there is one of YOURS/.test(rc.out), rc.out.slice(-600));
}

/* (f2) --check without being able to read orchestrator.config.json: it is NOT "everything installed" (exit 2) (Codex Sol r2 T57) */
{
  const d = fullOf12();
  const rs = spawnSync(process.execPath, [INSTALL, '--check', '--config-dir', d], {
    encoding: 'utf8', windowsHide: true, timeout: 60000,
    env: { ...process.env, CLAUDE_CONFIG_DIR: d, ORCH_CONFIG: path.join(d, 'does-not-exist.json') },
  });
  const out = (rs.stdout || '') + (rs.stderr || '');
  assertOk('(f2) --check without the airbag config exits with 2 and says so (COULD NOT autocompact)',
    rs.status === 2 && /COULD NOT +autocompact: I could not read `airbag_tokens`/.test(out) && !/everything installed/.test(out), out.slice(-500));
  // And when INSTALLING without that config, the summary does not say "Not done: nothing" (Codex Sol r3 T57).
  const di = conf();
  const ri = spawnSync(process.execPath, [INSTALL, '--config-dir', di], {
    encoding: 'utf8', windowsHide: true, timeout: 60000,
    env: { ...process.env, CLAUDE_CONFIG_DIR: di, ORCH_CONFIG: path.join(di, 'does-not-exist.json') },
  });
  assertOk('(f2) install without the airbag config puts it in "3. Not done:"',
    ri.status === 0 && /^3\. Not done: .*I could not compare your autocompact/.test(summary(ri.stdout || '')[2] || ''), summary(ri.stdout || '').join(' | '));
}

/* Extras: precedence of --config-dir and unknown option */
{
  // `--config-dir=-cfg` (with "=") is a legitimate path that starts with a dash.
  const cwdG = conf();
  const rg = spawnSync(process.execPath, [INSTALL, '--config-dir=-cfg'], {
    cwd: cwdG, encoding: 'utf8', windowsHide: true, timeout: 60000, env: { ...process.env, CLAUDE_CONFIG_DIR: cwdG },
  });
  assertOk('`--config-dir=-cfg` is accepted as a path (with "=" it is not confused with an option)',
    rg.status === 0 && fs.existsSync(path.join(cwdG, '-cfg', 'settings.json')), `${rg.status} · ${(rg.stdout || '').slice(0, 200)}`);
  const a = conf(), b = conf();
  const r = spawnSync(process.execPath, [INSTALL, '--config-dir', b], {
    encoding: 'utf8', windowsHide: true, timeout: 60000, env: { ...process.env, CLAUDE_CONFIG_DIR: a },
  });
  assertOk('--config-dir wins over CLAUDE_CONFIG_DIR (writes to the --config-dir one and not the other)',
    r.status === 0 && fs.existsSync(file(b)) && fs.readdirSync(a).length === 0, `${r.status} · a: ${fs.readdirSync(a).join(',')}`);
  const c = conf();
  const rx = run(c, '--revoke');
  assertOk('an option that does not exist (--revoke) exits with 2 and writes nothing', rx.code === 2 && fs.readdirSync(c).length === 0, rx.out.slice(0, 200));
  // `--config-dir --check`: the option is NOT taken for a path (Codex Sol r1 T57).
  const cwdV = conf();
  const rv = spawnSync(process.execPath, [INSTALL, '--config-dir', '--check'], {
    cwd: cwdV, encoding: 'utf8', windowsHide: true, timeout: 60000, env: { ...process.env, CLAUDE_CONFIG_DIR: cwdV },
  });
  assertOk('`--config-dir --check` exits with 2 and does not install into a folder called "--check"',
    rv.status === 2 && fs.readdirSync(cwdV).length === 0, `${rv.status} · ${fs.readdirSync(cwdV).join(',')}`);
  // --help writes nothing and exits with 0.
  const ch = conf();
  const rh = spawnSync(process.execPath, [INSTALL, '--help'], {
    encoding: 'utf8', windowsHide: true, timeout: 60000, env: { ...process.env, CLAUDE_CONFIG_DIR: ch },
  });
  assertOk('--help exits with 0, prints the usage and writes nothing', rh.status === 0 && /usage: node scripts\/install\.js/.test(rh.stdout || '') && fs.readdirSync(ch).length === 0, `${rh.status}`);
}

/* (s) THE BUNDLED SKILL splittasks: the variant of THIS system is copied whole to <config>/skills/splittasks */
{
  const VARIANT = { win32: 'splittasks-windows', darwin: 'splittasks-macos' }[process.platform] || null;
  const fileHasMark = (n, text) => /\.md$/i.test(n)
    ? /^---\r?\n[\s\S]*?\r?\n---/.test(text) && text.slice(0, 4096).includes(MARK)
    : (text.split(/\r?\n/).find((l) => l.trim() !== '') || '').trim() === MARK;
  // POSITIVE CONTROL: both variants exist in the skill, each with a SKILL.md named `splittasks` and marked.
  for (const v of ['splittasks-windows', 'splittasks-macos']) {
    const md = bytes(path.join(SKILL, 'skills', v, 'SKILL.md'));
    assertOk(`(s) the skill carries skills/${v}/SKILL.md with name: splittasks and the mark in its header`,
      md !== null && /^name:\s*splittasks\s*$/m.test(md.toString('utf8')) && fileHasMark('SKILL.md', md.toString('utf8')), md ? md.toString('utf8').slice(0, 200) : 'missing');
    // The trust helper both SKILL.md call (`bash "$HOME/.claude/skills/splittasks/claude-trust-paths.sh"`) travels with each variant, marked.
    const sh = bytes(path.join(SKILL, 'skills', v, 'claude-trust-paths.sh'));
    assertOk(`(s) the skill carries skills/${v}/claude-trust-paths.sh with the mark on its first line`,
      sh !== null && fileHasMark('claude-trust-paths.sh', sh.toString('utf8')) && md !== null && md.toString('utf8').includes('skills/splittasks/claude-trust-paths.sh'),
      sh ? sh.toString('utf8').slice(0, 80) : 'missing');
  }
  const d = conf();
  const r = run(d);
  const target = path.join(d, 'skills', 'splittasks');
  if (!VARIANT) {
    assertOk(`(s) on ${process.platform} there is no variant: it says SKIPPED and installs no splittasks (exit 0)`,
      r.code === 0 && /skill splittasks: no variant for this system/.test(r.out) && !fs.existsSync(target), r.out.slice(0, 600));
  } else {
    const names = fs.readdirSync(path.join(SKILL, 'skills', VARIANT)).filter((n) => fs.statSync(path.join(SKILL, 'skills', VARIANT, n)).isFile()).sort();
    const good = names.filter((n) => {
      const dst = bytes(path.join(target, n));
      return dst && dst.equals(fs.readFileSync(path.join(SKILL, 'skills', VARIANT, n))) && fileHasMark(n, dst.toString('utf8'));
    });
    assertOk(`(s) from scratch it copies the ${names.length} file(s) of skills/${VARIANT} to <config>/skills/splittasks, equal and marked (exit 0)`,
      r.code === 0 && names.length > 0 && good.length === names.length && new RegExp(`skill splittasks \\(.*variant ${VARIANT}\\): ${names.length} copied, 0 updated, 0 same`).test(r.out),
      `${good.length}/${names.length} · ${r.out.slice(0, 500)}`);
    assertOk('(s) the summary counts them: "N file(s) of /splittasks" in line 1 and "0 file(s) of /splittasks the same" in line 2',
      new RegExp(`^1\\. Installed: .*; ${names.length} file\\(s\\) of /splittasks\\.$`).test(summary(r.out)[0] || '') &&
      /^2\. Already there: .* and 0 file\(s\) of \/splittasks the same/.test(summary(r.out)[1] || ''), summary(r.out).slice(0, 2).join(' | '));
    const r2 = run(d);
    assertOk('(s) second run: all the same, nothing copied, bytes untouched',
      r2.code === 0 && new RegExp(`: 0 copied, 0 updated, ${names.length} same`).test(r2.out) &&
      names.every((n) => bytes(path.join(target, n)).equals(fs.readFileSync(path.join(SKILL, 'skills', VARIANT, n)))), r2.out.slice(0, 500));
    const rc = run(d, '--check');
    assertOk(`(s) --check lists the ${names.length} file(s) as OK and exits with 0`,
      rc.code === 0 && names.every((n) => new RegExp(`^OK +skill splittasks/${n.replace(/\./g, '\\.')}: same as the skill's`, 'm').test(rc.out)), rc.out.slice(-800));
    // An OLD version with the mark is updated; a file of YOURS without the mark is not.
    const old = `---\nname: splittasks\n${MARK}\n---\nold version\n`;
    fs.writeFileSync(path.join(target, 'SKILL.md'), old);
    const rc2 = run(d, '--check');
    assertOk('(s) --check with an old marked copy: DIFFERENT "old version" and exit 1',
      rc2.code === 1 && /DIFFERENT +skill splittasks\/SKILL\.md: it is an old version/.test(rc2.out), rc2.out.slice(-600));
    const r3 = run(d);
    assertOk('(s) install updates the old marked copy (1 updated) and leaves it equal to the skill\'s',
      r3.code === 0 && /: 0 copied, 1 updated/.test(r3.out) && bytes(path.join(target, 'SKILL.md')).equals(fs.readFileSync(path.join(SKILL, 'skills', VARIANT, 'SKILL.md'))), r3.out.slice(0, 500));
    const mine = '---\nname: splittasks\ndescription: mine\n---\nThis is MINE and carries no mark.\n';
    fs.writeFileSync(path.join(target, 'SKILL.md'), mine);
    const r4 = run(d);
    assertOk('(s) a SKILL.md of YOURS without the mark: install exits 0, does NOT overwrite it and names it in "3. Not done:"',
      r4.code === 0 && bytes(path.join(target, 'SKILL.md')).equals(Buffer.from(mine)) && /^3\. Not done: .*skill splittasks\/SKILL\.md.*YOURS/.test(summary(r4.out)[2] || ''), summary(r4.out).join(' | '));
    const rc4 = run(d, '--check');
    assertOk('(s) --check names it as DIFFERENT (yours, without the mark) and exits with 1',
      rc4.code === 1 && /DIFFERENT +skill splittasks\/SKILL\.md: there is one of YOURS/.test(rc4.out), rc4.out.slice(-600));
    // PREFLIGHT: a target that exists but cannot be read (a folder called SKILL.md) STOPS before writing anything (as h2).
    const d2 = conf();
    fs.mkdirSync(path.join(d2, 'skills', 'splittasks', 'SKILL.md'), { recursive: true });
    const r5 = run(d2);
    assertOk('(s) an unreadable target SKILL.md: exit 1, the cause, and nothing written (no settings.json, no agents)',
      r5.code === 1 && /STOP: I cannot read .*splittasks.*SKILL\.md .*I am not overwriting it/.test(r5.out) && !fs.existsSync(file(d2)) && !fs.existsSync(path.join(d2, 'agents')), r5.out.slice(0, 500));
  }
}

assertOk('THE REAL SETTINGS.JSON DID NOT CHANGE (whole fingerprint before and after)', fingerprint(REAL) === realBefore, `${realBefore} → ${fingerprint(REAL)}`);

for (const d of folders) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* Windows sometimes holds on */ } }
assertOk('the toy folders are deleted at the end', folders.every((d) => !fs.existsSync(d)));

console.log(`\nINSTALL: ${ok} OK, ${bad} FAILS`);
process.exit(bad === 0 ? 0 : 1);
