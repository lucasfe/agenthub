import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AgentCard from './AgentCard'
import { renderWithProviders } from '../test/test-utils'

vi.mock('../lib/api', () => ({
  fetchAgents: vi.fn().mockResolvedValue([]),
  fetchTeams: vi.fn().mockResolvedValue([]),
  fetchTools: vi.fn().mockResolvedValue([]),
}))

const mockAgent = {
  id: 'frontend-developer',
  name: 'Frontend Developer',
  category: 'Development Team',
  description: 'Expert in React, TypeScript and modern frontend development',
  tags: ['React', 'TypeScript', 'CSS'],
  icon: 'Monitor',
  color: 'blue',
  popularity: 98,
}

describe('AgentCard', () => {
  it('renders agent name and description', () => {
    renderWithProviders(<AgentCard agent={mockAgent} viewMode="grid" />)
    expect(screen.getByText('Frontend Developer')).toBeInTheDocument()
    expect(screen.getByText('Expert in React, TypeScript and modern frontend development')).toBeInTheDocument()
  })

  it('renders all tags', () => {
    renderWithProviders(<AgentCard agent={mockAgent} viewMode="grid" />)
    expect(screen.getByText('React')).toBeInTheDocument()
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
    expect(screen.getByText('CSS')).toBeInTheDocument()
  })

  it('displays formatted download count from popularity', () => {
    renderWithProviders(<AgentCard agent={mockAgent} viewMode="grid" />)
    // 98 * 243 = 23,814
    const expected = (98 * 243).toLocaleString()
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it('shows category slug', () => {
    renderWithProviders(<AgentCard agent={mockAgent} viewMode="grid" />)
    expect(screen.getByText('development-team')).toBeInTheDocument()
  })

  it('links to correct detail page', () => {
    const { container } = renderWithProviders(<AgentCard agent={mockAgent} viewMode="grid" />)
    const link = container.querySelector('a')
    expect(link).toHaveAttribute('href', '/agent/development-team/frontend-developer')
  })

  it('renders in list mode', () => {
    const { container } = renderWithProviders(<AgentCard agent={mockAgent} viewMode="list" />)
    const link = container.querySelector('a')
    expect(link).toHaveClass('flex', 'items-center')
    expect(screen.getByText('Frontend Developer')).toBeInTheDocument()
  })

  it('toggles stack on button click', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AgentCard agent={mockAgent} viewMode="grid" />)

    const button = screen.getAllByRole('button')[0]
    await user.click(button)

    // After click, button should have the active style
    expect(button).toHaveClass('bg-accent-green')
  })

  it('renders with fallback icon for invalid icon name', () => {
    const agent = { ...mockAgent, icon: 'InvalidIcon' }
    renderWithProviders(<AgentCard agent={agent} viewMode="grid" />)
    expect(screen.getByText('Frontend Developer')).toBeInTheDocument()
  })

  it('uses default blue color for unknown color', () => {
    const agent = { ...mockAgent, color: 'unknown' }
    const { container } = renderWithProviders(<AgentCard agent={agent} viewMode="grid" />)
    expect(container.querySelector('.from-blue-500\\/15')).toBeInTheDocument()
  })
})
