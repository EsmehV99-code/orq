/**
 * Test of the EVIDENCE COPY into the repo (`scripts/evidence.js`, T50, rules Rdcb7cd and R8f3290).
 *
 * Run:  node tests/test-evidence.mjs
 *       (in a worktree: with ORQ_HOOK=<worktree>/scripts/orchestrator-control.js, like the others)
 *
 * What it looks at, on TOY folders in a temp dir that is deleted at the end:
 *   (a) copies brief, receipt, Codex verdicts and measurements, and generates `suites.txt`
 *       (EXIT and OK/FAIL counts) and `codex/models.txt`;
 *   (b) a suite `.out` (of 1 MB and of 2 KB) is NOT copied and DOES show up in `suites.txt`;
 *   (c) a 400 KB file is skipped and listed;
 *   (d) the second run changes nothing (folder hash equal), a target with
 *       other content is not overwritten, and the source is never touched;
 *   (e) `--check` writes nothing;
 *   (f) a lane with nothing exits with 2; a usage error, with 1.
 * And TWO MUTANTS: the script without the 300 KB cap has to turn (c) red, and without the
 * suite-`.out` filter it has to turn (b) red. A test that cannot fail proves nothing.
 *
 * The default codex-out folder is `~/dev/codex-out` resolved with os.homedir(): it is tested
 * with a toy home (HOME and USERPROFILE pointing at a temp folder), never with the real one.
 * NOT TESTED ON macOS: a real Mac home, a real `gh`, and hard links on APFS.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';

const SKILL = process.env.ORQ_HOOK
  ? path.dirname(path.dirname(process.env.ORQ_HOOK)).replace(/\\/g, '/')
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..').replace(/\\/g, '/');
const SCRIPT = `${SKILL}/scripts/evidence.js`;

let ok = 0, bad = 0;
const assertOk = (name, cond, detail) => {
  if (cond) { ok++; console.log(`  OK    ${name}`); }
  else { bad++; console.log(`  FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
};

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-T58-evidence-'));
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const exists = (p) => fs.existsSync(p);
const put = (p, content) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); };

/* Fingerprint of a folder: paths + contents, in a fixed order. Absent folder = 'ABSENT'. */
function fingerprint(dir) {
  if (!exists(dir)) return 'ABSENT';
  const h = crypto.createHash('sha256');
  const walk = (d) => {
    for (const n of fs.readdirSync(d).sort()) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) walk(p);
      else { h.update(path.relative(dir, p)); h.update('\0'); h.update(fs.readFileSync(p)); h.update('\0'); }
    }
  };
  walk(dir);
  return h.digest('hex');
}

/* The toy: a repo with .orchestrator/ and a Codex folder. T7 has everything;
 * T70 exists to check that `T7` does not swallow `T70`. */
