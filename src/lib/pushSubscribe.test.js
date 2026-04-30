import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isSubscribed,
  isSupported,
  subscribe,
  unsubscribe,
} from './pushSubscribe'

const SUPABASE_URL = 'https://example.supabase.co'
const VAPID_KEY = 'BPHelloWorldFakeVapidPublicKey'
const ACCESS_TOKEN = 'jwt-token-abc'

const originalServiceWorker = Object.getOwnPropertyDescriptor(
  window.navigator,
  'serviceWorker',
)
const originalPushManager = window.PushManager
const originalNotification = window.Notification

function setServiceWorker(value) {
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value,
  })
}

function removeServiceWorker() {
  delete window.navigator.serviceWorker
}

function setPushManager(value) {
  if (value === undefined) {
    delete window.PushManager
    return
  }
  window.PushManager = value
}

function setNotification(value) {
  if (value === undefined) {
    delete window.Notification
    return
  }
  window.Notification = value
}

function makeNotification({ permission = 'default', request } = {}) {
  const ctor = function () {}
  ctor.permission = permission
  ctor.requestPermission = request || vi.fn().mockResolvedValue(permission)
  return ctor
}

function makeSubscription({
  endpoint = 'https://push.example.com/abc',
  p256dh = 'p256dh-key',
  auth = 'auth-key',
  unsubscribeImpl,
} = {}) {
  return {
    endpoint,
    toJSON() {
      return { endpoint, keys: { p256dh, auth } }
    },
    unsubscribe: unsubscribeImpl || vi.fn().mockResolvedValue(true),
  }
}

function makeRegistration({ subscribeImpl, getSubscriptionImpl } = {}) {
  return {
    pushManager: {
      subscribe: subscribeImpl || vi.fn(),
      getSubscription: getSubscriptionImpl || vi.fn().mockResolvedValue(null),
    },
  }
}

afterEach(() => {
  if (originalServiceWorker) {
    Object.defineProperty(
      window.navigator,
      'serviceWorker',
      originalServiceWorker,
    )
  } else {
    removeServiceWorker()
  }
  if (originalPushManager === undefined) {
    delete window.PushManager
  } else {
    window.PushManager = originalPushManager
  }
  if (originalNotification === undefined) {
    delete window.Notification
  } else {
    window.Notification = originalNotification
  }
  vi.restoreAllMocks()
})

describe('isSupported', () => {
  it('is false when PushManager is missing', () => {
    setPushManager(undefined)
    setNotification(makeNotification())
    expect(isSupported()).toBe(false)
  })

  it('is false when Notification is missing', () => {
    setPushManager(function PushManager() {})
    setNotification(undefined)
    expect(isSupported()).toBe(false)
  })

  it('is true when both PushManager and Notification exist on window', () => {
    setPushManager(function PushManager() {})
    setNotification(makeNotification())
    expect(isSupported()).toBe(true)
  })
})

