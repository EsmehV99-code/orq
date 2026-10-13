#!/usr/bin/env node
'use strict';
/* ============================================================================
 * evidence.js — copies a lane's EVIDENCE to `docs/evidence/T<n>/`, inside the
 * repository, so that the tests, the measurements and the why of each decision
 * do not stay only in the working folder (which is in `.gitignore`).
 *
 * WHY IT EXISTS (the owner's rules Rdcb7cd and R8f3290, 2026-09-25): `.orchestrator/`
 * is the orchestration's live folder and is NOT versioned; Codex's verdicts live
 * outside the repo (`~/dev/codex-out`). Without this copy, the why of a decision
 * exists only in a folder nobody else sees.
 *
 * WHAT IT COPIES, per lane, to `<target>/docs/evidence/<lane>/`:
 *   brief.md            ← .orchestrator/briefs/<lane>-*.md (or <lane>.md)
 *   receipt.md          ← .orchestrator/receipts/<lane>.md
 *   codex/<lane>-r<k>.md.txt  ← <codex-out>/<lane>-r<k>.md.txt (or .md in the old rounds): verdicts ONLY
 *   codex/models.txt    ← generated: the `model:` line of each <lane>-r<k>.log (the .log is NOT copied)
 *   measurements/…      ← .orchestrator/evidence-worktrees/<lane>[-something]/… : TEXT files of
 *                         300 KB or less, including `*-exit.txt` and the MUTANTS' `.out`
 *   suites.txt          ← generated: for each suite `.out`, its name, EXIT (from the sibling
 *                         `-exit.txt`) and how many lines start with OK and with FAIL
 *
 * WHAT A MUTANT `.out` IS (it is copied, with the cap) AND WHAT A SUITE ONE IS (it is not copied):
 *   a mutant one = inside a folder called `mutant`/`mutants`, or with the word
 *   `mutant(s)` as a piece of its name (`mutant1-x.out`, `T36-mutants.out`; not
 *   `immutable.out`). Every other `.out` is suite output: it goes to `suites.txt`. It is a
 *   naming convention (the one the lanes have used since T4); a suite `.out` put
 *   in `mutants/` would get in, but never one of more than 300 KB.
 *
 * WHAT IT NEVER COPIES, ON PURPOSE:
 *   · A suite `.out`: the full output weighs megabytes; rule R8f3290 says its EXIT
 *     and its count go in. It is counted by reading it in chunks, without loading it whole.
 *   · A file of more than 300 KB (nor a generated `suites.txt` or `models.txt`), nor
 *     a binary one (with a null byte at its start).
 *   · Codex's `.log` files (only their `model:` line is extracted), nor its `.diff`.
 *   · Symbolic links nor anything that is not a regular file.
 *   Everything that is skipped IS LISTED, with the reason.
 *
 * IT NEVER DELETES NOR OVERWRITES ANYTHING. Each file is written to a temporary and published with a
 * hard link that fails if the target already exists (atomic: two runs at once do not
 * overwrite each other). A target that already exists with OTHER content is not touched: it is
 * listed as "different". If a folder of the target is a link or junction, error. Running it twice
 * changes nothing. If a run is cut halfway, the next one completes what is missing.
 *
 * "LOCAL ONLY" PATH (T55, issue #16 point 11, the owner 28-Sep): in a repo where `main` is
 * protected (everything goes by PR) or that has no `docs/DECISIONES.md` / `docs/PENDIENTE.md`, copying
 * to `docs/evidence/` forced an impossible commit + push and the batch close stayed
 * stuck. Now there are two options that solve it without asking anything:
 *   --where       writes NOTHING. It looks at the target repo and answers with the exit code to
 *                 "can I put the evidence in the repo?": 0 = "at the repo" (the default branch is NOT
 *                 protected —`gh api repos/{owner}/{repo}/branches/<branch>/protection`:
 *                 404 = not protected, 200 = protected— AND docs/DECISIONES.md and
 *                 docs/PENDIENTE.md exist); 3 = "local only", with the reason in one line. With no `gh`,
 *                 no remote or with any error that is not a clean 404, it CANNOT be known and it is
 *                 treated as protected (the safe side).
 *   --local-only  copies the same as always, with the same SUMMARY and the same codes 0/1/2,
 *                 but to `<target>/.orchestrator/evidence-batch/<lane>/` (a folder that is not
 *                 versioned and does not demand a commit) and NEVER to `docs/evidence/`. The new
 *                 rules of §4 of PENDIENTE that the close sent to `docs/DECISIONES.md` go on
 *                 this path to `<target>/.orchestrator/evidence-batch/DECISIONES-batch-<date>.md`
 *                 (whoever closes the batch writes them down; the script only copies).
 *
 * USAGE:
 *   node scripts/evidence.js --lane T46 [--lane T47 …] [--codex-out <dir>]
 *                            [--root <repo>] [--target <repo>] [--check] [--local-only]
 *   node scripts/evidence.js --where [--target <repo>]
 *   --root      the live folder whose `.orchestrator/` is read (by default, the current folder)
 *   --target    the repo where `docs/evidence/` is written (by default, --root)
 *   --codex-out the folder of Codex's verdicts (by default ~/dev/codex-out, resolved with
 *               os.homedir(); if that default folder does not exist, it goes on without verdicts)
 *   --check     only lists what it would copy and what it would skip; writes NOTHING
 *   --local-only  writes to `<target>/.orchestrator/evidence-batch/<lane>/` instead of `docs/evidence/`
 *   --where     does not copy: says whether it is "at the repo" (0) or "local only" (3) and why
 *
 * EXIT CODES: 0 there is material (copied, already equal at the target, or all skipped and
 * listed) · 2 none of the lanes has anything · 1 error (arguments, folder that does not
 * exist, --root without .orchestrator/, link in the target, failure to read or write) ·
 * 3 ONLY with `--where`: "local only" (not an error: it is the normal path in a protected repo).
 *
 * NOT TESTED ON macOS: the default codex-out folder (`~/dev/codex-out` under the Mac user's
 * home), a real `gh` and the hard-link write on APFS were exercised on Windows with toy
 * folders and a toy `gh`, not on a Mac.
 * ========================================================================== */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CAP = 300 * 1024;
