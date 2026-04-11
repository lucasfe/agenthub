import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AgentEditCard from './AgentEditCard'
import { renderWithProviders } from '../test/test-utils'

const apiMock = vi.hoisted(() => ({
  fetchAgents: vi.fn(),
  fetchTeams: vi.fn(),
  fetchTools: vi.fn().mockResolvedValue([]),
  updateAgent: vi.fn(),
}))

vi.mock('../lib/api', () => apiMock)

const existingAgent = {
  id: 'frontend-developer',
  name: 'Frontend Developer',
  category: 'Development Team',
  description: 'Expert in React and modern frontend',
  tags: ['React', 'TypeScript', 'CSS'],
  icon: 'Monitor',
  color: 'blue',
  content: '## Responsibilities\n\nBuild great UIs.',
}

describe('AgentEditCard', () => {
  beforeEach(() => {
    apiMock.fetchAgents.mockResolvedValue([existingAgent])
    apiMock.fetchTeams.mockResolvedValue([])
    apiMock.updateAgent.mockReset()
  })

  it('shows a missing-agent error when the target id does not exist', async () => {
    apiMock.fetchAgents.mockResolvedValue([]) // empty DB

    renderWithProviders(
      <AgentEditCard targetId="ghost-agent" updates={{ color: 'rose' }} />,
    )

    await waitFor(() => {
      expect(screen.getByText(/Could not find an agent/i)).toBeInTheDocument()
    })
    expect(screen.getByText('ghost-agent')).toBeInTheDocument()
  })

  it('renders a diff showing only the changed fields', async () => {
    renderWithProviders(
      <AgentEditCard
        targetId="frontend-developer"
        updates={{ color: 'purple', description: 'Expert in React and Vue' }}
      />,
    )

    // Wait for DataContext to populate
    await waitFor(() => {
      expect(screen.getByText('Frontend Developer')).toBeInTheDocument()
    })

    // The two changing fields are shown
    expect(screen.getByText('color')).toBeInTheDocument()
    expect(screen.getByText('description')).toBeInTheDocument()
    // Diff values
    expect(screen.getByText('blue')).toBeInTheDocument()
    expect(screen.getByText('purple')).toBeInTheDocument()
    expect(screen.getByText('Expert in React and modern frontend')).toBeInTheDocument()
    expect(screen.getByText('Expert in React and Vue')).toBeInTheDocument()

    // Unchanged fields don't show diff rows
    expect(screen.queryByText('name')).not.toBeInTheDocument()
  })

  it('filters out invalid enum values from the diff', async () => {
    renderWithProviders(
      <AgentEditCard
        targetId="frontend-developer"
        updates={{ color: 'neon', category: 'Not a category' }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Frontend Developer')).toBeInTheDocument()
    })

    // Bad values were dropped → no diff rows
    expect(screen.queryByText('color')).not.toBeInTheDocument()
    expect(screen.queryByText('category')).not.toBeInTheDocument()
    expect(screen.getByText(/No changes proposed/i)).toBeInTheDocument()
  })

  it('shows "no changes" when the proposed value equals the current value', async () => {
    renderWithProviders(
      <AgentEditCard
        targetId="frontend-developer"
        updates={{ color: 'blue' }} // same as current
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Frontend Developer')).toBeInTheDocument()
    })
    expect(screen.getByText(/No changes proposed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /apply changes/i })).toBeDisabled()
  })

  it('calls updateAgent with only the diff fields on apply', async () => {
    apiMock.updateAgent.mockResolvedValue({ ...existingAgent, color: 'purple' })

    const user = userEvent.setup()
    renderWithProviders(
      <AgentEditCard
        targetId="frontend-developer"
        updates={{ color: 'purple' }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Frontend Developer')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /apply changes/i }))

    await waitFor(() => {
      expect(apiMock.updateAgent).toHaveBeenCalledWith('frontend-developer', {
        color: 'purple',
      })
    })

    await waitFor(() => {
      expect(screen.getByText(/changes applied/i)).toBeInTheDocument()
    })

    const link = screen.getByRole('link', { name: /view page/i })
    expect(link).toHaveAttribute('href', '/agent/development-team/frontend-developer')
  })

  it('shows an error banner when updateAgent fails', async () => {
    apiMock.updateAgent.mockRejectedValue(new Error('DB is sad'))

    const user = userEvent.setup()
    renderWithProviders(
      <AgentEditCard
        targetId="frontend-developer"
        updates={{ color: 'purple' }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Frontend Developer')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /apply changes/i }))

    await waitFor(() => {
      expect(screen.getByText(/DB is sad/)).toBeInTheDocument()
    })
  })

  it('allows editing the proposed diff inline before applying', async () => {
    apiMock.updateAgent.mockResolvedValue({ ...existingAgent, color: 'rose' })

    const user = userEvent.setup()
    renderWithProviders(
      <AgentEditCard
        targetId="frontend-developer"
        updates={{ color: 'purple' }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Frontend Developer')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^edit$/i }))
    expect(screen.getByText(/Edit changes for Frontend Developer/i)).toBeInTheDocument()

    // Change color to rose via the swatch with title="rose"
    await user.click(screen.getByTitle('rose'))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    // Back in preview — diff should now show blue → rose
    expect(screen.getByText('rose')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /apply changes/i }))

    await waitFor(() => {
      expect(apiMock.updateAgent).toHaveBeenCalledWith('frontend-developer', {
        color: 'rose',
      })
    })
  })
})