describe('subscribe', () => {
  beforeEach(() => {
    setPushManager(function PushManager() {})
  })

  it('short-circuits when push is not supported', async () => {
    setNotification(undefined)
    const fetchMock = vi.fn()
    const result = await subscribe({ vapidPublicKey: VAPID_KEY, fetch: fetchMock })
    expect(result).toEqual({ subscribed: false, reason: 'not-supported' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns no-sw when navigator.serviceWorker has no registration', async () => {
    setNotification(makeNotification({ permission: 'granted' }))
    setServiceWorker({
      ready: Promise.resolve(null),
      getRegistration: vi.fn().mockResolvedValue(null),
    })
    const fetchMock = vi.fn()
    const result = await subscribe({
      vapidPublicKey: VAPID_KEY,
      fetch: fetchMock,
      getAccessToken: () => ACCESS_TOKEN,
      supabaseUrl: SUPABASE_URL,
    })
    expect(result).toEqual({ subscribed: false, reason: 'no-sw' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns permission-denied when Notification.permission is denied', async () => {
    setNotification(makeNotification({ permission: 'denied' }))
    const registration = makeRegistration()
    setServiceWorker({
      ready: Promise.resolve(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    })
    const fetchMock = vi.fn()
    const result = await subscribe({
      vapidPublicKey: VAPID_KEY,
      fetch: fetchMock,
      getAccessToken: () => ACCESS_TOKEN,
      supabaseUrl: SUPABASE_URL,
    })
    expect(result).toEqual({ subscribed: false, reason: 'permission-denied' })
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns permission-denied when requestPermission resolves to anything other than granted', async () => {
    const requestPermission = vi.fn().mockResolvedValue('default')
    setNotification(
      makeNotification({ permission: 'default', request: requestPermission }),
    )
    const registration = makeRegistration()
    setServiceWorker({
      ready: Promise.resolve(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    })
    const fetchMock = vi.fn()
    const result = await subscribe({
      vapidPublicKey: VAPID_KEY,
      fetch: fetchMock,
      getAccessToken: () => ACCESS_TOKEN,
      supabaseUrl: SUPABASE_URL,
    })
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ subscribed: false, reason: 'permission-denied' })
  })

  it('subscribes via pushManager and POSTs the subscription to /functions/v1/push-subscribe with the JWT', async () => {
    setNotification(makeNotification({ permission: 'granted' }))
    const subscription = makeSubscription({
      endpoint: 'https://push.example.com/sub-1',
      p256dh: 'p256dh-1',
      auth: 'auth-1',
    })
    const pushSubscribe = vi.fn().mockResolvedValue(subscription)
    const registration = makeRegistration({ subscribeImpl: pushSubscribe })
    setServiceWorker({
      ready: Promise.resolve(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })

    const result = await subscribe({
      vapidPublicKey: VAPID_KEY,
      fetch: fetchMock,
      getAccessToken: () => ACCESS_TOKEN,
      supabaseUrl: SUPABASE_URL,
    })

    expect(pushSubscribe).toHaveBeenCalledTimes(1)
    const args = pushSubscribe.mock.calls[0][0]
    expect(args.userVisibleOnly).toBe(true)
    expect(args.applicationServerKey).toBeDefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${SUPABASE_URL}/functions/v1/push-subscribe`)
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({
      endpoint: 'https://push.example.com/sub-1',
      keys: { p256dh: 'p256dh-1', auth: 'auth-1' },
    })

    expect(result).toEqual({ subscribed: true, subscription })
  })

  it('returns network-error when the backend POST throws and does NOT roll back the local subscription', async () => {
    setNotification(makeNotification({ permission: 'granted' }))
    const localUnsubscribe = vi.fn().mockResolvedValue(true)
    const subscription = makeSubscription({ unsubscribeImpl: localUnsubscribe })
    const registration = makeRegistration({
      subscribeImpl: vi.fn().mockResolvedValue(subscription),
    })
    setServiceWorker({
      ready: Promise.resolve(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    })
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await subscribe({
      vapidPublicKey: VAPID_KEY,
      fetch: fetchMock,
      getAccessToken: () => ACCESS_TOKEN,
      supabaseUrl: SUPABASE_URL,
    })

    expect(result).toEqual({ subscribed: false, reason: 'network-error' })
    expect(localUnsubscribe).not.toHaveBeenCalled()
  })

  it('returns network-error when the backend responds with a non-2xx status', async () => {
    setNotification(makeNotification({ permission: 'granted' }))
    const subscription = makeSubscription()
    const registration = makeRegistration({
      subscribeImpl: vi.fn().mockResolvedValue(subscription),
    })
    setServiceWorker({
      ready: Promise.resolve(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('boom') })

    const result = await subscribe({
      vapidPublicKey: VAPID_KEY,
      fetch: fetchMock,
      getAccessToken: () => ACCESS_TOKEN,
      supabaseUrl: SUPABASE_URL,
    })

    expect(result).toEqual({ subscribed: false, reason: 'network-error' })
  })
})

describe('unsubscribe', () => {
  beforeEach(() => {
    setPushManager(function PushManager() {})
    setNotification(makeNotification({ permission: 'granted' }))
  })

  it('is a no-op when push is not supported and returns unsubscribed', async () => {
    setPushManager(undefined)
    setNotification(undefined)
    const fetchMock = vi.fn()
    const result = await unsubscribe({ fetch: fetchMock })
    expect(result).toEqual({ unsubscribed: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns unsubscribed when no service worker registration exists', async () => {
    setServiceWorker({
      ready: Promise.resolve(null),
      getRegistration: vi.fn().mockResolvedValue(null),
    })
    const fetchMock = vi.fn()
    const result = await unsubscribe({
      fetch: fetchMock,
      getAccessToken: () => ACCESS_TOKEN,
      supabaseUrl: SUPABASE_URL,
    })
    expect(result).toEqual({ unsubscribed: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns unsubscribed when there is no current subscription (idempotent)', async () => {
    const registration = makeRegistration({
      getSubscriptionImpl: vi.fn().mockResolvedValue(null),
    })
    setServiceWorker({
      ready: Promise.resolve(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    })
    const fetchMock = vi.fn()
    const result = await unsubscribe({
      fetch: fetchMock,
      getAccessToken: () => ACCESS_TOKEN,
      supabaseUrl: SUPABASE_URL,
    })
    expect(result).toEqual({ unsubscribed: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POSTs the endpoint to /functions/v1/push-unsubscribe and calls subscription.unsubscribe()', async () => {
    const localUnsubscribe = vi.fn().mockResolvedValue(true)
    const subscription = makeSubscription({
      endpoint: 'https://push.example.com/sub-2',
      unsubscribeImpl: localUnsubscribe,
    })
    const registration = makeRegistration({
      getSubscriptionImpl: vi.fn().mockResolvedValue(subscription),
    })
    setServiceWorker({
      ready: Promise.resolve(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })

    const result = await unsubscribe({
      fetch: fetchMock,
      getAccessToken: () => ACCESS_TOKEN,
      supabaseUrl: SUPABASE_URL,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${SUPABASE_URL}/functions/v1/push-unsubscribe`)
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(JSON.parse(init.body)).toEqual({
      endpoint: 'https://push.example.com/sub-2',
    })
    expect(localUnsubscribe).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ unsubscribed: true })
  })

  it('returns network-error reason when the backend POST throws but still tears down locally', async () => {
    const localUnsubscribe = vi.fn().mockResolvedValue(true)
    const subscription = makeSubscription({ unsubscribeImpl: localUnsubscribe })
    const registration = makeRegistration({
      getSubscriptionImpl: vi.fn().mockResolvedValue(subscription),
    })
    setServiceWorker({
      ready: Promise.resolve(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    })
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'))

    const result = await unsubscribe({
      fetch: fetchMock,
      getAccessToken: () => ACCESS_TOKEN,
      supabaseUrl: SUPABASE_URL,
    })

    expect(localUnsubscribe).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ unsubscribed: false, reason: 'network-error' })
  })
})

describe('isSubscribed', () => {
  beforeEach(() => {
    setPushManager(function PushManager() {})
    setNotification(makeNotification({ permission: 'granted' }))
  })

  it('is false when push is not supported', async () => {
    setPushManager(undefined)
    setNotification(undefined)
    await expect(isSubscribed()).resolves.toBe(false)
  })

  it('is false when there is no service worker registration', async () => {
    setServiceWorker({
      ready: Promise.resolve(null),
      getRegistration: vi.fn().mockResolvedValue(null),
    })
    await expect(isSubscribed()).resolves.toBe(false)
  })

  it('is true when pushManager.getSubscription returns a subscription', async () => {
    const registration = makeRegistration({
      getSubscriptionImpl: vi.fn().mockResolvedValue(makeSubscription()),
    })
    setServiceWorker({
      ready: Promise.resolve(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    })
    await expect(isSubscribed()).resolves.toBe(true)
  })

  it('is false when pushManager.getSubscription returns null', async () => {
    const registration = makeRegistration({
      getSubscriptionImpl: vi.fn().mockResolvedValue(null),
    })
    setServiceWorker({
      ready: Promise.resolve(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    })
    await expect(isSubscribed()).resolves.toBe(false)
  })
})