const DEFAULT_CODEX_OUT = () => path.join(os.homedir(), 'dev', 'codex-out');
const VALID_ID = /^[TH]\d+$/;
const CHUNK = 1024 * 1024;

const HELP = `usage: node scripts/evidence.js --lane T<n> [--lane T<m> …] [--codex-out <dir>] [--root <repo>] [--target <repo>] [--check] [--local-only]
     node scripts/evidence.js --where [--target <repo>]
  copies brief, receipt, Codex verdicts and text measurements (≤ 300 KB) to <target>/docs/evidence/T<n>/
  (with --local-only, to <target>/.orchestrator/evidence-batch/T<n>/); does NOT copy suite .out files (they go to suites.txt with EXIT and counts).
  Never deletes nor overwrites. Exit: 0 material · 2 nothing · 1 error. --where writes nothing: 0 = "at the repo" · 3 = "local only" (with the reason).`;

class UsageError extends Error {}

function readArgs(argv) {
  const a = { lanes: [], codexOut: null, root: process.cwd(), target: null, check: false, localOnly: false, where: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    const value = () => {
      const x = argv[++i];
      if (x === undefined || x.startsWith('--')) throw new UsageError(`the value of ${v} is missing`);
      return x;
    };
    if (v === '--lane') a.lanes.push(value());
    else if (v === '--codex-out') a.codexOut = value();
    else if (v === '--root') a.root = value();
    else if (v === '--target') a.target = value();
    else if (v === '--check') a.check = true;
    else if (v === '--local-only') a.localOnly = true;
    else if (v === '--where') a.where = true;
    else if (v === '--help' || v === '-h') { a.help = true; }
    else throw new UsageError(`unknown option: ${v}`);
  }
  if (a.help) return a;
  if (a.where) {
    if (a.localOnly || a.check || a.lanes.length || a.codexOut) throw new UsageError('--where is used alone (with --target): it copies nothing');
    a.target = a.target || a.root;
    return a;
  }
  if (a.lanes.length === 0) throw new UsageError('--lane T<n> is missing');
  for (const c of a.lanes) if (!VALID_ID.test(c)) throw new UsageError(`invalid lane: "${c}" (T<n> or H<n> expected)`);
  a.target = a.target || a.root;
  return a;
}

