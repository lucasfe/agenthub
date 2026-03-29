import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateTeamPage from './CreateTeamPage'
import { renderWithProviders } from '../test/test-utils'

const mockAgents = [
  { id: 'frontend-developer', name: 'Frontend Dev', category: 'Development Team', description: 'Frontend expert', tags: ['React'], icon: 'Monitor', color: 'blue', popularity: 90 },
  { id: 'backend-developer', name: 'Backend Dev', category: 'Development Team', description: 'Backend expert', tags: ['Node'], icon: 'Server', color: 'green', popularity: 85 },
]

vi.mock('../lib/api', () => ({
  fetchAgents: vi.fn().mockResolvedValue([
    { id: 'frontend-developer', name: 'Frontend Dev', category: 'Development Team', description: 'Frontend expert', tags: ['React'], icon: 'Monitor', color: 'blue', popularity: 90 },
    { id: 'backend-developer', name: 'Backend Dev', category: 'Development Team', description: 'Backend expert', tags: ['Node'], icon: 'Server', color: 'green', popularity: 85 },
  ]),
  fetchTeams: vi.fn().mockResolvedValue([]),
  fetchTeam: vi.fn().mockResolvedValue({
    id: 'test-team',
    name: 'Test Team',
    description: 'A test team',
    color: 'blue',
    agents: ['frontend-developer'],
  }),
  createTeam: vi.fn().mockResolvedValue({ id: 'new-team' }),
  updateTeam: vi.fn().mockResolvedValue({ id: 'test-team' }),
}))

const { createTeam, updateTeam } = await import('../lib/api')

describe('CreateTeamPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders create form with all sections', async () => {
    renderWithProviders(<CreateTeamPage />)
    expect(screen.getByRole('heading', { name: 'Create Team' })).toBeInTheDocument()
    expect(screen.getByText('Details')).toBeInTheDocument()
    expect(screen.getByText('Agents')).toBeInTheDocument()
  })

  it('renders name and description inputs', () => {
    renderWithProviders(<CreateTeamPage />)
    expect(screen.getByPlaceholderText('e.g. Web App Squad')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('What does this team do...')).toBeInTheDocument()
  })

  it('renders color options', () => {
    renderWithProviders(<CreateTeamPage />)
    expect(screen.getByTitle('Blue')).toBeInTheDocument()
    expect(screen.getByTitle('Green')).toBeInTheDocument()
  })

  it('submits and calls createTeam with correct data', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CreateTeamPage />)

    await user.type(screen.getByPlaceholderText('e.g. Web App Squad'), 'My Team')
    await user.type(screen.getByPlaceholderText('What does this team do...'), 'A great team')

    await user.click(screen.getByRole('button', { name: /create team/i }))

    await waitFor(() => {
      expect(createTeam).toHaveBeenCalledWith({
        id: 'my-team',
        name: 'My Team',
        description: 'A great team',
        color: 'blue',
        agents: [],
      })
    })
  })

  it('shows error message on submit failure', async () => {
    createTeam.mockRejectedValueOnce(new Error('Duplicate key'))
    const user = userEvent.setup()
    renderWithProviders(<CreateTeamPage />)

    await user.type(screen.getByPlaceholderText('e.g. Web App Squad'), 'Fail Team')
    await user.type(screen.getByPlaceholderText('What does this team do...'), 'Will fail')

    await user.click(screen.getByRole('button', { name: /create team/i }))

    await waitFor(() => {
      expect(screen.getByText('Duplicate key')).toBeInTheDocument()
    })
  })

  it('shows loading state during submission', async () => {
    createTeam.mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    renderWithProviders(<CreateTeamPage />)

    await user.type(screen.getByPlaceholderText('e.g. Web App Squad'), 'Loading Team')
    await user.type(screen.getByPlaceholderText('What does this team do...'), 'Testing')

    await user.click(screen.getByRole('button', { name: /create team/i }))

    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument()
    })
  })

  it('has cancel link back to teams', () => {
    renderWithProviders(<CreateTeamPage />)
    const cancelLink = screen.getByText('Cancel')
    expect(cancelLink.closest('a')).toHaveAttribute('href', '/teams')
  })
})
