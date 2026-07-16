# qa-pipeline

A multi-agent QA harness for web apps and Mini Apps. Instead of one agent politely clicking around and reporting "looks fine", it runs a **five-phase pipeline** where specialized roles attack the product in parallel and an adversarial gate refuses to let the run finish while coverage is still thin.

Built as a [Claude Code](https://claude.com/claude-code) skill (`SKILL.md`) plus a deterministic workflow script (`qa-pipeline.workflow.js`).

## Why

A single agent doing QA tends to fail the same way every time: it explores the happy path, never checks that the data actually landed in the database, and calls it a pass. This pipeline is built around that failure mode — separate roles with separate incentives, and a critic whose only job is to find what everyone else missed.

## The pipeline

| Phase | What happens |
|---|---|
| **1. Recon** | Builds a map of the product — hybrid of reading the code and walking the live UI. Output: `qa-map.md` |
| **2. Plan** | Turns the map into an executable coverage matrix, assigns roles and test personas. Output: `qa-plan.md` |
| **3. Run** | Four roles work in parallel against the live app, plus a white-box code audit |
| **4. Completeness gate** | An adversarial critic hunts for gaps and "OK without a real click", then loops back with follow-up work until two rounds come back dry |
| **5. Synthesis** | Merges everything into `report.md` — bugs by severity, coverage %, and generated regression tests |

## The roles

| Role | Mandate |
|---|---|
| `qa-recon` | Map every screen, route, and state |
| `qa-logic` | End-to-end journeys — state conflicts, cancel-and-retry, refresh mid-flow, multi-actor sequences |
| `qa-attacker` | Edge cases — double clicks, empty input, XSS strings, huge text, offline, races |
| `qa-data-paranoid` | Verifies the DB after every action; cross-effects between screens and users; privilege leaks via ID/slug swapping |
| `qa-visual-critic` | Real screenshots per viewport, judged against the project's own design system; must produce ≥3 improvements per screen |
| `qa-architect` | White-box code health — duplicated logic, dead code, multiple sources of truth |
| `qa-completeness-gate` | Adversarially re-checks anything marked "tested"; loops until dry |
| `qa-synth` | Assembles the report and writes regression tests |

Every role except the synthesizer is **read-only** — the harness can't quietly "fix" what it was asked to test.

## Design notes

- **Loop until dry, not until N.** Coverage is unknown-size, so the gate keeps spawning follow-ups until two consecutive rounds surface nothing new. Simple counters miss the tail.
- **Verification beats assertion.** A finding only counts with evidence — a screenshot, a DB row, a real click.
- **Read-only by default.** Test agents cannot write; only the synthesizer emits new files.
- **Safety rails** live in `references/safety.md` (rate limits, destructive-action bans).

## Layout

```
SKILL.md                  # skill entry point: dispatch + phases
qa-pipeline.workflow.js   # deterministic orchestration script
references/
  safety.md               # what agents must never do
  severity.md             # severity rubric for findings
  browser-driver.md       # browser automation notes
tools/lint_agent.py       # agent-definition linter
fixtures/mini-app/        # tiny fixture app to smoke-test the pipeline
```

## Status

Working harness, used as a skill. The full deep run has not been exercised end-to-end against a large production app yet.

## License

MIT © 2026 Max Ryzhik
