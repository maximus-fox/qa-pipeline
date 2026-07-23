# Target environments & drivers

The pipeline tests **whatever surface the product actually ships on** — not just a browser tab. Each environment has a driver: a concrete recipe for "open the app, click, type, screenshot, read state". Roles never invent their own automation; they read the driver assigned to their rows in `qa-plan.md`.

## Decision table

| Target | Driver | Backed by |
|---|---|---|
| Web app by URL | **browser-devtools** | chrome-devtools MCP → playwright MCP → Bash+playwright |
| Real login / OAuth / anti-bot; **messenger Mini Apps** | **real-chrome** | claude-in-chrome MCP (the user's live sessions) |
| Native desktop (macOS) | **desktop-native** | computer-use MCP |
| **Mobile — iOS & Android, native apps and Mini Apps in native clients** | **mobile** | Appium MCP (primary, both platforms) → raw `adb` (Android-only fallback) |
| Windows app | **windows** | Windows-MCP (or similar) on the Windows box → SSH/RDP degraded |
| No UI (API service, bot backend) | **api** | curl/httpie + DB; visual axis NOT COVERED, logic/data/attacker run on requests |
| CLI tool | Bash (run the binary, assert stdout/stderr/exit codes/files) | visual axis n/a; no dedicated driver file — the planner writes the invocation contract into the rows |
| Native desktop (Linux) | — none in this skill | rows `blocked (no driver)`, said in the wizard up front |

Several environments can run in one pipeline (e.g. web admin via browser-devtools + resident Mini App via real-chrome). The planner assigns an environment per matrix row.

## Probing (Phase 0)

Before the setup wizard, probe what's actually available and only offer what exists. Crucially: **external MCPs (Appium, Windows-MCP) are usually NOT installed by default** — when a target needs one and it's absent, offer the one-line install and degrade honestly; never assume it's there.

| Environment | Probe | If missing |
|---|---|---|
| browser-devtools | chrome-devtools OR playwright MCP tools present; else Bash+playwright | fallback works on any host with Node or Python — per-OS paths (incl. Windows) in the driver file |
| real-chrome | claude-in-chrome MCP present AND Chrome running with the extension | offer to connect the extension |
| desktop-native | computer-use MCP present (macOS host) | unavailable off-macOS |
| mobile | Appium MCP tools present? built-in iOS Simulator MCP (`mcp__Claude_Code_iOS_Simulator__*`, Claude Code desktop on macOS)? else `adb devices` lists a device? | offer `claude mcp add appium-mcp -- npx -y appium-mcp@latest` (iOS+Android) or `adb` (Android only); else unavailable |
| windows | a Windows-automation MCP connected? else SSH host in brief? | point to Windows-MCP (`uvx windows-mcp serve` on the Windows box, connect over SSE); else SSH-degraded |
| DB / code access | from the brief | degrade the matching axis loudly |

Report the probe inside the wizard — "available: X, Y; unavailable: Z (reason / install cmd)" — so the user chooses informed, not hopeful.

## Mini Apps: which environment is *correct*?

A Mini App is a web app embedded in a messenger. **Full protocol — insets, state × platform matrix, per-check environment honesty — in `references/mini-apps.md`; read it for any Mini App target.** The fidelity ladder in brief:

1. **Real messenger web client — `real-chrome` on `web.telegram.org` / MAX web (PRIMARY for logic/data).** Genuine `initData`, real auth, real theme, full DOM. But insets are ~0 there and there's no floating messenger chrome — the whole "buttons under Telegram's header" class is INVISIBLE in this layer.
2. **Real native client — `mobile` (Telegram Android: WebView-debug + CDP attach, see mini-apps.md) or `desktop-native` (Telegram Desktop/macOS beta) (the only honest verdict on insets/keyboard/gestures/fullscreen).** Slower, so cross-check the state matrix and SDK-dependent flows, not everything.
3. **Browser with a mocked SDK + inset variables (AUTOMATED overlap catch).** Not a facade when done right: set `--tg-safe-area-inset-*`/`--tg-content-safe-area-inset-*` to realistic values and run the geometry scan — proves the app *consumes* the insets. Reported as `partial (layer 1)`, never as device coverage.
4. **Bare browser on the app URL (FACADE ONLY).** No SDK, no `initData` — public-screen layout smoke only; SDK-dependent rows NOT COVERED if that's all you have.

Rule of thumb: **depth in the web client, insets and gestures only on a native client, emulation for regression.**

## Driver files

- `drivers/browser-devtools.md` — chrome-devtools MCP (primary), playwright MCP, Bash+playwright fallback (per-OS notes incl. Windows hosts).
- `drivers/real-chrome.md` — claude-in-chrome: live sessions, Mini Apps, real-profile safety.
- `drivers/desktop-native.md` — computer-use on macOS.
- `drivers/mobile.md` — Appium MCP (iOS+Android), built-in iOS Simulator MCP, raw adb fallback.
- `drivers/windows.md` — Windows-MCP on the target machine; SSH/RDP degraded modes.
- `drivers/api.md` — curl/httpie request loop for UI-less targets: auth, evidence transcripts, contract.

Every driver ends with the same contract: produce `<NN>-<screen>-<context>.jpg` artifacts in the run folder (`<context>` = viewport, device, or state; `.png` acceptable where the tool only emits PNG — adb screencap, some MCPs — the gate treats both as evidence), and report "this driver failed" as an explicit fast-fail with a reason — never a silent 0% coverage. UI-less drivers (api) substitute request/response transcripts for screenshots.
