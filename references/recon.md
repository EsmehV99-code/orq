# Reference — STEP 1: RECON of the environment

> **When to open this reference:** **before dispatching anything**, once per program. If you already
> went through it and have the answers written down, do not come back — what comes out of here already
> lives inside every brief.
>
> *Text moved verbatim from `SKILL.md` on 2026-09-15, when the skill was split into two floors. Nothing
> was rewritten or summarized: the owner's rules keep their dates and their quotes.*

---

# STEP 1 — RECON (before dispatching ANYTHING)

**This is not optional and it comes first.** Its goal is that **no terminal has to discover on its
own** how things get verified, which skill applies to it, or which gate is going to block it. You
figure it out **once** and feed it, already pre-chewed, into every brief.

Go through these seven points and **write the answers down** — you are going to copy them into the
briefs:

### 1.1 Available skills and tools
- List the installed skills (global and project). For each: **which type of lane needs it**. E.g. one
  for verification against real resources → every backend lane; one for cross-review → every lane
  before proposing anything.
- Tools outside the skills: reviewers from another provider, linters, type checkers, automated
  browser, MCP servers.
- **Also write down what is missing.** If a lane is going to need something that is not there, **ask
  the human** — an agent installs nothing on its own.

### 1.2 How THIS project really verifies
- The exact test, lint, and type-check command, **per package**.
- Is there a verification recipe against real resources (a disposable database, a running
  environment)? **That is real verification; a mock or a typecheck is not.**
- **Known traps in the environment**: processes that die silently, resources that cannot be shared,
  commands that fail quietly on this operating system.

#### 1.2-bis · And **HOW MUCH** verification costs. Without this number you cannot calibrate anything.

Measure and write down, because it is going to decide the pace of the whole program:

- **How long the whole suite takes**, and **how many tests there are**.
- And **WHAT WAS ALREADY RED**: that run you just did **is** your baseline, and saving it costs nothing
  more. `node scripts/orchestrator-control.js baseline --save --suite <name> --since <the output file you
  ALREADY generated> --target <the copy of the script that was tested>` records it with its `sha` and its
  tree; it **runs nothing**, it only parses what you already ran. Without it, the first lane that sees
  that red spends half an hour believing its change caused it — it happened three times on 09-21. With
  it, the `repeated_red` gate tells it what is **persistent** and what is **new** (and a persistent one
  **is still red**: that it was there before forgives nothing).
- **How long automatic verification of one proposal takes**, and **how much queueing gets added on
  top** if the runner is self-hosted and serves one at a time.
- **How many rounds external review usually takes.**
- **How much it costs to stand up the isolated site** (folder, dependencies, database).
- 🔴 **DOES THE SHORT CYCLE EXIST? Does the test runner accept being asked for a subset?**
  **Open it and look — do not assume it.** Check whether it reads command-line arguments,
  environment variables, or filters the file list it discovers. And check whether it runs
  **serially or in parallel**.

> ### If the runner does NOT accept a filter, **the LIGHT TOLL DOES NOT EXIST** and you cannot promise it.
>
> This is a measured failure, not a hypothetical one: a calibration was once written that said
> *"only run the tests the change touches"* against a runner that **always discovered all 204 files,
> serially, accepting not a single argument**. The rule was unenforceable on the day it was written,
> and every lane had to improvise its own launcher by hand.
>
> **When that capability is missing, the first thing you dispatch is building it**, before the work
> that needs it. It is the highest-return fix you will find: it turns a half-hour cycle into a
> two-minute one, and it multiplies across every attempt of every lane for the rest of the program.
> **And it goes out at the FULL toll**: if you break the runner, nobody can verify anything.

> **Add it up.** That is the time floor **any** change pays, even a three-line one. If the total goes
> over an hour, **the process is calibrated flat and that is your problem, not the lanes'**: they feel
> slow because the toll is the same for a trivial fix as for a state machine. The way out is the
> **risk-based toll** from the STEP 3 template — and it is your job to decide which one each lane
> carries and **write it into its brief**, not make it guess.

### 1.3 The gates every lane is going to hit
- Hooks that block commit or push, and **exactly what has to be done to satisfy them**.
- Mandatory review gates.
- File-ownership checks between parallel proposals.

### 1.4 When automatic verification fires — and when it does NOT
**This costs hours if ignored.** Find out and write down:
- Which target branches does it fire on? A proposal pointing at a different branch may **get no check
  at all**, and that reads exactly like "green".
