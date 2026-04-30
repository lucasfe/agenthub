// Pure helpers for the Task Templates feature.
//
// No I/O, no Supabase. Anything that needs to talk to the network
// belongs in `./templatesApi.js`. Keeping this module side-effect-free
// is what lets every consumer (BoardPage, TemplatesPage, AgentDetailPage,
// future re-plan flows) trust the snapshot semantics.

const ACTIVE_STATUSES = new Set(['todo', 'planning', 'awaiting_approval', 'executing'])

function planHasSteps(plan) {
  return Boolean(plan && Array.isArray(plan.steps) && plan.steps.length > 0)
}

function deepCopy(value) {
  if (value == null) return value
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

export function cloneTemplateToTask(template) {
  const plan = template?.plan ?? null
  const clonedPlan = plan == null ? null : deepCopy(plan)
  const status = planHasSteps(clonedPlan) ? 'awaiting_approval' : 'todo'
  return {
    title: template?.task_title ?? '',
    description: template?.task_description ?? '',
    status,
    plan: clonedPlan,
    run_id: null,
    error_message: null,
    artifacts: [],
  }
}

function collectAgentIds(plan) {
  if (!plan || !Array.isArray(plan.steps)) return []
  return plan.steps
    .map((step) => step?.agent_id)
    .filter((id) => typeof id === 'string' && id.length > 0)
}

function collectToolIds(plan) {
  if (!plan || !Array.isArray(plan.steps)) return []
  const ids = []
  for (const step of plan.steps) {
    const tools = Array.isArray(step?.tools_used) ? step.tools_used : []
    for (const tool of tools) {
      if (typeof tool === 'string' && tool.length > 0) ids.push(tool)
    }
  }
  return ids
}

function uniqueMissing(ids, knownSet) {
  const missing = new Set()
  for (const id of ids) {
    if (!knownSet.has(id)) missing.add(id)
  }
  return Array.from(missing)
}

function toIdSet(catalog) {
  if (!Array.isArray(catalog)) return new Set()
  return new Set(catalog.map((entry) => entry?.id).filter(Boolean))
}

export function findMissingAgents(plan, agentsCatalog) {
  return uniqueMissing(collectAgentIds(plan), toIdSet(agentsCatalog))
}

export function findMissingTools(plan, toolsCatalog) {
  return uniqueMissing(collectToolIds(plan), toIdSet(toolsCatalog))
}

function planReferencesAgent(plan, agentId) {
  if (!plan || !Array.isArray(plan.steps)) return false
  return plan.steps.some((step) => step?.agent_id === agentId)
}

export function findReferencingTemplates(agentId, templates) {
  if (!Array.isArray(templates)) return []
  return templates.filter((tpl) => planReferencesAgent(tpl?.plan, agentId))
}

export function findReferencingActiveTasks(agentId, tasks) {
  if (!Array.isArray(tasks)) return []
  return tasks.filter(
    (task) => ACTIVE_STATUSES.has(task?.status) && planReferencesAgent(task?.plan, agentId),
  )
}
