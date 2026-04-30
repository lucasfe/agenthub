const DEFAULT_SCOPE = '/mobile/'

function isSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

export async function register({ scope = DEFAULT_SCOPE } = {}) {
  if (!isSupported()) return null
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope })
  } catch {
    return null
  }
}

export async function unregister() {
  if (!isSupported()) return
  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((r) => r.unregister()))
  } catch {
    // ignore — unregister is best-effort
  }
}
