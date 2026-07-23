# Driver: browser-devtools (web apps by URL)

Order of preference — try the next only when the previous is genuinely unavailable:

## 1. chrome-devtools MCP (primary)

Tools like `new_page`, `navigate_page`, `resize_page`, `emulate`, `take_screenshot`, `evaluate_script`, `list_console_messages`, `list_network_requests`, `click`, `fill`. If deferred, load them in ONE ToolSearch call.

Field-tested pitfalls (cost real debugging time — respect them):

- **`resize_page` fails when the Chrome window is maximized** (`Restore window to normal state…`). Switch to `emulate` with `viewport: "1440x900x1"` — same effect, works regardless of window state.
- **Scroll with `behavior: 'instant'`** via `evaluate_script` — many apps set `scroll-behavior: smooth`, and a plain `scrollTo` screenshots mid-animation.
- **Wait for reality, not timers**: `document.fonts.ready`, network idle, the key element visible. Kill animations before capture: inject `*{animation:none!important;transition:none!important}`.
- **Verify numbers, not vibes**: element heights via `evaluate_script` (`offsetHeight`), horizontal overflow via `scrollWidth === innerWidth`.
- A closed/crashed page invalidates the selection — `list_pages` and reselect instead of concluding the app is down.

## 2. playwright MCP

`browser_navigate`, `browser_snapshot`, `browser_take_screenshot`, `browser_click`, `browser_evaluate`, `browser_resize`. Caveats: only ONE browser instance per MCP server ("Browser is already in use" → another role holds it; coordinate through the plan, don't fight); in many environments the MCP is "Connected" but non-functional (bundled browser missing) — drop it after one failure, don't retry.

## 3. Bash + playwright (fallback on any host with Node or Python)

Bash is always in the toolset. Write ONE reusable driver script to the scratch dir and call it per page (args: url, viewport, out-path, steps).

macOS / Linux:

```bash
PWPATH="$(dirname "$(ls -d ~/.npm/_npx/*/node_modules/playwright 2>/dev/null | head -1)")"
[ -z "$PWPATH" ] && npm i --prefix /tmp/pw playwright >/dev/null 2>&1 && PWPATH=/tmp/pw/node_modules
NODE_PATH="$PWPATH" node /tmp/qa-driver.mjs <url> <w>x<h> <out.jpg>
```

**Windows host** (the pipeline may legitimately run there — see `drivers/windows.md` topology 1): the unix paths above don't exist. Use the scratch/TEMP dir instead of `/tmp`, install with `npm i --prefix "%TEMP%\pw" playwright`, and Chrome lives at `%ProgramFiles%\Google\Chrome\Application\chrome.exe` or `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`. Mind the shell: Claude Code on Windows may hand you PowerShell or Git-Bash — probe with `echo $SHELL` / `$PSVersionTable` before assuming syntax.

In the script: `chromium.launch({executablePath: <system Chrome path>})` — the bundled chromium is usually absent; on macOS `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, on Linux `google-chrome`/`chromium`, on Windows the paths above. Hook `page.on('console')` and `page.on('response')` to capture errors. **Python playwright (`pip install playwright && playwright install chromium`) is an equally valid driver on all three OSes** and its bundled Chromium usually works — prefer it when Node paths get awkward (common on Windows).

Each `node` run launches its own Chrome → parallel roles never contend for a browser — **but they DO contend for RAM.** Every browser role is a full Chrome; three at once against a local dev server can OOM-kill the server under test. On a constrained host (≈≤8 GB) testing localhost, serialize browser roles or cap at 2 (see SKILL.md → Host-resource guard). The white-box `architect` role has no browser and is always safe to run in parallel.

## Viewport matrix

Priority: `qa-plan.md` rows → project breakpoints from `qa-map.md` (tailwind config / CSS `@media`) → fallback 1440×900 / 768×1024 / 390×844 **explicitly marked as fallback**.

## Screenshot contract

JPEG (not PNG), absolute path `{run-folder}/<NN>-<screen>-<viewport>.jpg`, one clean full-viewport shot per key screen per viewport. Kill motion first, wait for fonts/network. If a capture fails after one retry — record the failure; the ONLY legitimate "visual not covered" is after fallback #3 genuinely failed with a stated reason.

## Login

Use the persona's real session: log in through the form once, or set cookies/localStorage from the brief. Never stub `page.route()` unless the backend is genuinely unreachable — and mark every stubbed row as degraded.
