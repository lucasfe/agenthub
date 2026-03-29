import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { ThemeProvider, useTheme } from './ThemeContext'

function wrapper({ children }) {
  return <ThemeProvider>{children}</ThemeProvider>
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('defaults to dark theme', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('dark')
  })

  it('toggleTheme switches from dark to light', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('light')
  })

  it('toggleTheme switches back to dark', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.toggleTheme())
    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('dark')
  })

  it('persists theme to localStorage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.toggleTheme())
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('sets data-theme attribute on html element', () => {
    renderHook(() => useTheme(), { wrapper })
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('reads saved theme from localStorage', () => {
    localStorage.setItem('theme', 'light')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('light')
  })
})
