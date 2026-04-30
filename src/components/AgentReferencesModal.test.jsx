import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AgentReferencesModal from './AgentReferencesModal'

describe('AgentReferencesModal', () => {
  const baseProps = {
    agentName: 'Frontend Developer',
    templates: [],
    tasks: [],
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
  }

  it('renders the agent name in the header', () => {
    render(<AgentReferencesModal {...baseProps} templates={[{ id: 't1', name: 'Form ticket' }]} />)
    expect(screen.getByText(/Frontend Developer/)).toBeInTheDocument()
  })

  it('lists referencing templates by name', () => {
    render(
      <AgentReferencesModal
        {...baseProps}
        templates={[
          { id: 't1', name: 'Form ticket' },
          { id: 't2', name: 'Onboarding flow' },
        ]}
      />,
    )
    expect(screen.getByText('Form ticket')).toBeInTheDocument()
    expect(screen.getByText('Onboarding flow')).toBeInTheDocument()
  })

  it('lists referencing active tasks by title', () => {
    render(
      <AgentReferencesModal
        {...baseProps}
        tasks={[
          { id: 'k1', title: 'Build the form' },
          { id: 'k2', title: 'Wire login' },
        ]}
      />,
    )
    expect(screen.getByText('Build the form')).toBeInTheDocument()
    expect(screen.getByText('Wire login')).toBeInTheDocument()
  })

  it('omits the templates section when there are no referencing templates', () => {
    render(
      <AgentReferencesModal
        {...baseProps}
        tasks={[{ id: 'k1', title: 'Build the form' }]}
      />,
    )
    expect(screen.queryByText(/templates/i)).not.toBeInTheDocument()
  })

  it('omits the tickets section when there are no referencing tickets', () => {
    render(
      <AgentReferencesModal
        {...baseProps}
        templates={[{ id: 't1', name: 'Form ticket' }]}
      />,
    )
    expect(screen.queryByText(/active tickets/i)).not.toBeInTheDocument()
  })

  it('calls onCancel when the Cancel button is clicked', async () => {
    const onCancel = vi.fn()
    render(
      <AgentReferencesModal
        {...baseProps}
        templates={[{ id: 't1', name: 'X' }]}
        onCancel={onCancel}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onConfirm when the Delete anyway button is clicked', async () => {
    const onConfirm = vi.fn()
    render(
      <AgentReferencesModal
        {...baseProps}
        templates={[{ id: 't1', name: 'X' }]}
        onConfirm={onConfirm}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /delete anyway/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
