import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── Mocks ────────────────────────────────────────────────────────────────

vi.mock('../lib/api', () => ({
  fetchAgents: vi.fn().mockResolvedValue([]),
  fetchTeams: vi.fn().mockResolvedValue([]),
  fetchTools: vi.fn().mockResolvedValue([]),
  trackAgentUsage: vi.fn().mockResolvedValue(null),
}))

// Controllable mock of the SSE stream — same shape as in
// taskOrchestration.test.jsx so component tests can drive plan.proposed and
// errors at will.
const streamMock = vi.hoisted(() => {
  const calls = []
  const stream = vi.fn((args) => {
    let resolve
    let reject
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    calls.push({
      args,
      onEvent: args.onEvent,
      signal: args.signal,
      emit: (evt) => args.onEvent?.(evt),
      resolve: () => resolve(),
      reject: (err) => reject(err),
      promise,
    })
    return promise
  })
  return { stream, calls }
})

vi.mock('../lib/orchestration/stream', () => ({
  streamOrchestration: streamMock.stream,
  isOrchestrationConfigured: () => true,
}))

vi.mock('../lib/templatesApi', () => ({
  fetchTemplates: vi.fn().mockResolvedValue([]),
  insertTemplate: vi.fn().mockResolvedValue({ id: 'tpl-new' }),
  updateTemplate: vi.fn().mockResolvedValue(null),
  deleteTemplate: vi.fn().mockResolvedValue(undefined),
}))

// In-memory mock of the supabase tasks table. Tests can seed it via
// `setMockTasks([...])` before rendering. `inserts` accumulates every row
// passed to `.insert()` so new tests can assert what was written.
const supabaseHolder = vi.hoisted(() => ({
  tasks: [],
  inserts: [],
  set(tasks) {
    this.tasks = tasks
    this.inserts = []
  },
}))

