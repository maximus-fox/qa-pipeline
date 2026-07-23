---
name: qa-testing
description: Adversarial multi-agent QA for any product surface — web apps, messenger Mini Apps (Telegram/MAX), native desktop (macOS), and mobile (iOS & Android). A "mean tester" pipeline: an adaptive setup wizard, then recon → plan → parallel role attack (visual, logic, data-integrity, edge-cases + white-box code audit) → adversarial completeness gate → report + generated regression tests. Real screenshots, real clicks, real DB checks — never "looks fine". Use whenever the user wants to QA / test an app, find bugs, do a UI or UX audit, check a Mini App, verify data actually persists, or run a thorough pre-release pass. Triggers: qa, testing, test my app, find bugs, audit UI, check the mini app, does the data save, pre-release check.
---

# Mean-tester QA pipeline

Six phases, numbered 0–5. Specialized roles attack the product in parallel with different incentives; an adversarial gate refuses to finish while coverage is thin. The point is to fail the way real QA fails a product — not the way one polite agent clicks the happy path and calls it a pass.

```
0. PROBE + BRIEF  →  1. RECON     →  2. PLAN     →  3. RUN (parallel)          →  4. GATE        →  5. SYNTH
   detect envs,        recon           planner       visual / logic /              completeness      synth
   setup menu                                        data-paranoid / attacker      (loop-until-dry)  (report +
                                                     + architect (white-box)                          regression +
                                                                                                      menu)
```

## Language — the user's, everywhere

The person who launched the run may be a developer or a shop owner, in any country. **The wizard, every progress update, and `report.md` are written in the language the user speaks** (the language of their request). Role files are English instructions; the orchestrator passes the user's language in every brief, and roles write their findings in it. Only code stays code: selectors, test files, and commit-able artifacts follow the project's own conventions.

The same person may not be technical. **Every wizard question must be understandable by a non-technical person**: plain-language labels, and a description that explains the term ("DB access" → "a way for me to read your database — a connection string, or skip if you don't know"). Jargon without a plain explanation next to it is a bug in the wizard.

## Phase 0 — Probe & the setup wizard

**Probe first** (see `references/environments.md` → Probing): detect which drivers are actually connected. External MCPs (Appium for mobile, a Windows-automation MCP) are usually NOT installed — when a target needs one, offer the one-line install and degrade; never assume.

Then run an **adaptive wizard** — a chain of `AskUserQuestion` calls where each step appears only when the previous answers make it relevant. This is the design tension made explicit: *maximum guidance without friction*. Presets collapse the chain — "Smoke on a web URL" asks 2 questions; "Custom, multi-platform" walks all of it. Never dump every question on someone who just said "test my localhost:3000".

**Resume check first**: if `~/.claude/qa-runs/` holds a recent run for this target whose report has a non-empty **Checkpoint** section (deferred rows), the FIRST wizard option is "Resume the previous run" — on resume, pass the checkpoint rows as the focus scope so the planner makes them the active matrix and prior coverage isn't re-walked.

