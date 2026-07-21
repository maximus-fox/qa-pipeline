# Driver: real-chrome (the user's live browser)

`claude-in-chrome` MCP (`mcp__claude-in-chrome__*`): controls the user's **actual Chrome** with their logged-in sessions. This is the only driver that gets you past real login walls, OAuth, anti-bot checks — and the primary driver for **messenger Mini Apps**: on `web.telegram.org` (or the MAX web client) the Mini App receives a genuine `initData`, real user, real theme. You test the app as the signed-in human, not as a headless robot.

Core loop: `tabs_context_mcp` → `tabs_create_mcp` / `navigate` → `read_page` (accessibility tree with `ref_N` handles) → `computer` click/type by ref → `read_console_messages` / `read_network_requests` for evidence → screenshots via `computer {action:"screenshot"}`.

## Mini App recipe (Telegram example; MAX is analogous)

1. Open `web.telegram.org` in a new tab (the user is already logged in — if not, STOP and ask the user to log in themselves; never handle their credentials).
2. Find the bot chat, launch the Mini App (menu button / inline button).
3. The TMA runs in an iframe: `read_page` sees into it; clicks by ref work; console shows the app's own errors.
4. `initData`, auth, theme params are REAL — session-dependent screens, payments-adjacent screens (read-only!), role-gated flows all reachable.
5. Viewport: resize the window to phone width for mobile-layout rows; note that the web client is still platform `weba` — BackButton/haptics/native-keyboard behavior belongs to the native-client cross-check (android-adb / desktop-native).

## Safety — this is a real person's browser

- Work ONLY in tabs you opened; never touch pre-existing tabs, history, or other sites' sessions.
- The user's account here is usually a REAL account, not a test persona. Read screens freely; **create/modify data only through flows the brief explicitly allows**, prefix everything "TEST", and log every mutation for cleanup. Red zones apply doubly.
- Destructive/irreversible actions, payments, sending messages to real people — forbidden regardless of what the app offers. If a flow requires them, mark the row `blocked (red zone)`.
- Anything the user must do personally (log in, enter 2FA, approve a permission) — ask them in chat, wait, continue.

## Parallelism

One real Chrome = one user profile. Roles using this driver run **serialized** (the planner enforces it), or one role holds real-chrome while others use browser-devtools/other environments in parallel.

## Degradation

Extension not connected / no Chrome running → this environment is unavailable; matrix rows assigned to it become `blocked (driver unavailable)` and the setup menu should not have offered it. Never silently substitute a bare browser for a Mini App row — that changes what is being tested (see `references/environments.md (Mini Apps section)`).