- Does it get skipped in draft state? A draft can show everything as "skipped", which **is not
  green**.
- Are there path filters? A change outside those paths triggers nothing.
- **Rule that comes out of this:** *skipped* is not green, *cancelled* is not green, and **zero checks
  is not either**. Only what actually ran counts.

### 1.5 Isolation resources
- Convention for parallel working folders.
- **Ports and resource names already taken** — so you can assign unique ones to each lane.
- How dependencies are prepared without reinstalling (links, caches) and **what danger undoing that
  carries**.

### 1.6 Rules and decisions that already exist
- Project and user instructions.
- Business decisions already made: **not re-litigated, and not invented.**
- Previous handovers: expired by default (see STEP 5).

### 1.7 Who integrates and in what order
- Who may merge. **Never a lane; the orchestrator, only with the owner's recorded permit (`/orq-merge-permit`).**
- How proposals are serialized and what puts them in conflict.

### 1.8 Where the specs live, and the code → spec map

**Specs follow the change** *(owner's rule, 2026-09-15)*: if a lane changes design, logic, behavior,
language, technical pieces, or concepts, the document describing it gets updated **in that same
lane** — the old is deleted, the new is written. An old spec sitting next to new code is the
cheapest way for tomorrow's session to build on a lie.

A hook does not see concepts: it sees files. That is why every orchestrated repo carries a
**`specs-map.json` at its working root** that says which code each spec describes:

```json
{ "rules": [
  { "code": ["services/api/src/approvals/**"], "spec": "docs/specs/approvals.md" },
  { "code": ["apps/agenda/src/**"],            "specs": ["docs/specs/agenda.md", "docs/adr/012-serif.md"] }
] }
```

- **If it does not exist, you create it in this step**, looking at where the project keeps its specs,
  ADRs, and design documents. With no map the gate has no opinion, and it says so: `validate` warns
  *"no specs-map.json"* and rejects nothing.
- Every brief carries the **`## Affected specs`** section (it is in the template) with the specs that
  lane has to update, or `- none`, or `- <spec> — no change: <reason>` when the owner approved a
  change that does not touch what the spec describes. **That is the trace of their authorization**: the
  hook does not read minds, it reads the brief.
- While the lane works, the hook warns once per required spec; on closing, **`validate` rejects the
  receipt** whose diff touches mapped code without bringing its spec. How it does it, in
  `references/control-phase-1-and-2.md` (gate `spec_stale`).

**The specs index: for SEARCHING, not for reading them all** *(rule Rd4f8a1, owner, 09-24)*. When you create
the map, run `node scripts/orchestrator-control.js specs --index --root <project>`: it writes
`specs-index.md` next to the map, one line per spec (path — title — what it is about — lines), taken
from the spec itself (one that wants another summary declares it with `<!-- summary: … -->` in its
first 20 lines). At the start of each batch, `specs --index --check --root <project>` (0 up to date · 1
stale, and it says which · 2 no specs: it says so and writes nothing). The rule of use, for the
orchestrator and the leads: **"what does the project say about X" = `grep -in` in `specs-index.md`, and
open ONLY the spec it points to; reading whole specs is the exception that gets declared.**

**Design has a name too, and it is not inferred.** Before writing the map, look at where this project
keeps its design. The usual places:

- `docs/design/`, `docs/wireframes/` — drawn screens and flows
- the token files (palette, typography, spacing): `tokens.json`, `theme.ts`, `tailwind.config.*`
- the **UI ADRs** (`docs/adr/0NN-*.md`) that fixed a visual decision
- whatever is exported from Figma and versioned in the repo

And the MANDATORY question when writing the map, one per folder: **"which current FILE describes this
folder of components or screens?"** If there is no answer, one is not invented: the missing spec gets
written, or that folder stays out of the map. **A person writes the relation**; it is not deduced from
the folder name.

Three warnings that cost dearly if forgotten:

- **A `spec` is an EXACT FILE, never a folder or a glob.** The hook compares by path equality:
  `docs/design` (folder) or `docs/design/*.md` (glob) match nothing, and since T12 the map is declared
  BROKEN with its reason instead of staying quiet.
- **`ui/` is usually CODE, not spec**, and **Storybook is an executable test, not a document**:
  neither counts as anybody's `spec`.
- **A historical ADR is not rewritten.** If the UI changes, the current spec is another file, or a new
  ADR is written that makes clear it replaces the previous one.
