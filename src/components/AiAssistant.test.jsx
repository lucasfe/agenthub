import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AiAssistant from './AiAssistant'
import { renderWithProviders } from '../test/test-utils'

vi.mock('../lib/api', () => ({
  fetchAgents: vi.fn().mockResolvedValue([]),
  fetchTeams: vi.fn().mockResolvedValue([]),
}))

describe('AiAssistant', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('sends a user message and receives a mock reply', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    const input = screen.getByPlaceholderText('Type a message...')
    await user.type(input, 'Hello there')
    await user.click(screen.getByLabelText('Send message'))

    expect(screen.getByText('Hello there')).toBeInTheDocument()
    expect(screen.getByText('Thinking…')).toBeInTheDocument()

    vi.advanceTimersByTime(800)

    await waitFor(() => {
      expect(screen.queryByText('Thinking…')).not.toBeInTheDocument()
    })
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onClose = vi.fn()
    renderWithProviders(<AiAssistant open={true} onClose={onClose} />)

    await user.click(screen.getByLabelText('Close assistant'))
    expect(onClose).toHaveBeenCalled()
  })

  it('clears conversation back to just the welcome message', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithProviders(<AiAssistant open={true} onClose={() => {}} />)

    const input = screen.getByPlaceholderText('Type a message...')
    await user.type(input, 'First message')
    await user.click(screen.getByLabelText('Send message'))
    expect(screen.getByText('First message')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Clear conversation'))
    expect(screen.queryByText('First message')).not.toBeInTheDocument()
    expect(screen.getByText(/Hi! I'm your AI assistant/)).toBeInTheDocument()
  })
})
