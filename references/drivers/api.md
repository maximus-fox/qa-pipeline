# Driver: api (UI-less targets — API services, bot backends)

For targets with no screen: REST/GraphQL services, webhook handlers, bot backends. The "click" is a
request; the "screenshot" is a saved request/response transcript. Always available — needs only
Bash with `curl` (or `httpie` when present).

## Loop

1. **Auth**: from the persona's block in `qa-plan.md` — a token/header/cookie, never an interactive
   login. "Persona logs in" for this driver means: an authenticated probe request (e.g. `GET /me`)
   returns 2xx. That probe IS the login check recon runs.
2. **Request** with full evidence capture:
   ```bash
   curl -sS -w '\n%{http_code} %{time_total}s\n' -H "Authorization: Bearer $TOK" \
     -X POST "$BASE/orders" -d @payload.json -o body.json
   ```
3. **Persist evidence**: each covered row saves `<NN>-<endpoint>-<case>.txt` into the run folder —
   the request (method, URL, headers minus secrets, body) and the response (status, time, body).
   This transcript is this driver's screenshot: a row is `tested` only if its transcript exists.
4. **Verify state** where the row demands it (data-paranoid): follow-up GET and/or SQL SELECT.

## What each role does here

- **recon**: route tree from code/OpenAPI/docs + a live probe per route family (GET-only) → map.
- **logic**: request sequences (create → process → fetch), cross-actor visibility, idempotency keys.
- **data-paranoid**: response claims vs DB rows; double-POST twins; privilege swaps on IDs in paths.
- **attacker**: malformed bodies, wrong content-types, oversized payloads, missing/forged auth,
  unexpected verbs — through the API's own contract; no DoS, no infrastructure attacks.
- **visual-critic**: NOT COVERED — stated in the report, never silently skipped.

## Rules

Rate-limit yourself (the SSH etiquette of `references/safety.md` applies in spirit: batch, pause,
never hammer). Red zones apply to endpoints exactly as to buttons — a `DELETE /users/{id}` row on a
real user is `blocked (red zone)`. Mutations only under the test persona, "TEST" markers in payloads
where the schema allows, everything logged for cleanup.

## Degradation

No auth token in the brief → guest requests only; auth-gated routes `blocked (no persona)`. No DB
access → data axis degrades loudly per `roles/data-paranoid.md`.
