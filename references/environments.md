# Target environments & drivers

The pipeline tests **whatever surface the product actually ships on** — not just a browser tab. Each environment has a driver: a concrete recipe for "open the app, click, type, screenshot, read state". Roles never invent their own automation; they read the driver section assigned to them in `qa-plan.md`.

## Decision table

| Target | Driver | When |
|---|---|---|
| Web app (local dev / staging / prod, no login walls you can't pass) | **browser-devtools** | Default for anything with a URL |
| Web app behind real login, OAuth, anti-bot; **messenger Mini Apps** (Telegram TMA, MAX) | **real-chrome** | You need the user's live sessions — real cookies, real `initData` |
| Native desktop app (macOS): Electron, Qt/PySide, Tauri, any window | **desktop-native** | The product is a window, not a URL |
| Android app or Mini App inside the real Telegram Android client | **android-adb** | Phone/emulator connected via `adb` |
| Windows app | **windows** | Only degraded modes exist — read the driver before promising anything |
| iOS app | — | Honest gap: needs Xcode + Simulator (or Appium + real device). If `xcrun simctl list devices available` shows devices, drive it via `simctl` (boot, openurl, io screenshot) + accessibility dump; otherwise declare the axis NOT COVERED. Do not fake it |
| No UI at all (API service, bot backend) | curl/httpie + DB access | Visual axis explicitly NOT COVERED; logic/data axes still run |

Multiple environments can run in one pipeline (e.g. web admin panel via browser-devtools + resident Mini App via real-chrome). The planner assigns an environment per matrix row.

## Probing (Phase 0 does this once)

Before the setup menu, the orchestrator probes what is actually available and only offers environments that exist:

- `browser-devtools`: chrome-devtools MCP tools present (or playwright MCP, or Bash+playwright fallback — see driver).
- `real-chrome`: claude-in-chrome MCP tools present AND the user's Chrome is running with the extension connected.
- `desktop-native`: computer-use MCP present (macOS host).
- `android-adb`: `adb devices` lists a device/emulator.
- `windows`: a Windows-automation MCP is connected (see driver for what qualifies), or SSH access to a Windows host is provided in the brief (degraded, no UI).
- DB access / code access: from the brief.

Report the probe result to the user inside the setup menu — "available: X, Y; unavailable: Z (reason)" — so choosing an environment is informed, not hopeful.

## Mini Apps: which environment is *correct*?

A Mini App is a web app embedded in a messenger. Three levels of fidelity:

1. **Real messenger web client — `real-chrome` on `web.telegram.org` / MAX web (PRIMARY).** This *is* the real messenger: the Mini App gets genuine `initData`, real auth, real theme params — while you keep full DOM access (precise clicks, console, network, element-level screenshots). Highest bug yield per minute. Most Mini App testing should happen here.
2. **Real native client — `android-adb` (Telegram Android) or `desktop-native` (Telegram Desktop) (CROSS-CHECK).** The true WebView environment your mobile users live in: safe-area insets, keyboard overlap, BackButton behavior, viewport events. Slower (coordinate taps, no console), so use it to cross-check key flows and SDK-dependent behavior, not to walk the whole matrix.
3. **Bare browser on the app's URL (FACADE ONLY).** No SDK object, no `initData` — auth-dependent screens are unreachable or mocked. Acceptable only for layout smoke on public screens; every SDK-dependent row must be marked NOT COVERED if this is all you have.

Rule of thumb: **depth in the web client, breadth on a native client.** If only level 3 is available, say so loudly in the report.

## Driver files

- `drivers/browser-devtools.md` — chrome-devtools MCP (primary), playwright MCP, Bash+playwright fallback; screenshot protocol; viewport emulation pitfalls.
- `drivers/real-chrome.md` — claude-in-chrome: live sessions, Mini Apps, safety rules for a real profile.
- `drivers/desktop-native.md` — computer-use on macOS: screenshot→click loop, app tiers, launching apps.
- `drivers/android-adb.md` — adb: screencap, input, uiautomator dump; Telegram Mini Apps on a real phone.
- `drivers/windows.md` — what exists honestly: remote Windows-automation MCP on the target machine, or SSH-only degraded mode.

Every driver ends with the same contract: how to produce `<NN>-<screen>-<viewport>.jpg` artifacts in the run folder and how to report "this driver failed" (fast-fail with a reason — never a silent 0% coverage).
