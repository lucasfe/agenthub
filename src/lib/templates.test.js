import { describe, it, expect } from 'vitest'
import {
  cloneTemplateToTask,
  findMissingAgents,
  findMissingTools,
  findReferencingTemplates,
  findReferencingActiveTasks,
} from './templates'

const samplePlan = () => ({
  steps: [
    {
      id: 1,
      agent_id: 'frontend-developer',
      agent_name: 'Frontend Developer',
      task: 'Build the form',
      requirements: [{ key: 'form_name', value: '' }],
      tools_used: ['create_github_issue'],
    },
    {
      id: 2,
      agent_id: 'backend-developer',
      agent_name: 'Backend Developer',
      task: 'Wire the endpoint',
      requirements: [],
      tools_used: [],
    },
  ],
})

const sampleTemplate = (overrides = {}) => ({
  id: 'tpl-1',
  name: 'Form ticket',
  description: 'A reusable form-building template',
  task_title: 'Add a new form',
  task_description: 'Build form X with fields A, B, C',
  plan: samplePlan(),
  ...overrides,
})

describe('cloneTemplateToTask', () => {
  it('produces a row ready for INSERT INTO tasks with awaiting_approval status when plan is present', () => {
    const row = cloneTemplateToTask(sampleTemplate())
    expect(row.title).toBe('Add a new form')
    expect(row.description).toBe('Build form X with fields A, B, C')
    expect(row.status).toBe('awaiting_approval')
    expect(row.plan).toEqual(samplePlan())
    expect(row.error_message).toBeNull()
    expect(row.artifacts).toEqual([])
    expect(row.run_id).toBeNull()
  })

  it('produces a todo task with a null plan when the template has no plan', () => {
    const row = cloneTemplateToTask(sampleTemplate({ plan: null }))
    expect(row.status).toBe('todo')
    expect(row.plan).toBeNull()
  })

  it('treats a plan with an empty steps array as no-plan and lands the task in todo', () => {
    const row = cloneTemplateToTask(sampleTemplate({ plan: { steps: [] } }))
    expect(row.status).toBe('todo')
    expect(row.plan).toEqual({ steps: [] })
  })

  it('deep-copies the plan so callers cannot mutate the template via the cloned row', () => {
    const tpl = sampleTemplate()
    const row = cloneTemplateToTask(tpl)
    row.plan.steps[0].task = 'mutated'
    expect(tpl.plan.steps[0].task).toBe('Build the form')
  })

  it('does not include id/created_at/updated_at in the inserted row shape', () => {
    const row = cloneTemplateToTask(sampleTemplate())
    expect(row).not.toHaveProperty('id')
    expect(row).not.toHaveProperty('created_at')
    expect(row).not.toHaveProperty('updated_at')
  })
})

describe('findMissingAgents', () => {
  const catalog = [
    { id: 'frontend-developer' },
    { id: 'backend-developer' },
  ]

  it('returns [] when plan is null', () => {
    expect(findMissingAgents(null, catalog)).toEqual([])
  })

  it('returns [] when plan has no steps', () => {
    expect(findMissingAgents({ steps: [] }, catalog)).toEqual([])
  })

  it('returns [] when every step references a known agent', () => {
    expect(findMissingAgents(samplePlan(), catalog)).toEqual([])
  })

  it('returns the missing agent ids when some steps reference unknown agents', () => {
    const plan = {
      steps: [
        { id: 1, agent_id: 'frontend-developer' },
        { id: 2, agent_id: 'ghost-agent' },
        { id: 3, agent_id: 'phantom-agent' },
      ],
    }
    expect(findMissingAgents(plan, catalog).sort()).toEqual(['ghost-agent', 'phantom-agent'])
  })

  it('deduplicates missing agent ids', () => {
    const plan = {
      steps: [
        { id: 1, agent_id: 'ghost-agent' },
        { id: 2, agent_id: 'ghost-agent' },
      ],
    }
    expect(findMissingAgents(plan, catalog)).toEqual(['ghost-agent'])
  })

  it('tolerates a null catalog by treating every agent as missing', () => {
    expect(findMissingAgents(samplePlan(), null).sort()).toEqual([
      'backend-developer',
      'frontend-developer',
    ])
  })
})

