import { useState, useEffect, useCallback } from 'react'
import { Settings, Link2, Unlink, Check, Loader2, AlertCircle, ChevronLeft } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import Header from './Header'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

function GoogleSlidesIntegration() {
  const { session } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)

  const checkConnection = useCallback(async () => {
    if (!supabase || !session) return
    try {
      const { data } = await supabase
        .from('user_integrations')
        .select('id, connected_at')
        .eq('provider', 'google_slides')
        .maybeSingle()
      setConnected(!!data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [session])

  const [pendingCode, setPendingCode] = useState(null)

  const handleCallback = useCallback(async (code) => {
    if (!session || connecting) return
    setConnecting(true)
    setError(null)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-connect`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            code,
            redirect_uri: `${window.location.origin}/ai/agenthub/settings`,
          }),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to connect')
      setConnected(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setConnecting(false)
      setPendingCode(null)
    }
  }, [session, connecting])

  useEffect(() => {
    checkConnection()
  }, [checkConnection])

  // Capture the code from URL on mount
  useEffect(() => {
    const code = searchParams.get('code')
    if (code) {
      setPendingCode(code)
      searchParams.delete('code')
      searchParams.delete('scope')
      setSearchParams(searchParams, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Process the code once session is available
  useEffect(() => {
    if (pendingCode && session && !connecting) {
      handleCallback(pendingCode)
    }
  }, [pendingCode, session, connecting, handleCallback])

  const handleConnect = () => {
    if (!GOOGLE_CLIENT_ID) {
      setError('VITE_GOOGLE_CLIENT_ID not configured')
      return
    }
    const scopes = 'https://www.googleapis.com/auth/presentations https://www.googleapis.com/auth/drive.file'
    const redirectUri = `${window.location.origin}/ai/agenthub/settings`
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`
    window.location.href = url
  }

  const handleDisconnect = async () => {
    if (!supabase) return
    setLoading(true)
    try {
      await supabase
        .from('user_integrations')
        .delete()
        .eq('provider', 'google_slides')
      setConnected(false)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-bg-input border border-border-subtle">
        <Loader2 size={16} className="text-text-muted animate-spin" />
        <span className="text-sm text-text-muted">Checking connection...</span>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-bg-input border border-border-subtle overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M9.5 3H5.5C4.4 3 3.5 3.9 3.5 5V19C3.5 20.1 4.4 21 5.5 21H18.5C19.6 21 20.5 20.1 20.5 19V5C20.5 3.9 19.6 3 18.5 3H14.5" fill="#FBBC04" fillOpacity="0.2"/>
            <path d="M14.5 3H9.5V8L12 6.5L14.5 8V3Z" fill="#FBBC04"/>
            <rect x="7" y="12" width="10" height="1.5" rx="0.75" fill="#FBBC04"/>
            <rect x="7" y="15" width="7" height="1.5" rx="0.75" fill="#FBBC04"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text-primary">Google Slides</div>
          <div className="text-xs text-text-muted mt-0.5">
            {connected
              ? 'Connected — agents can create presentations in your Google Drive'
              : 'Connect to let agents create Google Slides presentations'}
          </div>
        </div>
        {connecting ? (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-primary border border-border-subtle text-sm text-text-muted">
            <Loader2 size={14} className="animate-spin" />
            Connecting...
          </div>
        ) : connected ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-2.5 py-1.5">
              <Check size={12} />
              Connected
            </span>
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 rounded-md px-2.5 py-1.5 transition-colors"
            >
              <Unlink size={12} />
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
          >
            <Link2 size={14} />
            Connect
          </button>
        )}
      </div>
      {error && (
        <div className="px-5 pb-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
            <AlertCircle size={14} className="text-rose-400 shrink-0" />
            <span className="text-xs text-rose-300">{error}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { user } = useAuth()

  return (
    <>
      <Header />
      <div className="max-w-2xl mx-auto px-8 py-8">
        <div className="flex items-center gap-2 mb-1">
          <Link to="/" className="text-text-muted hover:text-text-primary transition-colors">
            <ChevronLeft size={16} />
          </Link>
          <Settings size={20} className="text-text-muted" />
          <h1 className="text-xl font-bold text-text-primary">Settings</h1>
        </div>
        <p className="text-sm text-text-muted mb-8 ml-7">Manage your account and integrations</p>

        {/* Profile section */}
        {user && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-3">Account</h2>
            <div className="flex items-center gap-4 px-5 py-4 rounded-xl bg-bg-input border border-border-subtle">
              {user.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt=""
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-accent-blue/20 flex items-center justify-center text-accent-blue font-semibold text-sm">
                  {(user.email || '?')[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">
                  {user.user_metadata?.full_name || user.email}
                </div>
                <div className="text-xs text-text-muted truncate">{user.email}</div>
              </div>
            </div>
          </section>
        )}

        {/* Integrations section */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-3">Integrations</h2>
          <GoogleSlidesIntegration />
        </section>
      </div>
    </>
  )
}