function buildToy(base) {
  const root = path.join(base, 'root');
  const orch = path.join(root, '.orchestrator');
  put(path.join(orch, 'briefs', 'T7-topic.md'), '# T7 brief\n');
  put(path.join(orch, 'briefs', 'T70-other.md'), '# T70 NO\n');
  put(path.join(orch, 'receipts', 'T7.md'), '# receipt T7\n');
  const ev = path.join(orch, 'evidence-worktrees', 'T7');
  put(path.join(ev, 'structure.out'), '\nA.\n  OK    one\n  OK    two\n  FAIL  three\nSTRUCTURE: 2 OK, 1 FAILS\n');
  put(path.join(ev, 'structure-exit.txt'), 'EXIT=1\n');
  // (b) two suite outputs: one of 1 MB and a small one (2 KB). Neither is copied.
  put(path.join(ev, 'sub', 'hook.out'), ('  OK    x\n').repeat(104858));
  put(path.join(ev, 'sub', 'hook-exit.txt'), 'EXIT=0\n');
  put(path.join(ev, 'dashboard.out'), ('  OK    t\n').repeat(200) + '  FAIL  u\n');
  // mutants: their .out IS copied (they are short).
  put(path.join(ev, 'mutants', 'm1.out'), '  FAIL  caught\n');
  put(path.join(ev, 'mutant-loose.out'), '  FAIL  loose\n');
  put(path.join(ev, 'measurement.txt'), 'measurement: 42\n');
  // T8: its only evidence weighs 400 KB. It had material (all skipped): exits 0, not 2.
  put(path.join(orch, 'evidence-worktrees', 'T8', 'huge.txt'), 'y'.repeat(400 * 1024));
  // (c) 400 KB of text: skipped by size.
  put(path.join(ev, 'big.txt'), 'x'.repeat(400 * 1024));
  // binary: skipped.
  put(path.join(ev, 'photo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));
  const codex = path.join(base, 'codex');
  put(path.join(codex, 'T7-r1.md.txt'), 'VERDICT: CLEAN\n');
  put(path.join(codex, 'T7-r1.log'), 'OpenAI Codex\n--------\nworkdir: x\nmodel: gpt-5.6-sol\nprovider: openai\n');
  put(path.join(codex, 'T7-r1.md.diff'), 'diff --git\n');
  put(path.join(codex, 'T70-r1.md.txt'), 'NO\n');
  const dest = path.join(base, 'dest');
  fs.mkdirSync(dest, { recursive: true });
  return { root, codex, dest, lane: path.join(dest, 'docs', 'evidence', 'T7') };
}

const runAsync = (script, args) => new Promise((done) => {
  const h = spawn(process.execPath, [script, ...args]);
  h.on('close', (c) => done(c));
});
const run = (script, args, env) => {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: env ? { ...process.env, ...env } : process.env });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

/* The whole battery against a given script. Returns [{ id, name, cond, detail }]:
 * the normal run asserts them; the mutants look for theirs to come out false. */
async function battery(script, label) {
  const base = path.join(TMP, label);
  const j = buildToy(base);
  const r = [];
  const add = (id, name, cond, detail) => r.push({ id, name, cond: !!cond, detail });
  const args = ['--lane', 'T7', '--root', j.root, '--target', j.dest, '--codex-out', j.codex];
  const sourceFingerprint = fingerprint(j.root) + fingerprint(j.codex);

  // (e) --check first: writes NOTHING.
  const c = run(script, [...args, '--check']);
  add('e', '(e) --check exits 0, says "would copy" and does not create docs/evidence', c.code === 0 && /would copy/.test(c.out) &&
    !exists(path.join(j.dest, 'docs')), `exit ${c.code}`);

  // (a)
  const p1 = run(script, args);
  const s = read(path.join(j.lane, 'suites.txt')) || '';
  add('a', '(a) exits 0 and copies brief.md, receipt.md and the verdict codex/T7-r1.md.txt as they are', p1.code === 0 &&
    read(path.join(j.lane, 'brief.md')) === '# T7 brief\n' &&
    read(path.join(j.lane, 'receipt.md')) === '# receipt T7\n' &&
    read(path.join(j.lane, 'codex', 'T7-r1.md.txt')) === 'VERDICT: CLEAN\n', `exit ${p1.code}: ${p1.out.slice(0, 300)}`);
  add('a', '(a) codex/models.txt carries "T7-r1: model: gpt-5.6-sol" and the .log and the .diff are NOT copied',
    /^T7-r1: model: gpt-5\.6-sol$/m.test(read(path.join(j.lane, 'codex', 'models.txt')) || '') &&
    !exists(path.join(j.lane, 'codex', 'T7-r1.log')) && !exists(path.join(j.lane, 'codex', 'T7-r1.md.diff')));
  add('a', '(a) copies the text measurements: measurement.txt, structure-exit.txt and the mutant\'s .out',
    read(path.join(j.lane, 'measurements', 'measurement.txt')) === 'measurement: 42\n' &&
    read(path.join(j.lane, 'measurements', 'structure-exit.txt')) === 'EXIT=1\n' &&
    exists(path.join(j.lane, 'measurements', 'mutants', 'm1.out')) && exists(path.join(j.lane, 'measurements', 'mutant-loose.out')));
  add('a', '(a) suites.txt: "structure.out | EXIT=1 | OK 2 | FAIL 1"', s.includes('structure.out | EXIT=1 | OK 2 | FAIL 1'), s);
  add('a', '(a) T7 does not swallow T70 (neither its brief nor its verdict)',
    !exists(path.join(j.lane, 'codex', 'T70-r1.md.txt')) && !/T70/.test(read(path.join(j.lane, 'brief.md')) || '') &&
    !exists(path.join(j.dest, 'docs', 'evidence', 'T70')));
  add('a', '(a) the binary is not copied and is listed', !exists(path.join(j.lane, 'measurements', 'photo.png')) &&
    /skip\s+measurements\/photo\.png\s+— binary/.test(p1.out));

  // (b)
  add('b', '(b) no suite .out is copied (neither the 1 MB one nor the 2 KB one)',
    !exists(path.join(j.lane, 'measurements', 'sub', 'hook.out')) && !exists(path.join(j.lane, 'measurements', 'dashboard.out')) &&
    !exists(path.join(j.lane, 'measurements', 'structure.out')));
  add('b', '(b) and both show up in suites.txt with their EXIT and their count',
    s.includes('sub/hook.out | EXIT=0 | OK 104858 | FAIL 0') && s.includes('dashboard.out | EXIT ? | OK 200 | FAIL 1'), s);

  // (c)
  add('c', '(c) the 400 KB file is not copied and is listed with its size',
    !exists(path.join(j.lane, 'measurements', 'big.txt')) && /skip\s+measurements\/big\.txt\s+— 400 KB > 300 KB/.test(p1.out),
    p1.out.split('\n').filter((l) => l.includes('big')).join(' | '));

  // (d)
  const h1 = fingerprint(j.lane);
  const p2 = run(script, args);
  add('d', '(d) the second run exits 0, copies nothing and the folder stays identical',
    p2.code === 0 && /copied 0 · same \d+ · different 0/.test(p2.out) && fingerprint(j.lane) === h1, p2.out.split('\n').pop());
  fs.writeFileSync(path.join(j.lane, 'receipt.md'), 'EDITED BY HAND\n');
  const p3 = run(script, args);
  add('d', '(d) a target with other content is NOT overwritten: it is listed as "different"',
    p3.code === 0 && read(path.join(j.lane, 'receipt.md')) === 'EDITED BY HAND\n' && /different\s+receipt\.md/.test(p3.out));
  const hBeforeCheck = fingerprint(j.lane);
  const e2 = run(script, [...args, '--check']);
  add('e', '(e) --check over a target that already exists (and with a different file) changes nothing',
    e2.code === 0 && fingerprint(j.lane) === hBeforeCheck && /different\s+receipt\.md/.test(e2.out));
  // Two runs AT THE SAME TIME over an empty target: both exit 0 and leave the same as a single one.
  const dest2 = path.join(base, 'dest2');
  const dest1 = path.join(base, 'dest1');
  fs.mkdirSync(dest2, { recursive: true });
  fs.mkdirSync(dest1, { recursive: true });
  const argsA = (d) => ['--lane', 'T7', '--root', j.root, '--target', d, '--codex-out', j.codex];
  const [c1, c2] = await Promise.all([runAsync(script, argsA(dest2)), runAsync(script, argsA(dest2))]);
  run(script, argsA(dest1));
  const t7 = (d) => path.join(d, 'docs', 'evidence', 'T7');
  const temporaries = fs.readdirSync(t7(dest2), { recursive: true }).filter((n) => String(n).endsWith('.tmp'));
  add('d', '(d) two runs at once: both exit 0 and leave the same as a single one, with no temporaries',
    c1 === 0 && c2 === 0 && fingerprint(t7(dest2)) === fingerprint(t7(dest1)) && temporaries.length === 0,
    `${c1}/${c2} tmp ${temporaries.length}`);
  add('d', '(d) the source (.orchestrator and the Codex folder) does not change in any run',
    fingerprint(j.root) + fingerprint(j.codex) === sourceFingerprint);

  // (f)
  const f1 = run(script, ['--lane', 'T99', '--root', j.root, '--target', j.dest, '--codex-out', j.codex]);
  add('f', '(f) a lane with nothing exits with 2', f1.code === 2, `exit ${f1.code}`);
  const f2 = run(script, ['--root', j.root]);
  const f3 = run(script, ['--lane', '../T7', '--root', j.root]);
  const f4 = run(script, ['--lane', 'T7', '--root', path.join(base, 'does-not-exist')]);
  const f5 = run(script, ['--lane', 'T7', '--root', j.dest, '--codex-out', j.codex]);
  add('f', '(f) error exits with 1: no --lane, lane with a path, --root that does not exist, --root without .orchestrator/',
    f2.code === 1 && f3.code === 1 && f4.code === 1 && f5.code === 1,
    `${f2.code}/${f3.code}/${f4.code}/${f5.code}`);
  const f6 = run(script, ['--lane', 'T8', '--root', j.root, '--target', j.dest, '--codex-out', j.codex]);
  add('f', '(f) a lane whose material is skipped entirely exits 0 (not 2) and lists it',
    f6.code === 0 && /skip\s+measurements\/huge\.txt/.test(f6.out), `exit ${f6.code}`);
  // A junction in the target that points outside: error 1 and nothing is written outside.
  const outside = path.join(base, 'outside');
  const dest3 = path.join(base, 'dest3');
  fs.mkdirSync(outside, { recursive: true });
  fs.mkdirSync(path.join(dest3, 'docs'), { recursive: true });
  let hasLink = false;
  try { fs.symlinkSync(outside, path.join(dest3, 'docs', 'evidence'), 'junction'); hasLink = true; } catch { /* no permission */ }
  const f7 = run(script, ['--lane', 'T7', '--root', j.root, '--target', dest3, '--codex-out', j.codex]);
  add('f', '(f) with a link/junction in docs/evidence it exits 1 and writes nothing outside',
    hasLink && f7.code === 1 && fs.readdirSync(outside).length === 0, `link ${hasLink} exit ${f7.code}`);
  return r;
}

/* ============================================================================
 * T55 (issue #16, point 11): the batch close does not stop in a repo with a protected `main` or without
 * docs/DECISIONES.md. `--where` says "at the repo" (0) or "local only" (3); `--local-only` copies to
 * `.orchestrator/evidence-batch/<lane>/` and never to `docs/evidence/`.
 *   (a) toy WITHOUT a remote → --where exits 3 and says "no gh/remote";
 *   (b) toy with a remote + docs/DECISIONES.md + docs/PENDIENTE.md and a toy `gh` that
 *       answers 404 → exits 0 ("at the repo");
 *   (c) the same with a toy `gh` that answers 200 → exits 3 "main protected";
 *   (d) --local-only copies to .orchestrator/evidence-batch/T7/ with the usual SUMMARY and the
 *       same codes 0/1/2, and does not touch docs/evidence/.
 * Beyond the minimum: without docs, without `gh` in the PATH and a gh error that is not 404 also give
 * "local only"; --where writes nothing.
 * The toy `gh` is a `gh.cmd` (or a `gh` script) in a folder that goes ONLY in the child process's PATH;
 * its answer is set by the variable GH_TOY_STATE (200 / 404 / other).
 * ========================================================================== */
const gitT = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} → ${r.stderr}`);
  return r.stdout;
};
function buildToyGh(base) {
  const dir = path.join(base, 'toy-gh');
  fs.mkdirSync(dir, { recursive: true });
  if (process.platform === 'win32') {
    put(path.join(dir, 'gh.cmd'), [
      '@echo off',
      'if defined GH_TOY_LOG echo %*>> "%GH_TOY_LOG%"',
      'if "%GH_TOY_STATE%"=="200" goto ok',
      'if "%GH_TOY_STATE%"=="404" goto nf',
      'if "%GH_TOY_STATE%"=="404x" goto nx',
      'if "%GH_TOY_STATE%"=="404m" goto nm',
      'echo gh: boom (HTTP 500) 1>&2',
      'exit /b 1',
      ':ok',
      'echo {"url":"toy"}',
      'exit /b 0',
      ':nf',
      'echo gh: Branch not protected (HTTP 404) 1>&2',
      'exit /b 1',
      ':nx',
      'echo gh: Get "https://proxy.local:404/repos": connection refused 1>&2',
      'exit /b 1',
      ':nm',
      'echo gh: Branch not protected (HTTP 404) 1>&2',
      'echo gh: authentication error (HTTP 401) 1>&2',
      'exit /b 1', ''].join('\r\n'));
  } else {
    const f = path.join(dir, 'gh');
    put(f, '#!/bin/sh\n[ -n "$GH_TOY_LOG" ] && echo "$@" >> "$GH_TOY_LOG"\nif [ "$GH_TOY_STATE" = 200 ]; then echo \'{"url":"toy"}\'; exit 0; fi\n' +
      'if [ "$GH_TOY_STATE" = 404 ]; then echo "gh: Branch not protected (HTTP 404)" >&2; exit 1; fi\n' +
      'if [ "$GH_TOY_STATE" = 404x ]; then echo "gh: Get https://proxy.local:404/repos: connection refused" >&2; exit 1; fi\n' +
      'if [ "$GH_TOY_STATE" = 404m ]; then echo "gh: Branch not protected (HTTP 404)" >&2; echo "gh: authentication error (HTTP 401)" >&2; exit 1; fi\n' +
      'echo "gh: boom (HTTP 500)" >&2; exit 1\n');
    fs.chmodSync(f, 0o755);
  }
  return dir;
}
/* A toy repo: `docs` = which docs/*.md it has; `remote` = whether it has an origin (a local bare repo with main). */
function buildWhereRepo(base, name, { docs, remote, branch = 'main' }) {
  const repo = path.join(base, name);
  fs.mkdirSync(repo, { recursive: true });
  gitT(repo, 'init', '-q', '-b', branch);
  put(path.join(repo, 'README.md'), 'x\n');
  for (const d of docs) put(path.join(repo, 'docs', `${d}.md`), `# ${d}\n`);
  gitT(repo, 'add', '-A');
  gitT(repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'one');
  if (remote) {
    const bare = path.join(base, `${name}-remote.git`);
    gitT(base, 'init', '-q', '--bare', '-b', branch, bare);
    gitT(repo, 'remote', 'add', 'origin', bare);
    gitT(repo, 'push', '-q', 'origin', branch);
  }
  return repo;
}

