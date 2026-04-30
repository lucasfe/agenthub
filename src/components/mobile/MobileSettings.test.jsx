import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MobileSettings from './MobileSettings'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MobileSettings — Notifications toggle', () => {
  it('renders the toggle as off when isSubscribedFn resolves false', async () => {
    render(
      <MobileSettings
        isSupportedFn={() => true}
        isSubscribedFn={vi.fn().mockResolvedValue(false)}
        subscribeFn={vi.fn()}
        unsubscribeFn={vi.fn()}
      />,
    )
    const toggle = await screen.findByRole('switch', { name: /Notifications/i })
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'false')
    })
  })

  it('renders the toggle as on when isSubscribedFn resolves true', async () => {
    render(
      <MobileSettings
        isSupportedFn={() => true}
        isSubscribedFn={vi.fn().mockResolvedValue(true)}
        subscribeFn={vi.fn()}
        unsubscribeFn={vi.fn()}
      />,
    )
    const toggle = await screen.findByRole('switch', { name: /Notifications/i })
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'true')
    })
  })

  it('toggling on calls subscribeFn with vapidPublicKey and flips to checked on success', async () => {
    const subscribeFn = vi
      .fn()
      .mockResolvedValue({ subscribed: true, subscription: {} })
    const user = userEvent.setup()
    render(
      <MobileSettings
        vapidPublicKey="K"
        isSupportedFn={() => true}
        isSubscribedFn={vi.fn().mockResolvedValue(false)}
        subscribeFn={subscribeFn}
        unsubscribeFn={vi.fn()}
      />,
    )
    const toggle = await screen.findByRole('switch', { name: /Notifications/i })
    await user.click(toggle)
    await waitFor(() => {
      expect(subscribeFn).toHaveBeenCalledWith({ vapidPublicKey: 'K' })
    })
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'true')
    })
  })

  it('toggling off calls unsubscribeFn and flips to unchecked on success', async () => {
    const unsubscribeFn = vi.fn().mockResolvedValue({ unsubscribed: true })
    const user = userEvent.setup()
    render(
      <MobileSettings
        isSupportedFn={() => true}
        isSubscribedFn={vi.fn().mockResolvedValue(true)}
        subscribeFn={vi.fn()}
        unsubscribeFn={unsubscribeFn}
      />,
    )
    const toggle = await screen.findByRole('switch', { name: /Notifications/i })
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'true')
    })
    await user.click(toggle)
    await waitFor(() => {
      expect(unsubscribeFn).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'false')
    })
  })

  it('shows an inline error when subscribe returns a reason', async () => {
    const subscribeFn = vi
      .fn()
      .mockResolvedValue({ subscribed: false, reason: 'network-error' })
    const user = userEvent.setup()
    render(
      <MobileSettings
        isSupportedFn={() => true}
        isSubscribedFn={vi.fn().mockResolvedValue(false)}
        subscribeFn={subscribeFn}
        unsubscribeFn={vi.fn()}
      />,
    )
    const toggle = await screen.findByRole('switch', { name: /Notifications/i })
    await user.click(toggle)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Could not reach the server/i)
    })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('disables the toggle and renders a notice when push is not supported', async () => {
    render(
      <MobileSettings
        isSupportedFn={() => false}
        isSubscribedFn={vi.fn()}
        subscribeFn={vi.fn()}
        unsubscribeFn={vi.fn()}
      />,
    )
    const toggle = screen.getByRole('switch', { name: /Notifications/i })
    expect(toggle).toBeDisabled()
    expect(screen.getByText(/not supported on this browser/i)).toBeInTheDocument()
  })
})
