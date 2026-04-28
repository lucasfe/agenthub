import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const supabaseHolder = vi.hoisted(() => ({ current: null }))

vi.mock('../lib/supabase', () => ({
  get supabase() {
    return supabaseHolder.current
  },
}))

import { AuthProvider, useAuth } from './AuthContext'

function wrapper({ children }) {
  return <AuthProvider>{children}</AuthProvider>
}

function makeMockSupabase({
  initialSession = null,
  signOut = vi.fn().mockResolvedValue({ error: null }),
} = {}) {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: initialSession } }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signOut,
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    },
  }
}

beforeEach(() => {
  supabaseHolder.current = null
  vi.unstubAllEnvs()
})

describe('AuthContext (no supabase)', () => {
  it('provides default unauthenticated state when supabase is null', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.user).toBeNull()
    expect(result.current.session).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.isAuthorized).toBe(false)
  })

  it('exposes signInWithGoogle and signOut functions', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(typeof result.current.signInWithGoogle).toBe('function')
    expect(typeof result.current.signOut).toBe('function')
  })

  it('signInWithGoogle throws when supabase is null', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    await expect(result.current.signInWithGoogle()).rejects.toThrow('Supabase not configured')
  })

  it('signOut does not throw when supabase is null', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    await expect(result.current.signOut()).resolves.toBeUndefined()
  })
})

describe('AuthContext (with supabase + allowlist)', () => {
  it('exposes the user as authorized when their email is on the allowlist', async () => {
    vi.stubEnv('VITE_ALLOWED_EMAILS', 'lucasfe@gmail.com')
    const session = { user: { id: '1', email: 'lucasfe@gmail.com' } }
    supabaseHolder.current = makeMockSupabase({ initialSession: session })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user?.email).toBe('lucasfe@gmail.com')
    expect(result.current.session).toEqual(session)
    expect(result.current.isAuthorized).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('signs the user out and surfaces an error when their email is not allowed', async () => {
    vi.stubEnv('VITE_ALLOWED_EMAILS', 'lucasfe@gmail.com')
    const session = { user: { id: '2', email: 'intruder@x.com' } }
    const signOut = vi.fn().mockResolvedValue({ error: null })
    supabaseHolder.current = makeMockSupabase({ initialSession: session, signOut })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(signOut).toHaveBeenCalled()
    expect(result.current.user).toBeNull()
    expect(result.current.session).toBeNull()
    expect(result.current.isAuthorized).toBe(false)
    expect(result.current.error).toBeTruthy()
    expect(result.current.error).toContain('intruder@x.com')
    expect(result.current.error?.toLowerCase()).toContain('not authorized')
  })

  it('compares the email against the allowlist case-insensitively', async () => {
    vi.stubEnv('VITE_ALLOWED_EMAILS', 'lucasfe@gmail.com')
    const session = { user: { id: '3', email: 'Lucasfe@Gmail.COM' } }
    supabaseHolder.current = makeMockSupabase({ initialSession: session })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isAuthorized).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('treats an empty allowlist as fail-closed (no one allowed)', async () => {
    vi.stubEnv('VITE_ALLOWED_EMAILS', '')
    const session = { user: { id: '4', email: 'lucasfe@gmail.com' } }
    const signOut = vi.fn().mockResolvedValue({ error: null })
    supabaseHolder.current = makeMockSupabase({ initialSession: session, signOut })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(signOut).toHaveBeenCalled()
    expect(result.current.user).toBeNull()
    expect(result.current.isAuthorized).toBe(false)
    expect(result.current.error).toContain('lucasfe@gmail.com')
  })
})
