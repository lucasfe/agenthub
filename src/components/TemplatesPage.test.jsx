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

import { fetchTemplates, insertTemplate, updateTemplate, deleteTemplate } from '../lib/templatesApi'

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

  describe('+ New template flow', () => {
    it('shows a "+ New template" button on the page', async () => {
      fetchTemplates.mockResolvedValue([])
      renderWithProviders(<TemplatesPage />)
      expect(
        await screen.findByRole('button', { name: /new template/i }),
      ).toBeInTheDocument()
    })

    it('opens the create modal when the "+ New template" button is clicked', async () => {
      fetchTemplates.mockResolvedValue([])
      const user = userEvent.setup()
      renderWithProviders(<TemplatesPage />)

      await user.click(
        await screen.findByRole('button', { name: /new template/i }),
      )

      expect(
        screen.getByRole('heading', { name: /new template/i }),
      ).toBeInTheDocument()
      expect(screen.getByLabelText(/^template name$/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^task title$/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/template description/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/task description/i)).toBeInTheDocument()
    })

    it('cancel closes the modal without calling insertTemplate', async () => {
      fetchTemplates.mockResolvedValue([])
      const user = userEvent.setup()
      renderWithProviders(<TemplatesPage />)

      await user.click(
        await screen.findByRole('button', { name: /new template/i }),
      )
      expect(
        screen.getByRole('heading', { name: /new template/i }),
      ).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /cancel/i }))

      await waitFor(() =>
        expect(
          screen.queryByRole('heading', { name: /new template/i }),
        ).not.toBeInTheDocument(),
      )
      expect(insertTemplate).not.toHaveBeenCalled()
    })

    it('blocks submit when name or task title is empty', async () => {
      fetchTemplates.mockResolvedValue([])
      const user = userEvent.setup()
      renderWithProviders(<TemplatesPage />)

      await user.click(
        await screen.findByRole('button', { name: /new template/i }),
      )

      const submit = screen.getByRole('button', { name: /^create$/i })
      expect(submit).toBeDisabled()

      await user.type(screen.getByLabelText(/^template name$/i), 'My template')
      expect(submit).toBeDisabled()

      await user.type(screen.getByLabelText(/^task title$/i), 'Do the work')
      expect(submit).toBeEnabled()
    })

    it('submits and calls insertTemplate with plan:null and the user-provided fields', async () => {
      fetchTemplates.mockResolvedValue([])
      insertTemplate.mockResolvedValue({
        id: 'tpl-new',
        name: 'My template',
        description: 'When to use',
        task_title: 'Do the work',
        task_description: 'More detail',
        plan: null,
      })
      const user = userEvent.setup()
      renderWithProviders(<TemplatesPage />)

      await user.click(
        await screen.findByRole('button', { name: /new template/i }),
      )

      await user.type(screen.getByLabelText(/^template name$/i), 'My template')
      await user.type(screen.getByLabelText(/^task title$/i), 'Do the work')
      await user.type(
        screen.getByLabelText(/template description/i),
        'When to use',
      )
      await user.type(
        screen.getByLabelText(/task description/i),
        'More detail',
      )

      await user.click(screen.getByRole('button', { name: /^create$/i }))

      await waitFor(() => {
        expect(insertTemplate).toHaveBeenCalledTimes(1)
      })
      expect(insertTemplate).toHaveBeenCalledWith({
        name: 'My template',
        description: 'When to use',
        task_title: 'Do the work',
        task_description: 'More detail',
        plan: null,
      })
    })

    it('renders the new card in the grid after a successful insert', async () => {
      fetchTemplates.mockResolvedValue([])
      insertTemplate.mockResolvedValue({
        id: 'tpl-new',
        name: 'Fresh template',
        description: null,
        task_title: 'Some title',
        task_description: '',
        plan: null,
      })
      const user = userEvent.setup()
      renderWithProviders(<TemplatesPage />)

      expect(await screen.findByText(/no templates yet/i)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /new template/i }))
      await user.type(
        screen.getByLabelText(/^template name$/i),
        'Fresh template',
      )
      await user.type(screen.getByLabelText(/^task title$/i), 'Some title')
      await user.click(screen.getByRole('button', { name: /^create$/i }))

      expect(await screen.findByText('Fresh template')).toBeInTheDocument()
      expect(screen.queryByText(/no templates yet/i)).not.toBeInTheDocument()
    })
  })
})
