// A TOY CODEX, in JavaScript. The suite launches it by setting
// `ORCH_CODEX_CMD="node <path to this file>"`, so there is nothing to compile and
// no dependency on a native executable of the machine running the tests.
//
// It imitates what the real Codex does, and ONLY that:
//   · it prints its session header (`model: <model>`) on STDERR — measured with
//     Codex v0.154.0: its stdout comes out empty and the header goes to stderr;
//   · it reads the prompt from stdin when the last argument is `-`;
//   · it writes its final answer into the `--output-last-message` file.
//
// What it does ON TOP, driven by the environment, so the paths that matter can be
// tested:
//   STUB_VERDICT          what it writes as the final answer (clean by default).
//                         It accepts SEVERAL LINES: that way it can return an answer
//                         with `FINDING:` blocks like the one the new prompt asks for
//                         (PROMPT_VERSION 2), and not just a loose line.
//   STUB_ANSWER_FROM      path of a file whose content is written AS IS as the final
//                         answer. It takes precedence over STUB_VERDICT. It is the way
//                         to return a genuinely long review (e.g.
//                         `tests/fixtures/review-302fb02-sol.txt`) without stuffing it
//                         whole into an environment variable.
//   STUB_DO_NOT_WRITE=1   it writes nothing (empty output: it does NOT approve)
//   STUB_TOUCH_FILE       it modifies that file while "reviewing" (the diff changes)
//   STUB_PROMPT_TO        it saves there the prompt that really reached it
//   STUB_MODEL_STDOUT=1   it prints the header on stdout instead of stderr
//   STUB_EXIT             exit code (0 by default)
'use strict';

const fs = require('fs');

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return (i >= 0 && i + 1 < args.length) ? args[i + 1] : null;
};

// `STUB_FAKE_MODEL` makes it say that ANOTHER model ran, to test that a round with
// the wrong model does not approve.
const header = 'model: ' + (process.env.STUB_FAKE_MODEL || valueOf('-m') || 'gpt-6-astra');
if (process.env.STUB_MODEL_STDOUT === '1') process.stdout.write(header + '\n');
else process.stderr.write(header + '\n');

const touch = process.env.STUB_TOUCH_FILE || '';
if (touch) {
  let previous = '';
  try { previous = fs.readFileSync(touch, 'utf8'); } catch (_) { previous = ''; }
  try { fs.writeFileSync(touch, previous + '\nmutated-by-stub-codex\n', 'utf8'); } catch (_) { /* never mind */ }
}

// `STUB_CHANGE_PROGRAM=<path to the orchestrator-state.json>`: while it is
// "reviewing", the day's program changes (as if somebody had run `close` + `start`
// in another terminal). It is done by writing the `program_id` directly, not by
// calling the CLI: that way the test measures the RULE — a round from the previous
// day does not enter the new one's history — and not the order of the locks.
const changeProgram = process.env.STUB_CHANGE_PROGRAM || '';
if (changeProgram) {
  try {
    const L = JSON.parse(fs.readFileSync(changeProgram, 'utf8'));
    L.program_id = 'orch-another-program';
    fs.writeFileSync(changeProgram, JSON.stringify(L), 'utf8');
  } catch (_) { /* if it cannot be done, the test will see it when it checks */ }
}

const finish = () => {
  if (process.env.STUB_DO_NOT_WRITE !== '1') {
    const out = valueOf('--output-last-message');
    let verdict = process.env.STUB_VERDICT || 'VERDICT: NO OPEN FINDINGS';
    const from = process.env.STUB_ANSWER_FROM || '';
    if (from) {
      // If the file cannot be read, the stub does NOT invent a clean answer: it
      // writes the reason, and the round comes out "unknown", which is the honest
      // outcome. An invented answer here would turn a test green for the wrong reason.
      try { verdict = fs.readFileSync(from, 'utf8'); }
      catch (e) { verdict = 'STUB: could not read ' + from + ' (' + (e && e.code) + ')'; }
    }
    if (out) { try { fs.writeFileSync(out, verdict, 'utf8'); } catch (_) { /* never mind */ } }
  }
  const exit = Number(process.env.STUB_EXIT || 0);
  process.exit(Number.isFinite(exit) ? exit : 0);
};

const savePrompt = process.env.STUB_PROMPT_TO || '';
const last = args.length ? args[args.length - 1] : '';
if (last === '-') {
  // The prompt comes in on stdin. It is read WHOLE before finishing: if the stub
  // exited without draining it, whoever is writing on the other side would see a
  // broken pipe.
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (t) => { input += t; });
  process.stdin.on('end', () => {
    if (savePrompt) { try { fs.writeFileSync(savePrompt, input, 'utf8'); } catch (_) { /* never mind */ } }
    finish();
  });
  process.stdin.on('error', () => finish());
  process.stdin.resume();
} else {
  if (savePrompt) { try { fs.writeFileSync(savePrompt, last, 'utf8'); } catch (_) { /* never mind */ } }
  finish();
}
