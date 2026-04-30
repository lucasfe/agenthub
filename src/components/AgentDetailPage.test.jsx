import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router'
import { render } from '@testing-library/react'

const apiMock = vi.hoisted(() => ({
  fetchAgent: vi.fn(),
  fetchAgents: vi.fn().mockResolvedValue([]),
  fetchTeams: vi.fn().mockResolvedValue([]),
  fetchTools: vi.fn().mockResolvedValue([]),
  deleteAgent: vi.fn().mockResolvedValue(null),
  updateAgent: vi.fn(),
  trackAgentUsage: vi.fn().mockResolvedValue(null),
  fetchAllTasks: vi.fn().mockResolvedValue([]),
}))

vi.mock('../lib/api', () => apiMock)

const templatesApiMock = vi.hoisted(() => ({
  fetchTemplates: vi.fn().mockResolvedValue([]),
}))

vi.mock('../lib/templatesApi', () => templatesApiMock)

import AgentDetailPage from './AgentDetailPage'
import { DataProvider } from '../context/DataContext'

const sampleAgent = {
  id: 'frontend-developer',
  name: 'Frontend Developer',
  category: 'Development Team',
  description: 'A frontend dev',
  tags: [],
  icon: 'Monitor',
  color: 'blue',
  popularity: 50,
  content: '## Hello',
  tools: [],
  capabilities: [],
}

function renderAt(path = '/agent/development-team/frontend-developer') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DataProvider>
        <Routes>
          <Route path="/agent/:category/:agentId" element={<AgentDetailPage />} />
        </Routes>
      </DataProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  apiMock.fetchAgent.mockReset().mockResolvedValue(sampleAgent)
  apiMock.deleteAgent.mockReset().mockResolvedValue(null)
  apiMock.fetchAllTasks.mockReset().mockResolvedValue([])
  templatesApiMock.fetchTemplates.mockReset().mockResolvedValue([])
})

async function clickDelete() {
  const btn = await screen.findByRole('button', { name: /delete this agent/i })
  await userEvent.click(btn)
}

describe('AgentDetailPage delete flow with references', () => {
  it('skips the references modal and opens type-to-confirm when no references exist', async () => {
    renderAt()
    await clickDelete()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^delete agent$/i })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /delete anyway/i })).not.toBeInTheDocument()
  })

  it('opens the references modal when at least one template references the agent', async () => {
    templatesApiMock.fetchTemplates.mockResolvedValue([
      {
        id: 'tpl-1',
        name: 'Form ticket',
        plan: { steps: [{ agent_id: 'frontend-developer' }] },
      },
    ])
    renderAt()
    await clickDelete()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete anyway/i })).toBeInTheDocument()
    })
    expect(screen.getByText('Form ticket')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^delete agent$/i })).not.toBeInTheDocument()
  })

  it('opens the references modal when at least one active ticket references the agent', async () => {
    apiMock.fetchAllTasks.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Build the login form',
        status: 'awaiting_approval',
        plan: { steps: [{ agent_id: 'frontend-developer' }] },
      },
    ])
    renderAt()
    await clickDelete()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete anyway/i })).toBeInTheDocument()
    })
    expect(screen.getByText('Build the login form')).toBeInTheDocument()
  })

  it('does not list finalized tasks in the references modal', async () => {
    apiMock.fetchAllTasks.mockResolvedValue([
      {
        id: 'task-active',
        title: 'Active ticket',
        status: 'todo',
        plan: { steps: [{ agent_id: 'frontend-developer' }] },
      },
      {
        id: 'task-done',
        title: 'Old done ticket',
        status: 'done',
        plan: { steps: [{ agent_id: 'frontend-developer' }] },
      },
      {
        id: 'task-cancelled',
        title: 'Old cancelled ticket',
        status: 'cancelled',
        plan: { steps: [{ agent_id: 'frontend-developer' }] },
      },
    ])
    renderAt()
    await clickDelete()

    await waitFor(() => {
      expect(screen.getByText('Active ticket')).toBeInTheDocument()
    })
    expect(screen.queryByText('Old done ticket')).not.toBeInTheDocument()
    expect(screen.queryByText('Old cancelled ticket')).not.toBeInTheDocument()
  })

  it('Cancel on the references modal closes it without entering the type-to-confirm flow', async () => {
    templatesApiMock.fetchTemplates.mockResolvedValue([
      {
        id: 'tpl-1',
        name: 'Form ticket',
        plan: { steps: [{ agent_id: 'frontend-developer' }] },
      },
    ])
    renderAt()
    await clickDelete()

    const cancelBtn = await screen.findByRole('button', { name: /^cancel$/i })
    await userEvent.click(cancelBtn)

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /delete anyway/i })).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /^delete agent$/i })).not.toBeInTheDocument()
  })

  it('Delete anyway on the references modal opens the existing type-to-confirm modal', async () => {
    templatesApiMock.fetchTemplates.mockResolvedValue([
      {
        id: 'tpl-1',
        name: 'Form ticket',
        plan: { steps: [{ agent_id: 'frontend-developer' }] },
      },
    ])
    renderAt()
    await clickDelete()

    const deleteAnyway = await screen.findByRole('button', { name: /delete anyway/i })
    await userEvent.click(deleteAnyway)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^delete agent$/i })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /delete anyway/i })).not.toBeInTheDocument()
  })
})
