import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/test-utils'
import SettingsPage from './SettingsPage'

vi.mock('../lib/supabase', () => ({
  supabase: null,
}))

describe('SettingsPage', () => {
  it('renders settings heading and integrations section', () => {
    renderWithProviders(<SettingsPage />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Integrations')).toBeInTheDocument()
  })

  it('renders Google Slides integration card', () => {
    renderWithProviders(<SettingsPage />)
    expect(screen.getByText('Google Slides')).toBeInTheDocument()
  })

  it('shows Connect button when not connected', () => {
    renderWithProviders(<SettingsPage />)
    expect(screen.getByText('Connect')).toBeInTheDocument()
  })

  it('does not show Account section when not logged in', () => {
    renderWithProviders(<SettingsPage />)
    expect(screen.queryByText('Account')).not.toBeInTheDocument()
  })
})
