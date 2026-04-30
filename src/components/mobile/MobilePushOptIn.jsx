import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import {
  isSubscribed as defaultIsSubscribed,
  isSupported as defaultIsSupported,
  subscribe as defaultSubscribe,
} from '../../lib/pushSubscribe'

const STORAGE_KEY = 'mobile.pushOptIn.dismissed'

function readDismissed() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // ignore — quota or privacy mode; we just won't persist
  }
}

export default function MobilePushOptIn({
  vapidPublicKey = import.meta.env?.VITE_VAPID_PUBLIC_KEY || '',
  isSupportedFn = defaultIsSupported,
  isSubscribedFn = defaultIsSubscribed,
  subscribeFn = defaultSubscribe,
}) {
  const [hidden, setHidden] = useState(() => {
    if (typeof window === 'undefined') return true
    if (!isSupportedFn()) return true
    return readDismissed()
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (hidden) return
    let cancelled = false
    isSubscribedFn()
      .then((already) => {
        if (already && !cancelled) {
          writeDismissed()
          setHidden(true)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [hidden, isSubscribedFn])

  if (hidden) return null

  const dismiss = () => {
    writeDismissed()
    setHidden(true)
  }

  const enable = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await subscribeFn({ vapidPublicKey })
      if (result?.subscribed) {
        writeDismissed()
        setHidden(true)
      } else {
        setError(reasonToText(result?.reason))
      }
    } catch {
      setError('Could not enable notifications. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="region"
      aria-label="Enable notifications"
      className="mx-4 my-3 rounded-2xl border border-white/10 bg-white/5 p-3"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-accent-blue/20 p-2 text-accent-blue">
          <Bell size={18} aria-hidden="true" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-text-primary">
            Get notified when your agent finishes or needs approval
          </p>
          {error && (
            <p role="alert" className="mt-1 text-xs text-rose-300">
              {error}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={enable}
              disabled={busy}
              className="rounded-lg bg-accent-blue px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {busy ? 'Enabling…' : 'Enable'}
            </button>
            <button
              type="button"
              onClick={dismiss}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-sm text-text-muted hover:bg-white/5"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss notification opt-in"
          onClick={dismiss}
          disabled={busy}
          className="rounded p-1 text-text-muted hover:bg-white/5"
        >
          <X size={16} />
        </button>
      </div>
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
      return 'Could not enable notifications. Try again.'
  }
}
