export const meta = {
  name: 'qa-pipeline',
  description: 'Mean-tester QA: pre-flight → recon → plan → parallel role attack → completeness gate → synth',
  phases: [
    { title: 'Pre-flight' }, { title: 'Recon' }, { title: 'Plan' },
    { title: 'Run' }, { title: 'Gate' }, { title: 'Synth' },
  ],
}
// args = { targets, runFolder, skillDir, personas, mode, repoRoot, dbAccess, redZones, environments,
//          roles, changeScope, browserConcurrency, serialRoles }
//   skillDir           — absolute path to this installed skill (roles/drivers/safety live under it)
//   environments       — which drivers are available/chosen this run
//   roles              — which roles to run (defaults to all five below)
//   changeScope        — optional "focus on what changed"; '' = test everything
//   browserConcurrency — max browser-driven roles at once. The ORCHESTRATOR sets this from the host
//                        (SKILL.md → Host-resource guard): ≤8 GB RAM testing localhost → 1..2;
//                        roomy host / remote target → higher. Default 2 = safe on weak hardware.
//   serialRoles        — roles whose rows use a one-seat driver (real-chrome / desktop-native /
//                        mobile). One Chrome profile / one screen / one phone — these roles must
//                        never run concurrently with each other. Orchestrator reads this from the
//                        planner's per-role environment assignment.

// Roles are dispatched by FILE, not by registered agentType — that's what makes the skill portable.
const ALL_ROLES = [
  ['visual-critic', 'visual'], ['logic', 'logic'],
  ['data-paranoid', 'data'], ['attacker', 'attacker'], ['architect', 'architect'],
]
const BROWSERLESS = new Set(['architect'])   // no browser → free to run alongside anything
const chosen = args.roles && args.roles.length
  ? ALL_ROLES.filter(([slug]) => args.roles.includes(slug))
  : ALL_ROLES
const browserCap = Math.max(1, args.browserConcurrency || 2)
const serialSet = new Set(args.serialRoles || [])

// Secret hygiene: personas/dbAccess go ONLY to recon (to log in) and planner (to distribute).
// Pre-flight gets a stripped brief (it only curls). Run roles read secrets from qa-plan.md on disk.
const setupBrief = JSON.stringify({ targets: args.targets, runFolder: args.runFolder, skillDir: args.skillDir, repoRoot: args.repoRoot, mode: args.mode, personas: args.personas, dbAccess: args.dbAccess, redZones: args.redZones, environments: args.environments, changeScope: args.changeScope })
const preflightBrief = JSON.stringify({ targets: args.targets, mode: args.mode, personaCount: (args.personas || []).length })
const roleBrief = JSON.stringify({ targets: args.targets, runFolder: args.runFolder, skillDir: args.skillDir, mode: args.mode, environments: args.environments })
const synthBrief = JSON.stringify({ runFolder: args.runFolder, skillDir: args.skillDir, mode: args.mode, repoRoot: args.repoRoot })

const role = (slug) => `${args.skillDir}/references/roles/${slug}.md`
const dispatch = (slug, task, opts) =>
  agent(`First read your full role definition at ${role(slug)} and the files it references (drivers under ${args.skillDir}/references/drivers/, ${args.skillDir}/references/safety.md). Then perform this task strictly in that role. ${task}`,
    { agentType: 'general-purpose', label: opts.label, phase: opts.phase, schema: opts.schema })

// One run-round with the resource guard baked in:
//  - one-seat roles (serialRoles) run strictly one after another;
//  - remaining browser roles run in chunks of `browserCap`;
//  - browserless roles ride along with the first chunk (they cost no browser).
// Context hygiene: each role WRITES report-<role>-r<N>.md into runFolder itself and returns only a
// short summary — full reports are read from disk by gate/synth, never pasted into prompts.
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

// Pre-flight fast-fail: URL reachability + personas present. No secrets in this brief.
phase('Pre-flight')
const PRE = { type: 'object', properties: { ok: { type: 'boolean' }, reason: { type: 'string' } }, required: ['ok'] }
const pre = await dispatch('recon',
  `Pre-flight only (do NOT map yet). Brief: ${preflightBrief}. (1) curl -sI --max-time 8 each URL target — alive if any 2xx/3xx/401/403; timeout/ECONNREFUSED = dead. (2) confirm personaCount > 0 OR the mode is a guest smoke. Return {ok:false, reason} if every URL is dead OR (personaCount 0 AND not guest smoke); else {ok:true}. Read-only.`,
  { label: 'preflight', phase: 'Pre-flight', schema: PRE })
if (!pre || !pre.ok) {
  return { aborted: true, reason: (pre && pre.reason) || 'pre-flight failed (target unreachable or no personas)' }
}

phase('Recon')
const map = await dispatch('recon',
  `Map the product. Brief: ${setupBrief}. Use the driver matching each chosen environment (see environments.md; Mini App targets → also references/mini-apps.md). Write qa-map.md into runFolder; return its path + a ≤10-line summary.`,
  { label: 'recon', phase: 'Recon' })

phase('Plan')
const plan = await dispatch('planner',
  `Build qa-plan.md from qa-map.md in runFolder (recon summary: ${map}). Brief: ${setupBrief}. Assign role + persona + environment per row. Put personas and DB access INSIDE qa-plan.md (roles read them from there, not from args). Return path + row/journey counts + warnings only.`,
  { label: 'planner', phase: 'Plan' })

phase('Run')
const maxRounds = args.mode === 'deep' ? 3 : 1
const GATE = {
  type: 'object',
  properties: {
    complete: { type: 'boolean' },
    gap: { type: 'string' },                                   // '' when complete
    roles: { type: 'array', items: { type: 'string' } },       // ONLY roles with follow-up work
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

  phase('Gate')
  lastVerdict = await dispatch('completeness-gate',
    `Judge run completeness. Brief: ${synthBrief}. Read qa-plan.md, qa-map.md and every report-*.md from runFolder (round summaries: ${JSON.stringify(summaries)}). "complete" ONLY if every earlier gap you raised came back with evidence AND a fresh sweep finds nothing new. Return {complete, gap, roles}: gap = '' and roles = [] when complete; otherwise a concrete gap and ONLY the role slugs that must act on it.`,
    { label: `gate#${r}`, phase: 'Gate', schema: GATE })
  if (!lastVerdict || lastVerdict.complete || !lastVerdict.gap) break
  gapText = lastVerdict.gap
  const named = (lastVerdict.roles || []).filter(s => chosen.some(([slug]) => slug === s))
  gateRoles = named.length ? chosen.filter(([slug]) => named.includes(slug)) : chosen
}

phase('Synth')
const report = await dispatch('synth',
  `Build report.md + regression tests (MUST sanitize tokens/secrets in e2e files) + a structured recommendations-menu candidate list. Brief: ${synthBrief}. Read qa-map.md, qa-plan.md and every report-*.md from runFolder (do not rely on summaries alone). Gate's final verdict: ${JSON.stringify(lastVerdict)}. Return the report.md path and the menu candidates.`,
  { label: 'synth', phase: 'Synth' })

return { report, rounds: allSummaries.length ? Math.max(...allSummaries.map(s => s.round)) + 1 : 0, note: 'Recommendations menu (AskUserQuestion) is raised by the caller after the workflow returns — sub-agents do not ask interactive questions.' }
