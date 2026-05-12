import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/test-utils'
import Sidebar from './Sidebar'

vi.mock('../lib/api', () => ({
  fetchTeams: vi.fn().mockResolvedValue([]),
  fetchTools: vi.fn().mockResolvedValue([]),
  trackAgentUsage: vi.fn().mockResolvedValue(null),
}))

vi.mock('../lib/agentsRepo', () => ({
  listAgents: vi.fn().mockResolvedValue([]),
}))

vi.mock('../lib/supabase', () => ({
  supabase: null,
}))

describe('Sidebar', () => {
  it('renders Board and Templates links with the correct hrefs', () => {
    renderWithProviders(<Sidebar />)
    expect(screen.getByRole('link', { name: 'Board' })).toHaveAttribute('href', '/board')
    expect(screen.getByRole('link', { name: 'Templates' })).toHaveAttribute('href', '/templates')
  })

  it('nests Templates under Board instead of rendering it as a top-level entry', () => {
    renderWithProviders(<Sidebar />)
    const boardLink = screen.getByRole('link', { name: 'Board' })
    const templatesLink = screen.getByRole('link', { name: 'Templates' })
    const agentsLink = screen.getByRole('link', { name: /^Agents/ })

    // Templates must live inside Board's wrapper, deeper than the top-level entries.
    expect(boardLink.parentElement).toContainElement(templatesLink)
    // Top-level entries (Board, Agents) share the same direct parent; Templates does not.
    expect(templatesLink.parentElement).not.toBe(agentsLink.parentElement)
  })
})
