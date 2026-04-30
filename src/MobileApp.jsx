import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { useAuth } from './context/AuthContext'
import { register } from './lib/serviceWorker'
import MobileLogin from './components/mobile/MobileLogin'
import MobileChat from './components/mobile/MobileChat'
import MobileSettings from './components/mobile/MobileSettings'

function MobileGate({ children }) {
  const { user, isAuthorized, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-primary">
        <div className="text-text-muted">Loading...</div>
      </div>
    )
  }

  if (!user || !isAuthorized) {
    return <Navigate to="/mobile/login" replace />
  }

  return children
}

function MobileSettings() {
  return (
    <div className="flex flex-col min-h-screen bg-bg-primary p-4">
      <h1 className="text-xl font-bold text-text-primary">Settings</h1>
      <p className="text-sm text-text-muted mt-2">Mobile settings coming soon.</p>
    </div>
  )
}

export default function MobileApp() {
  useEffect(() => {
    register({ scope: '/mobile/' })
  }, [])

  return (
    <Routes>
      <Route path="login" element={<MobileLogin />} />
      <Route
        path="chat"
        element={
          <MobileGate>
            <MobileChat />
          </MobileGate>
        }
      />
      <Route
        path="settings"
        element={
          <MobileGate>
            <MobileSettings />
          </MobileGate>
        }
      />
      <Route path="*" element={<Navigate to="/mobile/chat" replace />} />
    </Routes>
  )
}
