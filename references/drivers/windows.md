# Driver: windows

Windows UI can be automated properly — via an MCP that runs **on the Windows machine itself**. There is no way to click Windows UI directly from a non-Windows host, so the topology matters. Probe first; degrade honestly only when no such MCP is reachable.

## 1. Windows-automation MCP on the target (primary — real UI testing)

Mature open-source options drive Windows through the native UI Automation API (real elements, not pixels): [Windows-MCP (CursorTouch)](https://github.com/CursorTouch/Windows-MCP) (MIT, widely used, 16+ tools: Click/Type/Scroll/Shortcut, Screenshot/Snapshot, App control, FileSystem, PowerShell, Registry, Clipboard), also [MCPControl](https://github.com/claude-did-this/MCPControl) and others.

It runs on the Windows box. Two working topologies:

1. **Claude Code runs on the Windows machine**, MCP configured locally → the whole pipeline runs there natively. Simplest and most reliable.
2. **Remote**: the MCP runs on Windows exposing SSE/HTTP; your host connects over LAN/VPN. The user installs and starts it there once, e.g.:
   ```
   # on the Windows machine (Python 3.13 + uv):
   uvx windows-mcp serve
   ```
   then adds it as a remote MCP in this session. Probe = its tools are visible here.

When present: the loop mirrors desktop-native (screenshot/snapshot → locate element → click → verify), element trees come from the MCP's inspection tools, artifacts follow the standard run-folder contract, serialized access. This closes Windows as a first-class environment — not a degraded one.

## 2. SSH only (degraded — no UI)

With just SSH you can run the app's CLI/tests, read logs and the Event Log (`wevtutil`), query processes/services, run PowerShell probes, and capture a full-screen shot of an active desktop session (PowerShell `CopyFromScreen`). You CANNOT click, type into windows, or walk dialogs → all UI rows `blocked (no UI driver)`, visual axis NOT COVERED for this target, said plainly in the report header. Logic/data axes may still partly run through APIs, DB, and logs.

## 3. RDP/VNC window on the controlling Mac (last resort)

If an RDP/VNC client shows the Windows desktop in a macOS window, computer-use can click inside that window. High latency, nested coordinates, flaky text input — a handful of spot-checks only, every such row marked, never called full coverage.

## Choosing

Windows-automation MCP tools present → mode 1/2 (offer the install if the user has a Windows box but hasn't set it up). SSH host in the brief → mode 2, explaining the UI gap. RDP client running → mode 3 spot-checks. Nothing → the environment is unavailable; say exactly that in the wizard.
