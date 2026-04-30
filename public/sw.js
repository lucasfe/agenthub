// Lucas AI Hub — service worker.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // Passthrough — let the network handle every request for now.
})

// Display a notification whenever the push service delivers a message.
// Payload schema (best-effort): { title, body, url, tag }.
// Falls back to a generic title when the server posts an unrecognized shape
// or no payload at all (some push services strip the body).
self.addEventListener('push', (event) => {
  let payload = {}
  if (event.data) {
    try {
      payload = event.data.json()
    } catch {
      payload = { body: event.data.text() }
    }
  }
  const title = payload.title || 'Lucas AI Hub'
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'agenthub-default',
    data: { url: payload.url || '/mobile/chat' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// Focus an existing PWA window or open one when the user taps the notification.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/mobile/chat'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.navigate?.(target)
            return client.focus()
          }
        }
        return self.clients.openWindow(target)
      }),
  )
})
