#!/usr/bin/env node
'use strict';
/* ============================================================================
 * dashboard.js — the LIVE DASHBOARD of the orchestration, drawn as a circuit.
 *
 * WHY IT EXISTS: the orchestration ledger (`.git/orchestrator-state.json`)
 * knows everything that's happening — who's open, which wait expired, which
 * gate tripped — but it's a half-megabyte JSON file. The owner doesn't read
 * JSON, and the orchestrator burns context every time it opens it. This turns
 * it into ONE page you just LOOK at: big boxes, labeled arrows, green passes /
 * red blocks / gray waits. Same visual language as `docs/circuit.html`, which
 * the owner already approved.
 *
 * WHAT THIS PROGRAM DOES NOT DO, ON PURPOSE:
 *   · It does NOT write to the ledger. It only reads: a dashboard that changes
 *     the state it measures stops being a dashboard.
 *   · It depends on NOTHING: zero libraries, zero network, zero CDN. The page
 *     is a single HTML+CSS file that opens the same with the wifi down.
 *   · It carries NO JavaScript. Sections fold with <details>, which is HTML.
 *
 * USAGE:
 *   node scripts/dashboard.js
 *   node scripts/dashboard.js --ledger <path.json> --out <path.html>
 *   node scripts/dashboard.js --watch        (regenerates every 60 s until killed)
 *   node scripts/dashboard.js --open         (opens it in the default browser)
 *
 * STDOUT: one single line per pass.
 *   DASHBOARD: <path> · <n> lanes · <n> open waits · <hh:mm:ss>
 *
 * EXIT CODES: 0 it drew the page · 2 there's no ledger or it couldn't be read
 * (and it still writes a page that SAYS so, so nobody's left staring at a
 * blank tab without knowing why).
 *
 * TEST HATCHES (only the suite uses these; in normal use they don't exist):
 *   ORCH_DASHBOARD_MS         milliseconds between passes with `--watch` (default 60000)
 *   ORCH_DASHBOARD_OPEN_CMD   the command that stands in for the browser with `--open` (respects quotes)
 *   ORCH_DASHBOARD_NOW        the "snapshot time" in milliseconds, to test edges (midnight)
 * ========================================================================== */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const LOG_LINES = 20;               // how many log lines get drawn
const INTERVAL_MS = 60000;          // how often it regenerates with --watch
const ALERTS_WINDOW_MS = 24 * 60 * 60 * 1000;
const MILLION = 1000000;            // memory is counted as a % of the million
const ALIVE_MS = 30 * 60000;        // "alive" = moved less than half an hour ago
const TODAY_MS = 24 * 60 * 60 * 1000; // window of the alerts for the owner (the last 24 h)
const MAX_REVIEWS = 5;              // how many reviews show without folding
const LOG_TAIL = 64 * 1024;         // only the TAIL of the log is read, never the whole file
const LOG_CAP = 4 * 1024 * 1024;    // how far the window opens while looking for a line break

/* ------------------------------------------------------------- ARGUMENTS */

function parseArgs(argv) {
  const a = { ledger: null, out: null, watch: false, open: false, error: null };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--ledger' || v === '--out') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) { a.error = `${v} needs a path`; return a; }
      if (v === '--ledger') a.ledger = value; else a.out = value;
      i++;
    } else if (v === '--watch') a.watch = true;
    else if (v === '--open') a.open = true;
    else if (v === '--help' || v === '-h') a.help = true;
    else { a.error = `I don't understand "${v}"`; return a; }
  }
  return a;
}

/* --------------------------------------------------------- WHERE EVERYTHING IS */

/** The common `.git`, resolved the same way as the main script: walking up
 *  from `cwd` until it's found, and if it's a FILE (a worktree) following the
 *  `gitdir:` → `commondir` trail. No repo, no orchestration: returns null. */
