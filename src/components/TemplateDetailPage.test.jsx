import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route, MemoryRouter } from 'react-router'
import { render } from '@testing-library/react'
import TemplateDetailPage from './TemplateDetailPage'
import { ThemeProvider } from '../context/ThemeContext'
import { DataProvider } from '../context/DataContext'

vi.mock('../lib/api', () => ({
  fetchTeams: vi.fn().mockResolvedValue([]),
  fetchTools: vi.fn().mockResolvedValue([]),
  trackAgentUsage: vi.fn().mockResolvedValue(null),
}))

vi.mock('../lib/agentsRepo', () => ({
  listAgents: vi.fn().mockResolvedValue([]),
  getAgent: vi.fn(),
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  deleteAgent: vi.fn(),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    session: { access_token: 'test-access-token' },
    user: { email: 'lucasfe@gmail.com' },
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}))

vi.mock('../lib/templatesApi', () => ({
  fetchTemplates: vi.fn().mockResolvedValue([]),
  insertTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
}))

vi.mock('../lib/templateReferencesApi', () => ({
  fetchReferences: vi.fn(),
  createTextReference: vi.fn(),
  createImageReference: vi.fn(),
  updateReference: vi.fn(),
  deleteReference: vi.fn(),
  getReferenceSignedUrl: vi.fn(),
  fetchTemplateById: vi.fn(),
}))

import { updateTemplate } from '../lib/templatesApi'
import {
  fetchReferences,
  createTextReference,
  createImageReference,
  deleteReference,
  getReferenceSignedUrl,
  fetchTemplateById,
} from '../lib/templateReferencesApi'

function renderAtRoute(path = '/templates/tpl-1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DataProvider>
        <ThemeProvider>
          <Routes>
            <Route path="/templates/:id" element={<TemplateDetailPage />} />
          </Routes>
        </ThemeProvider>
      </DataProvider>
    </MemoryRouter>,
  )
}

const sampleTemplate = {
  id: 'tpl-1',
  name: 'Luiza pipeline',
  description: 'Content automation pipeline',
  brand_context: 'Speak warmly in Portuguese.',
  params_schema: {
    topic: { type: 'string', required: true },
    time_range: { type: 'string', required: true },
  },
  title_template: 'Conteúdo: {{params.topic}}',
  description_template: 'Tópico {{params.topic}}',
  plan: {
    steps: [
      {
        id: 1,
        order: 1,
        agent_id: 'pedro-pesquisa',
        agent_name: 'Pedro Pesquisa',
        tool_keys: ['web_search'],
        params_keys: ['topic', 'time_range'],
        needs_outputs_from: [],
        reference_ids: [],
        instruction: 'Pesquise sobre {{params.topic}} nos últimos {{params.time_range}}.',
        requires_approval: true,
      },
      {
        id: 2,
        order: 2,
        agent_id: 'iago-instagram',
        agent_name: 'Iago Instagram',
        tool_keys: [],
        params_keys: [],
        needs_outputs_from: [1],
        reference_ids: ['ref-tone-id'],
        instruction: 'Use {{step-1.output}} no tom {{ref:tone}}.',
        requires_approval: false,
      },
    ],
  },
}

const sampleReferences = [
  {
    id: 'ref-tone-id',
    template_id: 'tpl-1',
    key: 'tone',
    kind: 'text',
    content_text: 'Speak warmly.',
    mime_type: 'text/markdown',
    original_filename: 'tone.md',
    created_at: '2026-05-01T00:00:00Z',
  },
  {
    id: 'ref-mood-id',
    template_id: 'tpl-1',
    key: 'mood',
    kind: 'image',
    storage_path: 'tpl-1/mood.png',
    mime_type: 'image/png',
    original_filename: 'mood.png',
    created_at: '2026-05-02T00:00:00Z',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  fetchTemplateById.mockResolvedValue(sampleTemplate)
  fetchReferences.mockResolvedValue(sampleReferences)
  getReferenceSignedUrl.mockResolvedValue('https://signed.example/preview.png')
})

