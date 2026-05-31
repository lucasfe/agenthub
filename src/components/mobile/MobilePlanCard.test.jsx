import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MobilePlanCard from './MobilePlanCard'

const samplePlan = {
  id: 'plan-1',
  steps: [
    {
      id: 1,
      agent_id: 'frontend-developer',
      agent_name: 'Frontend Developer',
      task: 'Build the login form with validation and styled inputs',
    },
    {
      id: 2,
      agent_id: 'backend-developer',
      agent_name: 'Backend Developer',
      task: 'Wire the API endpoint and validate the payload server-side',
    },
  ],
}

describe('MobilePlanCard', () => {
  it('renders a clickable toggle that exposes per-step details', async () => {
    const user = userEvent.setup()
    render(<MobilePlanCard plan={samplePlan} status="executing" />)

    const toggle = screen.getByRole('button', { name: /show details|expand plan/i })
    expect(toggle).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // Both step tasks are visible in full when expanded.
    expect(
      screen.getByText(/Build the login form with validation/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Wire the API endpoint and validate the payload/i),
    ).toBeInTheDocument()
  })

  it('shows each step text/result and final outcome when expanded and execution is done', async () => {
    const user = userEvent.setup()
    const stepStates = {
      1: { status: 'done', text: 'Form component implemented.' },
      2: { status: 'done', text: 'API endpoint /login created.' },
    }
    render(
      <MobilePlanCard
        plan={samplePlan}
        status="done"
        stepStates={stepStates}
        runSummary={{ duration_ms: 4321 }}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: /show details|expand plan/i }),
    )

    expect(screen.getByText('Form component implemented.')).toBeInTheDocument()
    expect(screen.getByText('API endpoint /login created.')).toBeInTheDocument()
  })

  it('surfaces step-level error messages when expanded', async () => {
    const user = userEvent.setup()
    const stepStates = {
      1: { status: 'done', text: 'OK' },
      2: { status: 'error', error: 'Network refused the connection' },
    }
    render(
      <MobilePlanCard
        plan={samplePlan}
        status="error"
        stepStates={stepStates}
        runError="Step 2 failed"
      />,
    )

    await user.click(
      screen.getByRole('button', { name: /show details|expand plan/i }),
    )

    expect(
      screen.getByText(/Network refused the connection/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Step 2 failed/i)).toBeInTheDocument()
  })

  it('still renders Approve/Cancel buttons when proposed', () => {
    const onApprove = vi.fn()
    const onCancel = vi.fn()
    render(
      <MobilePlanCard
        plan={samplePlan}
        status="proposed"
        onApprove={onApprove}
        onCancel={onCancel}
      />,
    )

    expect(screen.getByRole('button', { name: /^Approve$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Cancel$/i })).toBeInTheDocument()
  })
})
