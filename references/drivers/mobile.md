# Driver: mobile (iOS & Android)

Two backends, in preference order. Appium MCP is the clean primary — one tool for both platforms with real element trees; raw `adb` is the Android-only no-install fallback.

## 1. Appium MCP (primary — iOS + Android)

The official [`appium-mcp`](https://github.com/appium/appium-mcp) exposes a mobile device/emulator to the agent: real UI hierarchy, gestures, deep-linking, screenshots, app install/launch, permissions, screen recording — the same on iOS and Android.

Probe: are `appium-mcp` tools present in the session? If not and the user wants mobile, offer to install (one line) and degrade meanwhile:

```
claude mcp add appium-mcp -- npx -y appium-mcp@latest
```

Prerequisites (state them honestly when offering): Node 22+, JDK; **Android** needs the SDK + `adb` on PATH (`ANDROID_HOME`); **iOS** needs macOS + Xcode + a booted simulator or a real device in Developer Mode. iOS is therefore only reachable on a Mac with Xcode — say so rather than pretending.

Loop: select device/session → read UI hierarchy (locator or opt-in vision) → tap/swipe/type by element → screenshot per step into the run folder. App control: install/launch/terminate the build under test; deep-link for Mini App / route entry.

## 2. Raw adb (fallback — Android only, no install)

When Appium MCP isn't present but `adb devices` lists a device/emulator, drive Android directly over Bash:

```bash
adb devices
adb shell screencap -p /sdcard/s.png && adb pull /sdcard/s.png <run-folder>/NN-screen.png
adb shell input tap X Y            # tap
adb shell input swipe X1 Y1 X2 Y2 300
adb shell input text 'hello%stest' # %s = space
adb shell input keyevent 4         # back (66 enter, 3 home)
adb shell uiautomator dump && adb pull /sdcard/window_dump.xml  # element tree with bounds
adb logcat -d -t 200               # crashes + WebView console
adb shell am start -a android.intent.action.VIEW -d "https://t.me/<bot>?startapp=..."  # Mini App
```

Find elements by the `uiautomator` dump (`text`/`resource-id`/`bounds`), compute centers, tap — screenshot-and-guess is the last resort. This backend gives no iOS and no clean element API on WebViews, but needs zero extra install.

## Mini Apps on a native client

Telegram Android (via either backend) is the honest TMA WebView environment: safe-area, native keyboard overlap, hardware Back. Use as CROSS-CHECK breadth after depth in real-chrome (see `references/environments.md` → Mini Apps).

## Rules

One device = **serialized** access (like desktop-native — the planner must not schedule two roles on it at once). The phone may be the user's real phone: only the target app, test personas only, red zones apply, uninstall nothing. Screenshots land in the run folder with viewport = device model.

## Degradation

No Appium MCP and no device in `adb devices` → environment unavailable. Offer: install appium-mcp, or plug in a device / boot an emulator and authorize USB debugging, then re-probe. Emulators/simulators count fully.
