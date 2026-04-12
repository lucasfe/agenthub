import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

vi.mock('../lib/supabase', () => ({
  supabase: null,
}))

function wrapper({ children }) {
  return <AuthProvider>{children}</AuthProvider>
}

describe('AuthContext', () => {
  it('provides default unauthenticated state when supabase is null', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.user).toBeNull()
    expect(result.current.session).toBeNull()
    expect(result.current.loading).toBe(false)
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
