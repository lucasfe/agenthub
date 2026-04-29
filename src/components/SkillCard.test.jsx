import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SkillCard from './SkillCard'
import { renderWithProviders } from '../test/test-utils'

vi.mock('../lib/api', () => ({
  fetchAgents: vi.fn().mockResolvedValue([]),
  fetchTeams: vi.fn().mockResolvedValue([]),
  fetchTools: vi.fn().mockResolvedValue([]),
  trackAgentUsage: vi.fn().mockResolvedValue(null),
}))

const mockSkill = {
  slug: 'grill-me',
  name: 'grill-me',
  description: 'Interview the user relentlessly about a plan',
  sourceUrl: 'https://github.com/lucasfe/skills/tree/main/grill-me',
}

function setupClipboard() {
  const user = userEvent.setup()
  const writeText = vi
    .spyOn(navigator.clipboard, 'writeText')
    .mockResolvedValue(undefined)
  return { user, writeText }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SkillCard — default variant', () => {
  it('renders the skill name and description', () => {
    renderWithProviders(<SkillCard skill={mockSkill} />)
    expect(screen.getByText('grill-me')).toBeInTheDocument()
    expect(
      screen.getByText('Interview the user relentlessly about a plan'),
    ).toBeInTheDocument()
  })

  it('writes the install command to the clipboard on click', async () => {
    const { user, writeText } = setupClipboard()
    renderWithProviders(<SkillCard skill={mockSkill} />)
    await user.click(screen.getByRole('button', { name: /copy install command/i }))
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(
      'npx degit --mode=git lucasfe/skills/grill-me ~/.claude/skills/grill-me',
    )
  })

  it('shows transient "Copied!" feedback after the click', async () => {
    const { user } = setupClipboard()
    renderWithProviders(<SkillCard skill={mockSkill} />)
    await user.click(screen.getByRole('button', { name: /copy install command/i }))
    expect(
      await screen.findByRole('button', { name: /copied!/i }),
    ).toBeInTheDocument()
  })

  it('links to the source on GitHub', () => {
    renderWithProviders(<SkillCard skill={mockSkill} />)
    const link = screen.getByRole('link', { name: /view on github/i })
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/lucasfe/skills/tree/main/grill-me',
    )
  })

  it('does not render the install button in create variant', () => {
    renderWithProviders(<SkillCard variant="create" />)
    expect(
      screen.queryByRole('button', { name: /copy install command/i }),
    ).not.toBeInTheDocument()
  })
})

describe('SkillCard — create variant', () => {
  it('renders the create-skill affordance', () => {
    renderWithProviders(<SkillCard variant="create" />)
    expect(screen.getByText(/create skill/i)).toBeInTheDocument()
  })

  it('navigates to the Skill Creator agent route on click', () => {
    renderWithProviders(<SkillCard variant="create" />)
    const link = screen.getByRole('link', { name: /create skill/i })
    expect(link).toHaveAttribute('href', '/agent/ai-specialists/skill-creator')
  })
})
