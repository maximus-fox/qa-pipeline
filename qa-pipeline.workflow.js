export const meta = {
  name: 'qa-pipeline',
  description: 'Конвейер «Злой тестировщик»: pre-flight → разведка → план → прогон ролями параллельно → ворота полноты → сборка',
  phases: [
    { title: 'Pre-flight' }, { title: 'Разведка' }, { title: 'План' },
    { title: 'Прогон' }, { title: 'Ворота' }, { title: 'Сборка' },
  ],
}
// args = { baseUrl, runFolder, identities, mode, repoRoot, dbAccess, redZones }

// Проекции брифа (минимизация утечки секретов в логи): identities/dbAccess идут ТОЛЬКО тем, кому нужны
// для входа/назначения (recon — чтобы залогиниться; planner — чтобы распределить). Роли прогона читают
// свою личность и доступ к БД из qa-plan.md (на диске в runFolder), а не из аргументов/логов.
const reconBrief = JSON.stringify({ baseUrl: args.baseUrl, runFolder: args.runFolder, repoRoot: args.repoRoot, mode: args.mode, identities: args.identities, dbAccess: args.dbAccess, redZones: args.redZones })
const plannerBrief = reconBrief
const roleBrief = JSON.stringify({ baseUrl: args.baseUrl, runFolder: args.runFolder, mode: args.mode })
const synthBrief = JSON.stringify({ runFolder: args.runFolder, mode: args.mode, repoRoot: args.repoRoot })

// Pre-flight fast-fail (§5.9): доступность URL + наличие тест-личностей. Делает агент (в JS нет Bash).
phase('Pre-flight')
const PRE = { type: 'object', properties: { ok: { type: 'boolean' }, reason: { type: 'string' } }, required: ['ok'] }
const pre = await agent(
  `Pre-flight проверка перед QA-прогоном. Бриф: ${reconBrief}. Сделай: (1) curl -sI --max-time 8 к baseUrl — отвечает ли (любой 2xx/3xx/401/403 = жив; таймаут/ECONNREFUSED = мёртв); (2) проверь, что identities — непустой массив. Верни {ok:false, reason} если URL мёртв ИЛИ личностей 0; иначе {ok:true}. Это read-only проверка.`,
  { agentType: 'qa-recon', label: 'preflight', phase: 'Pre-flight', schema: PRE })
if (!pre || !pre.ok) {
  return { aborted: true, reason: (pre && pre.reason) || 'pre-flight не прошёл (URL недоступен или нет тест-личностей)' }
}

phase('Разведка')
const map = await agent(`Разведай продукт. Бриф: ${reconBrief}. Запиши qa-map.md в runFolder, верни путь + сводку.`,
  { agentType: 'qa-recon', label: 'recon' })
phase('План')
const plan = await agent(`Построй qa-plan.md из карты: ${map}. Бриф: ${plannerBrief}. Тест-личности и доступ к БД пропиши внутри qa-plan.md (роли прочитают оттуда, а не из аргументов).`,
  { agentType: 'qa-planner', label: 'planner' })

phase('Прогон')
const ROLES = [
  ['qa-visual-critic', 'visual'], ['qa-logic', 'logic'],
  ['qa-data-paranoid', 'data'], ['qa-attacker', 'attacker'], ['qa-architect', 'architect'],
]
const maxRounds = args.mode === 'deep' ? 3 : 1
const rounds = []
let dryStreak = 0, gap = plan
// «Сухо» = ДВА круга подряд без новых находок (§4.8/§5.9). dryStreak считает подряд идущие «полные» вердикты.
for (let r = 0; r < maxRounds && dryStreak < 2; r++) {
  const found = await parallel(ROLES.map(([t, l]) => () =>
    agent(`Прогон по плану/гэпу: ${gap}. Бриф: ${roleBrief}. Свою тест-личность и доступ к БД возьми из qa-plan.md в runFolder.`,
      { agentType: t, label: `${l}#${r}`, phase: 'Прогон' })))
  // Сохраняем привязку вывод↔роль даже при частичном провале (output:null = роль упала) — gate/synth видят, кто что дал.
  const labelled = ROLES.map(([t, l], i) => ({ role: l, output: found[i] || null }))
  rounds.push(labelled)
  phase('Ворота')
  const verdict = await agent(
    `Оцени полноту прогона. Бриф: ${synthBrief}. Выводы ролей по кругам (с метками роли): ${JSON.stringify(rounds)}. План: ${plan}. Матрицу и роль-отчёты читай из runFolder. Верни {complete, gap} (gap обязателен: если пробелов нет — пустая строка).`,
    { agentType: 'qa-completeness-gate', label: `gate#${r}`, phase: 'Ворота',
      schema: { type: 'object', properties: { complete: { type: 'boolean' }, gap: { type: 'string' } }, required: ['complete', 'gap'] } })
  // Полно ИЛИ нет gap → засчитываем «сухой» круг. Иначе сбрасываем streak и идём по новому gap.
  if (!verdict || verdict.complete || !verdict.gap) { dryStreak++ } else { dryStreak = 0; gap = verdict.gap }
}

phase('Сборка')
// qa-synth собирает report.md + регресс-тесты (с САНИТИЗАЦИЕЙ токенов) + СПИСОК кандидатов меню.
// AskUserQuestion НЕ вызывается здесь: субагент не задаёт интерактивных вопросов. Меню поднимает
// вызывающий (дирижёр / основной агент) после возврата воркфлоу, используя кандидатов из отчёта.
const report = await agent(
  `Собери report.md + регресс-тесты (ОБЯЗАТЕЛЬНО санитизируй токены/секреты в e2e-файлах) + структурированный список кандидатов меню рекомендаций. Бриф: ${synthBrief}. Выводы ролей: ${JSON.stringify(rounds)}. Роль-отчёты читай из runFolder. Верни путь к report.md и кандидатов меню.`,
  { agentType: 'qa-synth', label: 'synth', phase: 'Сборка' })
return { report, rounds: rounds.length, note: 'Меню рекомендаций (AskUserQuestion) поднимает вызывающий после возврата воркфлоу — субагенты интерактивные вопросы не задают.' }