vi.mock('../lib/supabase', () => {
  const makeQuery = () => {
    let pendingInsert = null
    const chain = {
      select: vi.fn(() => chain),
      order: vi.fn(() => Promise.resolve({ data: supabaseHolder.tasks, error: null })),
      insert: vi.fn((row) => {
        pendingInsert = row
        supabaseHolder.inserts.push(row)
        return chain
      }),
      update: vi.fn(() => chain),
      delete: vi.fn(() => chain),
      eq: vi.fn(() => Promise.resolve({ error: null })),
      single: vi.fn(() => {
        const data = pendingInsert
          ? { id: `task-new-${supabaseHolder.inserts.length}`, ...pendingInsert }
          : (supabaseHolder.tasks[0] || null)
        return Promise.resolve({ data, error: null })
      }),
    }
    return chain
  }
  return {
    supabase: {
      from: vi.fn(() => makeQuery()),
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  }
})

import BoardPage from './BoardPage'
import { renderWithProviders } from '../test/test-utils'
import { insertTemplate, fetchTemplates } from '../lib/templatesApi'

beforeEach(() => {
  streamMock.stream.mockClear()
  streamMock.calls.length = 0
  supabaseHolder.set([])
  insertTemplate.mockClear()
  fetchTemplates.mockClear()
  fetchTemplates.mockResolvedValue([])
})

function makeTask(overrides = {}) {
  return {
    id: 'task-1',
    title: 'Build login screen',
    description: 'with Google OAuth',
    status: 'awaiting_approval',
    plan: {
      steps: [
        {
          id: 's1',
          agent_id: 'frontend-developer',
          agent_name: 'Frontend Developer',
          agent_color: 'blue',
          agent_icon: 'Monitor',
          task: 'Existing plan step',
        },
      ],
    },
    artifacts: [],
    error_message: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

async function openTaskDetail(task) {
  supabaseHolder.set([task])
  renderWithProviders(<BoardPage />)
  // Wait for the card to appear and click it to open the detail panel.
  const card = await screen.findByText(task.title)
  await userEvent.setup().click(card)
  await screen.findByText('TASK')
}

describe('BoardPage Re-plan button', () => {
  it.each([
    ['awaiting_approval'],
    ['done'],
    ['error'],
    ['cancelled'],
  ])('renders the Re-plan button when status is %s', async (status) => {
    await openTaskDetail(makeTask({ status }))

    expect(
      await screen.findByRole('button', { name: /re-?plan/i }),
    ).toBeInTheDocument()
  })

  it.each([
    ['todo'],
    ['planning'],
    ['executing'],
  ])('does NOT render the Re-plan button when status is %s', async (status) => {
    await openTaskDetail(makeTask({ status }))

    expect(
      screen.queryByRole('button', { name: /re-?plan/i }),
    ).not.toBeInTheDocument()
  })

  it('does not show a confirmation modal on click', async () => {
    await openTaskDetail(makeTask({ status: 'done' }))
    const button = await screen.findByRole('button', { name: /re-?plan/i })

    await userEvent.setup().click(button)

    // Stream should have been kicked off without any confirm step.
    await waitFor(() => {
      expect(streamMock.stream).toHaveBeenCalledTimes(1)
    })
    expect(streamMock.stream.mock.calls[0][0].mode).toBe('planned')
    // No dialog/modal labeled Confirm or Are you sure.
    expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument()
  })

  it('keeps the existing plan visible while the re-plan stream is in flight', async () => {
    await openTaskDetail(makeTask({ status: 'done' }))
    expect(screen.getByText('Existing plan step')).toBeInTheDocument()

    const button = await screen.findByRole('button', { name: /re-?plan/i })
    await userEvent.setup().click(button)

    // Stream is open but no plan.proposed event yet — old plan must still
    // render in the DOM.
    expect(screen.getByText('Existing plan step')).toBeInTheDocument()
  })

  it('replaces the old plan with the new one when plan.proposed arrives', async () => {
    await openTaskDetail(makeTask({ status: 'done' }))
    const button = await screen.findByRole('button', { name: /re-?plan/i })
    await userEvent.setup().click(button)

    await waitFor(() => {
      expect(streamMock.calls.length).toBe(1)
    })

    act(() => {
      streamMock.calls[0].emit({
        type: 'plan.proposed',
        plan: {
          steps: [
            {
              id: 's2',
              agent_id: 'backend-developer',
              agent_name: 'Backend Developer',
              agent_color: 'green',
              agent_icon: 'Database',
              task: 'New plan step',
            },
          ],
        },
      })
    })

    await waitFor(() => {
      expect(screen.getByText('New plan step')).toBeInTheDocument()
    })
    expect(screen.queryByText('Existing plan step')).not.toBeInTheDocument()
  })

  it('keeps the old plan if the stream throws', async () => {
    await openTaskDetail(makeTask({ status: 'done' }))
    const button = await screen.findByRole('button', { name: /re-?plan/i })
    await userEvent.setup().click(button)

    await waitFor(() => {
      expect(streamMock.calls.length).toBe(1)
    })

    await act(async () => {
      streamMock.calls[0].reject(new Error('boom'))
      await streamMock.calls[0].promise.catch(() => {})
    })

    expect(screen.getByText('Existing plan step')).toBeInTheDocument()
  })

  it('disables the Re-plan button while a re-plan is already in flight', async () => {
    await openTaskDetail(makeTask({ status: 'done' }))
    const button = await screen.findByRole('button', { name: /re-?plan/i })

    await userEvent.setup().click(button)

    await waitFor(() => {
      expect(button).toBeDisabled()
    })
  })
})

describe('BoardPage Save as template action', () => {
  it.each([
    ['todo'],
    ['awaiting_approval'],
    ['executing'],
    ['done'],
    ['error'],
    ['cancelled'],
  ])('renders the Save as template button when status is %s', async (status) => {
    await openTaskDetail(makeTask({ status }))

    expect(
      await screen.findByRole('button', { name: /save as template/i }),
    ).toBeInTheDocument()
  })

  it('opens a modal pre-filled with the ticket title on click', async () => {
    await openTaskDetail(makeTask({ status: 'done' }))
    const trigger = await screen.findByRole('button', { name: /save as template/i })

    await userEvent.setup().click(trigger)

    const nameInput = await screen.findByLabelText(/template name/i)
    expect(nameInput).toHaveValue('Build login screen')
    expect(screen.getByLabelText(/template description/i)).toBeInTheDocument()
  })

  it('inserts a snapshot row with the chosen name and the source ticket fields', async () => {
    await openTaskDetail(makeTask({ status: 'done' }))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /save as template/i }))

    const nameInput = await screen.findByLabelText(/template name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'My new template')
    const descInput = screen.getByLabelText(/template description/i)
    await user.type(descInput, 'A reusable bug-fix recipe')

    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(insertTemplate).toHaveBeenCalledTimes(1)
    })
    const arg = insertTemplate.mock.calls[0][0]
    expect(arg.name).toBe('My new template')
    expect(arg.description).toBe('A reusable bug-fix recipe')
    expect(arg.task_title).toBe('Build login screen')
    expect(arg.task_description).toBe('with Google OAuth')
    expect(arg.plan).toEqual(makeTask().plan)
    expect(arg).not.toHaveProperty('status')
    expect(arg).not.toHaveProperty('run_id')
    expect(arg).not.toHaveProperty('error_message')
    expect(arg).not.toHaveProperty('artifacts')
    expect(arg).not.toHaveProperty('id')
  })

  it('inserts a null description when the user leaves the field blank', async () => {
    await openTaskDetail(makeTask({ status: 'done' }))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /save as template/i }))

    await screen.findByLabelText(/template name/i)
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(insertTemplate).toHaveBeenCalledTimes(1)
    })
    expect(insertTemplate.mock.calls[0][0].description).toBeNull()
  })

  it('inserts a null plan when the source ticket has no plan', async () => {
    await openTaskDetail(makeTask({ status: 'todo', plan: null }))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /save as template/i }))

    await screen.findByLabelText(/template name/i)
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(insertTemplate).toHaveBeenCalledTimes(1)
    })
    expect(insertTemplate.mock.calls[0][0].plan).toBeNull()
  })

  it('deep-copies the plan so mutating the snapshot does not affect the source ticket', async () => {
    const sourceTask = makeTask({ status: 'done' })
    await openTaskDetail(sourceTask)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /save as template/i }))

    await screen.findByLabelText(/template name/i)
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(insertTemplate).toHaveBeenCalledTimes(1)
    })
    const insertedPlan = insertTemplate.mock.calls[0][0].plan
    insertedPlan.steps[0].task = 'mutated'
    expect(sourceTask.plan.steps[0].task).toBe('Existing plan step')
  })

  it('closes the modal on cancel without calling insertTemplate', async () => {
    await openTaskDetail(makeTask({ status: 'done' }))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /save as template/i }))

    expect(await screen.findByLabelText(/template name/i)).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: /^cancel$/i }),
    )

    await waitFor(() => {
      expect(screen.queryByLabelText(/template name/i)).not.toBeInTheDocument()
    })
    expect(insertTemplate).not.toHaveBeenCalled()
  })

  it('closes the modal automatically after a successful insert', async () => {
    await openTaskDetail(makeTask({ status: 'done' }))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /save as template/i }))

    await screen.findByLabelText(/template name/i)
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(screen.queryByLabelText(/template name/i)).not.toBeInTheDocument()
    })
  })
})

