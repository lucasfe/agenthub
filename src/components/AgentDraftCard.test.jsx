import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AgentDraftCard from './AgentDraftCard'
import { renderWithProviders } from '../test/test-utils'

const apiMock = vi.hoisted(() => ({
  fetchAgents: vi.fn(),
  fetchTeams: vi.fn(),
  fetchTools: vi.fn().mockResolvedValue([]),
  createAgent: vi.fn(),
}))

vi.mock('../lib/api', () => apiMock)

const fullDraft = {
  name: 'Security Auditor',
  category: 'AI Specialists',
  description: 'Expert in OWASP Top 10 vulnerabilities',
  tags: ['OWASP', 'Pentest', 'Security'],
  icon: 'Shield',
  color: 'rose',
  content: '## Responsibilities\n\nYou audit code for security issues.',
}

describe('AgentDraftCard', () => {
  beforeEach(() => {
    apiMock.fetchAgents.mockResolvedValue([])
    apiMock.fetchTeams.mockResolvedValue([])
    apiMock.createAgent.mockReset()
  })

  it('renders preview with name, description, tags, and category', async () => {
    renderWithProviders(<AgentDraftCard draft={fullDraft} />)

    expect(screen.getByText('Security Auditor')).toBeInTheDocument()
    expect(screen.getByText(/OWASP Top 10/)).toBeInTheDocument()
    expect(screen.getByText('OWASP')).toBeInTheDocument()
    expect(screen.getByText('Pentest')).toBeInTheDocument()
    expect(screen.getByText('AI Specialists')).toBeInTheDocument()
  })

  it('falls back to defaults for invalid fields', () => {
    const draft = { name: 'Minimal', category: 'Invalid', color: 'neon' }
    renderWithProviders(<AgentDraftCard draft={draft} />)

    // Category falls back to AI Specialists
    expect(screen.getByText('AI Specialists')).toBeInTheDocument()
    expect(screen.getByText('Minimal')).toBeInTheDocument()
  })

  it('toggles the system prompt accordion', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AgentDraftCard draft={fullDraft} />)

    // Prompt not visible initially
    expect(screen.queryByText(/You audit code/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /system prompt/i }))
    expect(screen.getByText(/You audit code/)).toBeInTheDocument()
  })

  it('calls createAgent on Create click and shows the created state', async () => {
    apiMock.createAgent.mockResolvedValue({ id: 'security-auditor' })

    const user = userEvent.setup()
    renderWithProviders(<AgentDraftCard draft={fullDraft} />)

    await user.click(screen.getByRole('button', { name: /create agent/i }))

    await waitFor(() => {
      expect(apiMock.createAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'security-auditor',
          name: 'Security Auditor',
          category: 'AI Specialists',
          color: 'rose',
          icon: 'Shield',
          tags: ['OWASP', 'Pentest', 'Security'],
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getByText(/Agent created/i)).toBeInTheDocument()
    })

    // View page link should point to the detail page
    const link = screen.getByRole('link', { name: /view page/i })
    expect(link).toHaveAttribute('href', '/agent/ai-specialists/security-auditor')
  })

  it('shows an error when createAgent fails', async () => {
    apiMock.createAgent.mockRejectedValue(new Error('DB exploded'))

    const user = userEvent.setup()
    renderWithProviders(<AgentDraftCard draft={fullDraft} />)

    await user.click(screen.getByRole('button', { name: /create agent/i }))

    await waitFor(() => {
      expect(screen.getByText(/DB exploded/)).toBeInTheDocument()
    })
  })

  it('warns and disables Create when the derived ID conflicts with an existing agent', async () => {
    apiMock.fetchAgents.mockResolvedValue([
      { id: 'security-auditor', name: 'Security Auditor', category: 'AI Specialists' },
    ])

    renderWithProviders(<AgentDraftCard draft={fullDraft} />)

    // Wait for agents to load into DataContext
    await waitFor(() => {
      expect(screen.getByText(/already taken/i)).toBeInTheDocument()
    })

    const createBtn = screen.getByRole('button', { name: /create agent/i })
    expect(createBtn).toBeDisabled()
  })

  it('enters edit mode and saves changes back to preview', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AgentDraftCard draft={fullDraft} />)

    await user.click(screen.getByRole('button', { name: /^edit$/i }))
    expect(screen.getByText(/edit draft/i)).toBeInTheDocument()

    // Change the name
    const nameInput = screen.getByDisplayValue('Security Auditor')
    await user.clear(nameInput)
    await user.type(nameInput, 'Security Champion')

    await user.click(screen.getByRole('button', { name: /save draft/i }))

    // Back in preview mode with the new name
    expect(screen.getByText('Security Champion')).toBeInTheDocument()
    expect(screen.queryByText(/edit draft/i)).not.toBeInTheDocument()
  })

  it('cancels edit without saving', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AgentDraftCard draft={fullDraft} />)

    await user.click(screen.getByRole('button', { name: /^edit$/i }))
    const nameInput = screen.getByDisplayValue('Security Auditor')
    await user.clear(nameInput)
    await user.type(nameInput, 'Something Else')

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    // Original name is still there
    expect(screen.getByText('Security Auditor')).toBeInTheDocument()
    expect(screen.queryByText('Something Else')).not.toBeInTheDocument()
  })
})
