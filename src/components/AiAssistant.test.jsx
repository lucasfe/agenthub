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
  createAgent: vi.fn().mockResolvedValue({ id: 'mock' }),
  updateAgent: vi.fn().mockResolvedValue({ id: 'frontend-developer' }),
}))

// Controllable mock of the chat streaming client.
const chatMock = vi.hoisted(() => ({
  isChatConfigured: vi.fn(() => true),
  streamChat: vi.fn(),
}))

vi.mock('../lib/chat', () => chatMock)

describe('AiAssistant', () => {
  beforeEach(() => {
    chatMock.isChatConfigured.mockReturnValue(true)
    chatMock.streamChat.mockReset()
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

  it('streams an assistant reply from the chat helper', async () => {
    chatMock.streamChat.mockImplementation(async ({ onDelta, onDone }) => {
      onDelta('Hello')
      onDelta(' world')
      onDone()
    })

    const user = userEvent.setup()
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    const input = screen.getByPlaceholderText('Type a message...')
    await user.type(input, 'Hi there')
    await user.click(screen.getByLabelText('Send message'))

    expect(screen.getByText('Hi there')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Hello world')).toBeInTheDocument()
    })

    expect(chatMock.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'Hi there' }],
      }),
    )
  })

  it('renders an AgentDraftCard when streamChat emits a tool_call', async () => {
    chatMock.streamChat.mockImplementation(async ({ onDelta, onToolCall, onDone }) => {
      onDelta('Beleza! Montei um draft:')
      onToolCall({
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
      })
      onDone()
    })

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

  it('renders an AgentEditCard when streamChat emits an update_agent tool_call', async () => {
    chatMock.streamChat.mockImplementation(async ({ onDelta, onToolCall, onDone }) => {
      onDelta('Entendi, vou propor essa alteração:')
      onToolCall({
        name: 'update_agent',
        input: {
          id: 'frontend-developer',
          updates: { color: 'purple' },
        },
      })
      onDone()
    })

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

  it('forwards agents context to streamChat on send', async () => {
    chatMock.streamChat.mockImplementation(async ({ onDelta, onDone }) => {
      onDelta('hello')
      onDone()
    })

    const user = userEvent.setup()
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText('Type a message...'), 'oi')
    await user.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(chatMock.streamChat).toHaveBeenCalled()
    })
    const call = chatMock.streamChat.mock.calls[0][0]
    expect(Array.isArray(call.agents)).toBe(true)
    expect(call.agents.find((a) => a.id === 'frontend-developer')).toBeTruthy()
  })

  it('shows an error bubble when streamChat fails', async () => {
    chatMock.streamChat.mockImplementation(async ({ onError }) => {
      onError(new Error('boom'))
    })

    const user = userEvent.setup()
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText('Type a message...'), 'test')
    await user.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(screen.getByText(/boom/)).toBeInTheDocument()
    })
  })

  it('shows a configuration notice when chat is not configured', async () => {
    chatMock.isChatConfigured.mockReturnValue(false)

    const user = userEvent.setup()
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText('Type a message...'), 'hi')
    await user.click(screen.getByLabelText('Send message'))

    expect(screen.getByText(/Chat is not configured/)).toBeInTheDocument()
    expect(chatMock.streamChat).not.toHaveBeenCalled()
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
    chatMock.streamChat.mockImplementation(async ({ onDelta, onDone }) => {
      onDelta('reply')
      onDone()
    })

    const user = userEvent.setup()
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText('Type a message...'), 'First message')
    await user.click(screen.getByLabelText('Send message'))
    expect(screen.getByText('First message')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Clear conversation'))
    expect(screen.queryByText('First message')).not.toBeInTheDocument()
    expect(screen.getByText(/Hi! I'm your AI assistant/)).toBeInTheDocument()
  })
})