async function batteryT55(script, label) {
  const base = path.join(TMP, label);
  fs.mkdirSync(base, { recursive: true });
  const r = [];
  const add = (id, name, cond, detail) => r.push({ id, name, cond: !!cond, detail });
  const gh = buildToyGh(base);
  // The child's PATH (the child's only, never global): the real one WITHOUT any folder that has a `gh`,
  // and with the toy gh in front (or without it, for "no gh in the PATH").
  const ghNames = process.platform === 'win32' ? ['gh.exe', 'gh.cmd'] : ['gh'];
  const withoutGhDirs = String(process.env.PATH || '').split(path.delimiter)
    .filter((d) => d && !ghNames.some((n) => exists(path.join(d, n)))).join(path.delimiter);
  const withGh = (state) => ({ PATH: [gh, withoutGhDirs].join(path.delimiter), GH_TOY_STATE: state });
  const noGh = { PATH: withoutGhDirs, GH_TOY_STATE: '404' };
  const DOCS = ['DECISIONES', 'PENDIENTE'];

  // (a) without a remote → 3 "no gh/remote"
  const repoNoRemote = buildWhereRepo(base, 'no-remote', { docs: DOCS, remote: false });
  const a1 = run(script, ['--where', '--target', repoNoRemote], withGh('404'));
  add('T55a', '(T55a) --where in a repo WITHOUT a remote exits 3, says "local only" and "no gh/remote"',
    a1.code === 3 && /local only/.test(a1.out) && /no gh\/remote/.test(a1.out), `exit ${a1.code}: ${a1.out.slice(0, 200)}`);

  // (b) remote + docs + gh 404 → 0 "at the repo"
  const repoOk = buildWhereRepo(base, 'with-remote', { docs: DOCS, remote: true });
  const b1 = run(script, ['--where', '--target', repoOk], withGh('404'));
  add('T55b', '(T55b) --where with a remote, both docs and gh→404 (not protected) exits 0 and says "at the repo"',
    b1.code === 0 && /^WHERE at the repo/m.test(b1.out), `exit ${b1.code}: ${b1.out.slice(0, 200)}`);

  // (c) the same with gh→200 (protected) → 3 "main protected"
  const c1 = run(script, ['--where', '--target', repoOk], withGh('200'));
  add('T55c', '(T55c) --where with gh→200 (protected branch) exits 3 and says "main protected"',
    c1.code === 3 && /local only/.test(c1.out) && /main protected/.test(c1.out), `exit ${c1.code}: ${c1.out.slice(0, 200)}`);

  // Beyond the minimum: each reason for "local only" and that --where neither writes nor asks.
  const repoNoDoc = buildWhereRepo(base, 'no-decisions', { docs: ['PENDIENTE'], remote: true });
  const e1 = run(script, ['--where', '--target', repoNoDoc], withGh('404'));
  add('T55x', '(T55x) --where without docs/DECISIONES.md exits 3 and says so, even if the branch is not protected',
    e1.code === 3 && /without docs\/DECISIONES\.md/.test(e1.out), `exit ${e1.code}: ${e1.out.slice(0, 200)}`);
  const e2 = run(script, ['--where', '--target', repoOk], noGh);
  add('T55x', '(T55x) --where with a remote but NO gh in the PATH exits 3 and says "no gh/remote" (cannot know = protected)',
    e2.code === 3 && /no gh\/remote/.test(e2.out) && /is not in the PATH/.test(e2.out), `exit ${e2.code}: ${e2.out.slice(0, 200)}`);
  const e3 = run(script, ['--where', '--target', repoOk], withGh('500'));
  add('T55x', '(T55x) --where with a gh error that is NOT 404 exits 3 ("treated as protected")',
    e3.code === 3 && /treated as protected/.test(e3.out), `exit ${e3.code}: ${e3.out.slice(0, 200)}`);
  const e3b = run(script, ['--where', '--target', repoOk], withGh('404x'));
  add('T55x', '(T55x) --where with a gh error that carries a loose "404" (a port) but NOT "(HTTP 404)" exits 3: it is not an unambiguous 404',
    e3b.code === 3 && /treated as protected/.test(e3b.out), `exit ${e3b.code}: ${e3b.out.slice(0, 200)}`);
  const e3m = run(script, ['--where', '--target', repoOk], withGh('404m'));
  add('T55x', '(T55x) --where with an "(HTTP 404)" on an INTERMEDIATE line followed by another error (401) exits 3: the 404 has to be the end',
    e3m.code === 3 && /treated as protected/.test(e3m.out), `exit ${e3m.code}: ${e3m.out.slice(0, 200)}`);
  // post-r3: a default branch with "/" is ENCODED in the `gh api` path (release%2Fcurrent), not split into segments.
  const repoSlash = buildWhereRepo(base, 'branch-with-slash', { docs: DOCS, remote: true, branch: 'release/current' });
  const ghLog = path.join(base, 'gh-calls.log');
  const e3d = run(script, ['--where', '--target', repoSlash], { ...withGh('404'), GH_TOY_LOG: ghLog });
  const calls = read(ghLog) || '';
  add('T55x', '(T55x) with the default branch `release/current`, `gh api` receives `release%2Fcurrent` (encoded) and --where exits 0',
    e3d.code === 0 && calls.includes('branches/release%2Fcurrent/protection') && !calls.includes('release/current/protection'),
    `exit ${e3d.code}: ${e3d.out.slice(0, 120)} | gh: ${calls.slice(0, 160)}`);
  const repoDir = buildWhereRepo(base, 'doc-is-a-folder', { docs: ['PENDIENTE'], remote: true });
  fs.mkdirSync(path.join(repoDir, 'docs', 'DECISIONES.md'), { recursive: true });
  const e3c = run(script, ['--where', '--target', repoDir], withGh('404'));
  add('T55x', '(T55x) --where with a FOLDER called docs/DECISIONES.md (not a file) exits 3 and says "without docs/DECISIONES.md"',
    e3c.code === 3 && /without docs\/DECISIONES\.md/.test(e3c.out), `exit ${e3c.code}: ${e3c.out.slice(0, 200)}`);
  const before = fingerprint(repoOk);
  run(script, ['--where', '--target', repoOk], withGh('404'));
  run(script, ['--where', '--target', repoOk], withGh('200'));
  add('T55x', '(T55x) --where writes nothing in the target repo',
    fingerprint(repoOk) === before);
  const e4 = run(script, ['--where', '--target', path.join(base, 'does-not-exist')], withGh('404'));
  const e5 = run(script, ['--where', '--lane', 'T7'], withGh('404'));
  add('T55x', '(T55x) --where with a target that does not exist, or mixed with --lane, exits 1',
    e4.code === 1 && e5.code === 1, `${e4.code}/${e5.code}`);

  // (d) --local-only
  const j = buildToy(path.join(base, 'sl'));
  const normalDest = path.join(base, 'sl', 'dest-normal');
  fs.mkdirSync(normalDest, { recursive: true });
  const argsSl = ['--lane', 'T7', '--root', j.root, '--target', j.dest, '--codex-out', j.codex];
  const summary = (t) => (/^SUMMARY T7: .*$/m.exec(t) || [''])[0];
  const runNormal = run(script, ['--lane', 'T7', '--root', j.root, '--target', normalDest, '--codex-out', j.codex]);
  const d1 = run(script, [...argsSl, '--local-only']);
  const destSl = path.join(j.dest, '.orchestrator', 'evidence-batch', 'T7');
  add('T55d', '(T55d) --local-only exits 0 and copies brief, receipt and verdict to .orchestrator/evidence-batch/T7/',
    d1.code === 0 && read(path.join(destSl, 'brief.md')) === '# T7 brief\n' &&
    read(path.join(destSl, 'receipt.md')) === '# receipt T7\n' &&
    read(path.join(destSl, 'codex', 'T7-r1.md.txt')) === 'VERDICT: CLEAN\n', `exit ${d1.code}: ${d1.out.slice(0, 300)}`);
  add('T55d', '(T55d) --local-only does NOT write in docs/evidence/ (nor create docs/)',
    !exists(path.join(j.dest, 'docs')), fs.existsSync(j.dest) ? fs.readdirSync(j.dest).join(',') : '');
  add('T55d', '(T55d) --local-only carries the SAME SUMMARY as the normal copy and suites.txt with its EXIT and its count',
    summary(d1.out) !== '' && summary(d1.out) === summary(runNormal.out) &&
    (read(path.join(destSl, 'suites.txt')) || '').includes('structure.out | EXIT=1 | OK 2 | FAIL 1'),
    `${summary(d1.out)} <> ${summary(runNormal.out)}`);
  add('T55d', '(T55d) --local-only says where it writes (.orchestrator/evidence-batch/T7/) in its header',
    /EVIDENCE T7 → \.orchestrator\/evidence-batch\/T7\//.test(d1.out), d1.out.split('\n')[0]);
  const d2 = run(script, [...argsSl, '--local-only']);
  add('T55d', '(T55d) --local-only, second run: exits 0, copies nothing new (same) and does not overwrite',
    d2.code === 0 && /copied 0 · same \d+ · different 0/.test(d2.out), d2.out.split('\n').pop());
  const d3 = run(script, ['--lane', 'T99', '--root', j.root, '--target', j.dest, '--codex-out', j.codex, '--local-only']);
  const noOrch = path.join(base, 'sl', 'no-orchestrator');
  fs.mkdirSync(noOrch, { recursive: true });
  const d4 = run(script, ['--lane', 'T7', '--root', noOrch, '--codex-out', j.codex, '--local-only']);
  add('T55d', '(T55d) --local-only keeps the codes: lane with nothing → 2; --root without .orchestrator/ → 1',
    d3.code === 2 && d4.code === 1, `${d3.code}/${d4.code}`);
  // Without --target (target = root): writes inside its own .orchestrator/, without copying itself.
  const d5 = run(script, ['--lane', 'T7', '--root', j.root, '--codex-out', j.codex, '--local-only']);
  add('T55d', '(T55d) --local-only with target = root writes in its .orchestrator/evidence-batch/ and does not create docs/',
    d5.code === 0 && exists(path.join(j.root, '.orchestrator', 'evidence-batch', 'T7', 'brief.md')) &&
    !exists(path.join(j.root, 'docs')), `exit ${d5.code}`);
  return r;
}

/* The default codex-out folder comes from os.homedir() (`~/dev/codex-out`), never from a personal path.
 * A TOY home: HOME (POSIX) and USERPROFILE (Windows) point at a temp folder. */
function batteryHome(script, label) {
  const base = path.join(TMP, label);
  const j = buildToy(base);
  const home = path.join(base, 'home');
  put(path.join(home, 'dev', 'codex-out', 'T7-r1.md.txt'), 'VERDICT: FROM THE HOME\n');
  const env = { HOME: home, USERPROFILE: home };
  const r = [];
  const add = (id, name, cond, detail) => r.push({ id, name, cond: !!cond, detail });
  const p = run(script, ['--lane', 'T7', '--root', j.root, '--target', j.dest], env);
  add('home', '(home) with no --codex-out, the default folder is ~/dev/codex-out under the home folder (toy home)',
    p.code === 0 && read(path.join(j.lane, 'codex', 'T7-r1.md.txt')) === 'VERDICT: FROM THE HOME\n', `exit ${p.code}: ${p.out.slice(0, 200)}`);
  const src = fs.readFileSync(script, 'utf8');
  add('home', '(home) evidence.js hardcodes no personal path (no C:/Users/…, no /Users/<name>)',
    !/[A-Za-z]:[\\/]Users[\\/]/.test(src) && !/['"`]\/Users\//.test(src));
  return r;
}

console.log(`\nEVIDENCE (script: ${SCRIPT})`);
try {
if (!exists(SCRIPT)) {
  assertOk('scripts/evidence.js exists', false, SCRIPT);
} else if (process.env.T55_SCRIPT) {
  // Mutant mode: ONLY the T55 tests against another script (a mutated copy). The runs of
  // `.orchestrator/T55-evidence/mutants/` use it; a FAIL here is the mutant caught.
  const other = process.env.T55_SCRIPT.replace(/\\/g, '/');
  console.log(`\nONLY T55 against: ${other}`);
  for (const x of await batteryT55(other, 'only-t55')) assertOk(x.name, x.cond, x.detail);
} else {
  for (const x of await battery(SCRIPT, 'normal')) assertOk(x.name, x.cond, x.detail);
  for (const x of await batteryT55(SCRIPT, 'normal-t55')) assertOk(x.name, x.cond, x.detail);
  for (const x of batteryHome(SCRIPT, 'normal-home')) assertOk(x.name, x.cond, x.detail);

  console.log('\nMUTANTS (a test that cannot fail proves nothing)');
  const original = fs.readFileSync(SCRIPT, 'utf8');
  const mutant = async (name, old, now, idThatMustFall, bat = battery) => {
    const file = path.join(TMP, `mutant-${name}.js`);
    assertOk(`  the mutant "${name}" finds its line in the real script`, original.includes(old));
    if (!original.includes(old)) return;
    fs.writeFileSync(file, original.split(old).join(now), 'utf8');
    const rs = await bat(file, `mut-${name}`);
    const fallen = rs.filter((x) => x.id === idThatMustFall && !x.cond).map((x) => x.name);
    assertOk(`  MUTANT CAUGHT "${name}": test ${idThatMustFall} turns red`, fallen.length > 0,
      fallen.join(' | ') || 'no test fell');
  };
  await mutant('no-cap', 'const CAP = 300 * 1024;', 'const CAP = Infinity;', 'c');
  await mutant('no-out-filter', "if (/\\.out$/i.test(f.rel) && !isMutant(f.rel)) {", 'if (false) {', 'b');
  // T55: `--where` that ignores the protection (with gh→200 it says "at the repo"), and `--local-only` that writes in docs/evidence.
  await mutant('T55-where-ignores-protection', 'if (r.code === 0) return { repo: false,', 'if (r.code === 0) return { repo: true,', 'T55c', batteryT55);
  await mutant('T55-local-only-writes-in-docs', 'a.localOnly ? [', 'false ? [', 'T55d', batteryT55);
}
} finally {
  // Whatever happens above (an exception too), the temp folder is deleted.
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* never mind */ }
}
assertOk('the test\'s temp folder is deleted at the end', !exists(TMP), TMP);

console.log(`\nEVIDENCE: ${ok} OK, ${bad} FAILS`);
process.exit(bad === 0 ? 0 : 1);