const isDir = (p) => { try { return fs.lstatSync(p).isDirectory(); } catch { return false; } };
const kb = (n) => `${Math.ceil(n / 1024)} KB`;
const isMutant = (rel) => {
  const parts = rel.split('/');
  return parts.slice(0, -1).some((d) => /^mutants?$/i.test(d)) ||
    /(^|[-_.])mutants?(\d*)([-_.]|$)/i.test(parts[parts.length - 1]);
};

/* ------------------------------------------------------------------ --where (T55) */

/* An executable of the PATH by its ABSOLUTE path, never from the cwd (on Windows, `spawn('git')`
 * looks first in the working folder: a `git.exe` left in the repo would get run). */
function binInPath(names) {
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir || !path.isAbsolute(dir)) continue;
    for (const n of names) {
      const p = path.join(dir, n);
      try { if (fs.statSync(p).isFile()) return p; } catch { /* not here */ }
    }
  }
  return null;
}
const GIT_NAMES = process.platform === 'win32' ? ['git.exe'] : ['git'];
const GH_NAMES = process.platform === 'win32' ? ['gh.exe', 'gh.cmd'] : ['gh'];
const SAFE_BRANCH = /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/;

/* Runs a binary without asking anything: stdin closed and the interactive prompts of gh/git turned off.
 * A `.cmd` (the toy `gh` of the tests) is launched through cmd.exe; its arguments are already validated. */
function runBin(bin, args, cwd) {
  const opt = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000, windowsHide: true,
    env: { ...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0', GH_NO_UPDATE_NOTIFIER: '1' } };
  const r = (process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin))
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${bin}" ${args.join(' ')}`], { ...opt, windowsVerbatimArguments: true })
    : spawnSync(bin, args, opt);
  return { code: r.error ? -1 : r.status, out: String(r.stdout || '').trim(), err: String(r.stderr || '').trim() };
}

const firstLine = (t) => String(t || '').split(/\r?\n/).find((l) => l.trim() !== '') || '(no message)';

/* Should the evidence go up to the repo, or stay only local? Writes nothing and asks nothing.
 * Returns { repo: boolean, reason: string }. "I cannot know" counts as protected. */
