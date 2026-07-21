# Driver: android-adb (real phone / emulator)

Plain `adb` over Bash — no extra MCP needed. Works with any connected Android device or emulator (`adb devices` must list one; that's the Phase 0 probe).

## Toolkit

```bash
adb devices                                        # probe
adb shell screencap -p /sdcard/s.png && adb pull /sdcard/s.png <run-folder>/NN-screen.png
adb shell input tap X Y                            # tap
adb shell input swipe X1 Y1 X2 Y2 300              # swipe/scroll
adb shell input text 'hello%stest'                 # type (%s = space)
adb shell input keyevent KEYCODE_BACK              # back / enter (66) / home (3)
adb shell uiautomator dump && adb pull /sdcard/window_dump.xml   # element tree with bounds
adb logcat -d -t 200                               # recent device log (crashes, JS console of WebViews)
adb shell am start -n <package>/<activity>         # launch app
adb shell wm size                                  # real screen resolution
```

**Find elements by tree, not by eye:** `uiautomator dump` gives every node's `text`, `resource-id`, `content-desc` and `bounds="[x1,y1][x2,y2]"` — compute the center and tap it. Screenshot → guess-tap is the fallback, not the method.

## Mini Apps on the real client

Telegram for Android is the honest TMA environment (platform `android`): real WebView, safe-area, native keyboard overlap, BackButton hardware behavior.

1. `adb shell am start -a android.intent.action.VIEW -d "https://t.me/<bot>?startapp=..."` — or navigate the UI.
2. Walk key flows with tap/swipe from the dump tree; screenshot per step.
3. WebView console errors surface in `logcat` (tag `chromium`/`Console`).
4. Use as CROSS-CHECK breadth after depth in real-chrome (`references/environments.md (Mini Apps section)`).

## Rules

- One device = serialized access (like desktop-native).
- The phone may be the user's real phone: only the target app, test personas only, red zones apply, uninstall nothing.
- Screenshots land in the run folder under the standard naming with viewport = device model.

## Degradation

No device in `adb devices` → environment unavailable (offer the user to plug in/authorize USB-debugging once, then re-probe). Emulator counts fully.
