---
name: qa-testing
description: Adversarial multi-agent QA for any product surface — web apps, messenger Mini Apps (Telegram/MAX), native desktop (macOS), and mobile (iOS & Android). A "mean tester" pipeline: an adaptive setup wizard, then recon → plan → parallel role attack (visual, logic, data-integrity, edge-cases + white-box code audit) → adversarial completeness gate → report + generated regression tests. Real screenshots, real clicks, real DB checks — never "looks fine". Use whenever the user wants to QA / test an app, find bugs, do a UI or UX audit, check a Mini App, verify data actually persists, or run a thorough pre-release pass. Triggers: qa, testing, test my app, find bugs, audit UI, check the mini app, does the data save, pre-release check.
---

# Mean-tester QA pipeline

Five phases. Specialized roles attack the product in parallel with different incentives; an adversarial gate refuses to finish while coverage is thin. The point is to fail the way real QA fails a product — not the way one polite agent clicks the happy path and calls it a pass.

```
1. PROBE + BRIEF  →  2. RECON     →  3. PLAN     →  4. RUN (parallel)          →  5. GATE        →  6. SYNTH
   detect envs,        recon           planner       visual / logic /              completeness      synth
   setup menu                                        data-paranoid / attacker      (loop-until-dry)  (report +
                                                     + architect (white-box)                          regression +
                                                                                                      menu)
```

## Phase 0 — Probe & the setup wizard

**Probe first** (see `references/environments.md` → Probing): detect which drivers are actually connected. External MCPs (Appium for mobile, a Windows-automation MCP) are usually NOT installed — when a target needs one, offer the one-line install and degrade; never assume.

Then run an **adaptive wizard** — a chain of `AskUserQuestion` calls where each step appears only when the previous answers make it relevant. This is the design tension made explicit: *maximum guidance without friction*. Presets collapse the chain — "Smoke on a web URL" asks 2 questions; "Custom, multi-platform" walks all of it. Never dump every question on someone who just said "test my localhost:3000".

**The chain** (skip any step whose answer is already known from the user's prompt):

1. **What are we testing?** — Web app · Mini App · Desktop app · Mobile app · API/backend. This one answer drives which environment/driver applies and which later steps even appear.
2. **Where is it — and what changed?** — URL(s) / bot handle / app name+path. Plus an *optional* focus: "test everything" vs "focus on what changed" (a git diff, changed screens, a feature area). When they pick focus, thread that scope to recon + planner so the matrix prioritizes changed surfaces first (2026 practice — don't blind-test a huge app when only checkout changed). Off by default.
3. **How deep?** — **Smoke** (1 gate round, reading roles + one writing pass, key screens) · **Deep** (default; up to 3 rounds, all roles, full matrix) · **Custom**.
4. *(Custom only)* **Which roles?** — visual · logic · data-integrity · attacker · code-audit (multi-select).
5. **What can I test with?** — multi-select what they actually have: code repo path · test accounts/sessions · DB read access. Each one absent = that axis degrades loudly, not silently.
6. **What's off-limits?** — payments · deletes · notifications · custom (multi-select; irreversible actions pre-checked as safe defaults).
7. *(environment-specific, only if chosen)* — Mobile: which device/simulator, and is Appium MCP set up (offer install if not)? · Windows: is a Windows-automation MCP running on the box (offer setup if not)? · Desktop: which app?

Finish with a **one-screen confirm**: target, environments, mode, roles, access, red zones, focus scope — so the user green-lights before anything runs.

If the environment can't ask (headless, scheduled, sub-agent run) — don't stall: pick **Deep** on the probed environments with everything the brief already supplies, and record every assumption as the first lines of the report. Absence of an answer is not consent — never run destructive rows on assumption.

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
| `report-<role>.md` | orchestrator (persists each role's output) | Raw Phase-3 output per role — input to gate and synth |
| `report.md` | synth | Final report |
| `<NN>-<screen>-<viewport>.jpg` | browser/desktop/mobile roles | Screenshots via the assigned driver |

Regression tests go to `e2e/` in the project repo (synth only).

## Execution engine

**Workflow mode** (when ultracode is on, or the user asks for "workflow"/"orchestration"): the orchestrator calls `qa-pipeline.workflow.js` for deterministic Phase-3 parallelism, real loop-until-dry, and agent-count scaling by budget.

**Normal mode** (default): the orchestrator drives roles via the Agent tool — Phases 1–2 sequential, Phase 3 in small parallel batches (as budget allows), Phase 4 looped by hand.

Phase logic is identical in both; only the parallelism engine differs.

## Phases (detail in `references/roles/<role>.md` — read the role file before dispatching it)

1. **Recon** — `roles/recon.md`. Reads code (what should exist) + walks the live app via the assigned driver (what does exist), reconciles → `qa-map.md`.
2. **Plan** — `roles/planner.md`. Map → coverage matrix; assigns role + persona + **environment** per row; credentials and red zones as machine-readable blocks in `qa-plan.md`.
3. **Run** (parallel) — the four browser/app roles each under their persona and row-assigned driver, plus the white-box audit:
   - `roles/visual-critic.md` — real screenshots per viewport, judged against the project's own design system, ≥3 improvements per screen.
   - `roles/logic.md` — end-to-end journeys, state conflicts, interruptions, multi-actor.
   - `roles/data-paranoid.md` — DB verified after every action; privilege isolation.
   - `roles/attacker.md` — edge cases and input abuse.
   - `roles/architect.md` — white-box code health (no browser).
   The orchestrator saves each role's output to `report-<role>.md` (roles are read-only toward the product; the orchestrator persists their text) and passes those to the gate and synth.
4. **Gate** — `roles/completeness-gate.md`. Loop-until-dry: hunts gaps and "OK without a real click", dispatches follow-up work to the right roles, stops when two rounds come back dry or the cap (smoke 1 / deep 3) hits. Re-round output is appended to `report-<role>.md` under `--- Round N ---`.
5. **Synth** — `roles/synth.md`. Merges into `report.md`, generates regression tests in the project's own test harness, emits a recommendations menu as text. The orchestrator (not synth) raises `AskUserQuestion` for the menu.

## Fast-fail

Stop immediately with a clear message (never a silent "0% coverage") when:

1. **All URL targets unreachable** — HEAD/GET each before recon; none answers → stop with diagnostics.
2. **All personas fail to log in** — none can enter → stop, listing each persona and reason.

Partial availability (some personas / some targets / some environments down) does NOT stop the run — it's recorded as degradation in `qa-plan.md` before Phase 3.

## Safety

Full rules in `references/safety.md`. In short: test personas only, "TEST" prefix, log everything created; no irreversible actions or red-zone touches; Phases 1–4 read-only toward the product; only synth writes to the repo (`e2e/`) and deletes TEST data on menu choice; real-profile drivers (real-chrome / desktop / mobile) run on the user's real machine — extra care, credentials handled by the user alone.

## Files

- `references/environments.md` — environment decision table, probing, Mini App fidelity levels
- `references/drivers/*.md` — one per environment (browser-devtools, real-chrome, desktop-native, mobile, windows)
- `references/roles/*.md` — the nine role definitions (source of truth for dispatch)
- `references/safety.md`, `references/severity.md`
- `qa-pipeline.workflow.js` — deterministic engine for workflow mode
- `fixtures/mini-app/` — tiny sample app to smoke-test the pipeline itself
