import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateAgentPage from './CreateAgentPage'
import { renderWithProviders } from '../test/test-utils'

vi.mock('../lib/api', () => ({
  fetchAgents: vi.fn().mockResolvedValue([]),
  fetchTeams: vi.fn().mockResolvedValue([]),
  createAgent: vi.fn().mockResolvedValue({ id: 'test-agent' }),
}))

const { createAgent } = await import('../lib/api')

describe('CreateAgentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the form with all sections', () => {
    renderWithProviders(<CreateAgentPage />)
    expect(screen.getByRole('heading', { name: 'Create Agent' })).toBeInTheDocument()
    expect(screen.getByText('Identity')).toBeInTheDocument()
    expect(screen.getByText('Configuration')).toBeInTheDocument()
    expect(screen.getByText('System Prompt')).toBeInTheDocument()
  })

  it('renders name and description inputs', () => {
    renderWithProviders(<CreateAgentPage />)
    expect(screen.getByPlaceholderText('e.g. Frontend Developer')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('A short summary of what this agent does...')).toBeInTheDocument()
  })

  it('renders category options', () => {
    renderWithProviders(<CreateAgentPage />)
    expect(screen.getByText('Development Team')).toBeInTheDocument()
    expect(screen.getByText('AI Specialists')).toBeInTheDocument()
  })

  it('renders color options', () => {
    renderWithProviders(<CreateAgentPage />)
    expect(screen.getByTitle('Blue')).toBeInTheDocument()
    expect(screen.getByTitle('Green')).toBeInTheDocument()
    expect(screen.getByTitle('Purple')).toBeInTheDocument()
    expect(screen.getByTitle('Amber')).toBeInTheDocument()
    expect(screen.getByTitle('Rose')).toBeInTheDocument()
    expect(screen.getByTitle('Cyan')).toBeInTheDocument()
  })

  it('renders tool toggles', () => {
    renderWithProviders(<CreateAgentPage />)
    expect(screen.getByText('Bash')).toBeInTheDocument()
    expect(screen.getByText('Glob')).toBeInTheDocument()
  })

  it('renders model options', () => {
    renderWithProviders(<CreateAgentPage />)
    expect(screen.getByText('Claude Sonnet')).toBeInTheDocument()
    expect(screen.getByText('Claude Opus')).toBeInTheDocument()
    expect(screen.getByText('Claude Haiku')).toBeInTheDocument()
  })

  it('submits the form and calls createAgent', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CreateAgentPage />)

    await user.type(screen.getByPlaceholderText('e.g. Frontend Developer'), 'Test Agent')
    await user.type(screen.getByPlaceholderText('A short summary of what this agent does...'), 'A test agent')
    await user.type(screen.getByPlaceholderText('React, TypeScript, CSS (comma-separated)'), 'React, Test')

    await user.click(screen.getByRole('button', { name: /create agent/i }))

    await waitFor(() => {
      expect(createAgent).toHaveBeenCalledWith({
        id: 'test-agent',
        name: 'Test Agent',
        category: 'Development Team',
        description: 'A test agent',
        tags: ['React', 'Test'],
        icon: 'Bot',
        color: 'blue',
        featured: false,
        popularity: 0,
        content: '',
      })
    })
  })

  it('shows error message on submit failure', async () => {
    createAgent.mockRejectedValueOnce(new Error('Database error'))
    const user = userEvent.setup()
    renderWithProviders(<CreateAgentPage />)

    await user.type(screen.getByPlaceholderText('e.g. Frontend Developer'), 'Fail Agent')
    await user.type(screen.getByPlaceholderText('A short summary of what this agent does...'), 'Will fail')

    await user.click(screen.getByRole('button', { name: /create agent/i }))

    await waitFor(() => {
      expect(screen.getByText('Database error')).toBeInTheDocument()
    })
  })

  it('shows loading state during submission', async () => {
    createAgent.mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    renderWithProviders(<CreateAgentPage />)

    await user.type(screen.getByPlaceholderText('e.g. Frontend Developer'), 'Loading Agent')
    await user.type(screen.getByPlaceholderText('A short summary of what this agent does...'), 'Testing loading')

    await user.click(screen.getByRole('button', { name: /create agent/i }))

    await waitFor(() => {
      expect(screen.getByText('Creating...')).toBeInTheDocument()
    })
  })

  it('has a cancel link back to home', () => {
    const { container } = renderWithProviders(<CreateAgentPage />)
    const cancelLink = screen.getByText('Cancel')
    expect(cancelLink.closest('a')).toHaveAttribute('href', '/')
  })

  it('has a back link to agents', () => {
    renderWithProviders(<CreateAgentPage />)
    const backLink = screen.getByText('Back to agents')
    expect(backLink.closest('a')).toHaveAttribute('href', '/')
  })
})
