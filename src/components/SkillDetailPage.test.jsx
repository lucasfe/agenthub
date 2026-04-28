import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'

vi.mock('./Header', () => ({
  default: () => null,
}))

vi.mock('../lib/skills', () => ({
  getSkill: vi.fn(),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    session: { access_token: 'test-access-token' },
    user: { email: 'lucasfe@gmail.com' },
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}))

import { getSkill } from '../lib/skills'
import SkillDetailPage from './SkillDetailPage'

function renderAtSlug(slug) {
  return render(
    <MemoryRouter initialEntries={[`/skills/${slug}`]}>
      <Routes>
        <Route path="/skills/:slug" element={<SkillDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SkillDetailPage', () => {
  it('renders the install command, body, and source link on success', async () => {
    getSkill.mockResolvedValue({
      slug: 'grill-me',
      name: 'grill-me',
      description: 'Interview the user',
      body: '## Heading\n\nFull body here.',
      sourceUrl: 'https://github.com/lucasfe/skills/tree/main/grill-me',
    })

    renderAtSlug('grill-me')

    expect(await screen.findByRole('heading', { name: 'grill-me', level: 1 })).toBeInTheDocument()
    expect(
      screen.getByText('npx degit lucasfe/skills/grill-me ~/.claude/skills/grill-me'),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /heading/i, level: 2 })).toBeInTheDocument()
    expect(screen.getByText(/full body here/i)).toBeInTheDocument()
    const sourceLink = screen.getByRole('link', { name: /view source on github/i })
    expect(sourceLink).toHaveAttribute(
      'href',
      'https://github.com/lucasfe/skills/tree/main/grill-me',
    )
  })

  it('renders a clean 404-style empty state when the slug does not exist', async () => {
    getSkill.mockResolvedValue(null)

    renderAtSlug('does-not-exist')

    expect(await screen.findByText(/skill not found/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to skills/i })).toHaveAttribute(
      'href',
      '/skills',
    )
  })

  it('renders an error state when fetching fails', async () => {
    getSkill.mockRejectedValue(new Error('rate limited (403)'))

    renderAtSlug('grill-me')

    expect(await screen.findByText(/failed to load skill/i)).toBeInTheDocument()
    expect(screen.getByText(/rate limited \(403\)/i)).toBeInTheDocument()
  })

  it('renders a loading state while fetching', () => {
    getSkill.mockReturnValue(new Promise(() => {}))
    renderAtSlug('grill-me')
    expect(screen.getByText(/loading skill/i)).toBeInTheDocument()
  })

  it('copies the install command on click', async () => {
    getSkill.mockResolvedValue({
      slug: 'grill-me',
      name: 'grill-me',
      description: 'Interview the user',
      body: 'body',
      sourceUrl: 'https://github.com/lucasfe/skills/tree/main/grill-me',
    })
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined)

    renderAtSlug('grill-me')

    const button = await screen.findByRole('button', { name: /copy install command/i })
    await user.click(button)
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'npx degit lucasfe/skills/grill-me ~/.claude/skills/grill-me',
      ),
    )
  })
})
