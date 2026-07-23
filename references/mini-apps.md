# Mini App test protocol (Telegram / MAX / VK)

A Mini App is a web app inside a messenger's WebView — and the whole class of bugs the user
actually complains about ("buttons under Telegram's close button", "keyboard covers the input",
"bottom bar jumps") lives in the *seam* between the app and the messenger chrome. A bare browser
never shows that seam, and even the messenger's web client shows only part of it. This file is the
map of that seam: what to check, in which state, on which platform — and which environment can
honestly answer which question.

Roles: read this file for every matrix row whose target is a Mini App. The planner uses the
state × platform matrix below to generate rows; visual-critic runs the inset checks; logic runs the
state transitions; recon records which platform each row was actually verified on.

## The two insets — and why overlap bugs hide

Telegram (Bot API 8.0+) exposes TWO different insets, and the correct layout uses their SUM:

- `WebApp.safeAreaInset` / CSS `var(--tg-safe-area-inset-*)` — the DEVICE's unsafe zone
  (notch, home indicator, system bars).
- `WebApp.contentSafeAreaInset` / CSS `var(--tg-content-safe-area-inset-*)` — the zone occupied
  by TELEGRAM's own UI (close button, "..." menu, header).
- Correct top offset in expanded/fullscreen state = `safe-area-inset-top + content-safe-area-inset-top`,
  recalculated on `safeAreaChanged` / `contentSafeAreaChanged` / `viewportChanged` events.

Two traps that make this bug invisible in casual testing:

1. **It only manifests expanded/fullscreen on a mobile client.** Collapsed sheet → Telegram draws
   a native header, `contentSafeAreaInset.top ≈ 0`, nothing overlaps. On `web.telegram.org` insets
   are ~0 and there is no floating chrome. Test the expanded states or you will never see it.
