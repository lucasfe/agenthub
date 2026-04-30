import { useCallback, useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import {
  isSubscribed as defaultIsSubscribed,
  isSupported as defaultIsSupported,
  subscribe as defaultSubscribe,
  unsubscribe as defaultUnsubscribe,
} from '../../lib/pushSubscribe'

export default function MobileSettings({
  vapidPublicKey = import.meta.env?.VITE_VAPID_PUBLIC_KEY || '',
  isSupportedFn = defaultIsSupported,
  isSubscribedFn = defaultIsSubscribed,
  subscribeFn = defaultSubscribe,
  unsubscribeFn = defaultUnsubscribe,
}) {
  const [supported] = useState(() => isSupportedFn())
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!supported) return
    try {
      const value = await isSubscribedFn()
      setEnabled(Boolean(value))
    } catch {
      setEnabled(false)
    }
  }, [supported, isSubscribedFn])

  useEffect(() => {
    refresh()
  }, [refresh])

  const toggle = async () => {
    if (busy || !supported) return
    setBusy(true)
    setError(null)
    try {
      if (enabled) {
        const result = await unsubscribeFn({})
        if (result?.unsubscribed) {
          setEnabled(false)
        } else {
          setError(reasonToText(result?.reason))
        }
      } else {
        const result = await subscribeFn({ vapidPublicKey })
        if (result?.subscribed) {
          setEnabled(true)
        } else {
          setError(reasonToText(result?.reason))
        }
      }
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg-primary p-4">
      <h1 className="text-xl font-bold text-text-primary">Settings</h1>

      <section className="mt-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-accent-blue/20 p-2 text-accent-blue">
              <Bell size={18} aria-hidden="true" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-medium text-text-primary">
                Notifications
              </h2>
              <p className="text-xs text-text-muted">
                Get notified when your agent finishes or needs approval.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Notifications"
              onClick={toggle}
              disabled={busy || !supported}
              className={`relative h-6 w-11 rounded-full transition disabled:opacity-50 ${
                enabled ? 'bg-accent-blue' : 'bg-white/15'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                  enabled ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>
          {!supported && (
            <p className="mt-3 text-xs text-text-muted">
              Notifications are not supported on this browser.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-xs text-rose-300">
              {error}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

function reasonToText(reason) {
  switch (reason) {
    case 'permission-denied':
      return 'Notification permission was denied. Enable it in your browser settings.'
    case 'no-sw':
      return 'Service worker is not ready yet. Reload and try again.'
    case 'not-supported':
      return 'Notifications are not supported on this browser.'
    case 'network-error':
      return 'Could not reach the server. Try again.'
    default:
      return 'Could not toggle notifications. Try again.'
  }
}
