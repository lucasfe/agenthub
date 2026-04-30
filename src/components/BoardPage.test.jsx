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

// In-memory mock of the supabase tasks table. Tests can seed it via
// `setMockTasks([...])` before rendering.
const supabaseHolder = vi.hoisted(() => ({
  tasks: [],
  set(tasks) {
    this.tasks = tasks
  },
}))

vi.mock('../lib/supabase', () => {
  const makeQuery = () => {
    const result = { data: supabaseHolder.tasks, error: null }
    const chain = {
      select: vi.fn(() => chain),
      order: vi.fn(() => Promise.resolve(result)),
      insert: vi.fn(() => chain),
      update: vi.fn(() => chain),
      delete: vi.fn(() => chain),
      eq: vi.fn(() => Promise.resolve({ error: null })),
      single: vi.fn(() => Promise.resolve({ data: supabaseHolder.tasks[0] || null, error: null })),
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

beforeEach(() => {
  streamMock.stream.mockClear()
  streamMock.calls.length = 0
  supabaseHolder.set([])
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
