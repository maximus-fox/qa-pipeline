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
| No UI (API service, bot backend) | curl/httpie + DB | visual axis NOT COVERED; logic/data still run |

Several environments can run in one pipeline (e.g. web admin via browser-devtools + resident Mini App via real-chrome). The planner assigns an environment per matrix row.

## Probing (Phase 0)

Before the setup wizard, probe what's actually available and only offer what exists. Crucially: **external MCPs (Appium, Windows-MCP) are usually NOT installed by default** — when a target needs one and it's absent, offer the one-line install and degrade honestly; never assume it's there.

| Environment | Probe | If missing |
|---|---|---|
| browser-devtools | chrome-devtools OR playwright MCP tools present; else Bash+playwright | always available via Bash fallback |
| real-chrome | claude-in-chrome MCP present AND Chrome running with the extension | offer to connect the extension |
| desktop-native | computer-use MCP present (macOS host) | unavailable off-macOS |
| mobile | Appium MCP tools present? else `adb devices` lists a device? | offer `claude mcp add appium-mcp -- npx -y appium-mcp@latest` (iOS+Android) or `adb` (Android only); else unavailable |
| windows | a Windows-automation MCP connected? else SSH host in brief? | point to Windows-MCP (`uvx windows-mcp serve` on the Windows box, connect over SSE); else SSH-degraded |
| DB / code access | from the brief | degrade the matching axis loudly |

Report the probe inside the wizard — "available: X, Y; unavailable: Z (reason / install cmd)" — so the user chooses informed, not hopeful.

## Mini Apps: which environment is *correct*?

A Mini App is a web app embedded in a messenger. Three fidelity levels:

1. **Real messenger web client — `real-chrome` on `web.telegram.org` / MAX web (PRIMARY).** Genuine `initData`, real auth, real theme — while you keep full DOM access (precise clicks, console, network). Highest bug yield per minute. Most Mini App testing happens here.
2. **Real native client — `mobile` (Telegram Android via Appium) or `desktop-native` (Telegram Desktop) (CROSS-CHECK).** The true WebView: safe-area insets, keyboard overlap, BackButton, viewport events. Slower, so cross-check key/SDK-dependent flows, not the whole matrix.
3. **Bare browser on the app URL (FACADE ONLY).** No SDK, no `initData` — auth-dependent screens unreachable or mocked. OK for public-screen layout smoke only; mark every SDK-dependent row NOT COVERED if that's all you have.

Rule of thumb: **depth in the web client, breadth on a native client.**

## Driver files

- `drivers/browser-devtools.md` — chrome-devtools MCP (primary), playwright MCP, Bash+playwright fallback.
- `drivers/real-chrome.md` — claude-in-chrome: live sessions, Mini Apps, real-profile safety.
- `drivers/desktop-native.md` — computer-use on macOS.
- `drivers/mobile.md` — Appium MCP (iOS+Android) primary; raw adb fallback.
- `drivers/windows.md` — Windows-MCP on the target machine; SSH/RDP degraded modes.

Every driver ends with the same contract: produce `<NN>-<screen>-<viewport>.jpg` artifacts in the run folder, and report "this driver failed" as an explicit fast-fail with a reason — never a silent 0% coverage.
