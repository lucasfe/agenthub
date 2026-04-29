import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { StackProvider, useStack } from './StackContext'
import { DataProvider, useData } from './DataContext'

vi.mock('../lib/api', () => ({
  fetchAgents: vi.fn().mockResolvedValue([
    { id: 'frontend-developer', name: 'Frontend Dev', usage_count: 0 },
    { id: 'backend-developer', name: 'Backend Dev', usage_count: 0 },
  ]),
  fetchTeams: vi.fn().mockResolvedValue([]),
  fetchTools: vi.fn().mockResolvedValue([]),
  trackAgentUsage: vi.fn().mockResolvedValue(1),
}))

function wrapper({ children }) {
  return <StackProvider>{children}</StackProvider>
}

function dataWrapper({ children }) {
  return (
    <DataProvider>
      <StackProvider>{children}</StackProvider>
    </DataProvider>
  )
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

  it('hasAllAgents returns false for empty array', () => {
    const { result } = renderHook(() => useStack(), { wrapper })
    act(() => result.current.addAgents(['a', 'b']))
    expect(result.current.hasAllAgents([])).toBe(false)
  })


  it('removeAgents batch removes multiple agents', () => {
    const { result } = renderHook(() => useStack(), { wrapper })
    act(() => result.current.addAgents(['a', 'b', 'c', 'd']))
    act(() => result.current.removeAgents(['b', 'c']))
    expect(result.current.stack).toEqual(['a', 'd'])
  })

  it('removeAgents ignores IDs not in stack', () => {
    const { result } = renderHook(() => useStack(), { wrapper })
    act(() => result.current.addAgents(['a', 'b']))
    act(() => result.current.removeAgents(['b', 'x', 'y']))
    expect(result.current.stack).toEqual(['a'])
  })

  describe('with DataProvider — usage tracking', () => {
    it('toggleAgent bumps usage_count once on add and not on remove', async () => {
      const api = await import('../lib/api')
      api.trackAgentUsage.mockClear()

      const { result } = renderHook(
        () => ({ stack: useStack(), data: useData() }),
        { wrapper: dataWrapper },
      )
      await waitFor(() => expect(result.current.data.agents.length).toBeGreaterThan(0))

      act(() => result.current.stack.toggleAgent('frontend-developer'))
      expect(api.trackAgentUsage).toHaveBeenCalledTimes(1)
      expect(api.trackAgentUsage).toHaveBeenCalledWith(
        'frontend-developer',
        'cart_add',
      )
      const bumped = result.current.data.agents.find((a) => a.id === 'frontend-developer')
      expect(bumped?.usage_count).toBe(1)

      act(() => result.current.stack.toggleAgent('frontend-developer'))
      // Removing must not bump again.
      expect(api.trackAgentUsage).toHaveBeenCalledTimes(1)
    })

    it('addAgents only bumps newly added IDs', async () => {
      const api = await import('../lib/api')
      api.trackAgentUsage.mockClear()

      const { result } = renderHook(
        () => ({ stack: useStack(), data: useData() }),
        { wrapper: dataWrapper },
      )
      await waitFor(() => expect(result.current.data.agents.length).toBeGreaterThan(0))

      act(() => result.current.stack.addAgents(['frontend-developer']))
      act(() =>
        result.current.stack.addAgents(['frontend-developer', 'backend-developer']),
      )

      // First call adds frontend-developer (1 bump). Second call adds only
      // backend-developer (1 bump). Frontend-developer is already in the
      // stack and must not be bumped again.
      expect(api.trackAgentUsage).toHaveBeenCalledTimes(2)
      expect(api.trackAgentUsage).toHaveBeenNthCalledWith(1, 'frontend-developer', 'cart_add')
      expect(api.trackAgentUsage).toHaveBeenNthCalledWith(2, 'backend-developer', 'cart_add')
    })
  })
})
