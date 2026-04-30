import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TemplatesPage from './TemplatesPage'
import { renderWithProviders } from '../test/test-utils'

vi.mock('../lib/api', () => ({
  fetchAgents: vi.fn().mockResolvedValue([]),
  fetchTeams: vi.fn().mockResolvedValue([]),
  fetchTools: vi.fn().mockResolvedValue([]),
  trackAgentUsage: vi.fn().mockResolvedValue(null),
}))

vi.mock('../lib/templatesApi', () => ({
  fetchTemplates: vi.fn(),
  insertTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    session: { access_token: 'test-access-token' },
    user: { email: 'lucasfe@gmail.com' },
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}))

import { fetchTemplates, insertTemplate } from '../lib/templatesApi'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TemplatesPage', () => {
  it('calls fetchTemplates on mount', async () => {
    fetchTemplates.mockResolvedValue([])
    renderWithProviders(<TemplatesPage />)
    await waitFor(() => expect(fetchTemplates).toHaveBeenCalledTimes(1))
  })

  it('renders the empty state when no templates exist', async () => {
    fetchTemplates.mockResolvedValue([])
    renderWithProviders(<TemplatesPage />)
    expect(await screen.findByText(/no templates yet/i)).toBeInTheDocument()
  })

  it('renders one card per template, each showing name and step count', async () => {
    fetchTemplates.mockResolvedValue([
      {
        id: 'tpl-1',
        name: 'Bug fix template',
        description: 'For routine bug fixes',
        task_title: 'Fix bug',
        task_description: '',
        plan: { steps: [{ id: 1, agent_id: 'a' }, { id: 2, agent_id: 'b' }] },
      },
      {
        id: 'tpl-2',
        name: 'Feature template',
        description: null,
        task_title: 'Build feature',
        task_description: '',
        plan: null,
      },
    ])
    renderWithProviders(<TemplatesPage />)

    expect(await screen.findByText('Bug fix template')).toBeInTheDocument()
    expect(screen.getByText('Feature template')).toBeInTheDocument()
    expect(screen.getByText(/for routine bug fixes/i)).toBeInTheDocument()
    expect(screen.getByText(/2 steps/i)).toBeInTheDocument()
    expect(screen.getByText(/no plan yet/i)).toBeInTheDocument()
  })

  it('shows a loading indicator before the fetch resolves', () => {
    fetchTemplates.mockReturnValue(new Promise(() => {}))
    renderWithProviders(<TemplatesPage />)
    expect(screen.getByText(/loading templates/i)).toBeInTheDocument()
  })

  it('shows an error state when the fetch rejects', async () => {
    fetchTemplates.mockRejectedValue(new Error('network down'))
    renderWithProviders(<TemplatesPage />)
    expect(await screen.findByText(/failed to load templates/i)).toBeInTheDocument()
    expect(screen.getByText(/network down/i)).toBeInTheDocument()
  })
})