function decideWhere(target) {
  const reasons = [];
  // A regular FILE: a directory or a link with that name cannot be edited in step 5 bis.
  const isFile = (p) => { try { return fs.lstatSync(p).isFile(); } catch { return false; } };
  const missing = ['DECISIONES', 'PENDIENTE'].filter((n) => !isFile(path.join(target, 'docs', `${n}.md`)));
  if (missing.length) reasons.push(`without ${missing.map((n) => `docs/${n}.md`).join(' nor ')}`);
  const gitBin = binInPath(GIT_NAMES);
  const git = (args) => (gitBin ? runBin(gitBin, args, target) : { code: -1, out: '', err: '' });
  const remotes = git(['remote']);
  const names = remotes.code === 0 ? remotes.out.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : [];
  if (!names.length) reasons.push('no gh/remote: the repo has no remote, I cannot know whether its default branch is protected');
  const gh = binInPath(GH_NAMES);
  if (!gh) reasons.push('no gh/remote: `gh` is not in the PATH, I cannot know whether its default branch is protected');
  if (reasons.length) return { repo: false, reason: reasons.join(' · ') };

  const remote = names.includes('origin') ? 'origin' : names[0];
  // The default branch, asking the remote (what holds today) and, if it does not answer, the local copy.
  let branch = null;
  const ls = git(['ls-remote', '--symref', remote, 'HEAD']);
  const m = ls.code === 0 ? /^ref:\s+refs\/heads\/(\S+)\s+HEAD/m.exec(ls.out) : null;
  if (m) branch = m[1];
  if (!branch) {
    const sr = git(['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`]);
    if (sr.code === 0 && sr.out.startsWith(`${remote}/`)) branch = sr.out.slice(remote.length + 1);
  }
  if (!branch || !SAFE_BRANCH.test(branch)) {
    return { repo: false, reason: 'no gh/remote: I could not find out which is the remote\'s default branch, I cannot know whether it is protected' };
  }
  const r = runBin(gh, ['api', `repos/{owner}/{repo}/branches/${encodeURIComponent(branch)}/protection`], target);
  if (r.code === 0) return { repo: false, reason: `main protected: the branch ${branch} has protection (everything goes by PR)` };
  // Only the UNAMBIGUOUS 404 of the endpoint: gh closes it with "… (HTTP 404)" in its stderr. A loose "404"
  // or a "Not Found" in another message (a URL, a port) does not count: that is "I cannot know" = protected.
  // Without `m`: the "(HTTP 404)" has to be the END of the whole stderr (already trimmed), not that of an intermediate line
  // followed by another error (Codex T55-r2).
  if (/\(HTTP 404\)$/.test(r.err)) {
    return { repo: true, reason: `the default branch (${branch}) is not protected and docs/DECISIONES.md and docs/PENDIENTE.md exist` };
  }
  return { repo: false, reason: `no gh/remote: gh could not check the protection of ${branch} (${firstLine(r.err || r.out).slice(0, 120)}); it is treated as protected` };
}

function isBinary(buf) { return buf.subarray(0, 8192).includes(0); }

/* All the REGULAR files under `dir`, with their relative path in `/` slashes, in a fixed order.
 * It does not follow symbolic links (lstat): a link is not the lane's evidence. */
function walk(dir, base = dir, out = []) {
  const names = fs.readdirSync(dir).sort();
  for (const n of names) {
    const p = path.join(dir, n);
    const st = fs.lstatSync(p);
    if (st.isDirectory()) walk(p, base, out);
    else if (st.isFile()) out.push({ abs: p, rel: path.relative(base, p).split(path.sep).join('/'), size: st.size });
    else out.push({ abs: p, rel: path.relative(base, p).split(path.sep).join('/'), size: 0, odd: true });
  }
  return out;
}

/* Goes through a file line by line reading it in 1 MB chunks: never whole in memory.
 * `each(line)` returns true to stop early. */
function byLines(file, each) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(CHUNK);
    let rest = '';
    for (;;) {
      const n = fs.readSync(fd, buf, 0, CHUNK, null);
      if (n === 0) break;
      const chunk = rest + buf.toString('utf8', 0, n);
      const lines = chunk.split(/\r?\n/);
      rest = lines.pop();
      for (const l of lines) if (each(l)) return;
    }
    if (rest !== '') each(rest);
  } finally { fs.closeSync(fd); }
}

/* Plan for ONE lane: copies { rel, abs }, generated { rel, content } and skipped { rel, reason }.
 * It writes nothing. */
