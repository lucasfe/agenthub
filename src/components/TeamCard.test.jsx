import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import TeamCard from './TeamCard'
import { renderWithProviders } from '../test/test-utils'

vi.mock('../lib/api', () => ({
  fetchAgents: vi.fn().mockResolvedValue([
    { id: 'frontend-developer', name: 'Frontend Dev', category: 'Development Team', description: 'Frontend', tags: ['React'], icon: 'Monitor', color: 'blue', popularity: 90 },
  ]),
  fetchTeams: vi.fn().mockResolvedValue([]),
  fetchTools: vi.fn().mockResolvedValue([]),
}))

const mockTeam = {
  id: 'web-app-squad',
  name: 'Web App Squad',
  description: 'End-to-end web application development',
  color: 'blue',
  agents: ['frontend-developer', 'backend-developer'],
  created_at: '2026-02-15',
}

describe('TeamCard', () => {
  it('renders team name and description', () => {
    renderWithProviders(<TeamCard team={mockTeam} />)
    expect(screen.getByText('Web App Squad')).toBeInTheDocument()
    expect(screen.getByText('End-to-end web application development')).toBeInTheDocument()
  })

  it('links to correct team detail page', () => {
    const { container } = renderWithProviders(<TeamCard team={mockTeam} />)
    const link = container.querySelector('a')
    expect(link).toHaveAttribute('href', '/teams/web-app-squad')
  })

  it('renders without crashing when agents is null', () => {
    const teamWithNullAgents = { ...mockTeam, agents: null }
    renderWithProviders(<TeamCard team={teamWithNullAgents} />)
    expect(screen.getByText('Web App Squad')).toBeInTheDocument()
    expect(screen.getByText('0 agents')).toBeInTheDocument()
  })

  it('renders without crashing when agents is undefined', () => {
    const { agents, ...teamWithoutAgents } = mockTeam
    renderWithProviders(<TeamCard team={teamWithoutAgents} />)
    expect(screen.getByText('Web App Squad')).toBeInTheDocument()
  })

  it('renders without crashing when agents is empty array', () => {
    const teamWithEmptyAgents = { ...mockTeam, agents: [] }
    renderWithProviders(<TeamCard team={teamWithEmptyAgents} />)
    expect(screen.getByText('Web App Squad')).toBeInTheDocument()
    expect(screen.getByText('0 agents')).toBeInTheDocument()
  })
})
