import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import LoginPage from './LoginPage'

const authState = vi.hoisted(() => ({
  value: { user: null, isAuthorized: false, loading: false, error: null, signInWithGoogle: () => {} },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => authState.value,
}))

beforeEach(() => {
  authState.value = {
    user: null,
    isAuthorized: false,
    loading: false,
    error: null,
    signInWithGoogle: () => {},
  }
})

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('LoginPage', () => {
  it('renders the login page with Google button', () => {
    renderLogin()
    expect(screen.getByText('Lucas AI Hub')).toBeInTheDocument()
    expect(screen.getByText('Continue with Google')).toBeInTheDocument()
    expect(screen.getByText('Sign in to manage your agents')).toBeInTheDocument()
  })

  it('shows the Google sign-in button', () => {
    renderLogin()
    const button = screen.getByText('Continue with Google')
    expect(button.tagName).toBe('BUTTON')
  })

  it('shows the loading state while auth is resolving', () => {
    authState.value = { ...authState.value, loading: true }
    renderLogin()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText('Continue with Google')).not.toBeInTheDocument()
  })

  it('redirects to home when an authorized user is already signed in', () => {
    authState.value = {
      ...authState.value,
      user: { id: '1', email: 'lucasfe@gmail.com' },
      isAuthorized: true,
    }
    renderLogin()
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.queryByText('Continue with Google')).not.toBeInTheDocument()
  })

  it('renders the error banner with the rejected email when error is set', () => {
    authState.value = {
      ...authState.value,
      error: 'Your account intruder@x.com is not authorized to access this site.',
    }
    renderLogin()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('intruder@x.com')
    expect(alert).toHaveTextContent('not authorized')
    const button = screen.getByText('Continue with Google')
    expect(button).toBeEnabled()
  })
})
