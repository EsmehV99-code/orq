/**
 * ADVERSARIAL battery for orchestrator-control.js: trying to break it on purpose.
 *
 * Run:  node ~/.claude/skills/orq/tests/test-orchestrator-control-adversarial.mjs
 *
 * The other suite (test-orchestrator-control.mjs) checks that it DETECTS.
 * This one checks that it DOES NOT GET IN THE WAY: whatever happens, exit 0 and
 * under the timeout it is wired with (15-20 s). A broken hook does not break a
 * test: it stops the owner working, in every one of their projects at once.
 *
 * The cases in sections C and E came out of the Codex CLI review of 2026-08-11
 * (infinite loop in the lock, lock owners stepping on each other, and stacked
 * timeouts). They are here so they do not come back.
 */
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// `ORQ_HOOK` = the CANDIDATE: the script of the tree being worked on, which is what
// has to be tested (a lane carries it in its worktree). Without the variable, the
// script that sits next to this file is tested: the tree this suite lives in.
const HOOK = process.env.ORQ_HOOK || fileURLToPath(new URL('../scripts/orchestrator-control.js', import.meta.url));
const CEILING_MS = 15000; // the tightest timeout it is wired with

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-adv-'));
const repo = path.join(root, 'repo');
fs.mkdirSync(repo);
const git = (a, c) => execFileSync('git', a, { cwd: c, encoding: 'utf8', windowsHide: true });
git(['init', '-q', '.'], repo); git(['config', 'user.email', 't@t'], repo); git(['config', 'user.name', 't'], repo);
fs.writeFileSync(path.join(repo, 'a.txt'), 'x'); git(['add', '-A'], repo); git(['commit', '-qm', 'i'], repo);
const ledger = path.join(repo, '.git', 'orchestrator-state.json');

// The hook does nothing without `start`: it has to be activated, or this suite
// would be measuring the silence of a switched-off program and believing it holds
// up well.
const start = () => spawnSync('node', [HOOK, 'start'], {
  cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 30000,
});
start();

let bad = 0;
const probe = (name, fn) => {
  const t0 = Date.now();
  let r;
  try { r = fn(); } catch (e) { r = { code: 'EXCEPTION ' + e.message }; }
  const ms = Date.now() - t0;
  const good = r.code === 0 && ms < CEILING_MS;
  if (!good) bad++;
  console.log(`  ${good ? 'OK   ' : 'FAIL '} ${name.padEnd(52)} exit=${r.code} ${ms}ms`);
  return r;
};

