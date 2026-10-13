/**
 * Test for the orchestration DASHBOARD (`scripts/dashboard.js`).
 *
 * Run:  node <repo>/tests/test-dashboard.mjs
 *
 * What it checks: that the page tells the truth about the ledger it's given,
 * that it doesn't invent what isn't there, that it SHOWS ONLY WHAT'S ALIVE,
 * and that it NEVER touches the ledger. Nothing here launches the main
 * script or writes into the repo: everything goes through a temp folder that
 * gets deleted at the end.
 *
 * The SIX MUTANTS at the end are what stops this suite from being decoration:
 * the program gets broken on purpose (the red is taken off an expired wait,
 * the log's cutoff is changed, what is closed goes back to the grid, the
 * readers are un-grouped, the clock is let to rule over the status, and the
 * escaping is removed from the summary line) and the matching assertion is
 * checked to turn red. An assertion that doesn't know how to fail proves
 * nothing.
 *
 * NO test depends on the time of day it is run: the toy ledgers' dates are
 * generated here, relative to a pinned moment, and the edge cases (midnight,
 * the exact half-hour limit, "today") pin the snapshot time with
 * `ORCH_DASHBOARD_NOW`. At 00:03 it passes just like at 12:00.
 *
 * NOTHING here opens a real browser: `--open` is always run with the toy
 * browser hatch (`ORCH_DASHBOARD_OPEN_CMD`), and the macOS branch is
 * exercised in-process with a FAKE `spawnSync` (NOT TESTED ON macOS for real).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync, spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DASHBOARD = path.join(REPO, 'scripts', 'dashboard.js');
const FIXTURES = path.join(REPO, 'tests', 'fixtures');

let ok = 0, bad = 0;
const affirm = (name, cond, detail) => {
  if (cond) { ok++; console.log(`  OK    ${name}`); }
  else { bad++; console.log(`  FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
};

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't8-dashboard-'));
const inTmp = (...p) => path.join(TMP, ...p);

/* THE SNAPSHOT TIME, PINNED TO NOON TODAY. Without this, "delivered today"
 * and "helpers today" depended on what time the suite was run: a ledger with
 * something from "2 hours ago" stops being today's if it is 00:30. Now the toy
 * ledger and the dashboard look at the same clock, and the real hour does
 * not matter. (Codex gpt-5.6-sol, round 5, point 6.) */
const NOON = (() => { const d = new Date(); d.setHours(12, 0, 0, 0); return d.getTime(); })();

/* The @@...@@ marks in the toy ledger get swapped for real times: the alert
 * window is 24 h and "alive" is 30 min; with fixed dates it would go stale on
 * its own and the suite would turn red just by time passing. */
function prepareLedger(fixtureName, dest, withLog, anchor) {
  // `anchor` is the time that passes for "now". Without it, NOON. With it (and
  // with ORCH_DASHBOARD_NOW at the same value) 00:05 can be planted to test
  // midnight.
  const now = anchor || NOON;
  const iso = (ms) => new Date(now + ms).toISOString();
  const raw = fs.readFileSync(path.join(FIXTURES, fixtureName), 'utf8')
    // These go WITHOUT quotes in the result: `mtime` is a millisecond number.
    .replace(/"@@MS_2M_AGO@@"/g, String(now - 2 * 60000))
    .replace(/"@@MS_5M_AGO@@"/g, String(now - 5 * 60000))
    .replace(/"@@MS_10M_AGO@@"/g, String(now - 10 * 60000))
    .replace(/"@@MS_30M_EXACT@@"/g, String(now - 30 * 60000))
    .replace(/@@40H_AGO@@/g, iso(-40 * 3600000))
    .replace(/@@2H_AGO@@/g, iso(-2 * 3600000))
    .replace(/@@30M_AGO@@/g, iso(-30 * 60000))
    .replace(/@@10M_AGO@@/g, iso(-10 * 60000))
    .replace(/@@5M_AGO@@/g, iso(-5 * 60000))
    .replace(/@@2M_AGO@@/g, iso(-2 * 60000))
    .replace(/@@NOW@@/g, iso(0))
    .replace(/@@IN_2H@@/g, iso(2 * 3600000));
  fs.writeFileSync(dest, raw, 'utf8');
  if (withLog) {
    fs.copyFileSync(path.join(FIXTURES, 'dashboard-log.log'), dest.replace(/\.json$/, '') + '.log');
  }
  return dest;
}

function run(args, options = {}) {
  const r = spawnSync(process.execPath, [DASHBOARD, ...args], {
    encoding: 'utf8',
    cwd: options.cwd || TMP,
    // The dashboard looks at the SAME clock as the toy ledger.
    env: { ...process.env, ORCH_DASHBOARD_NOW: String(NOON), ...(options.env || {}) },
  });
  return { code: r.status, output: (r.stdout || '') + (r.stderr || '') };
}

const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const howMany = (text, needle) => text.split(needle).length - 1;
const SOURCE = fs.readFileSync(DASHBOARD, 'utf8');

/* ===================================================================== A */
console.log('\nA. THE PAGE WITH A FULL LEDGER');

const LEDGER = prepareLedger('dashboard-ledger-full.json', inTmp('ledger.json'), true);
const OUT = inTmp('out', 'dashboard.html');
const r1 = run(['--ledger', LEDGER, '--out', OUT]);
const page = read(OUT) || '';

affirm('exits with code 0', r1.code === 0, `code ${r1.code}: ${r1.output}`);
affirm('respects --out (writes right there, creating the folder)', fs.existsSync(OUT));
affirm('the stdout line has the format DASHBOARD: <path> · <n> lanes · <n> open waits · <hh:mm:ss>',
  /^DASHBOARD: .+ · \d+ lanes · \d+ open waits · \d{2}:\d{2}:\d{2}\s*$/.test(r1.output),
  JSON.stringify(r1.output));
