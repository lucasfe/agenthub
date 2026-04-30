import { supabase } from './supabase'

const SUBSCRIBE_PATH = '/functions/v1/push-subscribe'
const UNSUBSCRIBE_PATH = '/functions/v1/push-unsubscribe'

export function isSupported() {
  if (typeof window === 'undefined') return false
  return 'PushManager' in window && 'Notification' in window
}

export async function isSubscribed() {
  if (!isSupported()) return false
  const registration = await getRegistration()
  if (!registration) return false
  const sub = await safeCall(() => registration.pushManager.getSubscription())
  return Boolean(sub)
}

export async function subscribe({
  vapidPublicKey,
  fetch: fetchImpl = defaultFetch(),
  getAccessToken = defaultGetAccessToken,
  supabaseUrl = defaultSupabaseUrl(),
} = {}) {
  if (!isSupported()) return { subscribed: false, reason: 'not-supported' }

  const registration = await getRegistration()
  if (!registration) return { subscribed: false, reason: 'no-sw' }

  const granted = await ensurePermission()
  if (!granted) return { subscribed: false, reason: 'permission-denied' }

  let subscription
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toApplicationServerKey(vapidPublicKey),
    })
  } catch {
    return { subscribed: false, reason: 'permission-denied' }
  }

  const posted = await postSubscription({
    fetchImpl,
    supabaseUrl,
    getAccessToken,
    subscription,
  })
  if (!posted) return { subscribed: false, reason: 'network-error' }

  return { subscribed: true, subscription }
}

export async function unsubscribe({
  fetch: fetchImpl = defaultFetch(),
  getAccessToken = defaultGetAccessToken,
  supabaseUrl = defaultSupabaseUrl(),
} = {}) {
  if (!isSupported()) return { unsubscribed: true }

  const registration = await getRegistration()
  if (!registration) return { unsubscribed: true }

  const subscription = await safeCall(() =>
    registration.pushManager.getSubscription(),
  )
  if (!subscription) return { unsubscribed: true }

  let backendOk = true
  try {
    const token = await resolveAccessToken(getAccessToken)
    const url = `${supabaseUrl}${UNSUBSCRIBE_PATH}`
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || ''}`,
      },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
    // 404 means "no row found" — still treat as success (idempotent).
    if (!res || (!res.ok && res.status !== 404)) backendOk = false
  } catch {
    backendOk = false
  }

  await safeCall(() => subscription.unsubscribe())

  if (!backendOk) return { unsubscribed: false, reason: 'network-error' }
  return { unsubscribed: true }
}

async function postSubscription({
  fetchImpl,
  supabaseUrl,
  getAccessToken,
  subscription,
}) {
  try {
    const token = await resolveAccessToken(getAccessToken)
    const payload = subscription.toJSON?.() || {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    }
    const body = {
      endpoint: payload.endpoint,
      keys: { p256dh: payload.keys?.p256dh, auth: payload.keys?.auth },
    }
    const res = await fetchImpl(`${supabaseUrl}${SUBSCRIBE_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || ''}`,
      },
      body: JSON.stringify(body),
    })
    return Boolean(res && res.ok)
  } catch {
    return false
  }
}

async function ensurePermission() {
  const N = window.Notification
  if (!N) return false
  if (N.permission === 'granted') return true
  if (N.permission === 'denied') return false
  try {
    const result = await N.requestPermission()
    return result === 'granted'
  } catch {
    return false
  }
}

async function getRegistration() {
  const sw = navigator?.serviceWorker
  if (!sw) return null
  try {
    if (typeof sw.getRegistration === 'function') {
      const reg = await sw.getRegistration()
      if (reg) return reg
    }
    if (sw.ready && typeof sw.ready.then === 'function') {
      return (await sw.ready) || null
    }
  } catch {
    return null
  }
  return null
}

async function resolveAccessToken(getAccessToken) {
  try {
    const value = getAccessToken?.()
    if (value && typeof value.then === 'function') {
      return (await value) || ''
    }
    return value || ''
  } catch {
    return ''
  }
}

async function defaultGetAccessToken() {
  if (!supabase) return ''
  try {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token || ''
  } catch {
    return ''
  }
}

function defaultFetch() {
  return typeof globalThis.fetch === 'function'
    ? globalThis.fetch.bind(globalThis)
    : null
}

function defaultSupabaseUrl() {
  return import.meta.env?.VITE_SUPABASE_URL || ''
}

function toApplicationServerKey(input) {
  if (!input) return input
  if (typeof input !== 'string') return input
  return urlBase64ToUint8Array(input)
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  let raw
  try {
    raw = atob(base64)
  } catch {
    return base64String
  }
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function safeCall(fn) {
  try {
    return await fn()
  } catch {
    return null
  }
}
