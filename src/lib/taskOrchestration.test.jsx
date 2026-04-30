import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// Controllable mock of `streamOrchestration`. Each call captures the onEvent
// callback and the abort signal so tests can fire synthetic events and
// resolve/reject the underlying promise on demand. This lets the hook be
// driven through its full SSE lifecycle without a real network round-trip.
const streamMock = vi.hoisted(() => {
  const calls = []
  const stream = vi.fn((args) => {
    let resolve
    let reject
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    const handle = {
      args,
      onEvent: args.onEvent,
      signal: args.signal,
      emit: (evt) => args.onEvent?.(evt),
      resolve: () => resolve(),
      reject: (err) => reject(err),
      promise,
    }
    calls.push(handle)
    return promise
  })
  return { stream, calls }
})

vi.mock('./orchestration/stream', () => ({
  streamOrchestration: streamMock.stream,
  isOrchestrationConfigured: () => true,
}))

import { useTaskOrchestration } from './taskOrchestration'

beforeEach(() => {
  streamMock.stream.mockClear()
  streamMock.calls.length = 0
})

function makeTask(overrides = {}) {
  return {
    id: 'task-1',
    title: 'Build login screen',
    description: 'with Google OAuth',
    status: 'awaiting_approval',
    plan: { steps: [{ id: 's1', agent_id: 'a', task: 'old' }] },
    ...overrides,
  }
}

describe('useTaskOrchestration.replan', () => {
  it('exposes a replan function alongside startPlanning, approve, and cancel', () => {
    const onTaskUpdate = vi.fn()
    const { result } = renderHook(() =>
      useTaskOrchestration({
        task: makeTask(),
        agents: [],
        tools: [],
        onTaskUpdate,
      }),
    )

    expect(typeof result.current.replan).toBe('function')
    expect(typeof result.current.startPlanning).toBe('function')
    expect(typeof result.current.approve).toBe('function')
    expect(typeof result.current.cancel).toBe('function')
  })

  it('does NOT clear the plan or write null plan to Supabase while replan is streaming', () => {
    const onTaskUpdate = vi.fn()
    const task = makeTask({ status: 'done' })
    const { result } = renderHook(() =>
      useTaskOrchestration({ task, agents: [], tools: [], onTaskUpdate }),
    )

    act(() => result.current.replan())

    // The hook may patch error_message: null, but it must never patch plan: null
    // (that would clear the existing plan in state and Supabase).
    for (const call of onTaskUpdate.mock.calls) {
      const [, updates] = call
      expect(updates).not.toHaveProperty('plan', null)
    }
  })

  it('starts a planner stream against the task title and description', () => {
    const onTaskUpdate = vi.fn()
    const task = makeTask({ title: 'New title', description: 'New description' })
    const { result } = renderHook(() =>
      useTaskOrchestration({ task, agents: [], tools: [], onTaskUpdate }),
    )

    act(() => result.current.replan())

    expect(streamMock.stream).toHaveBeenCalledTimes(1)
    const args = streamMock.stream.mock.calls[0][0]
    expect(args.mode).toBe('planned')
    expect(args.messages).toEqual([
      { role: 'user', content: 'New title\n\nNew description' },
    ])
  })

  it('atomically replaces the old plan and transitions to awaiting_approval on plan.proposed', () => {
    const onTaskUpdate = vi.fn()
    const task = makeTask({ status: 'done' })
    const { result } = renderHook(() =>
      useTaskOrchestration({ task, agents: [], tools: [], onTaskUpdate }),
    )

    act(() => result.current.replan())

    const newPlan = { steps: [{ id: 's2', agent_id: 'b', task: 'new' }] }
    act(() => streamMock.calls[0].emit({ type: 'plan.proposed', plan: newPlan }))

    expect(onTaskUpdate).toHaveBeenCalledWith('task-1', {
      status: 'awaiting_approval',
      plan: newPlan,
    })
  })

  it('does NOT clear the plan when the stream errors after replan', async () => {
    const onTaskUpdate = vi.fn()
    const task = makeTask({ status: 'done' })
    const { result } = renderHook(() =>
      useTaskOrchestration({ task, agents: [], tools: [], onTaskUpdate }),
    )

    act(() => result.current.replan())

    await act(async () => {
      streamMock.calls[0].reject(new Error('network died'))
      await streamMock.calls[0].promise.catch(() => {})
    })

    for (const call of onTaskUpdate.mock.calls) {
      const [, updates] = call
      expect(updates).not.toHaveProperty('plan', null)
    }
  })

  it('does not start a second stream when replan is already in flight', () => {
    const onTaskUpdate = vi.fn()
    const task = makeTask({ status: 'done' })
    const { result } = renderHook(() =>
      useTaskOrchestration({ task, agents: [], tools: [], onTaskUpdate }),
    )

    act(() => result.current.replan())
    act(() => result.current.replan())

    expect(streamMock.stream).toHaveBeenCalledTimes(1)
  })

  it('exposes a replanInFlight flag that flips true while streaming and false after plan.proposed', async () => {
    const onTaskUpdate = vi.fn()
    const { result } = renderHook(() =>
      useTaskOrchestration({
        task: makeTask({ status: 'done' }),
        agents: [],
        tools: [],
        onTaskUpdate,
      }),
    )

    expect(result.current.replanInFlight).toBe(false)

    act(() => result.current.replan())
    expect(result.current.replanInFlight).toBe(true)

    act(() =>
      streamMock.calls[0].emit({ type: 'plan.proposed', plan: { steps: [] } }),
    )

    await waitFor(() => {
      expect(result.current.replanInFlight).toBe(false)
    })
  })

  it('clears replanInFlight when the stream errors so the user can retry', async () => {
    const onTaskUpdate = vi.fn()
    const { result } = renderHook(() =>
      useTaskOrchestration({
        task: makeTask({ status: 'done' }),
        agents: [],
        tools: [],
        onTaskUpdate,
      }),
    )

    act(() => result.current.replan())
    expect(result.current.replanInFlight).toBe(true)

    await act(async () => {
      streamMock.calls[0].reject(new Error('boom'))
      await streamMock.calls[0].promise.catch(() => {})
    })

    await waitFor(() => {
      expect(result.current.replanInFlight).toBe(false)
    })
  })

  it('is a no-op when called with no task', () => {
    const onTaskUpdate = vi.fn()
    const { result } = renderHook(() =>
      useTaskOrchestration({ task: null, agents: [], tools: [], onTaskUpdate }),
    )

    act(() => result.current.replan())

    expect(streamMock.stream).not.toHaveBeenCalled()
    expect(onTaskUpdate).not.toHaveBeenCalled()
  })
})