2. **`env(safe-area-inset-*)` returns 0 inside the Telegram iOS WebView** (confirmed upstream bugs:
   Telegram-Mini-Apps/issues#42, Telegram-iOS#1377). An app whose only mechanism is CSS `env()` is
   broken on iOS by construction. **White-box check: grep the app's CSS for `env(safe-area-inset`
   — if that's the only inset mechanism and the target ships on iOS, that's a finding without
   opening a single client.**

MAX has **no inset API at all** (Bridge exposes neither insets nor fullscreen/viewport events) —
overlap there is verified only visually on real clients, and the report must say so.
VK sends insets in the `VKWebAppUpdateConfig` event (VKUI maps them to `--safe-area-inset-*`).

## State × platform matrix (planner: one row per cell that applies)

States, in order — walk them as a journey, screenshot each:

| # | State | How to enter | What to check |
|---|-------|-------------|----------------|
| S1 | Collapsed bottom sheet | default open (mobile) | initial layout, nothing cut off |
| S2 | Expanded | drag up / `expand()` | **top controls vs Telegram chrome**, bottom bar position |
| S3 | Fullscreen | `requestFullscreen()` (if the app uses it) | top offset = sum of both insets; status-bar collision; rotate → insets recalc |
| S4 | Keyboard open | focus a bottom input | input visible, page doesn't jump or leave a gap (iOS client bugs #1474/#1475/#1410) |
| S5 | Back from S2–S4 | collapse / exitFullscreen / blur | layout restores, no stuck offsets |
| S6 | Theme switch | toggle dark mode mid-session (`themeChanged`) | no hardcoded colors ("white patches"), all from `--tg-theme-*` |

Platforms: `ios`, `android` (native clients — the truth for S1–S5), `weba`/`web` (web client),
`tdesktop`, `macos` (desktop). Clients are developed separately; divergence is expected by design —
a pass on one platform proves nothing about another.

## Layered environments — depth without self-deception

**Layer 1 — browser emulation (automated, catches the overlap class WITHOUT a device).**
In any browser driver, inject a mock before load: `window.Telegram.WebApp` stub (or
`mockTelegramEnv` from `@telegram-apps/sdk` if the project uses it) **plus realistic CSS vars**:

```js
// evaluate before app scripts run; values ≈ iPhone with notch, expanded TMA
const s = document.documentElement.style
s.setProperty('--tg-safe-area-inset-top', '47px')
s.setProperty('--tg-content-safe-area-inset-top', '46px')
s.setProperty('--tg-safe-area-inset-bottom', '34px')
```

Then run the geometry scan (`tools/visual-scan.js`): any fixed/absolute element whose box intrudes
into the top `safe+content` band or the bottom `safe` band = the overlap bug, caught headlessly.
This verifies *the app consumes the variables*. What it can NOT verify: that the real client
delivers them, keyboard behavior, gestures — never report Layer 1 as device coverage.

**Layer 2 — messenger web client (`real-chrome` on web.telegram.org / MAX web).**
Real `initData`, real auth, real theme, full DOM. Depth for logic/data/facades. Blind to: insets
(zero there), keyboard overlap, sheet gestures, fullscreen. `expand()` is a no-op on web/desktop.

**Layer 3 — native client spot-check (the only honest verdict on S1–S5).**

- **Android — the no-hacks path (preferred: full DevTools on the REAL WebView).**
  Any real device or emulator (emulators count fully; Telegram installs from Play Store or APK).
  In Telegram: Settings → long-press version number ×2 → **Enable WebView Debug**. Then either
  inspect interactively via `chrome://inspect/#devices`, or attach the pipeline's own tooling:
  ```bash
  adb shell dumpsys webviewupdate | head -3   # confirm WebView present
  # find the Telegram WebView devtools socket, forward it, attach over CDP:
  adb shell 'cat /proc/net/unix | grep webview_devtools'   # → webview_devtools_remote_<pid>
  adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
  curl -s http://localhost:9222/json   # pages; Playwright: chromium.connectOverCDP('http://localhost:9222')
  ```
  This gives DOM, console, screenshots and the geometry scan on the true Telegram Android WebView —
  the same checks as Layer 1, but with REAL insets and keyboard. Input still goes through the
  `mobile` driver (Appium/adb) when needed.
- **iOS** — real iPhone + Safari Web Inspector (Telegram: tap Settings icon ×10 → *Allow Web View
  Inspection*; Mac Safari → Develop → device). **The iOS Simulator cannot install Telegram**
  (App Store apps don't install; building Telegram-iOS from source is out of scope) — don't
  simulate coverage; the simulator's role for Mini Apps is at most Safari-engine layout checks
  (facade level). No Mac/iPhone → rows `blocked`, said loudly.
- **Desktop** — Telegram Desktop **Beta** (Windows/Linux): Settings → Advanced → Experimental →
  *Enable webview inspection* → right-click → Inspect. macOS client Beta: Settings icon ×5 →
  *Debug Mini Apps*. Platform-specific behavior only (`tdesktop`/`macos`); not a substitute for mobile.
- **Telegram test environment** exists (separate accounts/BotFather, `api.telegram.org/bot<token>/test/…`,
  plain HTTP allowed) — use for pre-prod bots when the brief provides it.

**MAX specifics.** Bridge = `window.WebApp` (script `st.max.ru/js/max-web-app.js`), platforms
`ios/android/desktop/web`. No insets, no viewport events, no fullscreen API. Desktop clients
(Windows/Linux) have **no webview inspection at all** — the honest matrix: DOM-work in the MAX
**web** version (ordinary browser DevTools); visual passes on device clients via screenshots
(`mobile` driver for Android/iOS; `windows` driver can drive the Windows client coordinate-level;
Linux client — no driver in this skill: rows `blocked (no driver)`, or Eruda injected in a dev
build if the team ships one). Desktop/web also lack Haptic/DeviceStorage/Biometric — feature rows
on those platforms are `n/a`, not failures.

**VK specifics.** Insets arrive via `VKWebAppUpdateConfig`; local dev via `vk-tunnel`; browser
mock — official `vk-bridge-mock`. Check insets are applied to the app root (known VKUI pitfall).

## Checklist per Mini App target (beyond the state matrix)

- [ ] No `env(safe-area-inset-*)` as the only inset mechanism (white-box grep — iOS trap above).
- [ ] Bottom-pinned elements use `viewportStableHeight` / `--tg-viewport-stable-height`, never
      `viewportHeight` (official doc rule) — they must not jump while dragging the sheet.
- [ ] No bare `100vh` — `100dvh` or Telegram viewport vars; verify visually with keyboard open.
- [ ] Long scrollable lists don't collapse the sheet on scroll-up (`disableVerticalSwipes` where needed).
- [ ] `fullscreenFailed: UNSUPPORTED` (web/desktop) handled without a stuck UI.
- [ ] BackButton shows/hides with navigation; MainButton/BottomButton doesn't cover content
      (content bottom padding) and uses `bottom_bar_bg_color`.
- [ ] Report says, per row, WHICH layer verified it (emulation / web client / which native client) —
      a Layer-1-only pass on an inset row is `partial`, never `tested`.
