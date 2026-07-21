export const meta = {
  name: 'qa-pipeline',
  description: 'Mean-tester QA: pre-flight → recon → plan → parallel role attack → completeness gate → synth',
  phases: [
    { title: 'Pre-flight' }, { title: 'Recon' }, { title: 'Plan' },
    { title: 'Run' }, { title: 'Gate' }, { title: 'Synth' },
  ],
}
// args = { targets, runFolder, skillDir, personas, mode, repoRoot, dbAccess, redZones, environments, roles, changeScope }
//   skillDir     — absolute path to this installed skill (roles/drivers/safety live under it)
//   environments — which drivers are available/chosen this run (['browser-devtools','real-chrome','mobile','windows',...])
//   roles        — which roles to run (defaults to all five below)
//   changeScope  — optional "focus on what changed" (git base ref, changed paths, or a feature area); '' = test everything

// Roles are dispatched by FILE, not by registered agentType — that's what makes the skill portable.
// Each sub-agent is told to first read its role definition, then act. If the host has a matching
// registered sub-agent it may be used instead, but the files under references/roles/ are the source of truth.
const ALL_ROLES = [
  ['visual-critic', 'visual'], ['logic', 'logic'],
  ['data-paranoid', 'data'], ['attacker', 'attacker'], ['architect', 'architect'],
]
const chosen = args.roles && args.roles.length
  ? ALL_ROLES.filter(([slug]) => args.roles.includes(slug))
  : ALL_ROLES

// Secret hygiene: personas/dbAccess go ONLY to recon (to log in) and planner (to distribute). Run roles
// read their persona + DB access from qa-plan.md on disk in runFolder, never from args/logs.
const setupBrief = JSON.stringify({ targets: args.targets, runFolder: args.runFolder, skillDir: args.skillDir, repoRoot: args.repoRoot, mode: args.mode, personas: args.personas, dbAccess: args.dbAccess, redZones: args.redZones, environments: args.environments, changeScope: args.changeScope })
const roleBrief = JSON.stringify({ targets: args.targets, runFolder: args.runFolder, skillDir: args.skillDir, mode: args.mode, environments: args.environments })
const synthBrief = JSON.stringify({ runFolder: args.runFolder, skillDir: args.skillDir, mode: args.mode, repoRoot: args.repoRoot })

// dispatch(roleSlug, task, opts): read the role file, then do the task.
const role = (slug) => `${args.skillDir}/references/roles/${slug}.md`
const dispatch = (slug, task, opts) =>
  agent(`First read your full role definition at ${role(slug)} and the files it references (drivers under ${args.skillDir}/references/drivers/, ${args.skillDir}/references/safety.md). Then perform this task strictly in that role. ${task}`,
    { agentType: 'general-purpose', label: opts.label, phase: opts.phase, schema: opts.schema })

// Pre-flight fast-fail: URL reachability + personas present. Done by an agent (no Bash in JS).
phase('Pre-flight')
const PRE = { type: 'object', properties: { ok: { type: 'boolean' }, reason: { type: 'string' } }, required: ['ok'] }
const pre = await dispatch('recon',
  `Pre-flight only (do NOT map yet). Brief: ${setupBrief}. (1) curl -sI --max-time 8 each URL target — alive if any 2xx/3xx/401/403; timeout/ECONNREFUSED = dead. (2) confirm personas is a non-empty array OR the mode is a guest smoke. Return {ok:false, reason} if every URL is dead OR (personas empty AND not guest smoke); else {ok:true}. Read-only.`,
  { label: 'preflight', phase: 'Pre-flight', schema: PRE })
if (!pre || !pre.ok) {
  return { aborted: true, reason: (pre && pre.reason) || 'pre-flight failed (target unreachable or no personas)' }
}

phase('Recon')
const map = await dispatch('recon',
  `Map the product. Brief: ${setupBrief}. Use the driver matching each chosen environment (see environments.md). Write qa-map.md into runFolder; return its path + a summary.`,
  { label: 'recon', phase: 'Recon' })

phase('Plan')
const plan = await dispatch('planner',
  `Build qa-plan.md from the map: ${map}. Brief: ${setupBrief}. Assign role + persona + environment per row. Put personas and DB access INSIDE qa-plan.md (roles read them from there, not from args).`,
  { label: 'planner', phase: 'Plan' })

phase('Run')
const maxRounds = args.mode === 'deep' ? 3 : 1
const rounds = []
let dryStreak = 0, gap = plan
// "Dry" = TWO consecutive rounds with nothing new. dryStreak counts consecutive complete verdicts.
for (let r = 0; r < maxRounds && dryStreak < 2; r++) {
  const found = await parallel(chosen.map(([slug, label]) => () =>
    dispatch(slug,
      `Run against the plan/gap: ${gap}. Brief: ${roleBrief}. Take your persona + DB access from qa-plan.md in runFolder. Use the driver for your row's environment.`,
      { label: `${label}#${r}`, phase: 'Run' })))
  const labelled = chosen.map(([, label], i) => ({ role: label, output: found[i] || null }))
  rounds.push(labelled)

  phase('Gate')
  const verdict = await dispatch('completeness-gate',
    `Judge run completeness. Brief: ${synthBrief}. Round outputs (role-labelled): ${JSON.stringify(rounds)}. Plan: ${plan}. Read the matrix and per-role reports from runFolder. Return {complete, gap} (gap required: empty string if no gaps).`,
    { label: `gate#${r}`, phase: 'Gate',
      schema: { type: 'object', properties: { complete: { type: 'boolean' }, gap: { type: 'string' } }, required: ['complete', 'gap'] } })
  if (!verdict || verdict.complete || !verdict.gap) { dryStreak++ } else { dryStreak = 0; gap = verdict.gap }
}

phase('Synth')
// synth builds report.md + regression tests (SANITIZE tokens in e2e files) + the menu-candidate list.
// AskUserQuestion is NOT called here — the caller (orchestrator) raises the menu after the workflow returns.
const report = await dispatch('synth',
  `Build report.md + regression tests (MUST sanitize tokens/secrets in e2e files) + a structured recommendations-menu candidate list. Brief: ${synthBrief}. Role outputs: ${JSON.stringify(rounds)}. Read per-role reports from runFolder. Return the report.md path and the menu candidates.`,
  { label: 'synth', phase: 'Synth' })

return { report, rounds: rounds.length, note: 'Recommendations menu (AskUserQuestion) is raised by the caller after the workflow returns — sub-agents do not ask interactive questions.' }
