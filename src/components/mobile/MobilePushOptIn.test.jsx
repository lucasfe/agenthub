import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MobilePushOptIn from './MobilePushOptIn'

const STORAGE_KEY = 'mobile.pushOptIn.dismissed'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('MobilePushOptIn', () => {
  it('does not render when push is not supported on this browser', () => {
    const { container } = render(
      <MobilePushOptIn
        isSupportedFn={() => false}
        isSubscribedFn={vi.fn()}
        subscribeFn={vi.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('does not render when localStorage marks the card as dismissed', () => {
    window.localStorage.setItem(STORAGE_KEY, '1')
    const { container } = render(
      <MobilePushOptIn
        isSupportedFn={() => true}
        isSubscribedFn={vi.fn().mockResolvedValue(false)}
        subscribeFn={vi.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the prompt when supported and not dismissed', () => {
    render(
      <MobilePushOptIn
        isSupportedFn={() => true}
        isSubscribedFn={vi.fn().mockResolvedValue(false)}
        subscribeFn={vi.fn()}
      />,
    )
    expect(screen.getByText(/Get notified/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Enable$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Not now/i })).toBeInTheDocument()
  })

  it('clicking Not now persists dismissal and removes the card', async () => {
    const user = userEvent.setup()
    render(
      <MobilePushOptIn
        isSupportedFn={() => true}
        isSubscribedFn={vi.fn().mockResolvedValue(false)}
        subscribeFn={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Not now/i }))
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1')
    expect(screen.queryByText(/Get notified/i)).not.toBeInTheDocument()
  })

  it('Enable calls subscribeFn with vapidPublicKey and hides the card on success', async () => {
    const subscribeFn = vi
      .fn()
      .mockResolvedValue({ subscribed: true, subscription: {} })
    const user = userEvent.setup()
    render(
      <MobilePushOptIn
        vapidPublicKey="VAPID-KEY"
        isSupportedFn={() => true}
        isSubscribedFn={vi.fn().mockResolvedValue(false)}
        subscribeFn={subscribeFn}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^Enable$/i }))
    await waitFor(() => {
      expect(subscribeFn).toHaveBeenCalledWith({ vapidPublicKey: 'VAPID-KEY' })
    })
    await waitFor(() => {
      expect(screen.queryByText(/Get notified/i)).not.toBeInTheDocument()
    })
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1')
  })

  it('shows an inline error message when subscribe returns a reason and keeps the card visible', async () => {
    const subscribeFn = vi
      .fn()
      .mockResolvedValue({ subscribed: false, reason: 'permission-denied' })
    const user = userEvent.setup()
    render(
      <MobilePushOptIn
        isSupportedFn={() => true}
        isSubscribedFn={vi.fn().mockResolvedValue(false)}
        subscribeFn={subscribeFn}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^Enable$/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/permission was denied/i)
    })
    expect(screen.getByText(/Get notified/i)).toBeInTheDocument()
  })

  it('hides itself when an existing subscription is detected on mount', async () => {
    render(
      <MobilePushOptIn
        isSupportedFn={() => true}
        isSubscribedFn={vi.fn().mockResolvedValue(true)}
        subscribeFn={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(screen.queryByText(/Get notified/i)).not.toBeInTheDocument()
    })
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1')
  })
})
