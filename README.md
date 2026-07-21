# qa-pipeline

A multi-agent QA harness for **any product surface** — web apps, messenger Mini Apps (Telegram / MAX), native desktop apps, and Android. Instead of one agent politely clicking around and reporting "looks fine", it runs a **five-phase pipeline** where specialized roles attack the product in parallel and an adversarial gate refuses to let the run finish while coverage is still thin.

Built as a [Claude Code](https://claude.com/claude-code) skill (`SKILL.md`) plus a deterministic workflow script (`qa-pipeline.workflow.js`). Self-contained — every role definition ships in the repo, so it works the moment you install it.

## Why

A single agent doing QA tends to fail the same way every time: it explores the happy path, never checks that the data actually landed in the database, and calls it a pass. This pipeline is built around that failure mode — separate roles with separate incentives, and a critic whose only job is to find what everyone else missed.

## The pipeline

| Phase | What happens |
|---|---|
| **0. Probe & brief** | Detects which environments are actually available, then a setup menu: Smoke / Deep / Custom (pick roles, environments, depth, red zones) |
| **1. Recon** | Builds a map of the product — hybrid of reading the code and walking the live UI. Output: `qa-map.md` |
| **2. Plan** | Turns the map into an executable coverage matrix; assigns a role, persona, and **environment** per row. Output: `qa-plan.md` |
| **3. Run** | Four roles work in parallel against the live app, plus a white-box code audit |
| **4. Completeness gate** | An adversarial critic hunts for gaps and "OK without a real click", then loops back with follow-up work until two rounds come back dry |
| **5. Synthesis** | Merges everything into `report.md` — bugs by severity, coverage %, and generated regression tests |

## Environments

The pipeline tests the surface the product actually ships on. Each has a driver in `references/drivers/`:

| Environment | Driver | For |
|---|---|---|
| Web app by URL | `browser-devtools` | Anything with a URL (chrome-devtools MCP, with a Bash+Playwright fallback) |
| Real login / OAuth / **Mini Apps** | `real-chrome` | The user's live browser sessions — genuine `initData`, real auth |
| Native desktop (macOS) | `desktop-native` | Electron/Qt/Tauri windows via computer-use |
| Android app / native Telegram | `android-adb` | Real phone or emulator via `adb` |
| Windows | `windows` | Honest about what exists (remote UI-automation MCP, or SSH-only degraded) |

**Mini Apps** are handled at the right fidelity: depth in the real web client (`web.telegram.org` — real `initData` with full DOM access), breadth on a native client for WebView-specific behavior. A bare browser on the app URL is treated as a facade only. See `references/environments.md`.

## The roles

| Role | Mandate |
|---|---|
| `recon` | Map every screen, route, and state |
| `planner` | Coverage matrix; assign role + persona + environment per row |
| `logic` | End-to-end journeys — state conflicts, cancel-and-retry, refresh mid-flow, multi-actor sequences |
| `attacker` | Edge cases — double clicks, empty input, injection strings, huge text, offline, races |
| `data-paranoid` | Verifies the DB after every action; cross-effects between screens and users; privilege leaks via ID/slug swapping |
| `visual-critic` | Real screenshots per viewport, judged against the project's own design system; ≥3 improvements per screen |
| `architect` | White-box code health — duplicated logic, dead code, multiple sources of truth |
| `completeness-gate` | Adversarially re-checks anything marked "tested"; loops until dry |
| `synth` | Assembles the report and writes regression tests |

Roles are dispatched **by file** (`references/roles/<role>.md`), run as general-purpose sub-agents — no separate agent registration needed. Every role except the synthesizer is **read-only** toward the product, so the harness can't quietly "fix" what it was asked to test.

## Design notes

- **Loop until dry, not until N.** Coverage is unknown-size, so the gate keeps spawning follow-ups until two consecutive rounds surface nothing new. Simple counters miss the tail.
- **Verification beats assertion.** A finding only counts with evidence — a screenshot, a DB row, a real click.
- **Degrade loudly.** Whatever the brief lacks — code, DB access, a driver — the matching axis is marked NOT COVERED in the report, never a silent 0%.
- **Read-only by default.** Test roles cannot write to the product; only the synthesizer emits new files (regression tests).
- **Safety rails** live in `references/safety.md` (test personas only, rate limits, destructive-action bans, extra care on real-profile drivers).

## Layout

```
SKILL.md                      # entry point: probe, brief menu, dispatch, phases
qa-pipeline.workflow.js       # deterministic orchestration (workflow mode)
references/
  environments.md             # environment decision table, probing, Mini App fidelity
  drivers/                     # one driver per environment
    browser-devtools.md  real-chrome.md  desktop-native.md  android-adb.md  windows.md
  roles/                      # nine role definitions — the source of truth for dispatch
  safety.md  severity.md
fixtures/mini-app/            # tiny fixture to smoke-test the pipeline itself
tools/lint_agent.py
```

## Requirements

Claude Code. Drivers use whatever is connected: chrome-devtools or Playwright MCP for web, claude-in-chrome MCP for live sessions, computer-use MCP for desktop, `adb` for Android. The pipeline probes at startup and only offers what's actually there.

## Status

Working harness. The individual phases and the portable file-based dispatch are exercised; a full deep run end-to-end against a large production app across multiple environments has not been benchmarked yet.

## License

MIT © 2026 Max Ryzhik