function commonGitDir(cwd) {
  let dir = path.resolve(cwd);
  for (let i = 0; i < 40; i++) {
    const mark = path.join(dir, '.git');
    let st = null;
    try { st = fs.statSync(mark); } catch (_) { /* not here */ }
    if (st) {
      if (st.isDirectory()) return mark;
      try {
        const gitdir = path.resolve(dir, (fs.readFileSync(mark, 'utf8').match(/gitdir:\s*(.+)/) || [])[1].trim());
        const common = path.join(gitdir, 'commondir');
        if (fs.existsSync(common)) return path.resolve(gitdir, fs.readFileSync(common, 'utf8').trim());
        return gitdir;
      } catch (_) { return null; }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function repoRoot(gcd) {
  return path.basename(gcd).toLowerCase() === '.git' ? path.dirname(gcd) : gcd;
}

function defaultPaths(cwd) {
  const gcd = commonGitDir(cwd);
  if (gcd === null) return { ledger: null, out: null };
  return {
    ledger: path.join(gcd, 'orchestrator-state.json'),
    out: path.join(repoRoot(gcd), '.orchestrator', 'dashboard.html'),
  };
}

/* ------------------------------------------------------------- READ THE DISK */

function readLedger(ledgerFile) {
  let raw;
  try { raw = fs.readFileSync(ledgerFile, 'utf8'); }
  catch (e) {
    return { ok: false, reason: e && e.code === 'ENOENT' ? 'does not exist' : `cannot be read (${e && e.code ? e.code : 'error'})` };
  }
  let data;
  try { data = JSON.parse(raw); }
  catch (_) { return { ok: false, reason: 'exists but is NOT valid JSON (it is mid-write or got corrupted)' }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: 'the content is not a ledger (a JSON object was expected)' };
  }
  return { ok: true, data };
}

/** The log lives next to the ledger, with the same root and a `.log`
 *  extension. Each line's format: <ISO> TAB <mode> TAB <gate> TAB <text…>. */
function readLog(ledgerPath, howMany) {
  const logPath = String(ledgerPath).replace(/\.json$/i, '') + '.log';
  // Only the TAIL, never the whole file: the log of a long day weighs
  // megabytes and this regenerates every 60 s with `--watch`. The last 64 KB
  // are read by position and the first line is dropped if it got cut in half.
  // (Codex gpt-5.6-sol, round 2, point (e).)
  let raw;
  let fd = null;
  try {
    const size = fs.statSync(logPath).size;
    fd = fs.openSync(logPath, 'r');
    // If the tail doesn't have EVEN ONE line break, the last line is longer
    // than the window: the window keeps opening backward until it finds a
    // break, with a cap. Before, this wasn't done and `indexOf` returned -1,
    // so `slice(0)` let a SPLIT line through — exactly the opposite of what
    // the comment said. (Codex gpt-5.6-sol, round 3, point (a).)
    let window = LOG_TAIL;
    for (;;) {
      const from = Math.max(0, size - window);
      const howMuch = size - from;
      const buf = Buffer.alloc(howMuch);
      const read = fs.readSync(fd, buf, 0, howMuch, from);
      let text = buf.slice(0, read).toString('utf8');
      if (from > 0) {
        // The window's first line is almost always cut in half: it's dropped
        // WHOLE. If there's no break at all, what was read is the middle of
        // a giant line and it's all dropped — half a line on the page is
        // worse than none, and the old comment said this while the code did
        // the opposite.
        const cut = text.indexOf('\n');
        text = cut === -1 ? '' : text.slice(cut + 1);
      }
      raw = text;
      // If after dropping the split part not even one whole line is left,
      // the window opens further back and retries, up to the cap.
      if (from === 0 || text.trim() !== '' || window >= LOG_CAP) break;
      window *= 2;
    }
  } catch (_) {
    return { path: logPath, lines: null };
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch (_) { /* doesn't matter */ } }
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
  return {
    path: logPath,
    lines: lines.slice(-howMany).map((l) => {
      const t = l.split('\t');
      return t.length >= 4
        ? { at: t[0], mode: t[1], gate: t[2], text: t.slice(3).join(' · ') }
        : { at: null, mode: null, gate: null, text: l };
    }),
  };
}

/* ----------------------------------------------------------- TOOLS */

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isArray = (v) => Array.isArray(v);
const isOwn = (o, k) => isObject(o) && Object.prototype.hasOwnProperty.call(o, k);

function formatDateTime(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const dd = (n) => String(n).padStart(2, '0');
  return `${dd(d.getDate())}/${dd(d.getMonth() + 1)} ${dd(d.getHours())}:${dd(d.getMinutes())}`;
}

function shortTime(d) {
  const dd = (n) => String(n).padStart(2, '0');
  return `${dd(d.getHours())}:${dd(d.getMinutes())}:${dd(d.getSeconds())}`;
}

function longDate(d) {
  const dd = (n) => String(n).padStart(2, '0');
  return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()} at ${shortTime(d)}`;
}

/** How long until (or how long since), in words, not milliseconds. */
function relativeClock(isoTarget, now) {
  const t = Date.parse(isoTarget);
  if (!Number.isFinite(t)) return 'no time';
  const min = Math.round((t - now) / 60000);
  const abs = Math.abs(min);
  const howMuch = abs < 60 ? `${abs} min` : abs < 1440 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} days`;
  return min >= 0 ? `${howMuch} left` : `${howMuch} ago`;
}

/** Real English plurals: "1 time", "320 times". */
const pluralize = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const truncate = (s, n) => {
  const t = String(s);
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
};

/* ------------------------------------------------------- THE PAGE MODEL
 * Everything the page draws comes from here. No section reads the ledger on
 * its own, and NONE of them blow up if a field is missing: what's missing is
 * said as "no data".
 */

function buildModel(reg, log, now) {
  const lanes = laneList(reg, now);
  return {
    header: header(reg, now),
    alive: lanes.alive,
    done: lanes.done,
    helpers: lanes.helpers,
    paths: lanes.paths,
    waits: waitList(reg, now),
    gates: gateList(reg),
    reviews: reviewList(reg),
    alerts: alertList(reg, now),
    log,
    now,
  };
}

function header(reg, now) {
  const c = {
    program: typeof reg.program_id === 'string' && reg.program_id ? reg.program_id : null,
    mode: typeof reg.mode === 'string' && reg.mode ? reg.mode : null,
    since: typeof reg.started_at === 'string' ? reg.started_at : (typeof reg.created_at === 'string' ? reg.created_at : null),
    last_event: typeof reg.last_event_at === 'string' ? reg.last_event_at : null,
    snapshot: now,
    orchestrator: null,
    others: [],
    repos: [],
  };
  if (isObject(reg.sessions)) {
    // The orchestrator is EXACTLY the session the ledger names in
    // `owner_session`, and no other. Before, "the most recent session marked
    // owner" was picked, and if another terminal carried that mark ITS memory
    // got drawn as if it were this one's: a foreign number in the box that says
    // "you are reading it". If the ledger doesn't name it, or names it and it
    // isn't there, nothing is guessed here. (Codex gpt-5.6-sol, round 5, point 1.)
    const ownerId = typeof reg.owner_session === 'string' && reg.owner_session ? reg.owner_session : null;
    const ownerSession = ownerId && isOwn(reg.sessions, ownerId) && isObject(reg.sessions[ownerId])
      ? reg.sessions[ownerId] : null;
    const chosen = ownerSession ? { id: ownerId, s: ownerSession } : null;
    if (chosen) {
      const ctx = Number(chosen.s.context_tokens);
      c.orchestrator = {
        id: chosen.id.slice(0, 8),
        cwd: typeof chosen.s.cwd === 'string' ? chosen.s.cwd : null,
        tokens: Number.isFinite(ctx) ? ctx : null,
        pct: Number.isFinite(ctx) ? Math.round((ctx / MILLION) * 100) : null,
        compactions: Number.isFinite(Number(chosen.s.compactions)) ? Number(chosen.s.compactions) : 0,
        measured: typeof chosen.s.context_at === 'string' ? chosen.s.context_at : null,
      };
    }
    // The OTHER terminals that have also loaded the skill in this same repo.
    // They go separately, spelled out fully: the owner had two terminals open
    // and the question the owner asked seeing the first version was "whose is this?".
    for (const [id, s] of Object.entries(reg.sessions)) {
      if (!isOwn(reg.sessions, id) || !isObject(s)) continue;
      if (chosen && id === chosen.id) continue;
      const ctx = Number(s.context_tokens);
      c.others.push({
        id: String(id).slice(0, 8),
        role: typeof s.role === 'string' ? s.role : 'no data',
        pct: Number.isFinite(ctx) ? Math.round((ctx / MILLION) * 100) : null,
        last: typeof s.last_time === 'string' ? s.last_time : null,
        cwd: typeof s.cwd === 'string' ? s.cwd : null,
      });
    }
    c.others.sort((a, b) => Date.parse(b.last || 0) - Date.parse(a.last || 0));
  }
  if (isObject(reg.lanes)) {
    for (const [pathKey, r] of Object.entries(reg.lanes)) {
      if (!isObject(r)) continue;
      c.repos.push({
        path: typeof r.cwd === 'string' ? r.cwd : pathKey,
        branch: typeof r.branch === 'string' ? r.branch : 'no data',
        head: typeof r.head === 'string' ? r.head.slice(0, 7) : 'no data',
        seen: typeof r.seen_at === 'string' ? r.seen_at : null,
      });
    }
  }
  return c;
}

/** The lane name (T1, T8…) hidden inside a piece of text: in a subagent's
 *  description ("T5 tests for the six points"), in a brief's file name
 *  (BRIEF-T8-live-dashboard.md), or in an artifact's key. */
function laneFrom(text) {
  const m = /(?:^|[^A-Za-z0-9])(T\d{1,3})(?=$|[^A-Za-z0-9])/i.exec(String(text || ''));
  return m ? m[1].toUpperCase() : null;
}

/** A lane's description IN THE OWNER'S OWN WORDS: no repeated lane number, no
 *  model name, no obligatory colon.
 *  "T10 Opus: 8 small script fixes" → "8 small script fixes". */
function inWords(desc) {
  let t = String(desc === null || desc === undefined ? '' : desc).trim();
  const before = t;
  t = t.replace(/^T\d{1,3}\b[\s:–—-]*/i, '');
  t = t.replace(/^(opus|sonnet|haiku|fable)\b[\s:–—-]*/i, '');
  t = t.replace(/^(lead)\b[\s:–—-]*/i, '');
  t = t.replace(/^[\s:–—-]+/, '');
  return truncate(t.trim() || before, 72);
}

/** An ISO date in milliseconds, and 0 when there is no date. WATCH OUT for the
 *  old shortcut (`Date.parse(x || 0)`): `Date.parse(0)` does NOT give 0, it
 *  gives January 1st, 2000, so a lane with no receipt showed up in the fold
 *  with a delivery date of "01/01 00:00". It was seen by looking at the REAL
 *  dashboard, not in the tests. */
const toMs = (x) => {
  if (typeof x !== 'string' || x === '') return 0;
  const t = Date.parse(x);
  return Number.isFinite(t) ? t : 0;
};

/** The statuses that mean "this is no longer working". The STATUS rules over
 *  the clock: a READY lane doesn't go back to the grid because its
 *  conversation file was touched a moment ago. */
const TERMINAL_STATUS = /^(READY|BLOCKED|CLOSED)/i;

/** "Today" is TODAY, the calendar day — not "in the last 24 hours". If it is
 *  11 in the morning, something from yesterday at 18:38 is NOT "today" even
 *  though less than 24 hours went by, and putting it in the summary confuses
 *  whoever reads it. */
function isToday(ms, now) {
  if (!ms) return false;
  const a = new Date(ms), b = new Date(now);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function laneList(reg, now) {
  const laneMap = new Map();
  const getOrCreate = (key, name) => {
    if (!laneMap.has(key)) {
      laneMap.set(key, {
        key, name: name || key,
        type: null, model: null,
        status: null, receipt: null, brief: null,
        tokens: null, pct: null, compactions: 0,
        rounds: null, agents: 0,
        seen: 0, atTerminal: 0, atArtifact: 0, launched: 0, isReader: false,
      });
    }
    return laneMap.get(key);
  };

  // 1. named terminals (the ones someone christened with `terminal --lane`)
  if (isObject(reg.terminals)) {
    for (const [key, t] of Object.entries(reg.terminals)) {
      if (!isOwn(reg.terminals, key) || !isObject(t)) continue;
      const c = getOrCreate(String(key).toUpperCase());
      c.type = 'terminal';
      c.atTerminal = toMs(t.at);
      c.terminal_name = typeof t.name === 'string' ? t.name : null;
      c.session = typeof t.session === 'string' ? t.session : null;
      if (isObject(reg.sessions) && c.session && isObject(reg.sessions[c.session])) {
        const s = reg.sessions[c.session];
        const ctx = Number(s.context_tokens);
        if (Number.isFinite(ctx)) { c.tokens = ctx; c.pct = Math.round((ctx / MILLION) * 100); }
        const comp = Number(s.compactions);
        if (Number.isFinite(comp)) c.compactions = Math.max(c.compactions, comp);
      }
    }
  }

  // 2. measured agents (this is where the real memory and compactions come from)
  if (isObject(reg.agents)) {
    for (const [id, a] of Object.entries(reg.agents)) {
      if (!isOwn(reg.agents, id) || !isObject(a)) continue;
      const desc = typeof a.desc === 'string' && a.desc ? a.desc : `subagent ${String(id).slice(0, 8)}`;
      // Whoever has NO lane name is indexed by its ID, not by its
      // description: two readers launched with the same text (or the same
      // first characters) merged into one and the count came up short.
      // (Codex gpt-5.6-sol, round 3, point (b).)
      const key = laneFrom(desc) || `agent:${id}`;
      const c = getOrCreate(key, key);
      c.agents++;
      if (c.type !== 'terminal') c.type = 'subagent';
      // A reading helper is the one with NO lane name (nobody handed it a
      // brief) or the one launched as a one-shot reader.
      if (/disposable|reader/i.test(String(a.type || '')) || !/^T\d+$/.test(key)) c.isReader = true;
      // A lane can have had several agents (one per round). Whoever's in
      // charge of the box is the LAST one that moved, not the first one
      // registered. NOTE: `mtime` is real activity (when it wrote its
      // transcript); `measured_at` is only when the orchestrator got around
      // to measuring all of them, and it's the same for everyone, so it
      // does NOT tell who's still alive.
      const seen = Number(a.mtime) || 0;
      if (seen >= c.seen) {
        c.seen = seen;
        c.desc = truncate(desc, 72);
        if (typeof a.model === 'string' && a.model !== 'unknown') c.model = a.model;
      }
      if (!c.desc) c.desc = truncate(desc, 72);
      const ctx = Number(a.ctx);
      if (Number.isFinite(ctx) && (c.tokens === null || ctx > c.tokens)) { c.tokens = ctx; c.pct = Math.round((ctx / MILLION) * 100); }
      const comp = Number(a.compactions);
      if (Number.isFinite(comp)) c.compactions = Math.max(c.compactions, comp);
    }
  }

  // 3. dispatched briefs (the last one of each lane is "the open brief")
  if (isArray(reg.dispatches)) {
    for (const d of reg.dispatches) {
      if (!isObject(d) || typeof d.path !== 'string') continue;
      const short = path.basename(d.path);
      // Only BRIEF-*: receipts and handover sheets go through here too, and
      // a receipt is NOT anyone's "open brief".
      if (!/^BRIEF/i.test(short)) continue;
      const key = laneFrom(short);
      if (!key) continue;
      const c = getOrCreate(key);
      if (c.brief === null || Date.parse(d.at || 0) >= Date.parse(c.brief.at || 0)) {
        c.brief = { name: short, at: typeof d.at === 'string' ? d.at : null };
      }
      // When the work was handed over: the MOST RECENT brief, which is the one
      // being worked on now. The owner wants to read "I launched it at 11:41".
      c.launched = Math.max(c.launched, toMs(d.at));
    }
  }

  // 4. delivered receipts (the last thing each lane said, and what it recommends)
  if (isObject(reg.receipts)) {
    for (const [key, r] of Object.entries(reg.receipts)) {
      if (!isOwn(reg.receipts, key) || !isObject(r)) continue;
      const c = getOrCreate(String(key).toUpperCase());
      c.receipt = {
        at: typeof r.at === 'string' ? r.at : null,
        status: typeof r.status === 'string' ? r.status : null,
        next: typeof r.next_step === 'string' ? r.next_step : null,
      };
    }
  }

  // 5. review rounds (artifacts under review + reviews launched)
  if (isObject(reg.artifacts)) {
    for (const [key, a] of Object.entries(reg.artifacts)) {
      if (!isOwn(reg.artifacts, key) || !isObject(a)) continue;
      const c = laneMap.get(laneFrom(key) || truncate(key, 40));
      if (!c) continue;
      const rounds = Number(a.rounds);
      if (Number.isFinite(rounds)) c.rounds = Math.max(c.rounds || 0, rounds);
      if (typeof a.status === 'string') c.artifactStatus = a.status;
      c.atArtifact = Math.max(c.atArtifact, toMs(a.last_update));
      if (!c.launched) c.launched = toMs(a.first);
    }
  }
  // 6. when each subagent was launched: the automatic wait that opens when
  //    launching it carries the exact time, and it is the most faithful datum
  //    for "since when".
  if (isArray(reg.waits)) {
    for (const e of reg.waits) {
      if (!isObject(e) || !isObject(e.data)) continue;
      const key = laneFrom(e.data.key || e.what || '');
      if (!key) continue;
      const c = laneMap.get(key);
      if (c) c.launched = Math.max(c.launched, toMs(e.created_at));
    }
  }
  if (isArray(reg.reviews)) {
    for (const r of reg.reviews) {
      if (!isObject(r) || typeof r.lane !== 'string') continue;
      const c = laneMap.get(r.lane.toUpperCase());
      if (!c) continue;
      const round = Number(r.round);
      if (Number.isFinite(round)) c.rounds = Math.max(c.rounds || 0, round);
    }
  }

  // final status, last move, and color of each box
  const allEntries = [...laneMap.values()];
  for (const c of allEntries) {
    c.status = (c.receipt && c.receipt.status) || c.artifactStatus || (c.agents > 0 || c.brief ? 'OPEN' : 'NO DATA');
    c.third = c.compactions >= 3;                            // 3rd compaction: warn in red
    c.last = Math.max(c.seen || 0, c.atTerminal || 0, c.atArtifact || 0,
      toMs(c.receipt && c.receipt.at), toMs(c.brief && c.brief.at));
    // DONE is said by the STATUS, and the status RULES over the clock. A closed
    // lane (READY, READY WITH DEVIATIONS, BLOCKED, CLOSED) does not become
    // "alive" again because its conversation file was touched a moment ago:
    // that is what made T10, closed 40 minutes earlier, show up as if it were
    // working. (The owner, 12:00: "you say you launched two agents but I only
    // see 1".) WATCH OUT: done does NOT mean "delivered": BLOCKED and CLOSED
    // are terminal too and may have no receipt at all.
    c.done = TERMINAL_STATUS.test(c.status);
    // The DELIVERY time only exists if there is a receipt. Before, the last
    // movement was used as a stand-in, and a CLOSED artifact with no receipt
    // came out as "delivered today" while its own row said "no receipt".
    // (Codex gpt-5.6-sol, round 5, point 5.)
    c.delivered = toMs(c.receipt && c.receipt.at);
    c.deliveredToday = c.done && !!c.receipt && isToday(c.delivered, now);
    c.closedNoReceipt = c.done && !c.receipt;
    // ALIVE: what is NOT closed and has also moved LESS than half an hour
    // ago — exactly 30 minutes already counts as stalled, hence the `>` and
    // not the `>=`. What is not closed but has been quiet for more than half
    // an hour is STALLED: it stopped halfway and doesn't need to be watched
    // every minute either. (Codex gpt-5.6-sol, round 5, point 4: the comment
    // said "less than half an hour" while the code let the exact limit through.)
    c.alive = !c.done && c.last > now - ALIVE_MS;
    c.stalled = !c.done && !c.alive;
    c.color = c.third || /BLOCKED/i.test(c.status) ? 'red'
      : c.done ? 'green' : 'gray';
    // A lane may have no measured agent (a named terminal, for example). Then
    // the words come from its brief's name:
    // "BRIEF-T3-named-terminal.md" → "named terminal".
    c.inWords = c.desc ? inWords(c.desc)
      : c.brief ? inWords(String(c.brief.name).replace(/\.md$/i, '').replace(/^BRIEF[-_]/i, '').replace(/[-_]+/g, ' '))
        : null;
    c.title = c.inWords ? `${c.key} — ${c.inWords}` : c.key;
    c.typeText = c.type === 'terminal'
      ? `named terminal${c.terminal_name ? ' («' + c.terminal_name + '»)' : ''}`
      : c.isReader ? `reading helper${c.model ? ' (' + c.model + ')' : ''}`
        : `an agent I launched${c.model ? ' (' + modelName(c.model) + ')' : ''}`;
  }

  // Reading helpers do NOT get their own box: they're counted in a single
  // one. They're one-shot readers, nobody hands them a brief, and twenty of
  // their boxes bury the three that matter. (the owner, round 2: "hundreds of
  // terminals are showing up".)
  const readers = allEntries.filter((c) => c.isReader);
  const lanes = allEntries.filter((c) => !c.isReader);
  const byNumber = (a, b) => {
    const na = /^T(\d+)$/.exec(a.key), nb = /^T(\d+)$/.exec(b.key);
    if (na && nb) return Number(na[1]) - Number(nb[1]);
    return (b.last || 0) - (a.last || 0);
  };

  return {
    alive: lanes.filter((c) => c.alive).sort(byNumber),
    done: lanes.filter((c) => !c.alive)
      .sort((a, b) => (b.last || 0) - (a.last || 0)),
    helpers: {
      // AGENTS are counted, not groups: "in total" has to match how many were
      // really launched. (Codex gpt-5.6-sol, round 3, point (b).)
      total: readers.reduce((n, c) => n + (c.agents || 1), 0),
      today: readers.filter((c) => isToday(c.last, now)).reduce((n, c) => n + (c.agents || 1), 0),
      last: readers.reduce((m, c) => Math.max(m, c.last || 0), 0) || null,
      names: readers.sort((a, b) => (b.last || 0) - (a.last || 0))
        .slice(0, 8).map((c) => ({ what: inWords(c.desc || c.key), when: c.last || null })),
    },
    // Paths do NOT go inside the boxes: they go here, at the end, in a folded
    // table for whoever needs them.
    paths: lanes.filter((c) => c.brief || c.receipt).map((c) => ({
      lane: c.key,
      what: c.inWords,
      brief: c.brief ? c.brief.name : null,
      receipt: c.receipt ? c.receipt.path || null : null,
      receipt_at: c.receipt ? c.receipt.at : null,
    })).sort((a, b) => a.lane.localeCompare(b.lane, 'en', { numeric: true })),
  };
}

/** The model name, the way a person would say it: "Opus", not "opus". */
function modelName(m) {
  const t = String(m || '').toLowerCase();
  return t === 'opus' ? 'Opus' : t === 'sonnet' ? 'Sonnet' : t === 'haiku' ? 'Haiku' : String(m);
}

function waitList(reg, now) {
  if (!isArray(reg.waits)) return { open: [], closed: [], any: false };
  const all = reg.waits.filter(isObject).map((e) => {
    const status = typeof e.status === 'string' ? e.status : 'NO DATA';
    return {
      what: truncate(typeof e.what === 'string' ? e.what : 'no data', 150),
      deadline: typeof e.deadline === 'string' ? e.deadline : null,
      status,
      clock: e.deadline ? relativeClock(e.deadline, now) : 'no time',
      noClose: e.no_known_close === true,
      type: isObject(e.data) && typeof e.data.type === 'string' ? e.data.type : null,
      // `closed_at` is KEPT: without it, "closed today" always came out 0 because
      // further down a field was read that this very function had thrown away.
      // (Codex gpt-5.6-sol, round 5, point 6.)
      closed_at: typeof e.closed_at === 'string' ? e.closed_at : null,
      color: waitColor(status, e.no_known_close === true),
    };
  });
  // CLOSED ones aren't boxes: they're a number. They already answered,
  // there's nothing to look at in them. (the owner, round 2: of 34 waits, 30 were closed.)
  const closed = all.filter((e) => e.status === 'CLOSED');
  return {
    any: all.length > 0,
    open: all.filter((e) => e.status !== 'CLOSED'),
    closed: closed.length,
    closedToday: closed.filter((e) => isToday(toMs(e.closed_at), now)).length,
  };
}

/** A wait's color. EXPIRED goes in RED: it's the whole point of the alert. */
function waitColor(status, noClose) {
  if (status === 'EXPIRED') return 'red';
  if (noClose) return 'gray';
  if (status === 'CLOSED') return 'green';
  return 'gray';
}

function gateList(reg) {
  const byGate = isObject(reg.counters) && isObject(reg.counters.by_gate) ? reg.counters.by_gate : null;
  if (!byGate) return [];
  const last = new Map();
  if (isArray(reg.alerts)) {
    for (const a of reg.alerts) {
      if (isObject(a) && typeof a.gate === 'string' && typeof a.at === 'string') last.set(a.gate, a.at);
    }
  }
  const gates = [];
  for (const [gate, n] of Object.entries(byGate)) {
    if (!isOwn(byGate, gate)) continue;
    const times = Number(n);
    const mode = isObject(reg.gates) && typeof reg.gates[gate] === 'string' ? reg.gates[gate] : 'no data';
    gates.push({
      gate,
      times: Number.isFinite(times) ? times : 0,
      mode,
      last: last.get(gate) || null,
      blocks: gate === 'orchestrator_builds' || mode === 'BLOCK',
    });
  }
  gates.sort((a, b) => b.times - a.times);
  return gates;
}

/** What's UNDER REVIEW: only what carries at least one round given, or an
 *  undecided decision. An open artifact with zero rounds is not work under
 *  review, it's a ledger row. 5 are shown; the rest, folded. */
function reviewList(reg) {
  if (!isObject(reg.artifacts)) return { highlighted: [], rest: 0, total: 0 };
  const rows = [];
  for (const [key, a] of Object.entries(reg.artifacts)) {
    if (!isOwn(reg.artifacts, key) || !isObject(a)) continue;
    const rounds = Number(a.rounds);
    const decided = a.decision !== null && a.decision !== undefined;
    if (!(Number.isFinite(rounds) && rounds > 0) && decided) continue;
    rows.push({
      what: inWords(key),
      rounds: Number.isFinite(rounds) ? rounds : 0,
      status: typeof a.status === 'string' ? a.status : 'no data',
      decision: decided ? String(a.decision) : null,
      last: typeof a.last_update === 'string' ? a.last_update : null,
      third: Number.isFinite(rounds) && rounds >= 3,
    });
  }
  rows.sort((a, b) => (b.rounds - a.rounds) || (toMs(b.last) - toMs(a.last)));
  return { highlighted: rows.slice(0, MAX_REVIEWS), rest: Math.max(0, rows.length - MAX_REVIEWS), total: rows.length };
}

/** The alerts the owner has to decide or type themselves: the ones the main
 *  script marks `for_human: true`. NOTE — today the ledger stores its alerts
 *  without that mark (it comes out of `raiseAlert()`, which doesn't copy it),
 *  so on a real ledger this list can come out empty and that's not a
 *  dashboard bug. That's why it also says how many alerts DO exist in the
 *  window, and where to see them. */
function alertList(reg, now) {
  if (!isArray(reg.alerts)) return { hasField: false, list: [], inWindow: 0 };
  const since = now - ALERTS_WINDOW_MS;
  const inWindow = reg.alerts.filter((a) => isObject(a) && Date.parse(a.at || 0) >= since);
  const flagged = inWindow.filter((a) => a.for_human === true);
  return {
    hasField: reg.alerts.some((a) => isObject(a) && isOwn(a, 'for_human')),
    inWindow: inWindow.length,
    list: flagged.map((a) => ({
      at: typeof a.at === 'string' ? a.at : null,
      gate: typeof a.gate === 'string' ? a.gate : 'no gate',
      text: truncate(typeof a.text === 'string' ? a.text : 'no text', 420),
    })),
  };
}

/* ------------------------------------------------------------------ DRAW */

const esc = (s) => String(s === null || s === undefined ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Ledger text ready to drop into the page. Besides escaping the HTML, it
 *  defuses web addresses: the page is a local file that opens with no
 *  network, and a live address inside it invites a click and the browser
 *  going out to fetch it. The destination is kept (you can see where it
 *  pointed), the "go" part is removed. */
const clean = (s) => esc(String(s === null || s === undefined ? '' : s).replace(/https?:\/\//gi, 'link→'));

const orNoData = (v) => (v === null || v === undefined || v === '' ? '<span class="no-data">no data</span>' : clean(v));

function pageStyle() {
  return `
:root{
  --ink:#1a1d21; --muted:#5a6169; --paper:#f7f8fa; --card:#ffffff;
  --line:#9aa3ad; --border:#d8dde3;
  --green:#1f7a44; --green-bg:#e8f6ed; --green-border:#4ea675;
  --red:#a62a2a;  --red-bg:#fdecec;  --red-border:#d2706f;
  --gray:#4a5259;  --gray-bg:#eef0f3;  --gray-border:#b9c1ca;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;padding:30px 20px 70px;background:var(--paper);color:var(--ink);
  font:17px/1.55 -apple-system, "Segoe UI", system-ui, Arial, sans-serif;}
.wrapper{max-width:1180px;margin:0 auto}
h1{font-size:30px;line-height:1.25;margin:0 0 8px}
h2{font-size:24px;line-height:1.3;margin:34px 0 6px}
h3{font-size:19px;margin:22px 0 10px}
p{margin:0 0 14px}
.intro{font-size:18px;color:var(--muted);max-width:75ch}
.no-data{color:var(--muted);font-style:italic}
.path{font-family:Consolas,"Courier New",monospace;font-size:16px;overflow-wrap:anywhere;word-break:break-word}

/* --- header --- */
.badges{display:flex;flex-wrap:wrap;gap:12px;margin:14px 0 8px;padding:0;list-style:none}
.badges li{background:var(--card);border:1px solid var(--border);border-radius:9px;
  padding:9px 14px;font-size:16px;min-width:0}
.badges b{display:block;font-size:16px;color:var(--muted);font-weight:700;
  text-transform:uppercase;letter-spacing:.02em}
.badges span{font-size:18px}
.badges .path,.badges .stamp{display:block}

/* --- legend --- */
.legend{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0 8px;padding:0;list-style:none}
.legend li{display:flex;align-items:center;gap:9px;font-size:16px;background:var(--card);
  border:1px solid var(--border);border-radius:8px;padding:8px 13px}
.swatch{width:19px;height:19px;border-radius:5px;border:2px solid}
.m-green{background:var(--green-bg);border-color:var(--green-border)}
.m-red{background:var(--red-bg);border-color:var(--red-border)}
.m-gray{background:var(--gray-bg);border-color:var(--gray-border)}

/* --- each circuit's frame --- */
.diagram{background:var(--card);border:1px solid var(--border);border-radius:14px;
  padding:24px 22px 26px;margin:0 0 16px}
.context-note{font-size:17px;color:var(--muted);margin:0 0 20px;padding-bottom:13px;
  border-bottom:1px dashed var(--border)}

/* --- boxes --- */
.box{border:2px solid var(--gray-border);background:var(--gray-bg);border-radius:11px;
  padding:13px 15px}
.box .title{font-size:18px;font-weight:700;line-height:1.3;display:block}
.box .foot{font-size:16px;color:var(--muted);margin-top:5px;display:block;line-height:1.4}
.box.green{background:var(--green-bg);border-color:var(--green-border)}
.box.green .title{color:var(--green)}
.box.red{background:var(--red-bg);border-color:var(--red-border)}
.box.red .title{color:var(--red)}
.box.center{width:min(100%,430px);margin:0 auto;text-align:center}

/* --- arrows --- */
.arrow-down{display:flex;flex-direction:column;align-items:center;margin:4px 0}
.arrow-down .stem{width:3px;height:24px;background:var(--line)}
.arrow-down .point{width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;
  border-top:13px solid var(--line)}
.arrow-down .label{font-size:16px;color:var(--muted);margin-top:5px}

/* --- lane grid --- */
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:16px}
.lane .fields{list-style:none;margin:10px 0 0;padding:0}
.lane .fields li{font-size:16px;line-height:1.45;padding:3px 0;border-top:1px solid rgba(0,0,0,.06)}
.lane .fields li:first-child{border-top:0}
.lane .fields b{color:var(--muted);font-weight:700}
.chip{display:inline-block;font-size:16px;font-weight:700;border-radius:999px;padding:2px 11px;
  border:2px solid var(--gray-border);background:#fff}
.chip.green{border-color:var(--green-border);color:var(--green)}
.chip.red{border-color:var(--red-border);color:var(--red)}
.bar{height:12px;border-radius:7px;background:#fff;border:1px solid var(--border);overflow:hidden;margin-top:5px}
.bar span{display:block;height:100%;background:var(--green-border)}
.bar.high span{background:var(--red-border)}

/* --- waits and gates --- */
.rows{display:flex;flex-direction:column;gap:12px}
.row{display:grid;grid-template-columns:1fr 210px;gap:14px;align-items:center}
.row .text{font-size:17px;overflow-wrap:anywhere}
.row .clock{font-size:16px;text-align:center}
.gate{border-style:double;border-width:3px;border-radius:6px}
.list{margin:0;padding-left:22px}
.list li{font-size:17px;margin:0 0 10px;line-height:1.5;overflow-wrap:anywhere}
.stamp{font-size:16px;color:var(--muted)}

/* --- glossary and round-2 pieces --- */
.glossary dl{margin:12px 0 0}
.glossary dt{font-size:17px;font-weight:700;margin:12px 0 2px}
.glossary dd{font-size:16px;color:var(--muted);margin:0 0 0 2px;line-height:1.45}
.box .foot.type{margin:0 0 6px;font-size:16px;font-weight:700;text-transform:uppercase;
  letter-spacing:.02em;color:var(--muted)}
.box .foot.movement{margin-top:10px;padding-top:8px;border-top:1px solid rgba(0,0,0,.08);font-size:16px}
code{font-family:Consolas,"Courier New",monospace;font-size:16px;background:var(--paper);
  padding:1px 5px;border-radius:4px;border:1px solid var(--border)}
li.done,li.loose{display:grid;grid-template-columns:82px 170px 1fr;gap:10px}
.box.chief{border-width:3px;border-color:var(--ink);background:#fff}
.box.chief .title{font-size:19px}
.box.chief .foot.type{color:var(--ink)}
.summary{margin:20px 0 0;padding-top:14px;border-top:1px dashed var(--border);font-size:17px}

/* --- log --- */
details{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 18px;margin:0 0 16px}
summary{font-size:18px;font-weight:700;cursor:pointer}
.log{list-style:none;margin:14px 0 0;padding:0}
.log li{font-size:16px;line-height:1.45;padding:7px 0;border-top:1px solid var(--border);
  display:grid;grid-template-columns:62px 190px 1fr;gap:10px;overflow-wrap:anywhere}
.log li:first-child{border-top:0}
.log .when{color:var(--muted);font-variant-numeric:tabular-nums}
.log .gate-tag{color:var(--muted);font-weight:700;overflow-wrap:anywhere}

footer{margin-top:38px;padding-top:16px;border-top:1px solid var(--border);font-size:16px;color:var(--muted)}

@media (max-width:820px){
  .row{grid-template-columns:1fr}
  .log li{grid-template-columns:1fr}
}`;
}

function wrapPage(title, body, watching) {
  // `refresh` ONLY when generated with `--watch`: without a watcher behind
  // it, the page would reload every minute to show exactly the same
  // snapshot, and that's promising something that doesn't happen.
  // (the owner, 10:30: "show it to me when I ask.")
  const refresh = watching ? '\n<meta http-equiv="refresh" content="60">' : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">${refresh}
<title>${esc(title)}</title>
<style>${pageStyle()}
</style>
</head>
<body>
<div class="wrapper">
${body}
</div>
</body>
</html>
`;
}

/** Six words, folded: the ones needed to understand the rest. */
function renderGlossary() {
  const rows = [
    ['Lane', "a piece of the work with an owner and its own files. It's called T1, T2, T3… Nobody touches another lane's files."],
    ['Agent', "a helper this terminal launches internally to do a lane. It isn't another window: it lives inside this session."],
    ['Named terminal', "a real window, opened by you, that's been given a name so things can be sent to it."],
    ['Wait', 'something requested that has not answered yet, with the time its deadline runs out.'],
    ['Gate', 'a rule that watches one specific thing and warns when it sees it (for example, the orchestrator trying to build).'],
    ['Compact', "when an agent's memory fills up, it summarizes its conversation and keeps going. By the third time, it tends to start forgetting things."],
  ];
  return `<details class="glossary"><summary>Six words, in case one sounds odd</summary>
  <dl>
${rows.map(([t, d]) => `    <dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join('\n')}
  </dl>
</details>`;
}

function renderHeader(c) {
  const orq = c.orchestrator;
  const repo = (orq && orq.cwd) || (c.repos.length ? c.repos[0].path : null);
  const whoIAm = `<p class="intro">This dashboard is <strong>THIS terminal's</strong> (the one that loaded the skill in
  <span class="path">${repo ? clean(repo) : 'no data'}</span>, session <strong>${orq ? clean(orq.id) : 'no data'}</strong>).
  Everything below was launched by it. Your other terminal, if it loads the skill in another repo, has its own dashboard.</p>`;

  const others = c.others.length
    ? `<h3>Other terminals in this repo</h3>
<div class="rows">
${c.others.map((o) => `  <div class="row">
    <div class="box">
      <span class="title">Other terminal — session ${clean(o.id)}</span>
      <span class="foot">${clean(o.role === 'owner' ? 'orchestrator' : o.role)}${o.pct === null ? '' : ' · memory ' + o.pct + '% of the million'}</span>
    </div>
    <div class="box"><span class="title">${o.last ? clean(formatDateTime(o.last)) : 'no data'}</span><span class="foot">last movement</span></div>
  </div>`).join('\n')}
</div>
<p class="stamp">What they do does NOT show up in this dashboard: each terminal keeps its own.</p>`
    : '';

  return `<h1>Orchestration dashboard</h1>
${whoIAm}

${renderGlossary()}

<ul class="badges">
  <li><b>Program</b><span>${orNoData(c.program)}</span></li>
  <li><b>Mode</b><span>${orNoData(c.mode)}</span></li>
  <li><b>Running since</b><span>${c.since ? clean(formatDateTime(c.since)) : '<span class="no-data">no data</span>'}</span></li>
  <li><b>Snapshot taken at</b><span>${esc(shortTime(new Date(c.snapshot)))}</span></li>
</ul>

<ul class="legend">
  <li><span class="swatch m-green"></span> Green: done</li>
  <li><span class="swatch m-red"></span> Red: blocks, expired, or needs a look</li>
  <li><span class="swatch m-gray"></span> Gray: working or waiting</li>
</ul>

${others}`;
}

/** "20 min ago", "2 h ago". So the launch time can be understood without
 *  subtracting in your head. */
function sinceWhen(ms, now) {
  if (!ms) return null;
  const min = Math.max(0, Math.round((now - ms) / 60000));
  return min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`;
}

function renderLanes(alive, done, helpers, head, now) {
  const orq = head.orchestrator;
  // THE ORCHESTRATOR GOES FIRST AND BIG. Without it, the owner saw boxes of
  // agents and didn't know which one was the terminal being read. (The owner,
  // 12:00: "which agent is that one, or is the orchestrator counted on the
  // dashboard?".)
  const orchestratorBox = orq
    ? `  <div class="box lane chief">
    <span class="title">ORCHESTRATOR — this terminal (you are reading it)</span>
    <ul class="fields">
      <li><b>Memory:</b> ${orq.pct !== null ? `${orq.pct}% of the million<div class="bar ${orq.pct >= 60 ? 'high' : ''}"><span style="width:${Math.max(0, Math.min(100, orq.pct))}%"></span></div>` : '<span class="no-data">no data</span>'}</li>
      <li><b>Compacted:</b> ${pluralize(orq.compactions, 'time', 'times')}</li>
      <li><b>Program:</b> ${orNoData(head.program)}</li>
      <li><b>Session:</b> ${clean(orq.id)}</li>
    </ul>
    <span class="foot movement">last movement: ${head.last_event ? clean(formatDateTime(head.last_event)) : 'no data'}</span>
  </div>`
    // With no `owner_session` in the ledger ANOTHER session's memory is NOT put
    // in its place: it says it isn't known. (Codex gpt-5.6-sol, round 5, point 1.)
    : `  <div class="box lane chief">
    <span class="title">ORCHESTRATOR — this terminal (you are reading it)</span>
    <ul class="fields">
      <li class="no-data">no data: I don't know who the orchestrator is — the ledger doesn't say which of the sessions it is, so I don't put another one's memory here.</li>
      <li><b>Program:</b> ${orNoData(head.program)}</li>
    </ul>
  </div>`;

  const box = (c) => {
    const memory = c.pct === null
      ? '<span class="no-data">no data</span>'
      : `${c.pct}% of the million<div class="bar ${c.pct >= 60 ? 'high' : ''}"><span style="width:${Math.max(0, Math.min(100, c.pct))}%"></span></div>`;
    const compact = c.third
      ? `<span class="chip red">${c.compactions} — on its 3rd: it's losing context</span>`
      : `${c.compactions}`;
    // WHO it is and SINCE WHEN, in one sentence, before any datum:
    // "T11 — Opus agent I launched at 11:41 (20 min ago) for: …".
    // If nobody wrote down when it was launched (no brief, no artifact, no
    // wait), it SAYS it isn't known instead of staying silent, and offers the
    // only thing there is: the time of its transcript. (Codex gpt-5.6-sol,
    // round 5, point 3.)
    const when = c.launched
      ? ` I launched at ${esc(shortTime(new Date(c.launched)).slice(0, 5))} (${esc(sinceWhen(c.launched, now))})`
      : c.seen
        ? ` — launched: time unknown (I only see its transcript since ${esc(shortTime(new Date(c.seen)).slice(0, 5))})`
        : ' — launched: time unknown';
    const who = c.type === 'terminal'
      ? `named terminal${c.terminal_name ? ' «' + clean(c.terminal_name) + '»' : ''}${when}`
      : `${c.model ? clean(modelName(c.model)) + ' agent' : 'agent with no model'}${when}`;
    return `  <div class="box lane ${c.color}">
    <span class="title">${clean(c.key)} — ${who}${c.inWords ? ' for: ' + clean(c.inWords) : ''}</span>
    <ul class="fields">
      <li><b>Status:</b> <span class="chip ${c.color === 'red' ? 'red' : c.color === 'green' ? 'green' : ''}">${clean(c.status)}</span></li>
      <li><b>Memory:</b> ${memory}</li>
      <li><b>Compactions:</b> ${compact}</li>
      <li><b>Review rounds:</b> ${c.rounds === null ? '<span class="no-data">no data</span>' : c.rounds}</li>
    </ul>
    <span class="foot movement">last movement: ${c.last ? esc(formatDateTime(new Date(c.last).toISOString())) : 'no data'}</span>
  </div>`;
  };

  const helpersBox = helpers.total
    ? `  <div class="box lane gray">
    <span class="foot type">reading helpers</span>
    <span class="title">Reading helpers: ${helpers.today} today</span>
    <ul class="fields">
      <li>One-shot readers: they open something long, summarize it, and disappear. They have no brief of their own.</li>
      <li><b>Total in the ledger:</b> ${helpers.total}</li>
    </ul>
    <span class="foot movement">last movement: ${helpers.last ? esc(formatDateTime(new Date(helpers.last).toISOString())) : 'no data'}</span>
  </div>`
    : '';

  const body = `  <div class="grid">
${[orchestratorBox, ...alive.map(box), helpersBox].filter(Boolean).join('\n')}
  </div>`;

  // The line that answers at a glance "who is working right now?".
  // `clean()` here too: the key comes out of the ledger (from `terminals` or
  // from `receipts`), so it is outside text and cannot reach the page as live
  // HTML. (Codex gpt-5.6-sol, round 5, point 8.)
  const listing = (cs) => (cs.length ? ' (' + cs.map((c) => clean(c.key)).join(', ') + ')' : '');
  const deliveredToday = done.filter((c) => c.deliveredToday);
  const closedNoReceipt = done.filter((c) => c.closedNoReceipt);
  const summary = `  <p class="summary"><b>Right now:</b> the orchestrator + ${
    alive.length ? pluralize(alive.length, 'agent working', 'agents working') + listing(alive) : 'no agent working'
  } · ${deliveredToday.length} delivered today${listing(deliveredToday)}${
    closedNoReceipt.length ? ' · ' + closedNoReceipt.length + ' closed with no receipt' + listing(closedNoReceipt) : ''
  } · ${pluralize(helpers.today, 'reading helper', 'reading helpers')}</p>`;

  // Each row of the fold says WHAT happened to it: delivered with a receipt,
  // closed with no receipt, or STALLED halfway. (Codex gpt-5.6-sol, round 5,
  // points 4 and 5.)
  const foldRow = (c) => {
    const stamp = c.receipt
      ? 'delivered at ' + esc(shortTime(new Date(c.delivered)).slice(0, 5)) + ' · receipt OK'
      : c.done
        ? '<span class="stamp">closed with no receipt</span>'
        : `<span class="stamp">STALLED · no receipt · last movement ${c.last ? esc(shortTime(new Date(c.last)).slice(0, 5)) : 'unknown'}</span>`;
    const at = c.delivered || c.last;
    return `    <li class="done"><span class="when">${at ? esc(formatDateTime(new Date(at).toISOString())) : '—'}</span><span class="gate-tag">${c.stalled ? 'STALLED' : clean(c.status)}</span><span>${clean(c.title)} · ${stamp}${c.receipt && c.receipt.next ? ' · <span class="stamp">next step: ' + clean(truncate(c.receipt.next, 150)) + '</span>' : ''}</span></li>`;
  };

  const stalledCount = done.filter((c) => c.stalled).length;
  const folded = done.length
    ? `<details><summary>${done.length} already done or stalled${stalledCount ? ` (${stalledCount} of them stalled, not closed)` : ''}</summary>
  <ul class="log">
${done.map(foldRow).join('\n')}
  </ul>
</details>`
    : '';

  return `<h2>Circuit 1 — what's in motion</h2>
<div class="diagram">
  <p class="context-note">The first box is the terminal you are reading; the agents it has launched hang from it.
  Up here only what's ALIVE shows up: what is not closed and has moved in the last half hour.
  Below, collapsed, goes the rest: what already closed and what was left STALLED halfway.</p>
${body}
${summary}
</div>
${folded}`;
}

function renderWaits(e) {
  if (!e.any) {
    return `<h2>Circuit 2 — the waits</h2>
<div class="diagram"><p class="context-note">What's pending someone's answer, with its clock.</p>
<p class="no-data">No data: the ledger has no waits.</p></div>`;
  }
  const row = (w) => `    <div class="row">
      <div class="box ${w.color}">
        <span class="title">${clean(w.status)}</span>
        <span class="foot">${clean(w.what)}</span>
      </div>
      <div class="box ${w.color} clock">
        <span class="title">${clean(w.clock)}</span>
        <span class="foot">${w.deadline ? 'due ' + clean(formatDateTime(w.deadline)) : 'no deadline set'}${w.noClose ? '<br>nobody flagged it as closed' : ''}</span>
      </div>
    </div>`;
  const open = e.open.length
    ? e.open.map(row).join('\n')
    : '    <p class="no-data">No open waits: everything requested has answered.</p>';
  const closed = e.closed
    ? `<details><summary>${e.closed} already closed (${e.closedToday} today)</summary>
  <p class="stamp">They already answered. There's nothing to look at in them: they're counted just to show how much has closed, not to read one by one.</p>
</details>`
    : '';
  return `<h2>Circuit 2 — the waits</h2>
<div class="diagram">
  <p class="context-note">Only what's still waiting. In red, what's EXPIRED: that's not going to arrive on its own anymore, someone has to go get it.</p>
  <div class="rows">
${open}
  </div>
</div>
${closed}`;
}

/** The gates, with the name a person understands. The technical name goes
 *  below, small, because that's what shows up in the log. */
const GATE_LABEL = {
  orchestrator_builds: 'the orchestrator tried to build',
  receipt_missing: 'something was claimed with no receipt backing it',
  zero_unchecked: 'a search came back with zero results',
  delivery_published: 'something was delivered with the tree unsaved',
  wait_expired: 'a wait ran past its deadline',
  third_round: 'third round on the same piece',
  overlap_stale: 'two lanes on the same file',
  task_identity: 'one task got confused with another',
  person_identity: 'who is who got confused',
  pr_state: 'the state of a PR',
  terminal_load: 'a terminal was filling up its memory',
  own_load: 'this terminal was filling up its own memory',
  lane_handoff: 'a lane changed hands',
  spec_stale: 'a spec went stale',
  startup: 'something about startup needs a person',
};

function renderGates(p) {
  if (!p.length) {
    return `<h2>Circuit 3 — today's gates</h2>
<div class="diagram"><p class="context-note">Each gate watches one thing and warns when it sees it.</p>
<p class="no-data">No data: the ledger keeps no per-gate count.</p></div>`;
  }
  const rows = p.map((g) => `    <div class="row">
      <div class="box gate ${g.blocks ? 'red' : 'gray'}">
        <span class="title">${clean(GATE_LABEL[g.gate] || g.gate)}</span>
        <span class="foot">${g.blocks ? 'this gate BLOCKS' : 'this gate only warns'} · called <code>${clean(g.gate)}</code></span>
      </div>
      <div class="box ${g.blocks ? 'red' : ''}">
        <span class="title">${pluralize(g.times, 'time', 'times')}</span>
        <span class="foot">last movement: ${g.last ? clean(formatDateTime(g.last)) : 'no data'}</span>
      </div>
    </div>`).join('\n');
  return `<h2>Circuit 3 — today's gates</h2>
<div class="diagram">
  <p class="context-note">Each gate watches one specific thing and warns when it sees it.
  How many times each one has tripped, and when it last did.</p>
  <div class="rows">
${rows}
  </div>
</div>`;
}

function renderReviews(r) {
  if (!r.total) {
    return `<h2>What's in review</h2>
<div class="diagram"><p class="context-note">Pieces that have had at least one review pass.</p>
<p class="no-data">No data: nothing in review.</p></div>`;
  }
  const row = (f) => `    <div class="row">
      <div class="box ${f.third ? 'red' : ''}">
        <span class="title">${clean(f.what)}</span>
        <span class="foot">${f.decision ? 'decided: ' + clean(f.decision) : 'not decided yet'}</span>
      </div>
      <div class="box ${f.third ? 'red' : ''}">
        <span class="title">${pluralize(f.rounds, 'round', 'rounds')}${f.third ? ' — stop and decide' : ''}</span>
        <span class="foot">last movement: ${f.last ? clean(formatDateTime(f.last)) : 'no data'}</span>
      </div>
    </div>`;
  const rest = r.rest
    ? `<details><summary>${r.rest} more in review</summary>
  <p class="stamp">The ${MAX_REVIEWS} with the most passes are shown. The rest is here just so it's known they exist.</p>
</details>`
    : '';
  return `<h2>What's in review</h2>
<div class="diagram">
  <p class="context-note">Pieces that have had at least one pass. On the third pass over the same one, the rule is stop and decide.</p>
  <div class="rows">
${r.highlighted.map(row).join('\n')}
  </div>
</div>
${rest}`;
}

function renderAlerts(a) {
  let body;
  if (a.list.length) {
    body = `<ol class="list">
${a.list.map((v) => `    <li><b>${clean(GATE_LABEL[v.gate] || v.gate)}</b> · ${v.at ? clean(formatDateTime(v.at)) : 'no time'}<br>${clean(v.text)}</li>`).join('\n')}
  </ol>`;
  } else if (!a.hasField) {
    body = `<p class="no-data">No data: this ledger stores its alerts without the "this is for the owner to decide" marker,
  so none can show up here. The ${a.inWindow} alerts from the last 24 hours can be seen below, in the log.</p>`;
  } else {
    body = `<p class="no-data">None in the last 24 hours. (${a.inWindow} alerts total in that window, none to decide.)</p>`;
  }
  return `<h2>Alerts for the owner</h2>
<div class="diagram">
  <p class="context-note">From the last 24 hours, only what a person has to decide or type.
  The orchestrator handles everything else on its own.</p>
  ${body}
</div>`;
}

function renderLog(b) {
  if (b.lines !== null && b.lines.length === 0) {
    return `<details><summary>Log — the last ${LOG_LINES} lines</summary>
  <p class="no-data">No data: the log exists, but not even one whole line can be pulled from its tail.</p>
</details>`;
  }
  if (b.lines === null) {
    return `<details><summary>Log — the last ${LOG_LINES} lines</summary>
  <p class="no-data">No data: there is no log next to the ledger.</p>
  <p class="stamp path">${clean(b.path)}</p>
</details>`;
  }
  const rows = b.lines.map((l) => `    <li class="bit"><span class="when">${l.at ? clean(formatDateTime(l.at)) : '—'}</span><span class="gate-tag">${clean(l.gate || '')}</span><span>${clean(truncate(l.text, 300))}</span></li>`).join('\n');
  return `<details><summary>Log — the last ${LOG_LINES} lines (oldest to newest)</summary>
  <ul class="log">
${rows}
  </ul>
</details>`;
}

/** Paths do NOT go inside the boxes: a long path inside a box makes it
 *  unreadable. They go here, at the end, folded, for whoever needs them. */
function renderPaths(paths) {
  if (!paths.length) return '';
  return `<details><summary>Where everything lives (paths)</summary>
  <div class="table-wrap">
  <table>
    <thead><tr><th>Lane</th><th>What it is</th><th>Brief</th><th>Receipt</th></tr></thead>
    <tbody>
${paths.map((r) => `      <tr><td>${clean(r.lane)}</td><td>${r.what ? clean(r.what) : '<span class="no-data">no data</span>'}</td><td class="path">${r.brief ? clean(r.brief) : '<span class="no-data">no data</span>'}</td><td>${r.receipt_at ? clean(formatDateTime(r.receipt_at)) : '<span class="no-data">no receipt</span>'}</td></tr>`).join('\n')}
    </tbody>
  </table>
  </div>
</details>`;
}

function renderPage(m, watching) {
  const footer = watching
    ? `<footer>Snapshot taken at ${esc(shortTime(new Date(m.now)))}. This page is regenerating itself every minute because it was launched with <code>--watch</code>.</footer>`
    : `<footer>Snapshot taken at ${esc(shortTime(new Date(m.now)))}. For another one, type <code>/dashboard</code>.</footer>`;
  const body = [
    renderHeader(m.header),
    renderLanes(m.alive, m.done, m.helpers, m.header, m.now),
    renderWaits(m.waits),
    renderGates(m.gates),
    renderReviews(m.reviews),
    renderAlerts(m.alerts),
    renderLog(m.log),
    renderPaths(m.paths),
    footer,
  ].filter(Boolean).join('\n\n');
  const prog = m.header.program ? ' — ' + m.header.program : '';
  return wrapPage('Orchestration dashboard' + prog, body, watching);
}

/** The page written when there is NO ledger. It exists so nobody's left
 *  staring at a blank tab: it says what's missing and what to do. */
function renderNoLedger(ledgerPath, reason, now) {
  const body = `<h1>Live orchestration dashboard</h1>
<p class="intro">There's nothing to show yet: <strong>the ledger could not be read</strong>.</p>

<div class="box red center">
  <span class="title">The ledger ${esc(reason)}</span>
  <span class="foot path">${clean(ledgerPath)}</span>
</div>

<div class="arrow-down"><span class="stem"></span><span class="point"></span><span class="label">what it means</span></div>

<div class="diagram">
  <p class="context-note">This is NOT a dashboard error: the dashboard only looks. It means one of three things.</p>
  <ol class="list">
    <li>There is no orchestration running in this folder yet.</li>
    <li>The folder it was launched from is not the repository being orchestrated.</li>
    <li>The ledger is mid-write at this very second: the page reloads itself within a minute and will probably show by then.</li>
  </ol>
</div>

<footer>Generated by scripts/dashboard.js on ${esc(longDate(new Date(now)))}. It reloads itself every minute.</footer>`;
  return wrapPage('Live dashboard — no ledger', body);
}

/* ------------------------------------------------------------ WRITE / OPEN */

/** Writes a piece's page: first to a temp file in the SAME folder, then a
 *  rename, which is atomic on the same volume. Without this, with `--watch`
 *  it's enough for the process to get killed mid-write (or for the browser
 *  to reload right then) to see a truncated HTML.
 *  (Codex gpt-5.6-sol, round 2, point (c).) */
function writePage(out, html) {
  const abs = path.resolve(out);
  const dir = path.dirname(abs);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.dashboard-${process.pid}-${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmp, html, 'utf8');
    fs.renameSync(tmp, abs);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) { /* if it's not there, fine */ }
    throw e;
  }
}

/** Opens the page with the default browser. On macOS it's `/usr/bin/open` (NOT TESTED ON
 *  macOS), on Linux
 *  `xdg-open`, and on Windows `cmd /c start` — the first empty argument of
 *  `start` is the window TITLE: without it, a quoted path is taken for the
 *  title and nothing opens. No `shell:true`: the path is quoted by hand. */
function openInBrowser(file) {
  const absolute = path.resolve(file);
  const byHand = process.env.ORCH_DASHBOARD_OPEN_CMD;   // hatch: the suite puts its toy browser here
  // `spawnSync` on purpose, not `spawn`: right after this the program exits,
  // and a child launched in the background is left half-started. Neither
  // `start` nor `open` wait for the browser to close, so this doesn't block
  // anyone.
  let r;
  if (byHand) {
    // Split RESPECTING QUOTES: `"/Applications/My Browser.app/x" --a` is one
    // single program with one argument, not `"/Applications/My` with three.
    // (Codex gpt-5.6-sol, round 2, point (b).)
    const parts = (byHand.trim().match(/"[^"]*"|\S+/g) || []).map((t) => t.replace(/^"|"$/g, ''));
    if (!parts.length) { process.stdout.write(`DASHBOARD: I couldn't open it myself. Open it yourself: ${absolute}\n`); return false; }
    r = spawnSync(parts[0], parts.slice(1).concat([absolute]), { stdio: 'ignore' });
  } else if (process.platform === 'win32') {
    // The first empty argument of `start` is the window TITLE: without it,
    // a quoted path is taken for the title and nothing opens.
    r = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'start', '""', `"${absolute}"`], {
      shell: false, windowsVerbatimArguments: true, stdio: 'ignore',
    });
  } else {
    // macOS: the ABSOLUTE `/usr/bin/open`, never a bare `open` that would be
    // looked up through PATH. Everything else falls back to `xdg-open`.
    // NOT TESTED ON macOS: the suite only checks, with a fake platform and a
    // fake `spawnSync`, that the command built is this one.
    r = spawnSync(process.platform === 'darwin' ? '/usr/bin/open' : 'xdg-open', [absolute], {
      shell: false, stdio: 'ignore',
    });
  }
  if (r && (r.error || r.status !== 0)) {
    process.stdout.write(`DASHBOARD: I couldn't open it myself. Open it yourself: ${absolute}\n`);
    return false;
  }
  return true;
}

/* -------------------------------------------------------------- ONE PASS */

function onePass(op) {
  // ORCH_DASHBOARD_NOW: the "snapshot time", so the suite can plant itself at
  // 00:03 or at 23:55 and check what the dashboard draws at those edges
  // without waiting for them. In normal use it doesn't exist.
  const fixed = Number(process.env.ORCH_DASHBOARD_NOW);
  const now = Number.isFinite(fixed) && fixed > 0 ? fixed : Date.now();
  const r = readLedger(op.ledger);
  if (!r.ok) {
    writePage(op.out, renderNoLedger(op.ledger, r.reason, now));
    return { ok: false, reason: r.reason, lanes: 0, waits: 0, now };
  }
  const m = buildModel(r.data, readLog(op.ledger, LOG_LINES), now);
  writePage(op.out, renderPage(m, !!op.watching));
  return { ok: true, lanes: m.alive.length, waits: m.waits.open.length, now };
}

function statusLine(op, r) {
  // This line's format does NOT change: the brief fixed it and the suite
  // checks it. What changed in round 2 is WHAT gets counted: ALIVE lanes,
  // not everyone who ever passed through the ledger over two days.
  return `DASHBOARD: ${path.resolve(op.out)} · ${r.lanes} lanes · ${r.waits} open waits · ${shortTime(new Date(r.now))}`;
}

const HELP = `usage: node scripts/dashboard.js [--ledger <path.json>] [--out <path.html>] [--watch] [--open]

Normally you do NOT type this: the owner types /dashboard in the orchestrator
terminal and that command already calls it with --open.

  --ledger  the ledger to read (by default, this folder's: .git/orchestrator-state.json)
  --out     where to write the page (by default, the repo's .orchestrator/dashboard.html)
  --open    opens the page in the default browser
  --watch   ADVANCED: keeps regenerating every 60 s and the page reloads itself.
            Occupies the console and dies when it's closed. Without --watch the page is a
            SNAPSHOT: it doesn't reload (for another one, /dashboard again).

Never writes to the ledger. Exits 0 if it drew the page, 2 if there was no ledger to read.
`;

function main(argv) {
  const a = parseArgs(argv);
  if (a.error) { process.stdout.write(`${a.error}\n\n${HELP}`); return 1; }
  if (a.help) { process.stdout.write(HELP); return 0; }

  const defaults = defaultPaths(process.cwd());
  const ledger = a.ledger || defaults.ledger;
  const out = a.out || defaults.out;

  if (!ledger || !out) {
    process.stdout.write('There is no git repository here, so there is no orchestration to look at.\n' +
      'Launch it inside the repo being orchestrated, or point it there: --ledger <path.json> --out <path.html>\n');
    return 2;
  }

  const op = { ledger, out, watching: a.watch };
  const first = onePass(op);
  process.stdout.write(statusLine(op, first) + '\n');
  if (a.open) openInBrowser(out);
  if (!first.ok) return 2;

  if (a.watch) {
    const every = Number(process.env.ORCH_DASHBOARD_MS) > 0 ? Number(process.env.ORCH_DASHBOARD_MS) : INTERVAL_MS;
    setInterval(() => {
      try {
        const r = onePass(op);
        process.stdout.write(statusLine(op, r) + '\n');
      } catch (e) {
        process.stdout.write(`DASHBOARD: couldn't regenerate (${e && e.message ? e.message : 'error'})\n`);
      }
    }, every);
    return null;   // null = don't exit: we're staying to watch
  }
  return 0;
}

if (require.main === module) {
  const code = main(process.argv.slice(2));
  if (code !== null) process.exit(code);
}

module.exports = { buildModel, renderPage, renderNoLedger, laneList, waitList, gateList,
  reviewList, alertList, inWords, LOG_LINES, openInBrowser };
