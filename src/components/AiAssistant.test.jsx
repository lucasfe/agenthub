import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AiAssistant from './AiAssistant'
import { renderWithProviders } from '../test/test-utils'

vi.mock('../lib/api', () => ({
  fetchAgents: vi.fn().mockResolvedValue([
    {
      id: 'frontend-developer',
      name: 'Frontend Developer',
      category: 'Development Team',
      description: 'Expert in React',
      tags: ['React', 'CSS'],
      icon: 'Monitor',
      color: 'blue',
    },
  ]),
  fetchTeams: vi.fn().mockResolvedValue([]),
  fetchTools: vi.fn().mockResolvedValue([]),
  createAgent: vi.fn().mockResolvedValue({ id: 'mock' }),
  updateAgent: vi.fn().mockResolvedValue({ id: 'frontend-developer' }),
}))

// Controllable mock of the orchestration engine. The fake Session drains a
// scripted list of events via the subscribe callback on the next microtask,
// mirroring how the real engine streams events through `session._emit`.
const orchestrationMock = vi.hoisted(() => {
  const createFakeSession = (events) => {
    let cancelled = false
    const session = {
      id: 'test-session',
      mode: 'chat',
      status: 'streaming',
      subscribe: (fn) => {
        queueMicrotask(() => {
          for (const evt of events) {
            if (cancelled) break
            fn(evt)
          }
        })
        return () => {}
      },
      cancel: vi.fn(() => {
        cancelled = true
      }),
    }
    return session
  }

  return {
    isOrchestrationConfigured: vi.fn(() => true),
    startSession: vi.fn(),
    _createFakeSession: createFakeSession,
  }
})

vi.mock('../lib/orchestration', () => orchestrationMock)

// Respond to startSession() by returning a session that will emit `events`
// once something subscribes to it.
function scriptSession(events) {
  orchestrationMock.startSession.mockImplementationOnce(() =>
    orchestrationMock._createFakeSession(events),
  )
}

