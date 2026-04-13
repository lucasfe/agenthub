import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/test-utils'
import LoginPage from './LoginPage'

vi.mock('../lib/supabase', () => ({
  supabase: null,
}))

describe('LoginPage', () => {
  it('renders the login page with Google button', () => {
    renderWithProviders(<LoginPage />)
    expect(screen.getByText('Lucas AI Hub')).toBeInTheDocument()
    expect(screen.getByText('Continue with Google')).toBeInTheDocument()
    expect(screen.getByText('Sign in to manage your agents')).toBeInTheDocument()
  })

  it('shows the Google sign-in button', () => {
    renderWithProviders(<LoginPage />)
    const button = screen.getByText('Continue with Google')
    expect(button.tagName).toBe('BUTTON')
  })
})
