import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import MobileLogin from './MobileLogin'

const authState = vi.hoisted(() => ({
  value: {
    user: null,
    isAuthorized: false,
    loading: false,
    error: null,
    signInWithGoogle: vi.fn(),
  },
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => authState.value,
}))

beforeEach(() => {
  authState.value = {
    user: null,
    isAuthorized: false,
    loading: false,
    error: null,
    signInWithGoogle: vi.fn(),
  }
})

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/mobile/login']}>
      <Routes>
        <Route path="/mobile/login" element={<MobileLogin />} />
        <Route path="/mobile/chat" element={<div>Chat home</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('MobileLogin', () => {
  it('renders the Continue with Google button', () => {
    renderLogin()
    expect(
      screen.getByRole('button', { name: /continue with google/i })
    ).toBeInTheDocument()
  })

  it('calls signInWithGoogle when the button is clicked', () => {
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }))
    expect(authState.value.signInWithGoogle).toHaveBeenCalledTimes(1)
  })

  it('renders an inline error banner when the auth context exposes an error', () => {
    authState.value = {
      user: null,
      isAuthorized: false,
      loading: false,
      error: 'This Google account is not authorized.',
      signInWithGoogle: vi.fn(),
    }
    renderLogin()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This Google account is not authorized.'
    )
  })

  it('redirects authenticated and authorized users to /mobile/chat', () => {
    authState.value = {
      user: { id: 'u1', email: 'lucas@example.com' },
      isAuthorized: true,
      loading: false,
      error: null,
      signInWithGoogle: vi.fn(),
    }
    renderLogin()
    expect(screen.getByText('Chat home')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /continue with google/i })
    ).not.toBeInTheDocument()
  })
})