describe('findMissingTools', () => {
  const catalog = [
    { id: 'create_github_issue' },
    { id: 'list_github_repos' },
  ]

  it('returns [] when plan is null or has no steps', () => {
    expect(findMissingTools(null, catalog)).toEqual([])
    expect(findMissingTools({ steps: [] }, catalog)).toEqual([])
  })

  it('returns [] when every step references known tools', () => {
    expect(findMissingTools(samplePlan(), catalog)).toEqual([])
  })

  it('returns the missing tool ids when some steps reference unknown tools', () => {
    const plan = {
      steps: [
        { id: 1, tools_used: ['create_github_issue', 'ghost_tool'] },
        { id: 2, tools_used: ['phantom_tool'] },
      ],
    }
    expect(findMissingTools(plan, catalog).sort()).toEqual(['ghost_tool', 'phantom_tool'])
  })

  it('deduplicates missing tool ids', () => {
    const plan = {
      steps: [
        { id: 1, tools_used: ['ghost_tool'] },
        { id: 2, tools_used: ['ghost_tool'] },
      ],
    }
    expect(findMissingTools(plan, catalog)).toEqual(['ghost_tool'])
  })

  it('skips steps without a tools_used array', () => {
    const plan = {
      steps: [
        { id: 1, agent_id: 'a' },
        { id: 2, tools_used: undefined },
      ],
    }
    expect(findMissingTools(plan, catalog)).toEqual([])
  })
})

describe('findReferencingTemplates', () => {
  const templates = [
    sampleTemplate({ id: 'tpl-a', name: 'A' }),
    sampleTemplate({
      id: 'tpl-b',
      name: 'B',
      plan: { steps: [{ id: 1, agent_id: 'qa-engineer' }] },
    }),
    sampleTemplate({ id: 'tpl-c', name: 'C', plan: null }),
  ]

  it('returns templates whose plan references the given agent_id', () => {
    const result = findReferencingTemplates('frontend-developer', templates)
    expect(result.map((t) => t.id)).toEqual(['tpl-a'])
  })

  it('returns [] when no template references the agent', () => {
    expect(findReferencingTemplates('nobody', templates)).toEqual([])
  })

  it('skips templates with a null or empty plan', () => {
    const tplsWithEmpty = [
      sampleTemplate({ id: 'tpl-x', plan: null }),
      sampleTemplate({ id: 'tpl-y', plan: { steps: [] } }),
    ]
    expect(findReferencingTemplates('frontend-developer', tplsWithEmpty)).toEqual([])
  })
})

describe('findReferencingActiveTasks', () => {
  const tasks = [
    { id: 't1', status: 'todo', plan: { steps: [{ id: 1, agent_id: 'frontend-developer' }] } },
    { id: 't2', status: 'awaiting_approval', plan: { steps: [{ id: 1, agent_id: 'frontend-developer' }] } },
    { id: 't3', status: 'executing', plan: { steps: [{ id: 1, agent_id: 'frontend-developer' }] } },
    { id: 't4', status: 'done', plan: { steps: [{ id: 1, agent_id: 'frontend-developer' }] } },
    { id: 't5', status: 'error', plan: { steps: [{ id: 1, agent_id: 'frontend-developer' }] } },
    { id: 't6', status: 'cancelled', plan: { steps: [{ id: 1, agent_id: 'frontend-developer' }] } },
    { id: 't7', status: 'awaiting_approval', plan: { steps: [{ id: 1, agent_id: 'someone-else' }] } },
  ]

  it('returns only non-finalized tasks (excludes done / error / cancelled)', () => {
    const result = findReferencingActiveTasks('frontend-developer', tasks)
    expect(result.map((t) => t.id).sort()).toEqual(['t1', 't2', 't3'])
  })

  it('returns [] when no active task references the agent', () => {
    expect(findReferencingActiveTasks('nobody', tasks)).toEqual([])
  })

  it('skips tasks with a null plan', () => {
    expect(
      findReferencingActiveTasks('frontend-developer', [
        { id: 'x', status: 'awaiting_approval', plan: null },
      ]),
    ).toEqual([])
  })
})
