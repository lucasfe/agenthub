import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import RequireAuth from './RequireAuth'

const authState = vi.hoisted(() => ({ value: null }))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => authState.value,
}))

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/board']}>
      <Routes>
        <Route
          path="/board"
          element={
            <RequireAuth>
              <div>Protected board</div>
            </RequireAuth>
          }
        />
        <Route path="/login" element={<div>Login screen</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('RequireAuth', () => {
  it('shows the loading indicator while auth is resolving', () => {
    authState.value = { user: null, isAuthorized: false, loading: true }
    renderGuard()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText('Protected board')).not.toBeInTheDocument()
    expect(screen.queryByText('Login screen')).not.toBeInTheDocument()
  })

  it('redirects to /login when there is no authenticated user', () => {
    authState.value = { user: null, isAuthorized: false, loading: false }
    renderGuard()
    expect(screen.getByText('Login screen')).toBeInTheDocument()
    expect(screen.queryByText('Protected board')).not.toBeInTheDocument()
  })

  it('redirects to /login when the user is signed in but not authorized', () => {
    authState.value = {
      user: { id: '1', email: 'intruder@x.com' },
      isAuthorized: false,
      loading: false,
    }
    renderGuard()
    expect(screen.getByText('Login screen')).toBeInTheDocument()
    expect(screen.queryByText('Protected board')).not.toBeInTheDocument()
  })

  it('renders the protected children when the user is authorized', () => {
    authState.value = {
      user: { id: '1', email: 'lucasfe@gmail.com' },
      isAuthorized: true,
      loading: false,
    }
    renderGuard()
    expect(screen.getByText('Protected board')).toBeInTheDocument()
    expect(screen.queryByText('Login screen')).not.toBeInTheDocument()
  })
})
