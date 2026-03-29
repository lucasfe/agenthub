import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { StackProvider, useStack } from './StackContext'

function wrapper({ children }) {
  return <StackProvider>{children}</StackProvider>
}

describe('StackContext', () => {
  it('starts with empty stack', () => {
    const { result } = renderHook(() => useStack(), { wrapper })
    expect(result.current.stack).toEqual([])
  })

  it('toggleAgent adds agent to stack', () => {
    const { result } = renderHook(() => useStack(), { wrapper })
    act(() => result.current.toggleAgent('frontend-developer'))
    expect(result.current.stack).toContain('frontend-developer')
  })

  it('toggleAgent removes agent if already in stack', () => {
    const { result } = renderHook(() => useStack(), { wrapper })
    act(() => result.current.toggleAgent('frontend-developer'))
    act(() => result.current.toggleAgent('frontend-developer'))
    expect(result.current.stack).not.toContain('frontend-developer')
  })

  it('removeAgent removes specific agent', () => {
    const { result } = renderHook(() => useStack(), { wrapper })
    act(() => result.current.toggleAgent('frontend-developer'))
    act(() => result.current.toggleAgent('backend-developer'))
    act(() => result.current.removeAgent('frontend-developer'))
    expect(result.current.stack).toEqual(['backend-developer'])
  })

  it('addAgents batch adds without duplicates', () => {
    const { result } = renderHook(() => useStack(), { wrapper })
    act(() => result.current.toggleAgent('frontend-developer'))
    act(() => result.current.addAgents(['frontend-developer', 'backend-developer', 'qa-engineer']))
    expect(result.current.stack).toEqual(['frontend-developer', 'backend-developer', 'qa-engineer'])
  })

  it('clearStack resets stack and closes panel', () => {
    const { result } = renderHook(() => useStack(), { wrapper })
    act(() => {
      result.current.toggleAgent('frontend-developer')
      result.current.setPanelOpen(true)
    })
    act(() => result.current.clearStack())
    expect(result.current.stack).toEqual([])
    expect(result.current.panelOpen).toBe(false)
  })

  it('isInStack returns correct boolean', () => {
    const { result } = renderHook(() => useStack(), { wrapper })
    act(() => result.current.toggleAgent('frontend-developer'))
    expect(result.current.isInStack('frontend-developer')).toBe(true)
    expect(result.current.isInStack('backend-developer')).toBe(false)
  })

  it('hasAllAgents checks if all agents are present', () => {
    const { result } = renderHook(() => useStack(), { wrapper })
    act(() => result.current.addAgents(['a', 'b', 'c']))
    expect(result.current.hasAllAgents(['a', 'b'])).toBe(true)
    expect(result.current.hasAllAgents(['a', 'd'])).toBe(false)
  })
})