describe('TemplateDetailPage — loading, not-found, and basic header', () => {
  it('shows a loading indicator before the fetch resolves', () => {
    fetchTemplateById.mockReturnValue(new Promise(() => {}))
    renderAtRoute()
    expect(screen.getByText(/loading template/i)).toBeInTheDocument()
  })

  it('shows a not-found message when fetchTemplateById returns null', async () => {
    fetchTemplateById.mockResolvedValue(null)
    renderAtRoute('/templates/missing')
    expect(await screen.findByText(/template not found/i)).toBeInTheDocument()
  })

  it('renders the template name and description', async () => {
    renderAtRoute()
    expect(await screen.findByRole('heading', { name: /luiza pipeline/i })).toBeInTheDocument()
    expect(screen.getByText(/content automation pipeline/i)).toBeInTheDocument()
  })

  it('renders a back link to /templates', async () => {
    renderAtRoute()
    const back = await screen.findByRole('link', { name: /back to templates/i })
    expect(back).toHaveAttribute('href', '/templates')
  })
})

describe('TemplateDetailPage — brand_context editor', () => {
  it('pre-fills the brand context textarea with the current value', async () => {
    renderAtRoute()
    const textarea = await screen.findByLabelText(/^brand context$/i)
    expect(textarea).toHaveValue('Speak warmly in Portuguese.')
  })

  it('saving brand_context calls updateTemplate with the new value', async () => {
    updateTemplate.mockImplementation((id, updates) =>
      Promise.resolve({ ...sampleTemplate, ...updates }),
    )
    const user = userEvent.setup()
    renderAtRoute()

    const textarea = await screen.findByLabelText(/^brand context$/i)
    await user.clear(textarea)
    await user.type(textarea, 'Updated brand voice')
    await user.click(screen.getByRole('button', { name: /save brand context/i }))

    await waitFor(() => expect(updateTemplate).toHaveBeenCalledTimes(1))
    expect(updateTemplate).toHaveBeenCalledWith(
      'tpl-1',
      expect.objectContaining({ brand_context: 'Updated brand voice' }),
    )
  })
})

describe('TemplateDetailPage — references CRUD', () => {
  it('lists existing references with name and kind', async () => {
    renderAtRoute()
    expect(await screen.findByText(/^tone$/i)).toBeInTheDocument()
    expect(screen.getByText(/^mood$/i)).toBeInTheDocument()
    expect(screen.getAllByText(/text/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/image/i).length).toBeGreaterThan(0)
  })

  it('uploading a .md file creates a kind=text reference', async () => {
    createTextReference.mockResolvedValue({
      id: 'ref-new',
      template_id: 'tpl-1',
      key: 'instructions',
      kind: 'text',
      content_text: '# hello world',
      original_filename: 'instructions.md',
    })
    const user = userEvent.setup()
    renderAtRoute()
    await screen.findByText(/^tone$/i)

    await user.type(screen.getByLabelText(/new reference key/i), 'instructions')

    const file = new File(['# hello world'], 'instructions.md', { type: 'text/markdown' })
    const input = screen.getByLabelText(/upload reference file/i)
    await user.upload(input, file)

    await user.click(screen.getByRole('button', { name: /add reference/i }))

    await waitFor(() => expect(createTextReference).toHaveBeenCalledTimes(1))
    expect(createTextReference).toHaveBeenCalledWith(
      'tpl-1',
      expect.objectContaining({
        key: 'instructions',
        original_filename: 'instructions.md',
      }),
    )
  })

  it('uploading a .png file creates a kind=image reference', async () => {
    createImageReference.mockResolvedValue({
      id: 'ref-img-new',
      template_id: 'tpl-1',
      key: 'cover',
      kind: 'image',
      storage_path: 'tpl-1/cover.png',
      mime_type: 'image/png',
      original_filename: 'cover.png',
    })
    const user = userEvent.setup()
    renderAtRoute()
    await screen.findByText(/^tone$/i)

    await user.type(screen.getByLabelText(/new reference key/i), 'cover')

    const file = new File(['fake-bytes'], 'cover.png', { type: 'image/png' })
    const input = screen.getByLabelText(/upload reference file/i)
    await user.upload(input, file)

    await user.click(screen.getByRole('button', { name: /add reference/i }))

    await waitFor(() => expect(createImageReference).toHaveBeenCalledTimes(1))
    expect(createImageReference).toHaveBeenCalledWith(
      'tpl-1',
      expect.objectContaining({
        key: 'cover',
        mime_type: 'image/png',
        original_filename: 'cover.png',
      }),
    )
  })

  it('deleting a reference calls deleteReference and removes it from the list', async () => {
    deleteReference.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderAtRoute()
    await screen.findByText(/^tone$/i)

    const deleteButtons = screen.getAllByRole('button', { name: /delete reference/i })
    await user.click(deleteButtons[0])
    // Confirmation step
    await user.click(await screen.findByRole('button', { name: /^confirm delete reference$/i }))

    await waitFor(() => expect(deleteReference).toHaveBeenCalledWith('ref-tone-id'))
    await waitFor(() => expect(screen.queryByText(/^tone$/i)).not.toBeInTheDocument())
  })
})

