# Driver: desktop-native (macOS windows via computer-use)

`computer-use` MCP (`mcp__computer-use__*`): screenshots of the real screen + mouse/keyboard on native macOS apps — Electron, Qt/PySide, Tauri, Java, anything with a window. This is how you test desktop products "like a human": look, click, type, look again.

## Loop

1. `request_access` with the app list FIRST — the user approves each app; you may need to request again mid-run for a newly needed app.
2. `open_application` to launch/front the target.
3. `screenshot` → find the control **in the current shot** → `left_click` at its coordinates → `screenshot` again to verify the result. Never click from a stale screenshot: windows move.
4. Text: `type` for content, `key` for shortcuts/Enter/Tab. `zoom` on a region when small text must be read exactly.
5. Artifacts: every screenshot that proves a bug or a covered row gets saved to the run folder with the standard `<NN>-<screen>-<state>.jpg` name (persist via Bash `screencapture` or by saving the tool's image).

## App tiers (enforced by the MCP — don't fight them)

- **Browsers** → read-only (screenshots yes, clicks blocked): use a browser driver instead.
- **Terminals/IDEs** → click-only (no typing): use the Bash tool for shell work.
- **Everything else** → full control.

## What this driver is honest about

- Coordinate-based: slower and blinder than DOM drivers — no console, no network, no element tree. Where the same product also has a web surface, walk the breadth there and use desktop-native for native-only behavior (menus, dialogs, tray, file pickers, window resize).
- One screen, one mouse → all desktop-native work is **serialized**; the planner must not schedule two roles here in parallel.
- The machine is the user's real computer: touch only the target app, never system settings, never other apps' windows. Red zones apply.
- Telegram Desktop as a Mini App cross-check environment lives here: platform `tdesktop`, real WebView — use for SDK-behavior spot-checks after the main matrix ran in real-chrome.

## Degradation

computer-use MCP absent (non-macOS host or not granted) → environment unavailable; rows `blocked (driver unavailable)`. AppleScript (`osascript`) may still launch apps / read some state — useful for setup, not a substitute for visual testing.