const ev = (extra = {}) => JSON.stringify({
  hook_event_name: 'PreToolUse', tool_name: 'Agent', cwd: repo,
  tool_input: { description: 'adversarial' }, ...extra,
});
// CAREFUL with the child's `cwd`: several cases deliberately pass an unusable cwd
// and the hook falls back to `process.cwd()`. If the child inherited the directory
// the test is run from, the owner's RESERVE ledger would fill up with test junk (it
// happened on 2026-08-11: the artifact "adversario" reached 12 rounds in their real
// state and warned them at every turn close). Launching from the temp repo, the
// fallback lands inside it and is deleted with everything else.
const launch = (input, env = {}) => {
  const r = spawnSync('node', [HOOK], {
    input, encoding: 'utf8', windowsHide: true, timeout: 60000,
    cwd: repo,
    env: { ...process.env, ...env },
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
};

console.log('\nA. HOSTILE INPUTS');
probe('5 MB payload', () => launch(JSON.stringify({
  hook_event_name: 'PreToolUse', tool_name: 'Agent', cwd: repo,
  tool_input: { description: 'x', prompt: 'A'.repeat(5 * 1024 * 1024) },
})));
probe('5000 levels of nesting', () => {
  let s = '1'; for (let i = 0; i < 5000; i++) s = '[' + s + ']';
  return launch(`{"hook_event_name":"PreToolUse","tool_name":"Agent","cwd":"${repo.replace(/\\/g, '/')}","tool_input":{"description":${s}}}`);
});
probe('lying types (tool_input is a number)', () => launch(JSON.stringify({
  hook_event_name: 'PreToolUse', tool_name: 'Agent', cwd: repo, tool_input: 42 })));
probe('made-up cwd that does not exist', () => launch(ev({ cwd: '/nope/never/exists/at/all' })));
probe('cwd that is a file, not a directory', () => launch(ev({ cwd: path.join(repo, 'a.txt') })));
probe('cwd with weird characters', () => launch(ev({ cwd: '/\u0000<>|?*' })));
// "ready " is a word of the delivery detector (`RE_DELIVERY`,
// scripts/orchestrator-control.js): the input has to use that vocabulary, or this
// case would stop exercising that regex.
probe('content that causes regex backtracking', () => launch(JSON.stringify({
  hook_event_name: 'PostToolUse', tool_name: 'Write', cwd: repo,
  tool_input: { file_path: 'handoffs/x.md', content: 'ready ' + 'a '.repeat(50000) } })));

console.log('\nB. THE LEDGER BROKEN OR INACCESSIBLE');
probe('ledger with corrupt JSON', () => { fs.writeFileSync(ledger, '{{{ not json'); return launch(ev()); });
probe('ledger that is a DIRECTORY', () => {
  try { fs.rmSync(ledger, { force: true }); } catch { /* it was not there */ }
  fs.mkdirSync(ledger, { recursive: true });
  const r = launch(ev());
  try { fs.rmSync(ledger, { recursive: true, force: true }); } catch { /* the OS may hold it */ }
  return r;
});
probe('read-only ledger', () => {
  fs.writeFileSync(ledger, '{"version":1}');
  fs.chmodSync(ledger, 0o444);
  const r = launch(ev());
  fs.chmodSync(ledger, 0o666);
  return r;
});

console.log('\nC. THE LOCK (Codex findings, 2026-08-11)');
// The cases above leave the ledger deleted or unreadable, and with no ledger the
// hook does not activate: checking "it did not write" here would be measuring the
// silence of a switched-off program. It is reactivated before each case and the
// CONTENT is compared, not the existence of the file.
const reactivate = () => {
  try { fs.rmSync(ledger, { force: true }); } catch { /* it was not there */ }
  try { fs.rmSync(ledger + '.lock', { recursive: true, force: true }); } catch { /* it was not there */ }
  start();
  return fs.readFileSync(ledger, 'utf8');
};

probe('FRESH lock of another process -> degrades, no eternal wait', () => {
  const before = reactivate();
  fs.mkdirSync(ledger + '.lock', { recursive: true });
  fs.writeFileSync(path.join(ledger + '.lock', 'owner'), 'another-process', 'utf8');
  const r = launch(ev());
  if (fs.readFileSync(ledger, 'utf8') !== before) { bad++; console.log('         (BAD: it wrote despite the foreign lock)'); }
  else console.log('         (with the program ACTIVE and a foreign lock: it did not write, good)');
  if (!fs.existsSync(ledger + '.lock')) { bad++; console.log('         (BAD: it deleted another owner\'s lock)'); }
  else console.log('         (it respected the foreign lock and did NOT delete it: good)');
  fs.rmSync(ledger + '.lock', { recursive: true, force: true });
  return r;
});
// A lock with NO readable owner mark is ambiguous: we do not know whose it is, so
// it is not broken at the normal deadline but at 4 times the deadline. That is
// deliberate, so as not to take the lock away from somebody who blew up right while
// writing it.
probe('lock with no readable owner: NOT broken at the normal deadline', () => {
  const before = reactivate();
  fs.mkdirSync(ledger + '.lock', { recursive: true });
  const old = new Date(Date.now() - 60000); // past the deadline, but not 4 times it
  fs.utimesSync(ledger + '.lock', old, old);
  const r = launch(ev());
  if (fs.readFileSync(ledger, 'utf8') !== before) { bad++; console.log('         (BAD: it broke a lock it does not know the owner of)'); }
  else console.log('         (ambiguous and not old enough: left alone)');
  try { fs.rmSync(ledger + '.lock', { recursive: true, force: true }); } catch { /* already gone */ }
  return r;
});
probe('lock with no owner, VERY old: broken (it does not leave the tool jammed)', () => {
  const before = reactivate();
  fs.mkdirSync(ledger + '.lock', { recursive: true });
  const ancient = new Date(Date.now() - 3600000); // way past 4x
  fs.utimesSync(ledger + '.lock', ancient, ancient);
  const r = launch(ev());
  if (fs.readFileSync(ledger, 'utf8') === before) { bad++; console.log('         (BAD: it would stay jammed forever)'); }
  else console.log('         (lock abandoned an hour ago: broken and recovered)');
  try { fs.rmSync(ledger + '.lock', { recursive: true, force: true }); } catch { /* already gone */ }
  return r;
});
probe('UNREADABLE lock (a file instead of a directory) -> no endless spin', () => {
  reactivate();
  fs.writeFileSync(ledger + '.lock', 'I am not a directory');
  const r = launch(ev());
  try { fs.rmSync(ledger + '.lock', { force: true }); } catch { /* already gone */ }
  return r;
});

console.log('\nD. THE CLOCK');
probe('Stop with 40 nonexistent worktrees in the overlap', () => {
  // CAREFUL: this ledger MUST carry a program_id. Without it the hook exits before
  // looking at anything and the test would be measuring the silence of a
  // switched-off program instead of the resilience of the overlap recompute. Codex
  // caught it on 2026-08-11.
  const heads = {}; for (let i = 0; i < 40; i++) heads['/nope/never/exists/wt-' + i] = 'a'.repeat(40);
  fs.writeFileSync(ledger, JSON.stringify({
    version: 1, program_id: 'orch-test', counters: { invocations: 0, alerts: 0, by_gate: {} },
    overlap: { measured_at: new Date().toISOString(), heads },
    dedup: {}, tasks: {}, artifacts: {}, waits: [], zeros: [], alerts: [],
    pending: [], events: [], identities: {}, lanes: {},
  }));
  const r = launch(JSON.stringify({ hook_event_name: 'Stop', cwd: repo }));
  const L = JSON.parse(fs.readFileSync(ledger, 'utf8'));
  if (L.counters.invocations === 0) { bad++; console.log('         (BAD: the hook never activated; the test proved nothing)'); }
  else console.log(`         (the hook DID run: ${L.counters.invocations} invocation(s))`);
  return r;
});

console.log('\nD-bis. THE ACTIVATION RULE, BY THE PATHS THAT WERE MISSING');
// Gaps Codex flagged on 2026-08-11 in the structure audit.
probe('with no program it does not launch a single git process', () => {
  try { fs.rmSync(ledger, { force: true }); } catch { /* it was not there */ }
  // git is hidden from it by emptying PATH: if it needed git to decide, it would
  // show. Node is launched by its absolute path (process.execPath) because otherwise
  // the empty PATH would not find node either and the test would be measuring
  // something else.
  const r = spawnSync(process.execPath, [HOOK], {
    input: ev(), encoding: 'utf8', windowsHide: true, timeout: 30000, cwd: repo,
    env: { ...process.env, PATH: '', Path: '', ORCH_CONTROL_DEBUG: '1' },
  });
  const spoke = (r.stdout || '') + (r.stderr || '');
  if (spoke.trim() !== '') { bad++; console.log(`         (BAD: it said something -> ${spoke.slice(0, 60)})`); }
  else console.log('         (no git in PATH and no program: completely quiet)');
  return { code: r.status };
});
probe('`start` after `close` really starts again', () => {
  start();
  spawnSync('node', [HOOK, 'close', '--even-if-left-open'], { cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  const asleep = launch(ev());
  start();
  const awake = launch(ev());
  const L = JSON.parse(fs.readFileSync(ledger, 'utf8'));
  if (L.closed_at) { bad++; console.log('         (BAD: still marked as closed after the second start)'); }
  if (L.counters.invocations === 0) { bad++; console.log('         (BAD: reopened but records nothing)'); }
  else console.log(`         (quiet after close, and recording again after the second start: ${L.counters.invocations})`);
  return { code: asleep.code === 0 && awake.code === 0 ? 0 : 1 };
});
probe('`close --program` of ANOTHER program does not close mine', () => {
  start();
  const r = spawnSync('node', [HOOK, 'close', '--program', 'orch-someone-else'], {
    cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 30000,
  });
  const L = JSON.parse(fs.readFileSync(ledger, 'utf8'));
  if (L.closed_at) { bad++; console.log('         (BAD: it closed the foreign program when asked with another id)'); }
  else console.log('         (it refused to close a program that is not its own: good)');
  return { code: r.status === 1 ? 0 : 1 }; // it must refuse with 1
});
probe('`pulse` with no program does NOT create the ledger (nor arm the hook)', () => {
  // It really happened: another terminal ran `pulse` in client-repo and with that
  // left a ledger created — and therefore the hook armed — where nobody had run
  // `start`.
  try { fs.rmSync(ledger, { force: true }); } catch { /* it was not there */ }
  const r = spawnSync(process.execPath, [HOOK, 'pulse'], {
    cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 30000,
  });
  if (fs.existsSync(ledger)) { bad++; console.log('         (BAD: `pulse` created the ledger with no start)'); }
  else console.log('         (`pulse` with no program: it did not touch the disk)');
  // and the same for the other subcommands that write
  for (const s of [['decide', '--artifact', 'x', '--decision', 'continue'], ['wait', '--what', 'x', '--deadline', '+30m'], ['integrate'], ['close']]) {
    spawnSync(process.execPath, [HOOK, ...s], { cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 30000 });
    if (fs.existsSync(ledger)) { bad++; console.log(`         (BAD: \`${s[0]}\` created the ledger with no start)`); break; }
  }
  return { code: r.status === 1 ? 0 : 1 }; // it must refuse with 1, not pretend it did something
});
probe('a corrupt ledger does NOT switch the watch off', () => {
  start();
  fs.writeFileSync(ledger, '{{{ broken');
  launch(ev());                    // this one sets the corrupt file aside and warns
  const second = launch(ev());     // and this one MUST keep watching
  const L = JSON.parse(fs.readFileSync(ledger, 'utf8'));
  if (!L.program_id) { bad++; console.log('         (BAD: the recovered ledger was born with no program)'); }
  if (L.counters.invocations < 2) { bad++; console.log('         (BAD: it went quiet after the first warning)'); }
  else console.log(`         (it kept watching after recovering: ${L.counters.invocations} invocations)`);
  return { code: second.code };
});

console.log('\nD-ter. FINDINGS OF THE CLOSING VERIFICATION (Codex, 2026-08-12)');
probe('LOOKING does not break: `status` over a broken ledger does NOT switch the watch off', () => {
  start();
  launch(ev());
  fs.writeFileSync(ledger, '{{{ broken');
  const st = spawnSync(process.execPath, [HOOK, 'status'], {
    cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 30000,
  });
  if (!fs.existsSync(ledger)) { bad++; console.log('         (BAD: `status` took the ledger out with it)'); }
  else console.log('         (`status` warns and does not touch the file: good)');
  const after = launch(ev());   // the next hook MUST recover and carry on
  const L = JSON.parse(fs.readFileSync(ledger, 'utf8'));
  if (!L.program_id) { bad++; console.log('         (BAD: it was left with no program after recovering)'); }
  else console.log('         (the next hook recovered it and keeps watching)');
  if (!/UNREADABLE/i.test(st.stdout || '')) { bad++; console.log('         (BAD: `status` did not warn that it was unreadable)'); }
  return { code: after.code };
});
probe('the ledger tolerates fields with lying types', () => {
  start();
  const L = JSON.parse(fs.readFileSync(ledger, 'utf8'));
  L.counters = null; L.artifacts = 'I am not an object'; L.waits = 42; L.pending = null;
  fs.writeFileSync(ledger, JSON.stringify(L));
  const r = launch(ev());
  const L2 = JSON.parse(fs.readFileSync(ledger, 'utf8'));
  if (typeof L2.counters !== 'object' || L2.counters === null) { bad++; console.log('         (BAD: counters is still broken)'); }
  else if (L2.counters.invocations < 1) { bad++; console.log('         (BAD: it never got to record the event)'); }
  else console.log('         (it normalised the broken fields and carried on working)');
  return r;
});
probe('a PATH with relative entries does not divert git', () => {
  start();
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({
      hook_event_name: 'PostToolUse', tool_name: 'Write', cwd: repo,
      // "hand it over" is one of the `RE_DELIVERY` tokens
      // (scripts/orchestrator-control.js): this payload has to look like a delivery
      // or the case would test nothing.
      tool_input: { file_path: 'handoffs/x.md', content: 'I hand it over to whoever follows' },
    }),
    encoding: 'utf8', windowsHide: true, timeout: 30000, cwd: repo,
    // '.' in front: if it slipped through, git would be looked for in the working directory
    env: { ...process.env, PATH: '.' + path.delimiter + (process.env.PATH || '') },
  });
  console.log('         (with "." at the front of PATH it still exits 0 and makes no odd noise)');
  return { code: r.status };
});

console.log('\nD-quater. THE THREE THAT HAD BEEN LEFT OPEN (closed on 2026-08-12)');
probe('the lock of a LIVE process is not broken, however old it is', () => {
  const before = reactivate();
  fs.mkdirSync(ledger + '.lock', { recursive: true });
  // owner = THIS process, which is obviously alive, with an ancient timestamp
  fs.writeFileSync(path.join(ledger + '.lock', 'owner'), process.pid + '-alive', 'utf8');
  const old = new Date(Date.now() - 3600000);
  fs.utimesSync(ledger + '.lock', old, old);
  const r = launch(ev());
  if (!fs.existsSync(ledger + '.lock')) { bad++; console.log('         (BAD: it broke the lock of a live process)'); }
  else console.log('         (old lock, but of a LIVE process: respected)');
  if (fs.readFileSync(ledger, 'utf8') !== before) { bad++; console.log('         (BAD: it wrote anyway)'); }
  fs.rmSync(ledger + '.lock', { recursive: true, force: true });
  return r;
});
probe('the lock of a DEAD process IS broken', () => {
  const before = reactivate();
  fs.mkdirSync(ledger + '.lock', { recursive: true });
  // a very high PID that certainly does not exist
  fs.writeFileSync(path.join(ledger + '.lock', 'owner'), '4294967000-dead', 'utf8');
  const old = new Date(Date.now() - 3600000);
  fs.utimesSync(ledger + '.lock', old, old);
  const r = launch(ev());
  if (fs.readFileSync(ledger, 'utf8') === before) { bad++; console.log('         (BAD: it did not break a dead process\'s lock; it would stay jammed)'); }
  else console.log('         (lock of a dead process: broken and recovered)');
  try { fs.rmSync(ledger + '.lock', { recursive: true, force: true }); } catch { /* already gone */ }
  return r;
});
probe('a stray unreadable file activates nothing', () => {
  try { fs.rmSync(ledger, { force: true }); } catch { /* it was not there */ }
  try { fs.rmSync(ledger.replace(/\.json$/, '') + '.log', { force: true }); } catch { /* it was not there */ }
  fs.writeFileSync(ledger, 'not json and nobody ran start');
  const r = launch(ev());
  const unchanged = fs.readFileSync(ledger, 'utf8') === 'not json and nobody ran start';
  if (!unchanged) { bad++; console.log('         (BAD: any old file activated the watch)'); }
  else console.log('         (no log proving a `start`: not activated, not touched)');
  return r;
});
probe('...but if there WAS a start, a broken ledger IS recovered', () => {
  start();                          // leaves a log with the start line
  launch(ev());
  fs.writeFileSync(ledger, '{{{ broken after a real start');
  const r = launch(ev());
  const L = JSON.parse(fs.readFileSync(ledger, 'utf8'));
  if (!L.program_id) { bad++; console.log('         (BAD: it did not recover despite there having been a start)'); }
  else console.log('         (there was a start log: recovered and still watching)');
  return r;
});
probe('a `close` from another terminal stops later writes', () => {
  start();
  spawnSync(process.execPath, [HOOK, 'close', '--even-if-left-open'], { cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  const before = fs.readFileSync(ledger, 'utf8');
  const r = spawnSync(process.execPath, [HOOK, 'wait', '--what', 'something', '--deadline', '+30m'], {
    cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 30000,
  });
  if (fs.readFileSync(ledger, 'utf8') !== before) { bad++; console.log('         (BAD: it wrote into an already-closed program)'); }
  else console.log('         (closed program: `wait` writes nothing)');
  return { code: r.status === 1 ? 0 : 1 };
});

console.log('\nE. INVARIANTS CODEX FLAGGED');
const source = fs.readFileSync(HOOK, 'utf8');
const inv = (name, cond) => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'OK   ' : 'FAIL '} ${name}`);
};
// CAREFUL: searching for the bare string also matched the COMMENT that explains the
// problem. Only the CALLS are looked at (a line that does not start with * or //),
// and every one of them has to start from an already-resolved path.
const calls = source.split('\n')
  .filter((l) => !/^\s*(\*|\/\/)/.test(l) && /(execFileSync|spawnSync)\s*\(/.test(l) && !/require\(/.test(l));
// Since 2026-09-16 `codex` is launched too (the `review` subcommand). The invariant
// is NOT relaxed: it is still "no executable is invoked by its bare name" (that
// would resolve it from the cwd, which comes from the payload). What changes is that
// there are now several launch lines, and every one of them starts from an
// already-resolved path: `bin` (git / gh / the process listing) or `codex`.
//
// Two details measured that day, which explain why they are not all alike:
//   · the Windows SHIM: when `codex` resolves to a `.cmd`/`.bat`, Node refuses to
//     launch it without `shell: true` (mitigation of CVE-2024-27980), so that branch
//     builds the line out of `[codex]` — the SAME absolute path, quoted — instead of
//     invoking a bare name;
//   · `codex` goes through `spawnSync` and not `execFileSync` because its session
//     header (`model: <model>`, which is what has to be checked) comes out on STDERR,
//     and `execFileSync` does not give that channel back when the process ends well.
//     Measured with Codex v0.154.0: empty stdout, `model:` on stderr.
//
// There were SIX launch lines between 2026-09-16 and 2026-09-22: the two extra ones
// belonged to the `publish` subcommand (it launched `node --check` and the three
// suites) and to the `tasklist.exe` that counted the `node` processes before
// starting them. `publish` was removed from the skill, and both calls left with it.
// The invariant has never been touched: what changes is the number, not the rule —
// whichever lines there are must start from an already-resolved path (`bin`, `codex`
// or `[codex]`). The fifth line is the process listing for the orphaned hooks
// (PowerShell on Windows, `ps` on macOS and Linux), launched through `bin` as well.
inv(`git, gh, codex and the process listing are invoked by absolute path (${calls.length} call(s))`,
  calls.length === 5 &&
  calls.every((l) => /(execFileSync|spawnSync)\((bin|codex|\[codex\])/.test(l)));
inv('...and Codex\'s header is looked for in BOTH channels, not only in stdout',
  /stdout \+ '\\n' \+ stderr/.test(source));
// `ORCH_CODEX_CMD` says WHAT gets launched (by default `codex`), but it does not
// relax the contract: a bare NAME is still looked up in PATH with `binInPath` (never
// from the cwd, which comes from the payload); only an explicit PATH is used as it
// is.
inv('...and a `codex` with no path comes from looking it up in PATH, not from a bare name',
  /const codex = isPath$/m.test(source) &&
  /^\s*: binInPath\(process\.platform === 'win32'$/m.test(source) &&
  /function binInPath\(names\)/.test(source));
inv('...and what gets launched can be pointed at with ORCH_CODEX_CMD, split into exe + arguments',
  /process\.env\.ORCH_CODEX_CMD/.test(source) && /function splitCommand\(s\)/.test(source));
inv('there is a total time budget for the invocation',
  /const TOTAL_BUDGET/.test(source) && /Date\.now\(\) > DEADLINE/.test(source));
inv('the lock carries an owner mark', /'owner'/.test(source) && /TOKEN/.test(source));
inv('the lock deadline is checked outside the catch',
  /\} catch \(_\) \{ \/\* it vanished/.test(source) && /if \(Date\.now\(\) > limit\) return false; \/\/ the deadline/.test(source));

console.log('\nF. THE SAFETY NET, DEMONSTRATED WITH MUTANTS');
// The contract has two halves and BOTH have to be tested:
//   the HOOK cannot exit !=0 or blow up · the CLI DOES have to be able to.
// The second half was broken until 2026-08-11: the phase-1 clamp was applied to the
// CLI too, so `selftest` exited 0 even when it failed. A test incapable of failing.
// It was discovered when the selftest started genuinely failing and kept saying it
// was fine.
const mutHook = path.join(root, 'mut-hook.js');
fs.writeFileSync(mutHook, source.replace(
  'function hookMode() {', 'function hookMode() { throw new Error("blown up on purpose");'));
const blowsUp = spawnSync('node', [mutHook], {
  input: ev(), encoding: 'utf8', windowsHide: true, timeout: 30000,
});
inv('the HOOK exits 0 even when its handler blows up', blowsUp.status === 0);

const mutCli = path.join(root, 'mut-cli.js');
fs.writeFileSync(mutCli, source.replace(
  "check('GLOBAL_MODE is OBSERVE (phase 1)', GLOBAL_MODE === 'OBSERVE');",
  "check('canary broken on purpose', false);"));
const badCli = spawnSync('node', [mutCli, 'selftest'], {
  encoding: 'utf8', windowsHide: true, timeout: 30000, cwd: repo,
});
inv('the CLI CAN exit with 1 when something fails', badCli.status === 1);
const goodCli = spawnSync('node', [HOOK, 'selftest'], {
  encoding: 'utf8', windowsHide: true, timeout: 30000, cwd: repo,
});
inv('...and it exits 0 when everything passes', goodCli.status === 0);

try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* the OS may hold the .git */ }
console.log(`\nADVERSARIAL: ${bad === 0 ? 'no case broke the contract' : bad + ' CASE(S) BREAK THE CONTRACT'}`);
process.exit(bad === 0 ? 0 : 1);