describe('AiAssistant', () => {
  beforeEach(() => {
    orchestrationMock.isOrchestrationConfigured.mockReturnValue(true)
    orchestrationMock.startSession.mockReset()
  })

  it('does not render when closed', () => {
    renderWithProviders(<AiAssistant open={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders header and initial welcome message when open', () => {
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('AI Assistant')).toBeInTheDocument()
    expect(screen.getByText(/Hi! I'm your AI assistant/)).toBeInTheDocument()
  })

  it('streams an assistant reply from the session', async () => {
    scriptSession([
      { type: 'router.classified', mode: 'chat' },
      { type: 'chat.text', value: 'Hello' },
      { type: 'chat.text', value: ' world' },
      { type: 'chat.done' },
    ])

    const user = userEvent.setup()
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    const input = screen.getByPlaceholderText('Type a message...')
    await user.type(input, 'Hi there')
    await user.click(screen.getByLabelText('Send message'))

    expect(screen.getByText('Hi there')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Hello world')).toBeInTheDocument()
    })

    expect(orchestrationMock.startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'chat',
        messages: [{ role: 'user', content: 'Hi there' }],
      }),
    )
  })

  it('renders an AgentDraftCard when the session emits a draft_agent tool_call', async () => {
    scriptSession([
      { type: 'chat.text', value: 'Beleza! Montei um draft:' },
      {
        type: 'chat.tool_call',
        name: 'draft_agent',
        input: {
          name: 'Security Auditor',
          category: 'AI Specialists',
          description: 'Expert in OWASP',
          tags: ['OWASP', 'Pentest'],
          icon: 'Shield',
          color: 'rose',
          content: '## Responsibilities\n\nAudit code.',
        },
      },
      { type: 'chat.done' },
    ])

    const user = userEvent.setup()
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText('Type a message...'), 'cria um agente de security')
    await user.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(screen.getByText('Security Auditor')).toBeInTheDocument()
    })
    expect(screen.getByText(/Beleza! Montei um draft/)).toBeInTheDocument()
    expect(screen.getByText(/Expert in OWASP/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create agent/i })).toBeInTheDocument()
  })

  it('renders an AgentEditCard when the session emits an update_agent tool_call', async () => {
    scriptSession([
      { type: 'chat.text', value: 'Entendi, vou propor essa alteração:' },
      {
        type: 'chat.tool_call',
        name: 'update_agent',
        input: {
          id: 'frontend-developer',
          updates: { color: 'purple' },
        },
      },
      { type: 'chat.done' },
    ])

    const user = userEvent.setup()
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    await user.type(
      screen.getByPlaceholderText('Type a message...'),
      'muda a cor do frontend-developer pra roxo',
    )
    await user.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(screen.getByText(/Edit proposal/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Entendi, vou propor/)).toBeInTheDocument()
    expect(screen.getByText('Frontend Developer')).toBeInTheDocument()
    expect(screen.getByText('color')).toBeInTheDocument()
    expect(screen.getByText('purple')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /apply changes/i })).toBeInTheDocument()
  })

  it('forwards agents context to startSession on send', async () => {
    scriptSession([
      { type: 'chat.text', value: 'hello' },
      { type: 'chat.done' },
    ])

    const user = userEvent.setup()
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText('Type a message...'), 'oi')
    await user.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(orchestrationMock.startSession).toHaveBeenCalled()
    })
    const call = orchestrationMock.startSession.mock.calls[0][0]
    expect(Array.isArray(call.agents)).toBe(true)
    expect(call.agents.find((a) => a.id === 'frontend-developer')).toBeTruthy()
  })

  it('shows an error bubble when the session emits chat.error', async () => {
    scriptSession([{ type: 'chat.error', error: 'boom' }])

    const user = userEvent.setup()
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText('Type a message...'), 'test')
    await user.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(screen.getByText(/boom/)).toBeInTheDocument()
    })
  })

  it('shows a configuration notice when orchestration is not configured', async () => {
    orchestrationMock.isOrchestrationConfigured.mockReturnValue(false)

    const user = userEvent.setup()
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText('Type a message...'), 'hi')
    await user.click(screen.getByLabelText('Send message'))

    expect(screen.getByText(/Chat is not configured/)).toBeInTheDocument()
    expect(orchestrationMock.startSession).not.toHaveBeenCalled()
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<AiAssistant open={true} onClose={onClose} />)

    await user.click(screen.getByLabelText('Close assistant'))
    expect(onClose).toHaveBeenCalled()
  })

  it('toggles fullscreen mode', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('max-w-md')

    await user.click(screen.getByLabelText('Enter fullscreen'))
    expect(dialog.className).toContain('inset-0')
    expect(dialog.className).not.toContain('max-w-md')

    await user.click(screen.getByLabelText('Exit fullscreen'))
    expect(dialog.className).toContain('max-w-md')
  })

  it('clears conversation back to just the welcome message', async () => {
    scriptSession([
      { type: 'chat.text', value: 'reply' },
      { type: 'chat.done' },
    ])

    const user = userEvent.setup()
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText('Type a message...'), 'First message')
    await user.click(screen.getByLabelText('Send message'))
    expect(screen.getByText('First message')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Clear conversation'))
    expect(screen.queryByText('First message')).not.toBeInTheDocument()
    expect(screen.getByText(/Hi! I'm your AI assistant/)).toBeInTheDocument()
  })

  it('renders a PlanCard when the session emits plan.proposed', async () => {
    scriptSession([
      { type: 'router.classified', mode: 'task' },
      { type: 'plan.proposing' },
      {
        type: 'plan.proposed',
        plan: {
          steps: [
            {
              id: 1,
              agent_id: 'frontend-developer',
              agent_name: 'Frontend Developer',
              agent_color: 'blue',
              agent_icon: 'Monitor',
              task: 'Research React trends',
              inputs: ['original_task'],
              tools_used: ['web_search'],
            },
          ],
          estimated_duration_ms: 12000,
        },
      },
    ])

    const user = userEvent.setup()
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText('Type a message...'), 'faz uma análise')
    await user.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(screen.getByText('Proposed plan')).toBeInTheDocument()
    })
    expect(screen.getByText(/1 step/)).toBeInTheDocument()
    expect(screen.getByText('Research React trends')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
  })

  it('renders a PlanFallbackCard when the session emits plan.fallback', async () => {
    scriptSession([
      { type: 'router.classified', mode: 'task' },
      { type: 'plan.proposing' },
      {
        type: 'plan.fallback',
        reason: 'No agent specializes in legal contract analysis.',
        suggested_agent_type: 'legal analyst',
      },
    ])

    const user = userEvent.setup()
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText('Type a message...'), 'analisa esse contrato')
    await user.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(screen.getByText('No suitable agent')).toBeInTheDocument()
    })
    expect(screen.getByText(/No agent specializes in legal contract analysis/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /create agent/i })).toBeInTheDocument()
  })

  it('triggers a refinement session when the user submits refine text', async () => {
    scriptSession([
      { type: 'router.classified', mode: 'task' },
      { type: 'plan.proposing' },
      {
        type: 'plan.proposed',
        plan: {
          steps: [
            {
              id: 1,
              agent_id: 'frontend-developer',
              agent_name: 'Frontend Developer',
              agent_color: 'blue',
              agent_icon: 'Monitor',
              task: 'Sketch something',
              inputs: ['original_task'],
              tools_used: [],
            },
          ],
        },
      },
    ])

    const user = userEvent.setup()
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText('Type a message...'), 'task')
    await user.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(screen.getByText('Proposed plan')).toBeInTheDocument()
    })

    // Arm the NEXT session call (the one triggered by refine)
    scriptSession([
      {
        type: 'plan.proposed',
        plan: {
          steps: [
            {
              id: 1,
              agent_id: 'frontend-developer',
              agent_name: 'Frontend Developer',
              agent_color: 'blue',
              agent_icon: 'Monitor',
              task: 'Sketch something refined',
              inputs: ['original_task'],
              tools_used: [],
            },
          ],
        },
      },
    ])

    const refineInput = screen.getByPlaceholderText(/refine plan/i)
    await user.type(refineInput, 'make step 1 shorter{Enter}')

    await waitFor(() => {
      expect(screen.getByText('Sketch something refined')).toBeInTheDocument()
    })

    // startSession was called twice: once for the initial plan, once for refine.
    expect(orchestrationMock.startSession).toHaveBeenCalledTimes(2)
    const secondCall = orchestrationMock.startSession.mock.calls[1][0]
    expect(secondCall.mode).toBe('planned')
    expect(secondCall.refinement).toBeTruthy()
    expect(secondCall.refinement.instructions).toBe('make step 1 shorter')
  })

  it('locks the PlanCard when the user approves', async () => {
    scriptSession([
      {
        type: 'plan.proposed',
        plan: {
          steps: [
            {
              id: 1,
              agent_id: 'frontend-developer',
              agent_name: 'Frontend Developer',
              agent_color: 'blue',
              agent_icon: 'Monitor',
              task: 'Do a thing',
              inputs: ['original_task'],
              tools_used: [],
            },
          ],
        },
      },
    ])

    const user = userEvent.setup()
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText('Type a message...'), 'task')
    await user.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /approve/i }))
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
  })
})
