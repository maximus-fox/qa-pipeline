export const meta = {
  name: 'qa-pipeline',
  description: 'Mean-tester QA: pre-flight → recon → plan → parallel role attack → completeness gate → synth',
  phases: [
    { title: 'Pre-flight' }, { title: 'Recon' }, { title: 'Plan' },
    { title: 'Run' }, { title: 'Gate' }, { title: 'Synth' },
  ],
}
// args = { targets, runFolder, skillDir, personas, mode, repoRoot, dbAccess, redZones, environments,
//          roles, changeScope, language, browserConcurrency, serialRoles }
//   skillDir           — absolute path to this installed skill (roles/drivers/safety live under it)
//   environments       — which drivers are available/chosen this run
//   roles              — which roles to run; wizard names are accepted (see ROLE_ALIASES).
//                        Default: all five (deep/custom) or the smoke set (smoke).
//   changeScope        — optional "focus on what changed" OR a checkpoint row list from a previous
//                        run being resumed; '' = test everything
//   language           — the language the user speaks; wizard, progress and ALL findings/reports
//                        are written in it (code/test files follow the project's conventions)
//   browserConcurrency — max browser-driven roles at once. The ORCHESTRATOR sets this from the host
//                        (SKILL.md → Host-resource guard): ≤8 GB RAM testing localhost → 1..2;
//                        roomy host / remote target → higher. Default 2 = safe on weak hardware.
//   serialRoles        — optional override: roles that must run one-at-a-time (one-seat drivers).
//                        The AUTHORITATIVE list comes from the planner's structured return (it knows
//                        the per-row environment assignment); this arg is merged in as an extra.

// Roles are dispatched by FILE, not by registered agentType — that's what makes the skill portable.
const ALL_ROLES = [
  ['visual-critic', 'visual'], ['logic', 'logic'],
  ['data-paranoid', 'data'], ['attacker', 'attacker'], ['architect', 'architect'],
]
const BROWSERLESS = new Set(['architect'])   // no browser → free to run alongside anything
// Wizard labels ≠ engine slugs — normalize both ways so args.roles never silently empties `chosen`.
const ROLE_ALIASES = {
  'visual': 'visual-critic', 'visual-critic': 'visual-critic', 'ui': 'visual-critic',
  'logic': 'logic', 'journeys': 'logic',
  'data-integrity': 'data-paranoid', 'data': 'data-paranoid', 'data-paranoid': 'data-paranoid',
  'attacker': 'attacker', 'edge-cases': 'attacker',
  'code-audit': 'architect', 'architect': 'architect', 'audit': 'architect',
}
// Smoke = reading roles + ONE writing pass (data-paranoid: persistence proof beats input abuse
// in a quick pass) + the browserless audit. Deep/custom = all five.
const SMOKE_SET = ['visual-critic', 'logic', 'data-paranoid', 'architect']
const requested = (args.roles || []).map(r => ROLE_ALIASES[String(r).toLowerCase().trim()]).filter(Boolean)
const defaultSet = args.mode === 'smoke' ? SMOKE_SET : ALL_ROLES.map(([s]) => s)
const chosenSlugs = requested.length ? requested : defaultSet
const chosen = ALL_ROLES.filter(([slug]) => chosenSlugs.includes(slug))
const browserCap = Math.max(1, args.browserConcurrency || 2)

// Secret hygiene: personas/dbAccess go ONLY to recon (to log in) and planner (to distribute).
// Pre-flight gets a stripped brief (it only curls). Run roles read secrets from qa-plan.md on disk.
const setupBrief = JSON.stringify({ targets: args.targets, runFolder: args.runFolder, skillDir: args.skillDir, repoRoot: args.repoRoot, mode: args.mode, language: args.language, personas: args.personas, dbAccess: args.dbAccess, redZones: args.redZones, environments: args.environments, changeScope: args.changeScope })
const preflightBrief = JSON.stringify({ targets: args.targets, mode: args.mode, personaCount: (args.personas || []).length })
const roleBrief = JSON.stringify({ targets: args.targets, runFolder: args.runFolder, skillDir: args.skillDir, repoRoot: args.repoRoot, mode: args.mode, language: args.language, environments: args.environments })
const synthBrief = JSON.stringify({ runFolder: args.runFolder, skillDir: args.skillDir, mode: args.mode, language: args.language, repoRoot: args.repoRoot })
const inLang = args.language ? ` Write ALL findings/report text in this language: ${args.language} (code, selectors, test files stay in the project's language).` : ''

