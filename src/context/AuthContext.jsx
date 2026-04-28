import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { isAllowed } from '../lib/auth'

const AuthContext = createContext()

function unauthorizedMessage(email) {
  return `Your account ${email} is not authorized to access this site.`
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let active = true

    const handleSession = async (s) => {
      const candidate = s?.user ?? null
      if (!candidate) {
        if (!active) return
        setSession(null)
        setUser(null)
        return
      }
      const email = candidate.email ?? ''
      if (isAllowed(email)) {
        if (!active) return
        setSession(s)
        setUser(candidate)
        setError(null)
        return
      }
      try {
        await supabase.auth.signOut()
      } catch {
        // Best-effort sign-out; we still clear local state below.
      }
      if (!active) return
      setSession(null)
      setUser(null)
      setError(unauthorizedMessage(email))
    }

    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      await handleSession(s)
      if (active) setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        handleSession(s)
      },
    )

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = async () => {
    if (!supabase) throw new Error('Supabase not configured')
    setError(null)
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    })
    if (err) throw err
  }

  const signOut = async () => {
    if (!supabase) return
    const { error: err } = await supabase.auth.signOut()
    if (err) throw err
    setError(null)
  }

  const isAuthorized = !!user && isAllowed(user.email ?? '')

  return (
    <AuthContext.Provider
      value={{ user, session, loading, error, isAuthorized, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