**The chain** (skip any step whose answer is already known from the user's prompt):

1. **What are we testing?** — Web app · Mini App · Desktop app · Mobile app · API/backend. This one answer drives which environment/driver applies and which later steps even appear.
2. **Where is it — and what changed?** — URL(s) / bot handle / app name+path. Plus an *optional* focus: "test everything" vs "focus on what changed" (a git diff, changed screens, a feature area). When they pick focus, thread that scope to recon + planner so the matrix prioritizes changed surfaces first (2026 practice — don't blind-test a huge app when only checkout changed). Off by default.
3. **Live users or test bench?** — Is this production with real customers, or a staging/dev environment? **Production default = reading roles only** (visual, logic-as-observer, code audit): the writing roles (attacker's garbage inputs, data-paranoid's TEST records) pollute a live site in ways no red-zone preset covers. Writing on production requires the user to explicitly say yes to a separate, clearly-worded question — and cleanup must be possible.
4. **How deep?** — **Smoke** (1 gate round; reading roles + data-paranoid as the single writing pass; key screens) · **Deep** (default; up to 3 rounds, all roles, full matrix) · **Custom** (pick roles yourself; deep's round cap applies).
5. *(Custom only)* **Which roles?** — visual · logic · data-integrity · attacker · code-audit (multi-select). These wizard names map to engine slugs (`visual-critic`, `logic`, `data-paranoid`, `attacker`, `architect`) — the workflow accepts both.
6. **What can I test with?** — multi-select what they actually have: code repo path · test accounts/sessions · DB read access. Each one absent = that axis degrades loudly, not silently.
7. **What's off-limits?** — payments · deletes · notifications · custom (multi-select; irreversible actions pre-checked as safe defaults).
8. *(environment-specific, only if chosen)* — Mobile: which device/simulator, and is Appium MCP set up (offer install if not)? · Windows: is a Windows-automation MCP running on the box (offer setup if not)? · Desktop: which app?

Finish with a **one-screen confirm**: target, environments, mode, roles, access, red zones, focus scope — so the user green-lights before anything runs.

**A skipped or empty answer is NOT consent.** Skip on red zones → ALL standard red zones stay ON. Skip on access → "none provided", the axis degrades loudly. Skip on the production question → treat as production (the safe reading-only default). Nothing destructive is ever enabled by silence.

If the environment can't ask (headless, scheduled, sub-agent run) — don't stall: pick **Deep** on the probed environments with everything the brief already supplies, and record every assumption as the first lines of the report. The same non-consent rule applies — never run destructive rows on assumption.

> **Degradation rule:** whatever the brief lacks, the matching axis degrades LOUDLY — recorded in `report.md` under "NOT-covered axes". Never a silent 0%. Fast-fail if a URL target answers nothing.

## Phase 0.5 — Run folder & dispatch model

The orchestrator creates the run folder BEFORE handing off:

```
~/.claude/qa-runs/<project>-<YYYYMMDD-HHMMSS>/
```

(The orchestrator stamps the timestamp — workflow scripts can't call `Date.now()`.)

**How roles are dispatched — the portable part.** Role definitions live in this skill at `references/roles/<role>.md`. The orchestrator runs each role as a general-purpose sub-agent, passing:
1. the contents of `references/roles/<role>.md` as the role's instructions,
2. the absolute skill directory (so the role can read its driver + safety files),
3. the run folder, the brief slice it needs, and its assigned rows.

This keeps the skill **self-contained**: it works for anyone who installs it, with no separate agent registration. (If a host happens to have matching registered sub-agents, the orchestrator may use those as an optimization — but the files are the source of truth.)

| File | Author | Contents |
|------|--------|----------|
| `qa-map.md` | recon | Full product map: screens, controls, journeys, viewports, design system |
| `qa-plan.md` | planner | Coverage matrix, role/persona/environment assignment, credentials & red-zone blocks |
| `report-<role>[-r<N>].md` | the role itself (workflow mode) or the orchestrator (normal mode) | Raw Phase-3 output per role/round — gate and synth read these from disk, never from pasted prompt text |
| `report.md` | synth | Final report |
| `<NN>-<screen>-<viewport>.jpg` | browser/desktop/mobile roles | Screenshots via the assigned driver |

Regression tests go to `e2e/` in the project repo (synth only).

## Execution engine

**Workflow mode** (when ultracode is on, or the user asks for "workflow"/"orchestration"): the orchestrator calls `qa-pipeline.workflow.js` for deterministic Phase-3 parallelism, real loop-until-dry, and agent-count scaling by budget. The orchestrator MUST pass `browserConcurrency` (from the host check below) and `language` (the user's). One-seat serialization needs no pre-knowledge: the planner returns `serialRoles` in its structured result (it's the one who assigns environments per row) and the engine merges it before Phase 3; `args.serialRoles` exists only as an extra override. Omitting `browserConcurrency` on a weak host recreates the OOM this guard exists to prevent.

**Normal mode** (default): the orchestrator drives roles via the Agent tool — Phases 1–2 sequential, Phase 3 in small parallel batches (as budget allows), Phase 4 looped by hand.

Phase logic is identical in both; only the parallelism engine differs.

**Progress updates**: a deep run takes hours. At every phase boundary and every gate round, the orchestrator posts a one-line status in the user's language — what just finished, what runs next ("recon done: 14 screens mapped → planning", "gate round 2/3: chasing 4 gaps in visual+data"). Silence between the confirm screen and the final menu is a defect of the run, not politeness.

### Host-resource guard — serialize browser roles on constrained hardware

Every browser-driven role launches its own Chrome/WebView. Running three or more of them **in parallel against a live dev server** can exhaust RAM and OOM-kill the server under test — a self-inflicted outage that blocks the very rows you were testing (learned the hard way on an 8 GB machine: three concurrent browser roles killed the target's Vite server; the backend survived, so it was clearly memory, not the app). Before Phase 3, size the fan-out to the host:

- **Check available memory** (macOS `memory_pressure`/`vm_stat`, Linux `free`, Windows PowerShell `Get-CimInstance Win32_OperatingSystem | % FreePhysicalMemory`) and whether the target is a **local dev server sharing this machine's RAM** (localhost) vs. a remote host.
- On a **constrained host (≈≤8 GB) testing a local server**: run browser roles **serially, or cap at 2 at once**. The white-box `architect` role uses no browser — always safe to run alongside. So a good low-RAM shape is: architect in parallel with **one** browser role at a time.
- On a roomy host or a remote target: the normal small-parallel-batch is fine.
- If the target server dies mid-run, **diagnose out-of-band** (curl the backend, check the process, check any lock/USB state) to distinguish a crash from a red-zone action (e.g. a shutdown button) — then checkpoint the blocked rows rather than silently reporting them uncovered.

This is a throughput-vs-safety trade the orchestrator makes explicitly; when unsure, prefer serial browser roles — a slower run beats an OOM that voids half the matrix.

## Phases (detail in `references/roles/<role>.md` — read the role file before dispatching it)

1. **Recon** — `roles/recon.md`. Reads code (what should exist) + walks the live app via the assigned driver (what does exist), reconciles → `qa-map.md`.
2. **Plan** — `roles/planner.md`. Map → coverage matrix; assigns role + persona + **environment** per row; credentials and red zones as machine-readable blocks in `qa-plan.md`.
3. **Run** (parallel) — the four browser/app roles each under their persona and row-assigned driver, plus the white-box audit:
   - `roles/visual-critic.md` — geometry scan from the DOM first (`tools/visual-scan.js`: overlaps, overflow px, clipped text, touch targets, unsafe bands) + axe-core, then real screenshots per viewport judged against the project's design system (or the universal bar when there is none), ≥3 improvements per screen in the project's tokens.
   - `roles/logic.md` — end-to-end journeys, state conflicts, interruptions, multi-actor.
   - `roles/data-paranoid.md` — DB verified after every action; privilege isolation.
   - `roles/attacker.md` — edge cases and input abuse.
   - `roles/architect.md` — white-box code health (no browser).
   Each role's full output lands in `report-<role>-r<N>.md` in the run folder — in workflow mode the role writes it itself; in normal mode the orchestrator persists the role's final message. Roles never touch the project's code or prod data; the writing roles (data-paranoid, attacker) mutate app data only through the app itself under a test persona — see `references/safety.md`.
4. **Gate** — `roles/completeness-gate.md`. Loop-until-dry: hunts gaps and "OK without a real click", dispatches follow-up work to ONLY the roles that have it (a follow-up round re-runs those roles, never the whole fleet), and declares `complete` only when every earlier follow-up came back with evidence AND a fresh sweep finds nothing new — that double condition is "dry". Cap: smoke 1 round / deep 3. Follow-up output lands in `report-<role>-r<N>.md`.
5. **Synth** — `roles/synth.md`. Merges into `report.md`, generates regression tests in the project's own test harness, emits a **grouped** recommendations-candidate list. The orchestrator (not synth) raises `AskUserQuestion` for the menu — see "The recommendations menu" below.

## The recommendations menu — and what happens after

A run yields 20–120 findings; `AskUserQuestion` fits 4 questions × 4 options. The menu therefore offers **groups, not items** — the itemized list lives in `report.md`, the menu references it:

- Up to 4 questions by track: **Bugs** · **Visual/UX improvements** · **Refactors** · **Housekeeping**. All multiSelect.
- Each option is a group with count + severity in the label ("Fix all 3 critical bugs", "Top-5 visual fixes on checkout (report §Visual 1–5)"), sized to a coherent chunk of work — not "fix bug #47".
- Housekeeping always includes **"Delete the TEST data created"** and doing nothing is always legitimate — the report alone is a complete deliverable.

**After the user picks**, a new phase begins — the read-only rule of Phases 1–4 no longer applies, because the user just authorized changes:
- The orchestrator applies the chosen groups itself (or via sub-agents), one reviewable change at a time, referencing each finding's evidence from the report; after each fix it re-runs the matching regression test (or re-checks the finding's `verify` command).
- Items that fit an installed specialist skill (a frontend/design skill for visual work, a review flow for refactors) may be routed there — never to a skill that isn't actually installed.
- TEST-data cleanup: executed through the app or the DB per the cleanup list, then verified gone.

## Fast-fail

Stop immediately with a clear message (never a silent "0% coverage") when:

1. **URL targets exist and ALL are unreachable** — HEAD/GET each before recon; none answers → stop with diagnostics. Targets without a URL (desktop app, mobile app, bot handle) are probed by their drivers later — their absence from this check is normal, not a failure.
2. **Personas exist and ALL fail to log in** — none can enter → stop, listing each persona and reason (checked during recon's live walk, not pre-flight). **Zero personas is NOT a failure** — it's a guest run: public surfaces only, every auth-gated row planned as `blocked (no persona)`.

Partial availability (some personas / some targets / some environments down) does NOT stop the run — it's recorded as degradation in `qa-plan.md` before Phase 3.

## Safety

Full rules in `references/safety.md`. In short: test personas only, "TEST" prefix, log everything created; no irreversible actions or red-zone touches; Phases 1–4 read-only toward the product; only synth writes to the repo (`e2e/`) and deletes TEST data on menu choice; real-profile drivers (real-chrome / desktop / mobile) run on the user's real machine — extra care, credentials handled by the user alone.

## Files

- `references/environments.md` — environment decision table, probing, Mini App fidelity levels
- `references/mini-apps.md` — Mini App test protocol: the two insets, state × platform matrix, layered environments (browser emulation / web client / native clients), MAX & VK specifics. Read for ANY Mini App target.
- `references/drivers/*.md` — one per environment (browser-devtools, real-chrome, desktop-native, mobile, windows)
- `references/roles/*.md` — the nine role definitions (source of truth for dispatch)
- `references/safety.md`, `references/severity.md`
- `tools/visual-scan.js` — DOM geometry defect scan (inject via any driver's evaluate)
- `qa-pipeline.workflow.js` — deterministic engine for workflow mode
- `fixtures/mini-app/` — sample Mini App with a mocked Telegram.WebApp and seeded visual defects, to smoke-test the pipeline itself
