import { describe, it, expect, afterEach, vi } from 'vitest'
import { register, unregister } from './serviceWorker'

const originalServiceWorker = Object.getOwnPropertyDescriptor(
  window.navigator,
  'serviceWorker'
)

function setServiceWorker(value) {
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value,
  })
}

function removeServiceWorker() {
  delete window.navigator.serviceWorker
}

afterEach(() => {
  if (originalServiceWorker) {
    Object.defineProperty(window.navigator, 'serviceWorker', originalServiceWorker)
  } else {
    removeServiceWorker()
  }
  vi.restoreAllMocks()
})

describe('register', () => {
  it('is a no-op when serviceWorker is not in navigator', async () => {
    removeServiceWorker()
    const result = await register()
    expect(result).toBeNull()
  })

  it('calls navigator.serviceWorker.register with /sw.js and the requested scope', async () => {
    const fakeRegistration = { scope: '/mobile/' }
    const swRegister = vi.fn().mockResolvedValue(fakeRegistration)
    setServiceWorker({ register: swRegister })

    const result = await register({ scope: '/mobile/' })

    expect(swRegister).toHaveBeenCalledTimes(1)
    expect(swRegister).toHaveBeenCalledWith('/sw.js', { scope: '/mobile/' })
    expect(result).toBe(fakeRegistration)
  })

  it('defaults to scope /mobile/ when none is passed', async () => {
    const swRegister = vi.fn().mockResolvedValue({ scope: '/mobile/' })
    setServiceWorker({ register: swRegister })

    await register()

    expect(swRegister).toHaveBeenCalledWith('/sw.js', { scope: '/mobile/' })
  })

  it('returns null and swallows registration errors so it never breaks the app boot', async () => {
    const swRegister = vi.fn().mockRejectedValue(new Error('install failed'))
    setServiceWorker({ register: swRegister })

    const result = await register({ scope: '/mobile/' })

    expect(result).toBeNull()
  })
})

describe('unregister', () => {
  it('is a no-op when serviceWorker is not in navigator', async () => {
    removeServiceWorker()
    await expect(unregister()).resolves.toBeUndefined()
  })

  it('unregisters every active registration returned by getRegistrations', async () => {
    const reg1 = { unregister: vi.fn().mockResolvedValue(true) }
    const reg2 = { unregister: vi.fn().mockResolvedValue(true) }
    const getRegistrations = vi.fn().mockResolvedValue([reg1, reg2])
    setServiceWorker({ getRegistrations })

    await unregister()

    expect(getRegistrations).toHaveBeenCalledTimes(1)
    expect(reg1.unregister).toHaveBeenCalledTimes(1)
    expect(reg2.unregister).toHaveBeenCalledTimes(1)
  })

  it('does not throw when getRegistrations rejects', async () => {
    const getRegistrations = vi.fn().mockRejectedValue(new Error('boom'))
    setServiceWorker({ getRegistrations })

    await expect(unregister()).resolves.toBeUndefined()
  })
})
