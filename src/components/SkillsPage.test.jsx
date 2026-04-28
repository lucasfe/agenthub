import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import SkillsPage from './SkillsPage'
import { renderWithProviders } from '../test/test-utils'

vi.mock('../lib/api', () => ({
  fetchAgents: vi.fn().mockResolvedValue([]),
  fetchTeams: vi.fn().mockResolvedValue([]),
  fetchTools: vi.fn().mockResolvedValue([]),
}))

vi.mock('../lib/skills', () => ({
  listSkills: vi.fn(),
}))

import { listSkills } from '../lib/skills'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SkillsPage', () => {
  it('renders the loading state with no cards', () => {
    listSkills.mockReturnValue(new Promise(() => {}))
    renderWithProviders(<SkillsPage />)
    expect(screen.getByText(/loading skills/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /copy install command/i }),
    ).not.toBeInTheDocument()
  })

  it('renders the error state with no cards', async () => {
    listSkills.mockRejectedValue(new Error('rate limited (403)'))
    renderWithProviders(<SkillsPage />)
    expect(await screen.findByText(/failed to load skills/i)).toBeInTheDocument()
    expect(screen.getByText(/rate limited \(403\)/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /copy install command/i }),
    ).not.toBeInTheDocument()
  })

  it('renders one card per skill plus the trailing create card', async () => {
    listSkills.mockResolvedValue([
      {
        slug: 'grill-me',
        name: 'grill-me',
        description: 'Interview the user',
        sourceUrl: 'https://github.com/lucasfe/skills/tree/main/grill-me',
      },
      {
        slug: 'to-prd',
        name: 'to-prd',
        description: 'Turn context into a PRD',
        sourceUrl: 'https://github.com/lucasfe/skills/tree/main/to-prd',
      },
    ])
    renderWithProviders(<SkillsPage />)

    expect(await screen.findByText('grill-me')).toBeInTheDocument()
    expect(screen.getByText('to-prd')).toBeInTheDocument()

    const copyButtons = screen.getAllByRole('button', {
      name: /copy install command/i,
    })
    expect(copyButtons).toHaveLength(2)

    expect(
      screen.getByRole('link', { name: /create skill/i }),
    ).toHaveAttribute('href', '/agent/ai-specialists/skill-creator')
  })

  it('renders the create-skill card even when the catalog is empty', async () => {
    listSkills.mockResolvedValue([])
    renderWithProviders(<SkillsPage />)

    await waitFor(() => {
      expect(
        screen.queryByText(/loading skills/i),
      ).not.toBeInTheDocument()
    })

    expect(
      screen.queryByRole('button', { name: /copy install command/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /create skill/i }),
    ).toHaveAttribute('href', '/agent/ai-specialists/skill-creator')
  })
})