const role = (slug) => `${args.skillDir}/references/roles/${slug}.md`
const dispatch = (slug, task, opts) =>
  agent(`First read your full role definition at ${role(slug)} and the files it references (drivers under ${args.skillDir}/references/drivers/, ${args.skillDir}/references/safety.md). Then perform this task strictly in that role.${inLang} ${task}`,
    { agentType: 'general-purpose', label: opts.label, phase: opts.phase, schema: opts.schema })

// One run-round with the resource guard baked in:
//  - one-seat roles (from the planner + args.serialRoles) run strictly one after another;
//  - remaining browser roles run in chunks of `browserCap`;
//  - browserless roles ride along with the first chunk (they cost no browser).
// Context hygiene: each role WRITES report-<role>-r<N>.md into runFolder itself and returns only a
// short summary — full reports are read from disk by gate/synth, never pasted into prompts.
let serialSet = new Set(args.serialRoles || [])
async function runRound(roleList, gapText, r) {
  const summaries = []
  const roleTask = (slug, label) =>
    dispatch(slug,
      `Run against the plan${gapText ? ` and this gap from the completeness gate: ${gapText}` : ''}. Brief: ${roleBrief}. Take your persona + DB access from qa-plan.md in runFolder. Use the driver for your row's environment. WRITE your full findings to ${args.runFolder}/report-${slug}-r${r}.md yourself; return only a ≤15-line summary (rows tested/failed/blocked + headline findings).`,
      { label: `${label}#${r}`, phase: 'Run' })
  const oneSeat = roleList.filter(([slug]) => serialSet.has(slug))
  const rest = roleList.filter(([slug]) => !serialSet.has(slug))
  const browser = rest.filter(([slug]) => !BROWSERLESS.has(slug))
  const free = rest.filter(([slug]) => BROWSERLESS.has(slug))
  for (let i = 0; i < Math.max(browser.length, 1); i += browserCap) {
    const chunk = browser.slice(i, i + browserCap)
    const batch = i === 0 ? [...free, ...chunk] : chunk
    if (!batch.length) break
    const res = await parallel(batch.map(([slug, label]) => () => roleTask(slug, label)))
    batch.forEach(([slug], j) => summaries.push({ role: slug, summary: res[j] || null }))
  }
  for (const [slug, label] of oneSeat) {
    const res = await roleTask(slug, label).catch(() => null)
    summaries.push({ role: slug, summary: res })
  }
  return summaries
}

// Pre-flight fast-fail — narrow by design (SKILL.md → Fast-fail):
//  - URL reachability applies ONLY when URL targets exist. Desktop/mobile/app targets have no URL —
//    that is NOT a failure.
//  - Zero personas is a legitimate GUEST run (public surfaces only; planner handles it) — never an
//    abort. Login failures are recon's job, not pre-flight's.
phase('Pre-flight')
const PRE = { type: 'object', properties: { ok: { type: 'boolean' }, reason: { type: 'string' }, guestRun: { type: 'boolean' } }, required: ['ok'] }
const pre = await dispatch('recon',
  `Pre-flight only (do NOT map yet). Brief: ${preflightBrief}. (1) IF any target is a URL: curl -sI --max-time 8 each — alive if any 2xx/3xx/401/403; timeout/ECONNREFUSED = dead. Return {ok:false, reason} ONLY if URL targets exist AND every one of them is dead. Targets that are not URLs (desktop app, mobile app, bot handle) are checked later by their drivers — skip them here. (2) personaCount 0 means a GUEST run (public surfaces only) — set {guestRun:true}, it is NOT a failure. Read-only.`,
  { label: 'preflight', phase: 'Pre-flight', schema: PRE })
if (!pre || !pre.ok) {
  return { aborted: true, reason: (pre && pre.reason) || 'pre-flight failed (all URL targets unreachable)' }
}
if (pre.guestRun) log('Guest run: no personas — public surfaces only, auth-gated rows will be planned as blocked')

phase('Recon')
const map = await dispatch('recon',
  `Map the product. Brief: ${setupBrief}. Use the driver matching each chosen environment (see environments.md; Mini App targets → also references/mini-apps.md). Write qa-map.md into runFolder; return its path + a ≤10-line summary.`,
  { label: 'recon', phase: 'Recon' })

