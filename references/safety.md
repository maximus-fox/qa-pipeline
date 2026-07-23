# Safety

Applies to every role, every environment.

- **Test personas only.** Everything created is prefixed "TEST" and logged for cleanup.
- **No irreversible actions, ever** — even under test: real payments, real sends/notifications to real people, mass-delete, tariff changes on a real business, anything in the brief's red zones.
- **Phases 1–4 never touch the project's CODE or existing data.** Precisely:
  - **Code**: no Edit/Write to sources, ever. Direct DB access is SELECT-only. SSH/Bash against the project is read-only.
  - **App data**: the writing roles (data-paranoid, attacker) DO create/modify app data — that is their job — but ONLY through the app's own UI/API, ONLY under a test persona, prefixed "TEST", logged for cleanup, and never in a red zone. A form submit by a test persona is legitimate testing; a direct `INSERT`/`UPDATE` in the DB is not.
  - **Run folder is scratch**: roles write their own artifacts there (`qa-map.md`, `qa-plan.md`, screenshots, `report-<role>-r<N>.md`, `.db_creds` by planner) — never a violation.
  - **synth is the only role that writes into the project repo** — new files under the project's test dir — and, only on explicit menu choice, deletes TEST data. After the recommendations menu, a user-authorized fix phase may modify code — that's outside Phases 1–4 and gated by the user's explicit selection.
- **Real-profile drivers (real-chrome, desktop-native, mobile) run against the user's real machine/accounts.** Extra caution: touch only the target app / the tabs you opened, never other sessions, settings, or people's data. Anything the user must do personally (log in, 2FA, grant a permission) — ask in chat and wait; never handle their credentials.
- **SSH etiquette:** max ~3 consecutive connections, then pause; batch queries. Many hosts run fail2ban and ban after a few rapid connections.
- **Prohibited-action classes stay prohibited even if the app offers them**: entering payment details/credentials, completing CAPTCHAs, changing security/system settings, deleting real data. If a flow requires one, the row is `blocked (red zone)`.
