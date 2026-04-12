import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
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

  it('renders a compact PlanCard when the session emits plan.proposed', async () => {
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
      expect(screen.getByText('Plan proposed')).toBeInTheDocument()
    })
    expect(screen.getByText(/1 step/)).toBeInTheDocument()
    // Compact card exposes a Review & approve button that opens the side panel.
    expect(
      screen.getByRole('button', { name: /review & approve/i }),
    ).toBeInTheDocument()
    // No required fields → quick approve available.
    expect(screen.getByRole('button', { name: /quick approve/i })).toBeInTheDocument()

    // The step task description is NOT in the compact summary; it only
    // appears in the review panel. Open the panel to confirm.
    expect(screen.queryByText('Research React trends')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /review & approve/i }))
    await waitFor(() => {
      expect(screen.getByText('Research React trends')).toBeInTheDocument()
    })
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

  it('triggers a refinement session when the user submits refine text in the panel', async () => {
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
      expect(screen.getByText('Plan proposed')).toBeInTheDocument()
    })
    // Open the review panel to access the refine input.
    await user.click(screen.getByRole('button', { name: /review & approve/i }))
    await waitFor(() => {
      expect(screen.getByText('Sketch something')).toBeInTheDocument()
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
    fireEvent.change(refineInput, { target: { value: 'make step 1 shorter' } })
    await user.click(screen.getByLabelText('Refine plan'))

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

  it('blocks approve until required requirements are filled and bundles answers on execute', async () => {
    scriptSession([
      {
        type: 'router.classified',
        mode: 'task',
      },
      { type: 'plan.analyzing_requirements' },
      {
        type: 'plan.proposed',
        plan: {
          steps: [
            {
              id: 1,
              agent_id: 'powerpoint-presenter',
              agent_name: 'PowerPoint Presenter',
              agent_color: 'amber',
              agent_icon: 'FileText',
              task: 'Create a pitch deck',
              inputs: ['original_task'],
              tools_used: [],
              requirements: [
                {
                  key: 'objective',
                  question: 'Qual é o objetivo?',
                  required: true,
                  suggested: '',
                },
                {
                  key: 'slides',
                  question: 'Quantos slides?',
                  required: false,
                  suggested: '10',
                },
              ],
            },
          ],
        },
      },
    ])

    const user = userEvent.setup()
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText('Type a message...'), 'faz um pitch')
    await user.click(screen.getByLabelText('Send message'))

    // Plan proposed with required fields → open the panel to see requirements
    await waitFor(() => {
      expect(screen.getByText('Plan proposed')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /review & approve/i }))

    await waitFor(() => {
      expect(screen.getByText('Needs from you')).toBeInTheDocument()
    })

    // Approve button (in the panel) should be disabled while required field is empty.
    const approveBtn = screen.getByRole('button', { name: /approve & run/i })
    expect(approveBtn).toBeDisabled()
    expect(screen.getByText(/1 required field needed/i)).toBeInTheDocument()

    // Fill in the required field.
    const objectiveInput = screen.getByPlaceholderText('').parentElement
    const objectiveField = screen.getAllByRole('textbox').find((el) =>
      el.closest('label, div')?.textContent?.includes('objetivo'),
    ) || screen.getAllByRole('textbox')[1] // fallback
    // Use fireEvent for deterministic state change
    fireEvent.change(objectiveField, { target: { value: 'pitch para investidor seed' } })

    // Arm the executor session for approve click
    scriptSession([
      { type: 'run.started', run_id: 'run-req' },
      { type: 'step.started', step_id: 1 },
      { type: 'step.text', step_id: 1, value: 'Done' },
      { type: 'step.done', step_id: 1, duration_ms: 100 },
      { type: 'run.done', run_id: 'run-req', duration_ms: 200 },
    ])

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /approve & run/i })).not.toBeDisabled()
    })
    await user.click(screen.getByRole('button', { name: /approve & run/i }))

    await waitFor(() => {
      expect(screen.getByText('Plan completed')).toBeInTheDocument()
    })

    // The execute call should have received step_answers with the filled value.
    const executeCall = orchestrationMock.startSession.mock.calls[1][0]
    expect(executeCall.mode).toBe('execute')
    expect(executeCall.stepAnswers).toBeTruthy()
    expect(executeCall.stepAnswers[1]).toBeTruthy()
    expect(executeCall.stepAnswers[1].objective).toBe('pitch para investidor seed')
    // Suggested default should be preserved for the non-required field
    expect(executeCall.stepAnswers[1].slides).toBe('10')
  })

  it('executes the plan end-to-end when the user clicks Quick approve', async () => {
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
      expect(screen.getByRole('button', { name: /quick approve/i })).toBeInTheDocument()
    })

    // Arm the executor session events BEFORE the user clicks approve.
    scriptSession([
      { type: 'run.started', run_id: 'run-xyz' },
      {
        type: 'step.started',
        step_id: 1,
        agent_id: 'frontend-developer',
        agent_name: 'Frontend Developer',
        agent_color: 'blue',
        agent_icon: 'Monitor',
      },
      { type: 'step.text', step_id: 1, value: 'Working on it…' },
      {
        type: 'step.done',
        step_id: 1,
        duration_ms: 1234,
        tokens_in: 50,
        tokens_out: 10,
      },
      { type: 'run.done', run_id: 'run-xyz', duration_ms: 1500 },
    ])

    await user.click(screen.getByRole('button', { name: /quick approve/i }))

    await waitFor(() => {
      expect(screen.getByText('Plan completed')).toBeInTheDocument()
    })
    expect(orchestrationMock.startSession).toHaveBeenCalledTimes(2)
    const approveCall = orchestrationMock.startSession.mock.calls[1][0]
    expect(approveCall.mode).toBe('execute')
    expect(approveCall.plan).toBeTruthy()
    expect(approveCall.plan.steps).toHaveLength(1)
  })

  it('offers per-step and all-output downloads after a run completes', async () => {
    scriptSession([
      {
        type: 'plan.proposed',
        plan: {
          steps: [
            {
              id: 1,
              agent_id: 'technical-writer',
              agent_name: 'Technical Writer',
              agent_color: 'amber',
              agent_icon: 'FileText',
              task: 'Write section A',
              inputs: ['original_task'],
              tools_used: [],
            },
            {
              id: 2,
              agent_id: 'technical-writer',
              agent_name: 'Technical Writer',
              agent_color: 'amber',
              agent_icon: 'FileText',
              task: 'Write section B',
              inputs: ['step_1'],
              tools_used: [],
            },
          ],
        },
      },
    ])

    const user = userEvent.setup()
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText('Type a message...'), 'write docs')
    await user.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /approve & run/i })).toBeInTheDocument()
    })

    scriptSession([
      { type: 'run.started', run_id: 'run-dl' },
      { type: 'step.started', step_id: 1 },
      { type: 'step.text', step_id: 1, value: '# Section A\n\nBody' },
      { type: 'step.done', step_id: 1, duration_ms: 500 },
      { type: 'step.started', step_id: 2 },
      { type: 'step.text', step_id: 2, value: '# Section B\n\nMore' },
      { type: 'step.done', step_id: 2, duration_ms: 500 },
      { type: 'run.done', run_id: 'run-dl', duration_ms: 1200 },
    ])

    // Mock URL + click for the jsdom download helpers (jsdom doesn't
    // implement createObjectURL, so stub first then spy on the stub).
    if (!URL.createObjectURL) URL.createObjectURL = () => 'blob://stub'
    if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {}
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob://fake')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    await user.click(screen.getByRole('button', { name: /quick approve/i }))

    await waitFor(() => {
      expect(screen.getByText('Plan completed')).toBeInTheDocument()
    })

    // Download all button is visible in the compact card's action row
    const downloadAll = screen.getByRole('button', { name: /download all/i })
    await user.click(downloadAll)
    expect(createSpy).toHaveBeenCalled()

    // Open the details panel to access per-step download buttons
    await user.click(screen.getByRole('button', { name: /open details/i }))
    await waitFor(() => {
      expect(screen.getAllByLabelText(/download step \d+ output/i).length).toBe(2)
    })
    const stepDownloads = screen.getAllByLabelText(/download step \d+ output/i)
    await user.click(stepDownloads[0])
    expect(clickSpy).toHaveBeenCalled()

    createSpy.mockRestore()
    revokeSpy.mockRestore()
    clickSpy.mockRestore()
  })

  it('surfaces a step error during execution', async () => {
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
              task: 'Fails',
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
      expect(screen.getByRole('button', { name: /quick approve/i })).toBeInTheDocument()
    })

    scriptSession([
      { type: 'run.started', run_id: 'run-err' },
      { type: 'step.started', step_id: 1 },
      { type: 'step.error', step_id: 1, error: 'Sub-agent exploded' },
      { type: 'run.error', run_id: 'run-err', error: 'Sub-agent exploded', failed_step_id: 1 },
    ])

    await user.click(screen.getByRole('button', { name: /quick approve/i }))

    await waitFor(() => {
      expect(screen.getByText('Plan failed')).toBeInTheDocument()
    })
    // Compact card detail line combines both pieces
    expect(screen.getByText(/Failed at step 1.*Sub-agent exploded/i)).toBeInTheDocument()
  })
})
