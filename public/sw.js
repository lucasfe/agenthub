// Lucas AI Hub — baseline service worker.
// Push handling and caching strategy land in later mobile slices.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // Passthrough — let the network handle every request for now.
})
