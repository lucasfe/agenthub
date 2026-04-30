import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'

const authState = vi.hoisted(() => ({
  value: {
    user: null,
    isAuthorized: false,
    loading: false,
    error: null,
    signInWithGoogle: vi.fn(),
  },
}))

vi.mock('./context/AuthContext', () => ({
  useAuth: () => authState.value,
}))

const swRegister = vi.hoisted(() => vi.fn().mockResolvedValue(null))

vi.mock('./lib/serviceWorker', () => ({
  register: swRegister,
}))

import MobileApp from './MobileApp'

beforeEach(() => {
  authState.value = {
    user: null,
    isAuthorized: false,
    loading: false,
    error: null,
    signInWithGoogle: vi.fn(),
  }
  swRegister.mockClear()
})

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/mobile/*" element={<MobileApp />} />
      </Routes>
    </MemoryRouter>
  )
}

function asAuthorized() {
  authState.value = {
    user: { id: 'u1', email: 'lucas@example.com' },
    isAuthorized: true,
    loading: false,
    error: null,
    signInWithGoogle: vi.fn(),
  }
}

describe('MobileApp', () => {
  it('redirects unauthenticated users from /mobile/chat to /mobile/login', () => {
    renderAt('/mobile/chat')
    expect(
      screen.getByRole('button', { name: /continue with google/i })
    ).toBeInTheDocument()
  })

  it('lets authenticated and authorized users land on /mobile/chat', () => {
    asAuthorized()
    renderAt('/mobile/chat')
    expect(
      screen.getByRole('button', { name: /new chat/i })
    ).toBeInTheDocument()
  })

  it('redirects /mobile (no inner path) to /mobile/chat for authenticated users', () => {
    asAuthorized()
    renderAt('/mobile')
    expect(
      screen.getByRole('button', { name: /new chat/i })
    ).toBeInTheDocument()
  })

  it('redirects /mobile/settings for unauthenticated users to /mobile/login', () => {
    renderAt('/mobile/settings')
    expect(
      screen.getByRole('button', { name: /continue with google/i })
    ).toBeInTheDocument()
  })

  it('registers the service worker on mount with /mobile/ scope', () => {
    renderAt('/mobile/login')
    expect(swRegister).toHaveBeenCalled()
    expect(swRegister.mock.calls[0][0]).toEqual({ scope: '/mobile/' })
  })
})