affirm('counts only ALIVE lanes (T1 and T3: T2 already delivered and the reader does not count)',
  / · 2 lanes · /.test(r1.output), r1.output.trim());
affirm('counts 2 open waits (the expired one and the waiting one)',
  / · 2 open waits · /.test(r1.output), r1.output.trim());

console.log('\nB. THE HEADER SAYS WHOSE DASHBOARD THIS IS');
affirm('says it is THIS terminal\'s', page.includes('This dashboard is <strong>THIS terminal\'s</strong>'));
affirm('names the orchestrator\'s SESSION', page.includes('s1111111'));
affirm('names the repo where the skill was loaded', page.includes('/tmp/toy/repo'));
affirm('warns that another terminal has its own dashboard',
  page.includes('has its own dashboard'));
affirm('lists the OTHER terminals in this repo, separately',
  page.includes('Other terminals in this repo') && page.includes('s9999999'));
affirm('  and says what they do does not show up here',
  page.includes('What they do does NOT show up in this dashboard'));
affirm('brings the six-word glossary, folded',
  page.includes('Six words, in case one sounds odd')
  && ['Lane', 'Agent', 'Named terminal', 'Wait', 'Gate', 'Compact']
    .every((p) => page.includes(`<dt>${p}</dt>`)));

console.log('\nC. THE SECTIONS ARE ALL THERE');
for (const piece of ['Orchestration dashboard', "Circuit 1 — what's in motion",
  'Circuit 2 — the waits', "Circuit 3 — today's gates", "What's in review",
  'Alerts for the owner', 'Log', 'Where everything lives (paths)']) {
  affirm(`the page has "${piece}"`, page.includes(piece));
}
affirm('the header brings the program, the mode, and the orchestrator\'s memory',
  page.includes('orch-toy01') && page.includes('OBSERVE') && page.includes('41% of the million'));