function planLane(id, a, codexOut) {
  const orch = path.join(a.root, '.orchestrator');
  const copies = [];
  const generated = [];
  const skipped = [];

  const briefDir = path.join(orch, 'briefs');
  if (isDir(briefDir)) {
    const re = new RegExp(`^${id}(-[^/\\\\]*)?\\.md$`);
    const briefs = fs.readdirSync(briefDir).filter((n) => re.test(n) && fs.lstatSync(path.join(briefDir, n)).isFile()).sort();
    // There is almost always one. If there were two, the second does not overwrite the first.
    briefs.forEach((n, i) => copies.push({ rel: i === 0 ? 'brief.md' : `brief-${n}`, abs: path.join(briefDir, n) }));
  }
  const receipt = path.join(orch, 'receipts', `${id}.md`);
  if (fs.existsSync(receipt) && fs.lstatSync(receipt).isFile()) copies.push({ rel: 'receipt.md', abs: receipt });

  if (codexOut) {
    const names = fs.readdirSync(codexOut).sort();
    const reV = new RegExp(`^${id}-r(\\d+)\\.md(\\.txt)?$`);
    const reL = new RegExp(`^(${id}-r\\d+)\\.log$`);
    for (const n of names) {
      if (!reV.test(n)) continue;
      // New rounds: `.md.txt`; old rounds (before `review`): `.md`. If both are there, `.md.txt` is enough.
      if (n.endsWith('.md') && names.includes(`${n}.txt`)) continue;
      const abs = path.join(codexOut, n);
      if (fs.lstatSync(abs).isFile()) copies.push({ rel: `codex/${n}`, abs });
    }
    const models = [];
    for (const n of names) {
      const m = reL.exec(n);
      if (!m || !fs.lstatSync(path.join(codexOut, n)).isFile()) continue;
      let line = null;
      byLines(path.join(codexOut, n), (l) => { if (/^model:/.test(l)) { line = l.trim(); return true; } return false; });
      models.push(`${m[1]}: ${line || '(no model: line in the .log)'}`);
    }
    if (models.length) {
      generated.push({ rel: 'codex/models.txt', content:
        `# Model of each Codex round of ${id}: the "model:" line of its .log (the .log is not kept). Generated by scripts/evidence.js.\n${models.join('\n')}\n` });
    }
  }

  const evRoot = path.join(orch, 'evidence-worktrees');
  if (isDir(evRoot)) {
    const reD = new RegExp(`^${id}(-.*)?$`);
    const dirs = fs.readdirSync(evRoot).filter((n) => reD.test(n) && isDir(path.join(evRoot, n))).sort();
    const suites = [];
    for (const d of dirs) {
      const pref = d === id ? '' : `${d}/`;
      for (const f of walk(path.join(evRoot, d))) {
        const rel = `measurements/${pref}${f.rel}`;
        if (f.odd) { skipped.push({ rel, reason: 'not a regular file' }); continue; }
        if (/\.out$/i.test(f.rel) && !isMutant(f.rel)) {
          suites.push({ name: `${pref}${f.rel}`, abs: f.abs });
          skipped.push({ rel, reason: `suite output (${kb(f.size)}): goes to suites.txt` });
          continue;
        }
        copies.push({ rel, abs: f.abs });
      }
    }
    if (suites.length) {
      const rows = suites.map((s) => {
        const exitF = s.abs.replace(/\.out$/i, '-exit.txt');
        let exit = 'EXIT ?';
        try {
          if (fs.lstatSync(exitF).isFile() && fs.statSync(exitF).size <= CAP) {
            exit = (fs.readFileSync(exitF, 'utf8').split(/\r?\n/).find((l) => l.trim() !== '') || 'EXIT ?').trim();
          }
        } catch { /* no sibling */ }
        let nOk = 0, nFail = 0;
        byLines(s.abs, (l) => { if (/^ *OK/.test(l)) nOk++; else if (/^ *FAIL/.test(l)) nFail++; return false; });
        return `${s.name} | ${exit} | OK ${nOk} | FAIL ${nFail}`;
      });
      generated.push({ rel: 'suites.txt', content:
        `# Suites of ${id}: file | EXIT (from its -exit.txt) | lines that start with OK | with FAIL.\n` +
        `# The full output is NOT kept in the repo (rule R8f3290): it stays in .orchestrator/evidence-worktrees/. Generated by scripts/evidence.js.\n` +
        `${rows.join('\n')}\n` });
    }
  }
  return { copies, generated, skipped };
}

/* No folder of the path target/docs/evidence/<id>/… may be a link or junction:
 * writing through one would be writing outside the repo. */
function checkNoLinks(target, relFolder) {
  let p = path.resolve(target);
  for (const part of relFolder.split('/')) {
    p = path.join(p, part);
    let st;
    try { st = fs.lstatSync(p); } catch { return; } // it does not exist yet: it will be created as a normal folder
    if (st.isSymbolicLink()) throw new Error(`${p} is a link or junction: I do not write through it`);
    if (!st.isDirectory()) throw new Error(`${p} exists and is not a folder`);
  }
}

/* Where a lane's evidence is written, relative to the target (parts of the path). */
const evidenceBase = (a, id) => (a.localOnly ? ['.orchestrator', 'evidence-batch', id] : ['docs', 'evidence', id]);

