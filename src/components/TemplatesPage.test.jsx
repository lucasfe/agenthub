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

  describe('Edit drawer flow', () => {
    const sampleTemplate = {
      id: 'tpl-edit',
      name: 'Bug fix template',
      description: 'For routine bug fixes',
      task_title: 'Fix bug',
      task_description: 'Investigate and fix',
      plan: {
        steps: [
          {
            id: 1,
            agent_id: 'frontend-developer',
            agent_name: 'Frontend Dev',
            task: 'Reproduce the bug',
            requirements: [{ key: 'env', label: 'Environment', required: true }],
          },
          {
            id: 2,
            agent_id: 'qa-engineer',
            agent_name: 'QA Engineer',
            task: 'Add a regression test',
            requirements: [],
          },
        ],
      },
    }

    it('opens the edit drawer when a template card is clicked', async () => {
      fetchTemplates.mockResolvedValue([sampleTemplate])
      const user = userEvent.setup()
      renderWithProviders(<TemplatesPage />)

      await user.click(await screen.findByRole('button', { name: /bug fix template/i }))

      expect(
        await screen.findByRole('heading', { name: /edit template/i }),
      ).toBeInTheDocument()
      expect(screen.getByLabelText(/^template name$/i)).toHaveValue('Bug fix template')
      expect(screen.getByLabelText(/template description/i)).toHaveValue('For routine bug fixes')
      expect(screen.getByLabelText(/^task title$/i)).toHaveValue('Fix bug')
      expect(screen.getByLabelText(/task description/i)).toHaveValue('Investigate and fix')
    })

    it('renders one editable textarea per plan step labelled with the agent name', async () => {
      fetchTemplates.mockResolvedValue([sampleTemplate])
      const user = userEvent.setup()
      renderWithProviders(<TemplatesPage />)

      await user.click(await screen.findByRole('button', { name: /bug fix template/i }))

      expect(await screen.findByLabelText(/step 1 — frontend dev/i)).toHaveValue('Reproduce the bug')
      expect(screen.getByLabelText(/step 2 — qa engineer/i)).toHaveValue('Add a regression test')
    })

    it('does NOT render editable inputs for agent_id, agent_name, requirements, or step order', async () => {
      fetchTemplates.mockResolvedValue([sampleTemplate])
      const user = userEvent.setup()
      renderWithProviders(<TemplatesPage />)

      await user.click(await screen.findByRole('button', { name: /bug fix template/i }))
      await screen.findByRole('heading', { name: /edit template/i })

      // Per acceptance criteria, agent identity and requirements stay read-only.
      expect(screen.queryByLabelText(/agent id/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/^agent name$/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/requirements/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/step order/i)).not.toBeInTheDocument()
    })

    it('Save persists top-level edits via updateTemplate and reflects the new name on the card', async () => {
      fetchTemplates.mockResolvedValue([sampleTemplate])
      updateTemplate.mockImplementation((id, updates) =>
        Promise.resolve({ ...sampleTemplate, ...updates }),
      )
      const user = userEvent.setup()
      renderWithProviders(<TemplatesPage />)

      await user.click(await screen.findByRole('button', { name: /bug fix template/i }))

      const nameInput = screen.getByLabelText(/^template name$/i)
      await user.clear(nameInput)
      await user.type(nameInput, 'Renamed template')

      await user.click(screen.getByRole('button', { name: /^save$/i }))

      await waitFor(() => expect(updateTemplate).toHaveBeenCalledTimes(1))
      expect(updateTemplate).toHaveBeenCalledWith('tpl-edit', expect.objectContaining({
        name: 'Renamed template',
        description: 'For routine bug fixes',
        task_title: 'Fix bug',
        task_description: 'Investigate and fix',
      }))

      await waitFor(() =>
        expect(
          screen.queryByRole('heading', { name: /edit template/i }),
        ).not.toBeInTheDocument(),
      )
      expect(await screen.findByText('Renamed template')).toBeInTheDocument()
    })

    it('Save persists step.task edits via updateTemplate while preserving non-editable plan fields', async () => {
      fetchTemplates.mockResolvedValue([sampleTemplate])
      updateTemplate.mockImplementation((id, updates) =>
        Promise.resolve({ ...sampleTemplate, ...updates }),
      )
      const user = userEvent.setup()
      renderWithProviders(<TemplatesPage />)

      await user.click(await screen.findByRole('button', { name: /bug fix template/i }))

      const stepInput = await screen.findByLabelText(/step 1 — frontend dev/i)
      await user.clear(stepInput)
      await user.type(stepInput, 'Reproduce the bug locally with the new fixture')

      await user.click(screen.getByRole('button', { name: /^save$/i }))

      await waitFor(() => expect(updateTemplate).toHaveBeenCalledTimes(1))
      const call = updateTemplate.mock.calls[0]
      expect(call[0]).toBe('tpl-edit')
      const updatedPlan = call[1].plan
      expect(updatedPlan.steps[0]).toMatchObject({
        id: 1,
        agent_id: 'frontend-developer',
        agent_name: 'Frontend Dev',
        task: 'Reproduce the bug locally with the new fixture',
      })
      expect(updatedPlan.steps[0].requirements).toEqual([
        { key: 'env', label: 'Environment', required: true },
      ])
      expect(updatedPlan.steps[1]).toMatchObject({
        id: 2,
        agent_id: 'qa-engineer',
        agent_name: 'QA Engineer',
        task: 'Add a regression test',
      })
    })

    it('Cancel closes the drawer without calling updateTemplate', async () => {
      fetchTemplates.mockResolvedValue([sampleTemplate])
      const user = userEvent.setup()
      renderWithProviders(<TemplatesPage />)

      await user.click(await screen.findByRole('button', { name: /bug fix template/i }))

      const nameInput = await screen.findByLabelText(/^template name$/i)
      await user.clear(nameInput)
      await user.type(nameInput, 'Local edit that should be discarded')

      await user.click(screen.getByRole('button', { name: /^cancel$/i }))

      await waitFor(() =>
        expect(
          screen.queryByRole('heading', { name: /edit template/i }),
        ).not.toBeInTheDocument(),
      )
      expect(updateTemplate).not.toHaveBeenCalled()
      expect(screen.getByText('Bug fix template')).toBeInTheDocument()
    })

    it('Escape closes the drawer without calling updateTemplate', async () => {
      fetchTemplates.mockResolvedValue([sampleTemplate])
      const user = userEvent.setup()
      renderWithProviders(<TemplatesPage />)

      await user.click(await screen.findByRole('button', { name: /bug fix template/i }))
      await screen.findByRole('heading', { name: /edit template/i })

      await user.keyboard('{Escape}')

      await waitFor(() =>
        expect(
          screen.queryByRole('heading', { name: /edit template/i }),
        ).not.toBeInTheDocument(),
      )
      expect(updateTemplate).not.toHaveBeenCalled()
    })

    it('renders a clear "no plan attached" message and no step editor for null-plan templates', async () => {
      fetchTemplates.mockResolvedValue([
        {
          id: 'tpl-no-plan',
          name: 'Plain template',
          description: 'No plan yet',
          task_title: 'Just a title',
          task_description: '',
          plan: null,
        },
      ])
      const user = userEvent.setup()
      renderWithProviders(<TemplatesPage />)

      await user.click(await screen.findByRole('button', { name: /plain template/i }))

      expect(await screen.findByLabelText(/^template name$/i)).toHaveValue('Plain template')
      expect(screen.getByText(/no plan attached/i)).toBeInTheDocument()
      expect(screen.queryByLabelText(/^step 1 /i)).not.toBeInTheDocument()
    })
  })

  describe('Delete flow', () => {
    const sampleTemplate = {
      id: 'tpl-del',
      name: 'Disposable template',
      description: 'Will be deleted',
      task_title: 'Title',
      task_description: '',
      plan: null,
    }

    it('asks for confirmation before calling deleteTemplate', async () => {
      fetchTemplates.mockResolvedValue([sampleTemplate])
      const user = userEvent.setup()
      renderWithProviders(<TemplatesPage />)

      await user.click(await screen.findByRole('button', { name: /disposable template/i }))
      await user.click(await screen.findByRole('button', { name: /^delete template$/i }))

      // First click reveals confirmation, doesn't fire delete yet.
      expect(deleteTemplate).not.toHaveBeenCalled()
      expect(await screen.findByRole('button', { name: /^confirm delete$/i })).toBeInTheDocument()
    })

    it('confirming delete removes the card and closes the drawer', async () => {
      fetchTemplates.mockResolvedValue([sampleTemplate])
      deleteTemplate.mockResolvedValue(undefined)
      const user = userEvent.setup()
      renderWithProviders(<TemplatesPage />)

      await user.click(await screen.findByRole('button', { name: /disposable template/i }))
      await user.click(await screen.findByRole('button', { name: /^delete template$/i }))
      await user.click(await screen.findByRole('button', { name: /^confirm delete$/i }))

      await waitFor(() => expect(deleteTemplate).toHaveBeenCalledWith('tpl-del'))
      await waitFor(() =>
        expect(
          screen.queryByRole('heading', { name: /edit template/i }),
        ).not.toBeInTheDocument(),
      )
      expect(screen.queryByText('Disposable template')).not.toBeInTheDocument()
    })

    it('cancelling the confirmation keeps the template visible', async () => {
      fetchTemplates.mockResolvedValue([sampleTemplate])
      const user = userEvent.setup()
      renderWithProviders(<TemplatesPage />)

      await user.click(await screen.findByRole('button', { name: /disposable template/i }))
      await user.click(await screen.findByRole('button', { name: /^delete template$/i }))

      // After clicking the destructive trigger, a "Cancel delete" appears alongside "Confirm delete".
      await user.click(await screen.findByRole('button', { name: /^cancel delete$/i }))

      expect(deleteTemplate).not.toHaveBeenCalled()
      expect(await screen.findByRole('button', { name: /^delete template$/i })).toBeInTheDocument()
    })
  })
})