phase('Plan')
const PLAN = {
  type: 'object',
  properties: {
    path: { type: 'string' }, rows: { type: 'number' }, journeys: { type: 'number' },
    serialRoles: { type: 'array', items: { type: 'string' } },  // roles whose rows use one-seat drivers
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['path', 'rows', 'serialRoles'],
}
const plan = await dispatch('planner',
  `Build qa-plan.md from qa-map.md in runFolder (recon summary: ${map}). Brief: ${setupBrief}. Assign role + persona + environment per row. Put personas INSIDE qa-plan.md; if DB access was provided, write the connection secret to {runFolder}/.db_creds (per your role file) and reference it. Return {path, rows, journeys, serialRoles, warnings}: serialRoles = role slugs whose rows sit on one-seat drivers (real-chrome / desktop-native / mobile) — they will be serialized.`,
  { label: 'planner', phase: 'Plan', schema: PLAN })
if (plan && plan.serialRoles) plan.serialRoles.forEach(s => serialSet.add(ROLE_ALIASES[s] || s))

phase('Run')
const maxRounds = args.mode === 'smoke' ? 1 : 3
const GATE = {
  type: 'object',
  properties: {
    complete: { type: 'boolean' },
    gap: { type: 'string' },                                   // '' when complete
    roles: { type: 'array', items: { type: 'string' } },       // ONLY roles with follow-up work; may include 'recon'
  },
  required: ['complete', 'gap', 'roles'],
}
let allSummaries = []
let gapText = ''            // round 0 = full plan, later rounds = the gate's gap
let gateRoles = chosen      // later rounds re-run only the roles the gate names
let lastVerdict = null
for (let r = 0; r < maxRounds; r++) {
  const summaries = await runRound(gateRoles, gapText, r)
  allSummaries = allSummaries.concat(summaries.map(s => ({ ...s, round: r })))
  log(`Round ${r + 1}/${maxRounds} done: ${summaries.map(s => s.role).join(', ')}`)

  phase('Gate')
  lastVerdict = await dispatch('completeness-gate',
    `Judge run completeness. Brief: ${synthBrief}. Read qa-plan.md, qa-map.md and every report-*.md from runFolder (round summaries: ${JSON.stringify(summaries)}). "complete" ONLY if every earlier gap you raised came back with evidence AND a fresh sweep finds nothing new. Return {complete, gap, roles}: gap = '' and roles = [] when complete; otherwise a concrete gap and ONLY the role slugs that must act on it ('recon' allowed for map gaps).`,
    { label: `gate#${r}`, phase: 'Gate', schema: GATE })
  if (!lastVerdict || lastVerdict.complete || !lastVerdict.gap) break

  gapText = lastVerdict.gap
  const named = (lastVerdict.roles || []).map(s => ROLE_ALIASES[s] || s)
  // Map gaps route to recon: refresh qa-map.md BEFORE the follow-up round, still within this loop.
  if (named.includes('recon')) {
    await dispatch('recon',
      `Update qa-map.md in runFolder to close this map gap (do not re-map everything): ${gapText}. Brief: ${setupBrief}.`,
      { label: `recon#${r + 1}`, phase: 'Gate' })
  }
  const runNamed = chosen.filter(([slug]) => named.includes(slug))
  if (!runNamed.length) {
    // Gate named nobody actionable (only recon, or unknown slugs) → nothing to re-run; do NOT
    // fall back to the whole fleet. The refreshed map (if any) is judged next round via gate.
    if (!named.includes('recon')) break
    gateRoles = []
    continue
  }
  gateRoles = runNamed
}

phase('Synth')
const report = await dispatch('synth',
  `Build report.md + regression tests (MUST sanitize tokens/secrets in e2e files) + the structured recommendations-menu candidate list per your role file (grouped, with counts/severity — the orchestrator has a 4-questions × 4-options, multiSelect menu budget). Brief: ${synthBrief}. Read qa-map.md, qa-plan.md and every report-*.md from runFolder (do not rely on summaries alone). Gate's final verdict: ${JSON.stringify(lastVerdict)}. Return the report.md path and the menu candidates.`,
  { label: 'synth', phase: 'Synth' })

return { report, rounds: allSummaries.length ? Math.max(...allSummaries.map(s => s.round)) + 1 : 0, note: 'Recommendations menu (AskUserQuestion, multiSelect) is raised by the caller after the workflow returns — sub-agents do not ask interactive questions.' }
