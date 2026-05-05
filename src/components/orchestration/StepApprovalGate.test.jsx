import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StepApprovalGate from './StepApprovalGate'
import { renderWithProviders } from '../../test/test-utils'

const baseStep = {
  id: 1,
  agent_id: 'frontend-developer',
  agent_name: 'Frontend Developer',
  instruction: 'Hello {{ params.who }}',
  status: 'awaiting_approval',
  retry_count: 0,
  output: '## Draft v1\n\nThis is the rendered output.',
  resolved_prompt: 'Hello world',
}

describe('StepApprovalGate', () => {
  it('renders the step output as markdown plus approve/retry buttons when awaiting approval', () => {
    renderWithProviders(
      <StepApprovalGate
        step={baseStep}
        taskStatus="awaiting_approval"
        onApprove={() => {}}
        onRetry={() => {}}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Draft v1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Aprovar/i })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Refazer com ajustes/i }),
    ).toBeInTheDocument()
  })

  it('shows the retry counter using retry_count over the maximum (e.g. "0/3")', () => {
    renderWithProviders(
      <StepApprovalGate
        step={{ ...baseStep, retry_count: 1 }}
        taskStatus="awaiting_approval"
        onApprove={() => {}}
        onRetry={() => {}}
      />,
    )

    expect(screen.getByText(/1\s*\/\s*3/)).toBeInTheDocument()
  })

  it('calls onApprove with the step id when "Aprovar" is clicked (happy path)', async () => {
    const user = userEvent.setup()
    const onApprove = vi.fn()
    renderWithProviders(
      <StepApprovalGate
        step={baseStep}
        taskStatus="awaiting_approval"
        onApprove={onApprove}
        onRetry={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Aprovar/i }))
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(onApprove).toHaveBeenCalledWith(baseStep.id)
  })

  it('reveals a textarea after clicking "Refazer com ajustes" and submits feedback via onRetry', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    renderWithProviders(
      <StepApprovalGate
        step={baseStep}
        taskStatus="awaiting_approval"
        onApprove={() => {}}
        onRetry={onRetry}
      />,
    )

    // No textarea before clicking refazer
    expect(screen.queryByRole('textbox', { name: /feedback/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Refazer com ajustes/i }))

    const textarea = screen.getByRole('textbox', { name: /feedback/i })
    await user.type(textarea, 'Mais formal, por favor')

    await user.click(screen.getByRole('button', { name: /Enviar feedback/i }))

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledWith(baseStep.id, 'Mais formal, por favor')
  })

  it('disables the submit-feedback button until the textarea has non-whitespace content', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    renderWithProviders(
      <StepApprovalGate
        step={baseStep}
        taskStatus="awaiting_approval"
        onApprove={() => {}}
        onRetry={onRetry}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Refazer com ajustes/i }))
    const submit = screen.getByRole('button', { name: /Enviar feedback/i })
    expect(submit).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: /feedback/i }), '   ')
    expect(submit).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: /feedback/i }), 'fix the tone')
    expect(submit).not.toBeDisabled()
  })

  it('renders a terminal "Task em erro" state when the task is in error and the cap is exhausted', () => {
    renderWithProviders(
      <StepApprovalGate
        step={{
          ...baseStep,
          status: 'error',
          retry_count: 3,
          error_message: 'Step 1 exceeded max retries (3)',
        }}
        taskStatus="error"
        taskErrorMessage="Step 1 exceeded max retries (3)"
        onApprove={() => {}}
        onRetry={() => {}}
      />,
    )

    expect(screen.getByText(/Task em erro/i)).toBeInTheDocument()
    expect(screen.getByText(/exceeded max retries/i)).toBeInTheDocument()
    // Approve / Refazer must NOT be available in the terminal state
    expect(screen.queryByRole('button', { name: /^Aprovar$/i })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Refazer com ajustes/i }),
    ).not.toBeInTheDocument()
  })

  it('toggles the resolved-prompt debug section for completed/in-progress steps', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <StepApprovalGate
        step={{ ...baseStep, status: 'done', resolved_prompt: 'Hello Lucas' }}
        taskStatus="executing"
        onApprove={() => {}}
        onRetry={() => {}}
      />,
    )

    const toggle = screen.getByRole('button', { name: /Debug: ver prompt resolvido/i })
    expect(toggle).toBeInTheDocument()
    expect(screen.queryByText('Hello Lucas')).not.toBeInTheDocument()

    await user.click(toggle)
    expect(screen.getByText('Hello Lucas')).toBeInTheDocument()
  })

  it('does not render the debug toggle for pending steps that have not been rendered yet', () => {
    renderWithProviders(
      <StepApprovalGate
        step={{ ...baseStep, status: 'pending', output: '', resolved_prompt: '' }}
        taskStatus="executing"
        onApprove={() => {}}
        onRetry={() => {}}
      />,
    )

    expect(
      screen.queryByRole('button', { name: /Debug: ver prompt resolvido/i }),
    ).not.toBeInTheDocument()
  })

  it('falls back to the textual output (no image gallery) for steps without prior text', () => {
    renderWithProviders(
      <StepApprovalGate
        step={{ ...baseStep, output: '', status: 'awaiting_approval' }}
        taskStatus="awaiting_approval"
        onApprove={() => {}}
        onRetry={() => {}}
      />,
    )

    // Even with empty output, approve/retry must still render
    expect(screen.getByRole('button', { name: /Aprovar/i })).toBeInTheDocument()
  })
})
