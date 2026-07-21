# Driver: windows (honest edition)

There is no built-in way to click Windows UI from a non-Windows host. Do not promise Windows UI testing unless one of these is ACTUALLY connected — probe first, degrade loudly otherwise.

## Mode A — Windows-automation MCP on the target machine (full UI testing)

Open-source MCP servers exist that automate Windows UI via UIAutomation/pywinauto (e.g. projects like `Windows-MCP`). They run **on the Windows machine itself**. Two working topologies:

1. **Claude Code runs on the Windows machine** with such an MCP configured locally → this pipeline runs there natively; screenshots, clicks, element trees all local. Simplest and most reliable.
2. **Remote MCP**: the server runs on Windows exposing HTTP/SSE; your host connects to it over LAN/VPN. Requires the user to install and start it there once. Probe = the MCP's tools are visible in this session.

If mode A is present: loop mirrors desktop-native (screenshot → locate → click → verify), element trees come from the MCP's inspection tools, artifacts follow the standard run-folder contract, serialized access.

## Mode B — SSH only (degraded, no UI)

With just SSH to a Windows host you can: run the app's CLI/tests, read logs and Event Log (`wevtutil`), query processes/services, copy files, run PowerShell probes, even capture a full-screen screenshot of the console session (`psr` or PowerShell `CopyFromScreen` — works only when a desktop session is active).

What you CANNOT do: click, type into windows, walk dialogs. All UI matrix rows → `blocked (no UI driver on Windows)`, the visual axis for this target is NOT COVERED, and the report says so in the header. Logic/data axes may still partially run through APIs, DB, and logs.

## Mode C — RDP/VNC window on the controlling Mac (last resort)

If an RDP/VNC client shows the Windows desktop in a macOS window, computer-use can click inside that window. It works, but coordinates are nested, latency is high, and text input is unreliable — use only for a handful of spot-checks, mark every row driven this way, and never call this full coverage.

## Choosing

Probe order: MCP tools present? → mode A. SSH host in brief? → offer B (explaining the UI gap). RDP client running? → C for spot-checks only. Nothing? The environment is unavailable — say exactly that in the setup menu.
