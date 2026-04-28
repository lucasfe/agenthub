import { Navigate } from 'react-router'
import { useAuth } from '../context/AuthContext'

export default function RequireAuth({ children }) {
  const { user, isAuthorized, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-primary">
        <div className="text-text-muted">Loading...</div>
      </div>
    )
  }

  if (!user || !isAuthorized) {
    return <Navigate to="/login" replace />
  }

  return children
}