describe('BoardPage From template action', () => {
  function makeTemplate(overrides = {}) {
    return {
      id: 'tpl-1',
      name: 'Bug fix recipe',
      description: 'A reusable bug-fix template',
      task_title: 'Fix the bug',
      task_description: 'Describe how to reproduce',
      plan: {
        steps: [
          {
            id: 's1',
            agent_id: 'frontend-developer',
            agent_name: 'Frontend Developer',
            agent_color: 'blue',
            agent_icon: 'Monitor',
            task: 'Investigate the failing component',
          },
        ],
      },
      ...overrides,
    }
  }

  async function waitForBoard() {
    renderWithProviders(<BoardPage />)
    return await screen.findByRole('button', { name: /from template/i })
  }

  it('renders the + From template button alongside + Add task in the todo column', async () => {
    await waitForBoard()
    expect(screen.getByRole('button', { name: /^add task$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /from template/i })).toBeInTheDocument()
  })

  it('opens the template selector modal and lists fetched templates on click', async () => {
    fetchTemplates.mockResolvedValueOnce([
      makeTemplate({ id: 'tpl-a', name: 'First template' }),
      makeTemplate({ id: 'tpl-b', name: 'Second template' }),
    ])
    const trigger = await waitForBoard()
    await userEvent.setup().click(trigger)

    expect(await screen.findByRole('heading', { name: /use a template/i })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /First template/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Second template/i })).toBeInTheDocument()
  })

  it('shows the read-only preview pane when a template is selected', async () => {
    fetchTemplates.mockResolvedValueOnce([
      makeTemplate({ id: 'tpl-a', name: 'First option', task_title: 'Wrong preview' }),
      makeTemplate({ id: 'tpl-b', name: 'Bug fix recipe' }),
    ])
    const trigger = await waitForBoard()
    const user = userEvent.setup()
    await user.click(trigger)

    await user.click(await screen.findByRole('button', { name: /Bug fix recipe/i }))

    // Preview surfaces ticket fields and plan step content.
    expect(screen.getByText('Fix the bug')).toBeInTheDocument()
    expect(screen.getByText('Describe how to reproduce')).toBeInTheDocument()
    expect(screen.getByText('Investigate the failing component')).toBeInTheDocument()
    // The wrong template's title must NOT leak into the preview.
    expect(screen.queryByText('Wrong preview')).not.toBeInTheDocument()
    // Preview must be read-only — no editable inputs anywhere on the page yet.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('inserts an awaiting_approval task with the cloned plan and opens the panel on click of Use template', async () => {
    const tpl = makeTemplate()
    fetchTemplates.mockResolvedValueOnce([tpl])
    const trigger = await waitForBoard()
    const user = userEvent.setup()
    await user.click(trigger)
    await user.click(await screen.findByText('Bug fix recipe'))
    await user.click(screen.getByRole('button', { name: /use template/i }))

    await waitFor(() => {
      expect(supabaseHolder.inserts.length).toBe(1)
    })
    const inserted = supabaseHolder.inserts[0]
    expect(inserted.title).toBe('Fix the bug')
    expect(inserted.description).toBe('Describe how to reproduce')
    expect(inserted.status).toBe('awaiting_approval')
    expect(inserted.plan).toEqual(tpl.plan)
    expect(inserted.run_id).toBeNull()
    expect(inserted.error_message).toBeNull()
    expect(inserted.artifacts).toEqual([])

    // Modal closed and the detail panel opened on the new ticket.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /use template/i })).not.toBeInTheDocument()
    })
    expect(await screen.findByText('TASK')).toBeInTheDocument()
  })

  it('lands the new ticket in todo when the chosen template has no plan', async () => {
    const tpl = makeTemplate({
      id: 'tpl-blank',
      name: 'Blank starter',
      task_title: 'Blank task',
      plan: null,
    })
    fetchTemplates.mockResolvedValueOnce([tpl])
    const trigger = await waitForBoard()
    const user = userEvent.setup()
    await user.click(trigger)
    await user.click(await screen.findByText('Blank starter'))
    await user.click(screen.getByRole('button', { name: /use template/i }))

    await waitFor(() => {
      expect(supabaseHolder.inserts.length).toBe(1)
    })
    expect(supabaseHolder.inserts[0].status).toBe('todo')
    expect(supabaseHolder.inserts[0].plan).toBeNull()
  })

  it('does not mutate the source template plan when the new ticket plan is touched', async () => {
    const tpl = makeTemplate()
    fetchTemplates.mockResolvedValueOnce([tpl])
    const trigger = await waitForBoard()
    const user = userEvent.setup()
    await user.click(trigger)
    await user.click(await screen.findByText('Bug fix recipe'))
    await user.click(screen.getByRole('button', { name: /use template/i }))

    await waitFor(() => {
      expect(supabaseHolder.inserts.length).toBe(1)
    })
    const insertedPlan = supabaseHolder.inserts[0].plan
    insertedPlan.steps[0].task = 'mutated copy'
    expect(tpl.plan.steps[0].task).toBe('Investigate the failing component')
  })

  it('keeps the existing + Add task inline form unchanged', async () => {
    const trigger = await waitForBoard()
    expect(trigger).toBeInTheDocument()
    const addBtn = screen.getByRole('button', { name: /^add task$/i })
    await userEvent.setup().click(addBtn)

    expect(screen.getByPlaceholderText(/task title/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /use template/i })).not.toBeInTheDocument()
  })

  it('closes the modal on cancel without inserting anything', async () => {
    fetchTemplates.mockResolvedValueOnce([makeTemplate()])
    const trigger = await waitForBoard()
    const user = userEvent.setup()
    await user.click(trigger)
    await screen.findByText('Bug fix recipe')

    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    await waitFor(() => {
      expect(screen.queryByText('Bug fix recipe')).not.toBeInTheDocument()
    })
    expect(supabaseHolder.inserts.length).toBe(0)
  })
})