describe('TemplateDetailPage — steps editor', () => {
  it('renders one step block per step, labeled with order and agent', async () => {
    renderAtRoute()
    await screen.findByLabelText(/step 1 instruction/i)
    expect(screen.getByLabelText(/step 1 instruction/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/step 2 instruction/i)).toBeInTheDocument()
    expect(screen.getByText(/pedro pesquisa/i)).toBeInTheDocument()
    expect(screen.getByText(/iago instagram/i)).toBeInTheDocument()
  })

  it('renders structural fields read-only and instruction as a textarea', async () => {
    renderAtRoute()
    await screen.findByLabelText(/step 1 instruction/i)

    // Read-only display: agent_id should appear as text, not in an editable input.
    const agentIdReadonly = screen.getAllByText(/pedro-pesquisa/i)
    expect(agentIdReadonly.length).toBeGreaterThan(0)
    expect(screen.queryByRole('textbox', { name: /agent id/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /tool keys/i })).not.toBeInTheDocument()

    // Instruction is an editable textarea.
    const instruction1 = screen.getByLabelText(/step 1 instruction/i)
    expect(instruction1.tagName.toLowerCase()).toBe('textarea')
    expect(instruction1).toHaveValue(
      'Pesquise sobre {{params.topic}} nos últimos {{params.time_range}}.',
    )
  })

  it('saving a step persists instruction and requires_approval changes via updateTemplate', async () => {
    updateTemplate.mockImplementation((id, updates) =>
      Promise.resolve({ ...sampleTemplate, ...updates }),
    )
    const user = userEvent.setup()
    renderAtRoute()
    await screen.findByLabelText(/step 1 instruction/i)

    const instruction = screen.getByLabelText(/step 1 instruction/i)
    await user.clear(instruction)
    await user.type(instruction, 'Pesquise sobre {{params.topic}}')

    const approvalToggle = screen.getByLabelText(/step 1 requires approval/i)
    await user.click(approvalToggle) // toggle off (was true)

    await user.click(screen.getByRole('button', { name: /^save step 1$/i }))

    await waitFor(() => expect(updateTemplate).toHaveBeenCalledTimes(1))
    const [id, payload] = updateTemplate.mock.calls[0]
    expect(id).toBe('tpl-1')
    const updatedStep = payload.plan.steps.find((s) => s.id === 1)
    expect(updatedStep.instruction).toBe('Pesquise sobre {{params.topic}}')
    expect(updatedStep.requires_approval).toBe(false)
    // Other structural fields preserved unchanged.
    expect(updatedStep.agent_id).toBe('pedro-pesquisa')
    expect(updatedStep.tool_keys).toEqual(['web_search'])
    expect(updatedStep.params_keys).toEqual(['topic', 'time_range'])
  })

  it('blocks save when instruction has an undeclared placeholder, surfacing inline error', async () => {
    const user = userEvent.setup()
    renderAtRoute()
    await screen.findByLabelText(/step 1 instruction/i)

    const instruction = screen.getByLabelText(/step 1 instruction/i)
    await user.clear(instruction)
    await user.type(instruction, 'Bad: {{params.unknown_one}}')

    await user.click(screen.getByRole('button', { name: /^save step 1$/i }))

    expect(updateTemplate).not.toHaveBeenCalled()
    expect(await screen.findByText(/params\.unknown_one/i)).toBeInTheDocument()
    expect(screen.getByText(/undeclared/i)).toBeInTheDocument()
  })

  it('blocks save when instruction references an unknown reference key', async () => {
    const user = userEvent.setup()
    renderAtRoute()
    await screen.findByLabelText(/step 1 instruction/i)

    const instruction = screen.getByLabelText(/step 1 instruction/i)
    await user.clear(instruction)
    await user.type(instruction, 'Voice: {{ref:nonexistent}}')

    await user.click(screen.getByRole('button', { name: /^save step 1$/i }))

    expect(updateTemplate).not.toHaveBeenCalled()
    expect(await screen.findByText(/ref:nonexistent/i)).toBeInTheDocument()
  })
})
