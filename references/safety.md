# Safety

Applies to every role, every environment.

- **Test personas only.** Everything created is prefixed "TEST" and logged for cleanup.
- **No irreversible actions, ever** — even under test: real payments, real sends/notifications to real people, mass-delete, tariff changes on a real business, anything in the brief's red zones.
- **Phases 1–4 are read-only toward the PRODUCT.** Roles do not mutate the project's code, prod data, or DB. Bash/SSH/DB against the project is read-only (SELECT, GET, file reads) — no Edit/Write to sources, no POST/PUT/DELETE and no DB writes outside a test persona.
  - **Writing artifacts to the run folder is allowed** and is not a violation: roles write their own scratch files (`qa-map.md`, `qa-plan.md`, screenshots, `report-<role>.md`) under the run folder via Bash. That's scratch, not product.
  - **synth is the only role that writes into the project repo** — new files under `e2e/` — and, only on explicit menu choice, deletes TEST data. Nothing else writes to the repo or prod data.
- **Real-profile drivers (real-chrome, desktop-native, android-adb) run against the user's real machine/accounts.** Extra caution: touch only the target app / the tabs you opened, never other sessions, settings, or people's data. Anything the user must do personally (log in, 2FA, grant a permission) — ask in chat and wait; never handle their credentials.
- **SSH etiquette:** max ~3 consecutive connections, then pause; batch queries. Many hosts run fail2ban and ban after a few rapid connections.
- **Prohibited-action classes stay prohibited even if the app offers them**: entering payment details/credentials, completing CAPTCHAs, changing security/system settings, deleting real data. If a flow requires one, the row is `blocked (red zone)`.