function apply(id, plan, a) {
  const count = { copy: 0, same: 0, different: 0 };
  const lines = [];
  const skipped = [...plan.skipped];
  const write = (rel, data) => {
    if (data.length > CAP) { skipped.push({ rel, reason: `${kb(data.length)} > 300 KB` }); return; }
    if (isBinary(data)) { skipped.push({ rel, reason: 'binary' }); return; }
    const relDir = [...evidenceBase(a, id), ...rel.split('/').slice(0, -1)].join('/');
    checkNoLinks(a.target, relDir);
    const dest = path.join(path.resolve(a.target), ...relDir.split('/'), rel.split('/').pop());
    const compare = () => {
      let previous = null;
      try { previous = fs.readFileSync(dest); } catch { /* it does not exist */ }
      if (previous === null) return false;
      if (previous.equals(data)) { count.same++; lines.push(`  same       ${rel}`); }
      else { count.different++; lines.push(`  different  ${rel}  (already exists with other content: not touched)`); }
      return true;
    };
    if (compare()) return;
    if (a.check) { count.copy++; lines.push(`  would copy ${rel}  (${kb(data.length)})`); return; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    checkNoLinks(a.target, relDir);
    // Own temporary + hard link: `linkSync` fails if the target already exists, so what
    // another run has just written is never overwritten. The temporary is ours and is always removed.
    const tmp = `${dest}.evidence-${process.pid}-${Date.now()}.tmp`;
    fs.writeFileSync(tmp, data, { flag: 'wx' });
    try {
      fs.linkSync(tmp, dest);
      count.copy++;
      lines.push(`  copy       ${rel}  (${kb(data.length)})`);
    } catch (e) {
      if (e.code !== 'EEXIST' || !compare()) throw e;
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* gone already */ }
    }
  };
  for (const c of plan.copies) {
    // The size is looked at BEFORE reading (a huge file does not enter memory) and again on
    // what was read in `write` (in case it grew in between).
    const size = fs.statSync(c.abs).size;
    if (size > CAP) { skipped.push({ rel: c.rel, reason: `${kb(size)} > 300 KB` }); continue; }
    write(c.rel, fs.readFileSync(c.abs));
  }
  for (const g of plan.generated) write(g.rel, Buffer.from(g.content, 'utf8'));
  for (const s of skipped) lines.push(`  skip       ${s.rel}  — ${s.reason}`);
  return { count, lines, skipped: skipped.length };
}

function main(argv) {
  let a;
  try { a = readArgs(argv); } catch (e) {
    if (e instanceof UsageError) { process.stderr.write(`evidence: ${e.message}\n${HELP}\n`); return 1; }
    throw e;
  }
  if (a.help) { process.stdout.write(`${HELP}\n`); return 0; }
  if (a.where) {
    if (!isDir(a.target)) { process.stderr.write(`evidence: --target does not exist: ${a.target}\n`); return 1; }
    const d = decideWhere(path.resolve(a.target));
    process.stdout.write(d.repo ? `WHERE at the repo — ${d.reason}\n` : `WHERE local only — ${d.reason}\n`);
    return d.repo ? 0 : 3;
  }
  if (!isDir(a.root)) { process.stderr.write(`evidence: --root does not exist: ${a.root}\n`); return 1; }
  // Without `.orchestrator/` it is not an orchestration's live folder: almost surely the wrong folder.
  // It is an error (1), not a "nothing there" (2), so that the batch close stops and does not go on in silence.
  if (!isDir(path.join(a.root, '.orchestrator'))) {
    process.stderr.write(`evidence: ${a.root} has no .orchestrator/ (wrong folder? use --root <live folder>)\n`);
    return 1;
  }
  if (!isDir(a.target)) { process.stderr.write(`evidence: --target does not exist: ${a.target}\n`); return 1; }
  let codexOut = null;
  if (a.codexOut) {
    if (!isDir(a.codexOut)) { process.stderr.write(`evidence: --codex-out does not exist: ${a.codexOut}\n`); return 1; }
    codexOut = a.codexOut;
  } else if (isDir(DEFAULT_CODEX_OUT())) codexOut = DEFAULT_CODEX_OUT();

  let withMaterial = 0;
  try {
    for (const id of [...new Set(a.lanes)]) {
      const plan = planLane(id, a, codexOut);
      if (plan.copies.length + plan.generated.length + plan.skipped.length === 0) {
        process.stdout.write(`EVIDENCE ${id}: no material (neither brief, nor receipt, nor Codex, nor evidence)\n`);
        continue;
      }
      withMaterial++;
      const { count, lines, skipped } = apply(id, plan, a);
      process.stdout.write(`EVIDENCE ${id} → ${evidenceBase(a, id).join('/')}/${a.check ? '  (--check: nothing is written)' : ''}\n${lines.join('\n')}\n`);
      process.stdout.write(`SUMMARY ${id}: ${a.check ? 'would copy' : 'copied'} ${count.copy} · same ${count.same} · different ${count.different} · skipped ${skipped}\n`);
    }
  } catch (e) {
    process.stderr.write(`evidence: ERROR ${e && e.message ? e.message : e}\n`);
    return 1;
  }
  return withMaterial > 0 ? 0 : 2;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, CAP };
