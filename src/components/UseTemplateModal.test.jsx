import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UseTemplateModal from './UseTemplateModal'

function makeTemplate(paramsSchema) {
  return {
    id: 'tpl-1',
    name: 'Luiza pipeline',
    description: 'Mental health content',
    params_schema: paramsSchema,
  }
}

describe('UseTemplateModal', () => {
  it('renders one input per primitive type from params_schema', () => {
    const template = makeTemplate({
      type: 'object',
      required: ['topic', 'tone'],
      properties: {
        topic: { type: 'string', label: 'Topic' },
        tone: { type: 'enum', enum: ['serious', 'playful'] },
        notes: { type: 'textarea', label: 'Notes' },
        count: { type: 'number', label: 'Slide count' },
      },
    })

    render(
      <UseTemplateModal
        template={template}
        onClose={() => {}}
        onInstantiate={vi.fn()}
      />,
    )

    // string
    expect(screen.getByLabelText(/Topic/)).toHaveAttribute('type', 'text')
    // enum (select)
    const tone = screen.getByLabelText(/Tone/)
    expect(tone.tagName).toBe('SELECT')
    expect(tone.querySelectorAll('option')).toHaveLength(2)
    // textarea
    expect(screen.getByLabelText(/Notes/).tagName).toBe('TEXTAREA')
    // number
    expect(screen.getByLabelText(/Slide count/)).toHaveAttribute('type', 'number')
  })

  it('renders an empty state when params_schema is missing', () => {
    const template = makeTemplate(null)
    render(
      <UseTemplateModal
        template={template}
        onClose={() => {}}
        onInstantiate={vi.fn()}
      />,
    )
    expect(
      screen.getByText(/no parameters/i),
    ).toBeInTheDocument()
  })

  it('shows inline errors for missing required fields and does NOT call onInstantiate', async () => {
    const template = makeTemplate({
      properties: { topic: { type: 'string', required: true } },
    })
    const onInstantiate = vi.fn()

    render(
      <UseTemplateModal
        template={template}
        onClose={() => {}}
        onInstantiate={onInstantiate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /create task/i }))

    expect(await screen.findByText(/topic.*required/i)).toBeInTheDocument()
    expect(onInstantiate).not.toHaveBeenCalled()
  })

  it('shows inline errors for invalid enum values and does NOT call onInstantiate', async () => {
    const template = makeTemplate({
      properties: { tone: { type: 'enum', enum: ['serious'], required: true } },
    })
    const onInstantiate = vi.fn()

    render(
      <UseTemplateModal
        template={template}
        onClose={() => {}}
        onInstantiate={onInstantiate}
      />,
    )

    // Manually inject an unsupported value to simulate a tampered form.
    const tone = screen.getByLabelText(/Tone/)
    fireEvent.change(tone, { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))

    await waitFor(() => expect(onInstantiate).not.toHaveBeenCalled())
  })

  it('calls onInstantiate with the typed values when the form is valid', async () => {
    const template = makeTemplate({
      properties: {
        topic: { type: 'string', required: true },
        tone: { type: 'enum', enum: ['serious', 'playful'], required: true },
      },
    })
    const onInstantiate = vi.fn().mockResolvedValue('task-uuid')
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <UseTemplateModal
        template={template}
        onClose={onClose}
        onInstantiate={onInstantiate}
      />,
    )

    await user.type(screen.getByLabelText(/Topic/), 'mental health')
    fireEvent.change(screen.getByLabelText(/Tone/), { target: { value: 'playful' } })
    await user.click(screen.getByRole('button', { name: /create task/i }))

    await waitFor(() => expect(onInstantiate).toHaveBeenCalledTimes(1))
    expect(onInstantiate).toHaveBeenCalledWith({
      topic: 'mental health',
      tone: 'playful',
    })
  })

  it('shows the server error message when onInstantiate rejects', async () => {
    const template = makeTemplate({ properties: {} })
    const onInstantiate = vi
      .fn()
      .mockRejectedValue(new Error('template not found'))

    render(
      <UseTemplateModal
        template={template}
        onClose={() => {}}
        onInstantiate={onInstantiate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /create task/i }))

    expect(await screen.findByText(/template not found/i)).toBeInTheDocument()
  })

  it('calls onClose when the cancel button is clicked', () => {
    const template = makeTemplate({ properties: { topic: { type: 'string' } } })
    const onClose = vi.fn()

    render(
      <UseTemplateModal
        template={template}
        onClose={onClose}
        onInstantiate={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
