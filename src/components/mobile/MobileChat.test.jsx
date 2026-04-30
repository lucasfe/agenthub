import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MobileChat from './MobileChat'
import { renderWithProviders } from '../../test/test-utils'

vi.mock('../../lib/api', () => ({
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
    {
      id: 'backend-developer',
      name: 'Backend Developer',
      category: 'Development Team',
      description: 'APIs & DB',
      tags: ['API'],
      icon: 'Server',
      color: 'green',
    },
  ]),
  fetchTeams: vi.fn().mockResolvedValue([]),
  fetchTools: vi.fn().mockResolvedValue([]),
  createAgent: vi.fn().mockResolvedValue({ id: 'mock' }),
  updateAgent: vi.fn().mockResolvedValue({ id: 'frontend-developer' }),
  trackAgentUsage: vi.fn().mockResolvedValue(null),
}))

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

vi.mock('../../lib/orchestration', () => orchestrationMock)

const voiceMock = vi.hoisted(() => ({
  isSupported: vi.fn(() => true),
  startRecognition: vi.fn(),
  stopRecognition: vi.fn(),
}))

vi.mock('../../lib/voice', () => voiceMock)

function scriptSession(events) {
  orchestrationMock.startSession.mockImplementationOnce(() =>
    orchestrationMock._createFakeSession(events),
  )
}

describe('MobileChat', () => {
  beforeEach(() => {
    orchestrationMock.isOrchestrationConfigured.mockReturnValue(true)
    orchestrationMock.startSession.mockReset()
    voiceMock.isSupported.mockReset().mockReturnValue(true)
    voiceMock.startRecognition.mockReset()
    voiceMock.stopRecognition.mockReset()
  })

  it('renders empty state, header, and input controls', () => {
    renderWithProviders(<MobileChat />)
    expect(screen.getByText(/Start a conversation/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Voice input/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Send message/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /New chat/i })).toBeInTheDocument()
  })

  it('sends a text message and renders streaming assistant reply', async () => {
    scriptSession([
      { type: 'chat.text', value: 'Hello' },
      { type: 'chat.text', value: ' world' },
      { type: 'chat.done' },
    ])

    const user = userEvent.setup()
    renderWithProviders(<MobileChat />)

    const input = screen.getByPlaceholderText(/Type a message/i)
    await user.type(input, 'oi')
    await user.click(screen.getByLabelText(/Send message/i))

    expect(screen.getByText('oi')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Hello world')).toBeInTheDocument()
    })

    expect(orchestrationMock.startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'chat',
        messages: [{ role: 'user', content: 'oi' }],
      }),
    )
  })

  it('mic FAB starts speech recognition and appends transcript to input', async () => {
    let callbacks = null
    voiceMock.startRecognition.mockImplementation((opts) => {
      callbacks = opts
      return { stop: vi.fn() }
    })

    const user = userEvent.setup()
    renderWithProviders(<MobileChat />)

    const input = screen.getByPlaceholderText(/Type a message/i)
    await user.type(input, 'hello ')

    await user.click(screen.getByLabelText(/Voice input/i))
    expect(voiceMock.startRecognition).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/Listening/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Stop voice input/i)).toBeInTheDocument()

    callbacks.onResult({ transcript: 'world', isFinal: true })
    callbacks.onEnd?.()

    await waitFor(() => {
      expect(input.value).toBe('hello world')
    })
    expect(screen.queryByText(/Listening/i)).not.toBeInTheDocument()
  })

  it('shows toast when speech recognition reports not-allowed (permission denied)', async () => {
    let callbacks = null
    voiceMock.startRecognition.mockImplementation((opts) => {
      callbacks = opts
      return { stop: vi.fn() }
    })

    const user = userEvent.setup()
    renderWithProviders(<MobileChat />)

    await user.click(screen.getByLabelText(/Voice input/i))
    callbacks.onError({ code: 'not-allowed', message: 'denied' })
    callbacks.onEnd?.()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Microphone/i)
    })
  })

  it('renders an approval card when chat.tool_call has requires_approval and approve dispatches', async () => {
    const onApprove = vi.fn()
    orchestrationMock.startSession.mockImplementationOnce(() => {
      const session = orchestrationMock._createFakeSession([
        {
          type: 'chat.tool_call',
          name: 'create_github_issue',
          input: { repo: 'lucasfe/agenthub', title: 'Test', body: 'body' },
          requires_approval: true,
          tool_call_id: 'tu-approval-1',
        },
      ])
      session.approve = onApprove
      return session
    })

    const user = userEvent.setup()
    renderWithProviders(<MobileChat />)

    await user.type(screen.getByPlaceholderText(/Type a message/i), 'open issue')
    await user.click(screen.getByLabelText(/Send message/i))

    await waitFor(() => {
      expect(screen.getByText(/Approval required/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/create_github_issue/i)).toBeInTheDocument()
    const approveBtn = screen.getByRole('button', { name: /Approve/i })
    await user.click(approveBtn)
    expect(onApprove).toHaveBeenCalledTimes(1)
  })

  it('renders a plan summary card when plan.proposed arrives', async () => {
    scriptSession([
      {
        type: 'plan.proposed',
        plan: {
          id: 'plan-1',
          steps: [
            { id: 1, agent_id: 'frontend-developer', agent_name: 'Frontend Developer', task: 'Build UI' },
            { id: 2, agent_id: 'backend-developer', agent_name: 'Backend Developer', task: 'Add API' },
          ],
        },
      },
    ])

    const user = userEvent.setup()
    renderWithProviders(<MobileChat />)

    await user.type(screen.getByPlaceholderText(/Type a message/i), 'plan something')
    await user.click(screen.getByLabelText(/Send message/i))

    await waitFor(() => {
      expect(screen.getByText(/2 steps/i)).toBeInTheDocument()
    })
    expect(screen.getByText('Frontend Developer')).toBeInTheDocument()
    expect(screen.getByText('Backend Developer')).toBeInTheDocument()
  })

  it('agent picker bottom sheet selects an agent and forwards selectedAgentId to startSession', async () => {
    scriptSession([
      { type: 'chat.text', value: 'hello' },
      { type: 'chat.done' },
    ])

    const user = userEvent.setup()
    renderWithProviders(<MobileChat />)

    await waitFor(() => {
      expect(screen.getByLabelText(/Select agent/i)).toBeInTheDocument()
    })

    await user.click(screen.getByLabelText(/Select agent/i))
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Pick an agent/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Frontend Developer/i }))

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /Pick an agent/i }),
      ).not.toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText(/Type a message/i), 'oi')
    await user.click(screen.getByLabelText(/Send message/i))

    await waitFor(() => {
      expect(orchestrationMock.startSession).toHaveBeenCalled()
    })
    const call = orchestrationMock.startSession.mock.calls[0][0]
    expect(call.selectedAgentId).toBe('frontend-developer')
  })

  it('New chat resets messages and cancels active session', async () => {
    scriptSession([
      { type: 'chat.text', value: 'partial' },
    ])

    const user = userEvent.setup()
    renderWithProviders(<MobileChat />)

    await user.type(screen.getByPlaceholderText(/Type a message/i), 'first message')
    await user.click(screen.getByLabelText(/Send message/i))

    await waitFor(() => {
      expect(screen.getByText('first message')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /New chat/i }))

    await waitFor(() => {
      expect(screen.queryByText('first message')).not.toBeInTheDocument()
    })
    expect(screen.getByText(/Start a conversation/i)).toBeInTheDocument()
  })
})