console.log('\nD. CIRCUIT 1: THE ORCHESTRATOR FIRST, AND ONLY WHAT\'S ALIVE');
const openBoxes = (page.match(/<div class="box lane [^"]*">[\s\S]*?<\/div>/g) || []);
// NEW (round 4): the owner didn't know which of the boxes was the terminal
// they were reading. Now it is the FIRST one, and it says its memory.
affirm('the ORCHESTRATOR is the FIRST box of circuit 1',
  /<div class="box lane chief">/.test(openBoxes[0] || ''),
  (openBoxes[0] || 'there are no boxes').slice(0, 120));
affirm('  and it introduces itself as the terminal being read',
  page.includes('ORCHESTRATOR — this terminal (you are reading it)'));
affirm('  and it brings ITS memory, its compactions and its program',
  /<div class="box lane chief">[\s\S]*?41% of the million[\s\S]*?Compacted:<\/b> 1 time[\s\S]*?orch-toy01/.test(page));
affirm('the ALIVE lane T1 has its box', /<span class="title">T1 — /.test(page));
affirm('the ALIVE lane T3 has its box', /<span class="title">T3 — /.test(page));
// NEW (round 4): the STATUS rules over the clock.
affirm('a READY lane with RECENT movement does not show up as alive',
  !openBoxes.some((c) => /<span class="title">T2 — /.test(c)),
  'T2 delivered a receipt but its mtime is 5 minutes old');
affirm('  and in the fold it says what time it delivered and that the receipt is there',
  /T2 — [\s\S]{0,200}delivered at \d{2}:\d{2} · receipt OK/.test(page));
// NEW (round 4): the summary line, which answers "who is working now?".
affirm('under the circuit there is a summary line that counts right',
  /<p class="summary"><b>Right now:<\/b> the orchestrator \+ 2 agents working \(T1, T3\) · 1 delivered today \(T2\) · 2 reading helpers<\/p>/.test(page),
  (page.match(/<p class="summary">.*?<\/p>/) || ['not there'])[0]);
// ROUND 2: what's DONE cannot show up as an open box.
affirm('what is DONE (T2, which already delivered a receipt) does NOT show up as an open box',
  !openBoxes.some((c) => /<span class="title">T2 — /.test(c)),
  openBoxes.filter((c) => c.includes('T2')).join(' | ').slice(0, 200));
affirm('  but it DOES show up in the folded "done" list, with its time and its receipt',
  /<details><summary>1 already done or stalled<\/summary>/.test(page)
  && /<li class="done">[\s\S]*?T2 — [\s\S]*?integrate: the full suite passes green/.test(page));
// NEW (round 4): the first line says WHO it is, SINCE WHEN and FOR WHAT.
affirm('the first line of a live box says who, since when and for what',
  /<span class="title">T1 — Opus agent I launched at \d{2}:\d{2} \(\d+ (min|h|days) ago\) for: the piece that keeps compacting<\/span>/.test(page),
  (page.match(/<span class="title">T1 — [^<]*/) || ['not there'])[0]);
affirm('  and a named terminal introduces itself as such',
  /<span class="title">T3 — named terminal «wt-factory» I launched at \d{2}:\d{2}/.test(page),
  (page.match(/<span class="title">T3 — [^<]*/) || ['not there'])[0]);
affirm('  and the lane number is not repeated inside the description',
  !page.includes('T1 — T1 '));
affirm('every box ends with "last movement: hh:mm"',
  howMany(page, 'foot movement">last movement:') >= 3);
// ROUND 2: one-shot readers go GROUPED, not one box each.
affirm('reading helpers go GROUPED into a single box',
  howMany(page, '<span class="title">Reading helpers:') === 1);
// (b) Codex gpt-5.6-sol, round 3: they were indexed by a truncated description,
// so TWO readers with the same text merged into one and the total came up
// short. The toy ledger carries two with the SAME description on purpose.
affirm('counts AGENTS, not groups: the 2 readers with equal description count as 2',
  page.includes('<b>Total in the ledger:</b> 2'),
  (page.match(/Total in the ledger:<\/b> \d+/) || ['not there'])[0]);
affirm('  and the 2 also count in "today"',
  page.includes('<span class="title">Reading helpers: 2 today</span>'),
  (page.match(/Reading helpers: \d+ today/) || ['not there'])[0]);
affirm('  and neither shows up by its own name anywhere on the page',
  !page.includes('count the adversary tests'));
affirm('there are no paths inside the boxes: they went to the folded table at the end',
  !openBoxes.some((c) => /BRIEF-T\d|\/tmp\/toy|\.md</.test(c))
  && page.includes('BRIEF-T3-named-terminal.md'));

// (c) THE THIRD COMPACTION IN RED
const RE_THIRD = /<span class="chip red">3 — on its 3rd/;
affirm('the lane on its 3rd compaction shows up in RED', RE_THIRD.test(page));
affirm('  and its whole box is red, not just the label',
  /<div class="box lane red">[\s\S]{0,1200}on its 3rd/.test(page));

console.log('\nE. WAITS, GATES, REVIEWS, AND ALERTS');
// (b) THE EXPIRED ONE IN RED — what mutant 1 measures.
const RE_EXPIRED_RED = /<div class="box red">\s*<span class="title">EXPIRED/;
affirm('the EXPIRED wait shows up in RED', RE_EXPIRED_RED.test(page));
affirm('the still-waiting wait does NOT show up in red',
  /<div class="box gray">\s*<span class="title">WAITING/.test(page));
affirm('CLOSED waits are not boxes: they are a folded counter',
  /<summary>1 already closed \(\d+ today\)<\/summary>/.test(page));
affirm('the gate that BLOCKS shows up in red, with its plain-English name and its 12 times',
  /<div class="box gate red">\s*<span class="title">the orchestrator tried to build/.test(page)
  && page.includes('12 times'));
affirm('  and it says it in plain English, not with a broken plural', !page.includes('time(s)'));
affirm('  the gate\'s technical name is still there, small',
  page.includes('<code>orchestrator_builds</code>'));
affirm('the gate that only warns does not show up in red',
  /<div class="box gate gray">\s*<span class="title">something was claimed with no receipt/.test(page));
affirm('the review with rounds given shows up, with its round count',
  page.includes("What's in review") && page.includes('2 rounds'));
affirm('the alert for the owner from the last 24 h DOES show up',
  page.includes('lane T1 is on its third compaction'));
affirm('the alert for the owner from 40 h ago does NOT show up',
  !page.includes('must NOT show up on the dashboard'));

console.log('\nF. THE LOG: 20 LINES, NOT ONE MORE');
// (d) EXACTLY 20 — what mutant 2 measures. The toy log carries 25.
const LINES = howMany(page, '<li class="bit">');
affirm('the page draws exactly 20 log lines', LINES === 20, `drew ${LINES}`);
affirm('  and they are the LAST 20: the 3rd of the 25 was left out',
  !page.includes('must NOT show up: only the last 20'));
// (g) Before, this looked for "wt-factory", which is ALSO in the ledger: the
// assertion passed even if the odd log line were deleted. Now it looks for
// the JOIN with " · " of columns 4 and 5, which can ONLY come from that line.
// (Codex gpt-5.6-sol, round 2, point (g).)
affirm('  a log line with MORE than 4 columns does not break it: they join with " · "',
  page.includes('T3 · wt-factory'),
  'looking for the join that can only come from dashboard-log.log line 13');
affirm('  control: that text is NOT in the toy ledger',
  !fs.readFileSync(LEDGER, 'utf8').includes('T3 · wt-factory'));

console.log('\nG. THE PAGE IS A STANDALONE FILE: NO LIBRARIES, NO NETWORK');
affirm('there is no <script src', !page.includes('<script src'));
affirm('there is not even one <script', !page.includes('<script'));
affirm('there is no "http://" anywhere on the page', !page.includes('http://'));
affirm('there is no "https://" anywhere on the page', !page.includes('https://'));
affirm('  and that despite the ledger and the log carrying web addresses',
  fs.readFileSync(LEDGER, 'utf8').includes('https://')
  && read(path.join(FIXTURES, 'dashboard-log.log')).includes('https://'));
affirm('  the address is defused but you can see where it pointed', page.includes('link→example.invalid'));
affirm('no letter goes below 16 px',
  (page.match(/font-size:(\d+(?:\.\d+)?)px/g) || []).every((m) => Number(m.match(/[\d.]+/)[0]) >= 16),
  (page.match(/font-size:(\d+(?:\.\d+)?)px/g) || []).filter((m) => Number(m.match(/[\d.]+/)[0]) < 16).join(', '));

console.log('\nH. THE SNAPSHOT NEVER LIES: RELOAD ONLY WITH --WATCH');
affirm('without --watch there is NO auto-reload', !page.includes('http-equiv="refresh"'));
affirm('without --watch the footer sends you to type /dashboard for another one',
  /Snapshot taken at \d{2}:\d{2}:\d{2}\. For another one, type <code>\/dashboard<\/code>/.test(page));
{
  const out = inTmp('watched.html');
  const child = spawn(process.execPath, [DASHBOARD, '--ledger', LEDGER, '--out', out, '--watch'],
    { cwd: TMP, env: { ...process.env, ORCH_DASHBOARD_MS: '150', ORCH_DASHBOARD_NOW: String(NOON) } });
  await new Promise((res) => setTimeout(res, 500));
  child.kill();
  const p = read(out) || '';
  affirm('with --watch it DOES reload itself every 60 s', p.includes('<meta http-equiv="refresh" content="60">'));
  affirm('  and the footer says so, instead of sending you to type /dashboard',
    p.includes('regenerating itself every minute') && !p.includes('type <code>/dashboard'));
}

console.log('\nI. THE LEDGER IS READ, NEVER WRITTEN');
{
  const before = fs.readFileSync(LEDGER, 'utf8');
  const mtimeBefore = fs.statSync(LEDGER).mtimeMs;
  run(['--ledger', LEDGER, '--out', inTmp('other.html')]);
  affirm('the ledger stays byte for byte the same', fs.readFileSync(LEDGER, 'utf8') === before);
  affirm('  and not even its date got touched', fs.statSync(LEDGER).mtimeMs === mtimeBefore);
  affirm('the log did not get written either',
    fs.readFileSync(LEDGER.replace(/\.json$/, '') + '.log', 'utf8').split('\n').filter(Boolean).length === 25);
}

console.log('\nJ. THE PAGE IS NEVER SEEN HALF-WRITTEN (atomic write)');
{
  // (c) Codex gpt-5.6-sol, round 2: with a direct writeFileSync, killing the
  // process mid-write leaves a truncated HTML in front of whoever is looking at it.
  affirm('writes to a temp file and RENAMES it (the rename is atomic)',
    /fs\.renameSync\(tmp, abs\)/.test(SOURCE) && /\.dashboard-\$\{process\.pid\}/.test(SOURCE));
  const dir = inTmp('atomic');
  const out = path.join(dir, 'dashboard.html');
  fs.mkdirSync(dir, { recursive: true });
  // An old, complete page, and an ORPHANED temp file half-written by another pass.
  run(['--ledger', LEDGER, '--out', out]);
  const old = read(out) || '';
  fs.writeFileSync(path.join(dir, '.dashboard-9999-1.tmp'), '<!DOCTYPE html><html><body>ORPHANED-HALF-CHUNK', 'utf8');
  let allComplete = true;
  for (let i = 0; i < 6; i++) {
    run(['--ledger', LEDGER, '--out', out]);
    const p = read(out) || '';
    if (!p.startsWith('<!DOCTYPE html>') || !p.trimEnd().endsWith('</html>')) allComplete = false;
  }
  affirm('after 6 passes in a row, the page is ALWAYS whole', allComplete);
  affirm('  an orphaned half-written temp file is never confused with the page',
    (read(out) || '').length > old.length / 2 && !(read(out) || '').includes('ORPHANED-HALF-CHUNK'));
  const leftovers = fs.readdirSync(dir).filter((f) => f.startsWith('.dashboard-') && f !== '.dashboard-9999-1.tmp');
  affirm('  and it does not leave its own temp files lying around', leftovers.length === 0, leftovers.join(', '));
}

console.log('\nK. A HUGE LOG IS NEVER READ WHOLE');
{
  // (e) Codex gpt-5.6-sol, round 2: reading megabytes every 60 s to keep only
  // 20 lines. Now only the last 64 KB are read by position.
  affirm('reads only the TAIL of the file, by position',
    /fs\.readSync\(fd, buf, 0, howMuch, from\)/.test(SOURCE) && /LOG_TAIL/.test(SOURCE));
  const ledger = prepareLedger('dashboard-ledger-full.json', inTmp('big.json'), false);
  const log = inTmp('big.log');
  const filler = 'x'.repeat(220);
  const chunks = [];
  for (let i = 0; i < 24000; i++) {
    chunks.push(`2026-09-16T10:00:00.000Z\tOBSERVE\tzero_unchecked\tline ${i} ${filler}`);
  }
  chunks.push('2026-09-17T09:00:00.000Z\tOBSERVE\twait_expired\tTHIS IS THE LAST LINE OF THE BIG LOG');
  fs.writeFileSync(log, chunks.join('\n') + '\n', 'utf8');
  const size = fs.statSync(log).size;
  const t0 = Date.now();
  const r = run(['--ledger', ledger, '--out', inTmp('big.html')]);
  const took = Date.now() - t0;
  const p = read(inTmp('big.html')) || '';
  affirm(`with a log of ${(size / 1048576).toFixed(1)} MB it still comes out fine`, r.code === 0, r.output);
  affirm('  and it draws the LAST line of all of them', p.includes('THIS IS THE LAST LINE OF THE BIG LOG'));
  affirm('  and it is still 20 lines', howMany(p, '<li class="bit">') === 20);
  affirm('  and it does not draw anything from the start of the file', !p.includes('line 0 '));
  affirm(`  and it does not take forever (took ${took} ms)`, took < 4000);

  // (a) Codex gpt-5.6-sol, round 3: if the 64 KB tail has NOT ONE line break,
  // `indexOf` returned -1 and half a line leaked into the page. Now the
  // window opens backward until it finds a break (with a cap), and if it
  // never finds one, the split line is dropped whole.
  const ledger2 = prepareLedger('dashboard-ledger-full.json', inTmp('big2.json'), false);
  const log2 = inTmp('big2.log');
  const giant = 'G'.repeat(150 * 1024);   // a single 150 KB entry, bigger than the window
  fs.writeFileSync(log2,
    ['2026-09-16T10:00:00.000Z\tOBSERVE\tstartup\tfirst normal line',
      '2026-09-16T10:01:00.000Z\tOBSERVE\tstartup\tsecond normal line',
      `2026-09-16T10:02:00.000Z\tOBSERVE\tzero_unchecked\tSTART-OF-THE-GIANT ${giant}`].join('\n') + '\n',
    'utf8');
  const rg = run(['--ledger', ledger2, '--out', inTmp('big2.html')]);
  const pg = read(inTmp('big2.html')) || '';
  affirm('with a 150 KB entry and no line breaks, it still comes out fine', rg.code === 0, rg.output);
  affirm('  it draws the giant line WHOLE (starting where it really starts)',
    pg.includes('START-OF-THE-GIANT'));
  affirm('  and no SPLIT line leaks through (none starts with the filler)',
    !/<li class="bit"><span class="when">—<\/span><span class="gate-tag"><\/span><span>GGG/.test(pg));
  affirm('  and the normal lines from before still show up',
    pg.includes('first normal line') && pg.includes('second normal line'));

  // Extreme case: the WHOLE file is a single line with no break at all and
  // bigger than the cap. There is nothing whole to show: it says so, it
  // doesn't invent anything.
  const ledger3 = prepareLedger('dashboard-ledger-full.json', inTmp('big3.json'), false);
  fs.writeFileSync(inTmp('big3.log'), 'X'.repeat(5 * 1024 * 1024), 'utf8');
  const r3 = run(['--ledger', ledger3, '--out', inTmp('big3.html')]);
  const p3 = read(inTmp('big3.html')) || '';
  affirm('a 5 MB file with not one line break does not blow up', r3.code === 0, r3.output);
  affirm('  and it does NOT draw half a line: it says so', howMany(p3, '<li class="bit">') === 0
    && p3.includes('not even one whole line can be pulled'));
}

console.log('\nL. WHEN THE LEDGER IS MISSING OR HALF-WRITTEN');
{
  const out = inTmp('no-ledger.html');
  const r = run(['--ledger', inTmp('does-not-exist.json'), '--out', out]);
  const p = read(out) || '';
  affirm('exits with code 2', r.code === 2, `code ${r.code}`);
  affirm('it still writes a page', fs.existsSync(out));
  affirm('  and the page SAYS the ledger could not be read',
    p.includes('the ledger could not be read') && p.includes('does not exist'));
  affirm('  with the path it looked for, so you know where to look', p.includes('does-not-exist.json'));
  affirm('  and with no invented data: no lanes, no waits', !p.includes('Circuit 1'));

  const broken = inTmp('broken.json');
  fs.writeFileSync(broken, '{ "version": 1, "lan', 'utf8');
  const r2 = run(['--ledger', broken, '--out', inTmp('broken.html')]);
  affirm('a half-written ledger also exits 2 and explains it',
    r2.code === 2 && (read(inTmp('broken.html')) || '').includes('is NOT valid JSON'));
}

console.log('\nM. WHEN THE LEDGER IS MISSING FIELDS');
{
  const ledger = prepareLedger('dashboard-ledger-gaps.json', inTmp('gaps.json'), false);
  const out = inTmp('gaps.html');
  const r = run(['--ledger', ledger, '--out', out]);
  const p = read(out) || '';
  affirm('exits with code 0: missing fields is not an error', r.code === 0, `code ${r.code}`);
  affirm('the sections are still there',
    p.includes('Circuit 1') && p.includes('Circuit 2') && p.includes('Circuit 3')
    && p.includes('Alerts for the owner') && p.includes('Log'));
  affirm('and every gap says "no data"', howMany(p, 'no data') >= 4, `${howMany(p, 'no data')} times`);
  affirm('with no log next to it, it says so and does not blow up', p.includes('there is no log next to the ledger'));
  affirm('counts 0 lanes and 0 open waits', / · 0 lanes · 0 open waits · /.test(r.output), r.output.trim());
  // NEW (round 5): with no `owner_session` NOTHING is guessed.
  affirm('with no owner_session it does not guess: it says it doesn\'t know who the orchestrator is',
    p.includes('no data: I don\'t know who the orchestrator is'));
}

console.log('\nN. --WATCH AND --OPEN');
{
  const out = inTmp('watching.html');
  const child = spawn(process.execPath, [DASHBOARD, '--ledger', LEDGER, '--out', out, '--watch'],
    { cwd: TMP, env: { ...process.env, ORCH_DASHBOARD_MS: '150', ORCH_DASHBOARD_NOW: String(NOON) } });
  let lines = '';
  child.stdout.on('data', (d) => { lines += d.toString(); });
  await new Promise((res) => setTimeout(res, 1200));
  const alive = child.exitCode === null;
  child.kill();
  const passes = howMany(lines, 'DASHBOARD: ');
  affirm('--watch stays alive instead of exiting', alive);
  affirm('--watch regenerates the page on its own, more than once', passes >= 3, `${passes} passes`);
  affirm('--watch\'s clock is 60 s when nobody changes it',
    /const INTERVAL_MS = 60000;/.test(SOURCE));

  // The toy browser: a script that writes down what it received. NOTHING here
  // opens a real browser.
  const mark = inTmp('opened.txt');
  const stub = inTmp('toy-browser.js');
  fs.writeFileSync(stub, `require('fs').writeFileSync(${JSON.stringify(mark)}, process.argv[2] || '', 'utf8');`, 'utf8');
  const r = run(['--ledger', LEDGER, '--out', out, '--open'],
    { env: { ORCH_DASHBOARD_OPEN_CMD: `${process.execPath} ${stub}` } });
  await new Promise((res) => setTimeout(res, 400));
  affirm('--open calls the browser', fs.existsSync(mark), r.output);
  affirm('  and passes it the page\'s ABSOLUTE path',
    (read(mark) || '') === path.resolve(out), read(mark));
  // (b) Codex gpt-5.6-sol, round 2: the command is split respecting quotes,
  // so a path with spaces doesn't turn into three arguments.
  const mark2 = inTmp('opened2.txt');
  const folderWithSpaces = inTmp('with spaces');
  fs.mkdirSync(folderWithSpaces, { recursive: true });
  const stub2 = path.join(folderWithSpaces, 'browser.js');
  fs.writeFileSync(stub2, `require('fs').writeFileSync(${JSON.stringify(mark2)}, process.argv[2] || '', 'utf8');`, 'utf8');
  run(['--ledger', LEDGER, '--out', out, '--open'],
    { env: { ORCH_DASHBOARD_OPEN_CMD: `"${process.execPath}" "${stub2}"` } });
  await new Promise((res) => setTimeout(res, 400));
  affirm('  and it handles paths with spaces if they are quoted', fs.existsSync(mark2));
}

console.log('\nO. THE MACOS BRANCH (NOT TESTED ON macOS): `/usr/bin/open` GETS CALLED ON DARWIN');
{
  // We can't launch a real macOS process from here, and a test that opens a
  // browser would be a bad test anyway. So this exercises the branch DIRECTLY
  // inside this same process: `child_process.spawnSync` gets REPLACED by a
  // fake that only writes down what it was asked (dashboard.js reads it off
  // the SAME shared core-module object when it is required),
  // `process.platform` is forced to the platform under test, and the toy
  // escape hatch `ORCH_DASHBOARD_OPEN_CMD` is left UNSET so the real platform
  // branch runs. NOTHING is launched, on any machine.
  const cpModule = require('child_process');
  const captureOpen = (platform, target) => {
    const originalSpawnSync = cpModule.spawnSync;
    const originalPlatform = process.platform;
    const originalHatch = process.env.ORCH_DASHBOARD_OPEN_CMD;
    delete process.env.ORCH_DASHBOARD_OPEN_CMD;
    let seenArgs = null;
    let threw = null;
    cpModule.spawnSync = (...args) => { seenArgs = args; return { status: 0 }; };
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    try {
      delete require.cache[require.resolve(DASHBOARD)];
      const dash = require(DASHBOARD);
      dash.openInBrowser(target);
    } catch (e) {
      threw = e;
    } finally {
      cpModule.spawnSync = originalSpawnSync;
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      if (originalHatch !== undefined) process.env.ORCH_DASHBOARD_OPEN_CMD = originalHatch;
      delete require.cache[require.resolve(DASHBOARD)];
    }
    return { seenArgs, threw };
  };

  const darwinTarget = inTmp('darwin-dashboard.html');
  const mac = captureOpen('darwin', darwinTarget);
  affirm('openInBrowser did not throw while forced to darwin', mac.threw === null, mac.threw && mac.threw.message);
  affirm('on darwin it calls the ABSOLUTE `/usr/bin/open`, not a bare `open`, not `xdg-open`, not `cmd.exe`',
    mac.seenArgs !== null && mac.seenArgs[0] === '/usr/bin/open', JSON.stringify(mac.seenArgs));
  affirm('  and passes it the HTML file\'s ABSOLUTE path as the only argument',
    mac.seenArgs !== null && Array.isArray(mac.seenArgs[1]) && mac.seenArgs[1].length === 1
    && mac.seenArgs[1][0] === path.resolve(darwinTarget),
    mac.seenArgs && JSON.stringify(mac.seenArgs[1]));
  affirm('  with no shell (a path is never handed to a shell to reinterpret)',
    mac.seenArgs !== null && mac.seenArgs[2] && mac.seenArgs[2].shell === false);

  const lin = captureOpen('linux', inTmp('linux-dashboard.html'));
  affirm('on linux it still falls back to `xdg-open`',
    lin.threw === null && lin.seenArgs !== null && lin.seenArgs[0] === 'xdg-open', JSON.stringify(lin.seenArgs));
  const win = captureOpen('win32', inTmp('win-dashboard.html'));
  affirm('on win32 it still goes through `cmd /c start` with an empty title',
    win.threw === null && win.seenArgs !== null && Array.isArray(win.seenArgs[1])
    && win.seenArgs[1].slice(0, 4).join(' ') === '/d /s /c start' && win.seenArgs[1][4] === '""',
    JSON.stringify(win.seenArgs && win.seenArgs[1]));
  affirm('  and the source marks the macOS branch as NOT TESTED ON macOS',
    /NOT TESTED ON macOS/.test(SOURCE) && /'\/usr\/bin\/open'/.test(SOURCE));
}

console.log('\nP. WITHOUT --LEDGER OR --OUT, IT PULLS THEM FROM THE REPO');
{
  const repo = inTmp('toy-repo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  prepareLedger('dashboard-ledger-full.json', path.join(repo, '.git', 'orchestrator-state.json'), true);
  const r = run([], { cwd: repo });
  affirm('finds only the ledger of the repo it was launched from', r.code === 0, r.output);
  affirm('and writes to <repo>/.orchestrator/dashboard.html',
    fs.existsSync(path.join(repo, '.orchestrator', 'dashboard.html')));

  const deep = path.join(repo, 'scripts', 'very', 'deep');
  fs.mkdirSync(deep, { recursive: true });
  const r2 = run([], { cwd: deep });
  affirm('climbs up to .git even when launched from a deep subfolder',
    r2.code === 0 && r2.output.includes(path.join(repo, '.orchestrator')), r2.output);
}

console.log('\nQ. THE EDGES: midnight, the exact limit, closed with no receipt, identity, and HTML');
// The snapshot is planted at 00:05 of an ordinary day: that way midnight and
// "today" are tested for real, and it does not matter what time the suite is run.
const MIDNIGHT = (() => { const d = new Date(); d.setHours(0, 5, 0, 0); return d.getTime(); })();
let edgesPage = '';
{
  const ledger = prepareLedger('dashboard-ledger-edges.json', inTmp('edges.json'), false, MIDNIGHT);
  const out = inTmp('edges.html');
  const r = run(['--ledger', ledger, '--out', out], { env: { ORCH_DASHBOARD_NOW: String(MIDNIGHT) } });
  edgesPage = read(out) || '';
  affirm('the edges ledger is drawn with the snapshot time pinned at 00:05',
    r.code === 0 && edgesPage.includes('Snapshot taken at 00:05:00'), r.output);

  // (1) identity: `owner_session` rules, not "the most recent owner".
  affirm('the ORCHESTRATOR box is the one of `owner_session`, not the impostor\'s',
    /<div class="box lane chief">[\s\S]*?30% of the million[\s\S]*?Compacted:<\/b> 2 times[\s\S]*?sreal111/.test(edgesPage),
    (edgesPage.match(/<div class="box lane chief">[\s\S]{0,400}/) || [''])[0].slice(0, 200));
  affirm('  and the impostor\'s memory does NOT leak into its box',
    !/<div class="box lane chief">[\s\S]*?90% of the million[\s\S]*?<\/div>/.test(edgesPage));
  affirm('  the impostor shows up where it belongs: in "Other terminals in this repo"',
    /Other terminals in this repo[\s\S]*?simpost1/.test(edgesPage));

  // (2) midnight: launched yesterday at 23:55, snapshot at 00:05 today.
  affirm('an agent launched at 23:55 and photographed at 00:05 comes out as "10 min ago"',
    /<span class="title">T20 — Opus agent I launched at 23:55 \(10 min ago\)/.test(edgesPage),
    (edgesPage.match(/<span class="title">T20 — [^<]*/) || ['not there'])[0]);

  // (3) live box with no launch time: it SAYS so, it doesn't stay silent.
  affirm('an agent nobody wrote the time down for says so, and offers its transcript\'s',
    /<span class="title">T21 — Sonnet agent — launched: time unknown \(I only see its transcript since 23:55\)/.test(edgesPage),
    (edgesPage.match(/<span class="title">T21 — [^<]*/) || ['not there'])[0]);

  // (4) the EXACT 30-minute limit is already STALLED, not alive.
  const edgeBoxes = (edgesPage.match(/<div class="box lane [^"]*">[\s\S]*?<\/div>/g) || []);
  affirm('an OPEN lane that moved exactly 30 minutes ago is no longer alive',
    !edgeBoxes.some((c) => /<span class="title">T22 — /.test(c)));
  affirm('  and in the fold it comes out labeled STALLED, with no receipt and its time',
    /T22[\s\S]{0,300}STALLED · no receipt · last movement 23:35/.test(edgesPage),
    (edgesPage.match(/T22[\s\S]{0,160}/) || ['not there'])[0]);
  // This one came out of looking at the REAL dashboard: a lane with no receipt
  // was drawn with the date "01/01 00:00" because `Date.parse(0)` is the year
  // 2000, not zero.
  affirm('  and its date is that of its last movement, not the year 2000',
    /T22/.test(edgesPage) && !edgesPage.includes('01/01 00:00'),
    (edgesPage.match(/<li class="done">[\s\S]{0,120}T22/) || ['not there'])[0]);
  affirm('  and the fold\'s title warns that there are stalled ones in there',
    /<summary>\d+ already done or stalled \(\d+ of them stalled, not closed\)<\/summary>/.test(edgesPage),
    (edgesPage.match(/<summary>[^<]*done or stalled[^<]*<\/summary>/) || ['not there'])[0]);

  // (5) a CLOSED lane with no receipt is not a "delivered today".
  affirm('a CLOSED lane with no receipt does NOT count as delivered today',
    /<p class="summary">[\s\S]*?1 delivered today \(T24\)/.test(edgesPage),
    (edgesPage.match(/<p class="summary">.*?<\/p>/) || ['not there'])[0]);
  affirm('  it comes out separately, as "closed with no receipt", with its name',
    /<p class="summary">[\s\S]*?1 closed with no receipt \(T23\)/.test(edgesPage));
  affirm('  and its row in the fold says the same as the summary',
    /T23[\s\S]{0,300}closed with no receipt/.test(edgesPage));

  // (6) "today" with the snapshot at 00:05: the wait closed at 00:03 IS today's.
  affirm('at 00:05, a wait closed at 00:03 counts as closed TODAY',
    /<summary>1 already closed \(1 today\)<\/summary>/.test(edgesPage),
    (edgesPage.match(/<summary>\d+ already closed \(\d+ today\)<\/summary>/) || ['not there'])[0]);

  // (8) the poisoned key arrives as TEXT, never as live HTML.
  affirm('a key with HTML inside does NOT arrive as an active tag',
    !edgesPage.includes('<IMG SRC=X') && !edgesPage.includes('<img src=x'));
  affirm('  it arrives escaped, and you see it exactly as it was written',
    edgesPage.includes('&lt;IMG SRC=X ONERROR=1&gt;'));
  affirm('  and also in the summary line',
    /<p class="summary">[\s\S]*?&lt;IMG SRC=X ONERROR=1&gt;/.test(edgesPage),
    (edgesPage.match(/<p class="summary">.*?<\/p>/) || ['not there'])[0]);
}

console.log('\nR. THE MUTANTS: making sure the assertions above know how to turn red');
{
  const runMutant = (name, old, updated, check) => {
    affirm(`mutant "${name}" setup: the original line is where it's expected`,
      howMany(SOURCE, old) === 1, `appears ${howMany(SOURCE, old)} times`);
    const mutantPath = inTmp(`mutant-${name}.js`);
    fs.writeFileSync(mutantPath, SOURCE.replace(old, updated), 'utf8');
    const out = inTmp(`mutant-${name}.html`);
    const r = spawnSync(process.execPath, [mutantPath, '--ledger', LEDGER, '--out', out],
      { encoding: 'utf8', cwd: TMP, env: { ...process.env, ORCH_DASHBOARD_NOW: String(NOON) } });
    affirm(`  mutant "${name}" still runs (otherwise it proves nothing)`, r.status === 0, r.stderr);
    check(read(out) || '');
  };

  runMutant('no-red-on-expired',
    "  if (status === 'EXPIRED') return 'red';",
    "  if (status === 'EXPIRED') return 'gray';",
    (p) => affirm('  MUTANT CAUGHT: taking the red off EXPIRED turns the assertion red',
      !RE_EXPIRED_RED.test(p)));

  runMutant('log-of-25',
    'const LOG_LINES = 20;',
    'const LOG_LINES = 25;',
    (p) => affirm('  MUTANT CAUGHT: drawing 25 log lines turns the assertion red',
      howMany(p, '<li class="bit">') !== 20, `drew ${howMany(p, '<li class="bit">')}`));

  // ROUND 2: if what's done goes back into the grid, it gets caught.
  runMutant('done-goes-back-to-the-grid',
    '    alive: lanes.filter((c) => c.alive).sort(byNumber),',
    '    alive: lanes.sort(byNumber),',
    (p) => {
      const boxes = (p.match(/<div class="box lane [^"]*">[\s\S]*?<\/div>/g) || []);
      affirm('  MUTANT CAUGHT: if what is done goes back into the grid, the assertion turns red',
        boxes.some((c) => /<span class="title">T2 — /.test(c)));
    });

  // NEW (round 4, widened in round 5): if the clock rules over the status
  // again, it gets caught — and checked with the FOUR terminal statuses, not
  // only with READY. (Codex gpt-5.6-sol, round 5, point 7.)
  {
    const old = '    c.done = TERMINAL_STATUS.test(c.status);';
    const updated = '    c.done = TERMINAL_STATUS.test(c.status) && c.last < now - ALIVE_MS;';
    affirm('mutant "the-clock-rules-over-the-status" setup: the original line is where it\'s expected',
      howMany(SOURCE, old) === 1);
    const mutantPath = inTmp('mutant-clock.js');
    fs.writeFileSync(mutantPath, SOURCE.replace(old, updated), 'utf8');
    // A toy ledger per status: all four have delivered and all four have
    // just touched their transcript.
    for (const status of ['READY', 'READY WITH DEVIATIONS', 'BLOCKED', 'CLOSED']) {
      const ledger = inTmp(`status-${status.replace(/\s/g, '-')}.json`);
      fs.writeFileSync(ledger, JSON.stringify({
        version: 1, program_id: 'orch-statuses', mode: 'OBSERVE',
        owner_session: 's1', sessions: { s1: { role: 'owner', context_tokens: 1000, last_time: new Date(NOON).toISOString() } },
        agents: { a1: { id: 'a1', desc: 'T30 the one that already closed', model: 'opus', ctx: 1000, compactions: 0, mtime: NOON - 60000 } },
        receipts: { T30: { at: new Date(NOON - 60000).toISOString(), status, next_step: 'nothing' } },
        waits: [], alerts: [], counters: { by_gate: {} },
      }), 'utf8');
      const sane = run(['--ledger', ledger, '--out', inTmp(`sane-${status}.html`)]);
      const sanePage = read(inTmp(`sane-${status}.html`)) || '';
      const inGrid = (p) => (p.match(/<div class="box lane [^"]*">[\s\S]*?<\/div>/g) || [])
        .some((c) => /<span class="title">T30 — /.test(c));
      affirm(`  a freshly moved ${status} does NOT show up in the grid`, sane.code === 0 && !inGrid(sanePage));
      const rm = spawnSync(process.execPath, [mutantPath, '--ledger', ledger, '--out', inTmp(`mut-${status}.html`)],
        { encoding: 'utf8', cwd: TMP, env: { ...process.env, ORCH_DASHBOARD_NOW: String(NOON) } });
      affirm(`  MUTANT CAUGHT on ${status}: if the clock rules, it goes back to the grid`,
        rm.status === 0 && inGrid(read(inTmp(`mut-${status}.html`)) || ''));
    }
  }

  // NEW (round 5): if the escaping is removed from the summary line, it gets caught.
  runMutant('summary-unescaped',
    "  const listing = (cs) => (cs.length ? ' (' + cs.map((c) => clean(c.key)).join(', ') + ')' : '');",
    "  const listing = (cs) => (cs.length ? ' (' + cs.map((c) => c.key).join(', ') + ')' : '');",
    () => {
      const out = inTmp('mutant-xss.html');
      const ledger = prepareLedger('dashboard-ledger-edges.json', inTmp('edges-xss.json'), false, MIDNIGHT);
      const rm = spawnSync(process.execPath, [inTmp('mutant-summary-unescaped.js'), '--ledger', ledger, '--out', out],
        { encoding: 'utf8', cwd: TMP, env: { ...process.env, ORCH_DASHBOARD_NOW: String(MIDNIGHT) } });
      const p = read(out) || '';
      affirm('  MUTANT CAUGHT: unescaped, the key with HTML arrives as an active tag',
        rm.status === 0 && p.includes('<IMG SRC=X ONERROR=1>'), rm.stderr);
    });

  // ROUND 2: if readers get their own box again, it gets caught.
  runMutant('readers-with-their-own-box',
    '  const lanes = allEntries.filter((c) => !c.isReader);',
    '  const lanes = allEntries;',
    (p) => affirm('  MUTANT CAUGHT: if readers stop being grouped, the assertion turns red',
      p.includes('count the adversary tests')));
}

/* ------------------------------------------------------------------ cleanup */
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* doesn't matter */ }

console.log(`\nDASHBOARD: ${ok} OK, ${bad} FAILS`);
process.exit(bad === 0 ? 0 : 1);
