// Hook that drives the orchestration lifecycle for a single board task.
//
// Usage:
//   const orch = useTaskOrchestration({ task, agents, tools, onTaskUpdate })
//   orch.startPlanning()   — kicks off the planner
//   orch.approve()         — approves the plan and starts execution
//   orch.cancel()          — cancels
//
// The hook streams SSE events and calls onTaskUpdate(taskId, patch) to persist
// state changes back to the parent (which writes to Supabase).

import { useRef, useCallback, useState } from 'react'
import { streamOrchestration } from './orchestration/stream'

export function useTaskOrchestration({ task, agents, tools, onTaskUpdate }) {
  const [stepStates, setStepStates] = useState({})
  const [activeStepId, setActiveStepId] = useState(null)
  const [runSummary, setRunSummary] = useState(null)
  const [runError, setRunError] = useState(null)
  const [failedStepId, setFailedStepId] = useState(null)
  const abortRef = useRef(null)

  const taskId = task?.id
  const patch = useCallback(
    (updates) => {
      if (taskId) onTaskUpdate(taskId, updates)
    },
    [taskId, onTaskUpdate],
  )

  const startPlanning = useCallback(() => {
    if (!task) return
    patch({ status: 'planning', plan: null, error_message: null, run_id: null, artifacts: [] })
    setStepStates({})
    setActiveStepId(null)
    setRunSummary(null)
    setRunError(null)
    setFailedStepId(null)

    const controller = new AbortController()
    abortRef.current = controller

    const taskDescription = [task.title, task.description].filter(Boolean).join('\n\n')

    streamOrchestration({
      mode: 'planned',
      sessionId: crypto.randomUUID(),
      messages: [{ role: 'user', content: taskDescription }],
      agents,
      tools,
      signal: controller.signal,
      onEvent: (event) => {
        switch (event.type) {
          case 'plan.proposed':
            patch({ status: 'awaiting_approval', plan: event.plan })
            break
          case 'plan.fallback':
            patch({
              status: 'error',
              error_message: event.reason || 'No suitable agent found',
            })
            break
          case 'plan.error':
            patch({
              status: 'error',
              error_message: event.error || 'Planning failed',
            })
            break
          default:
            break
        }
      },
    }).catch((err) => {
      if (err.name !== 'AbortError') {
        patch({ status: 'error', error_message: err.message })
      }
    })
  }, [task, agents, tools, patch])

  const approve = useCallback(
    (stepAnswers) => {
      if (!task?.plan) return
      patch({ status: 'executing', error_message: null })
      setStepStates({})
      setActiveStepId(null)
      setRunSummary(null)
      setRunError(null)
      setFailedStepId(null)

      const controller = new AbortController()
      abortRef.current = controller

      const taskDescription = [task.title, task.description].filter(Boolean).join('\n\n')
      const collectedArtifacts = []

      streamOrchestration({
        mode: 'execute',
        sessionId: crypto.randomUUID(),
        messages: [{ role: 'user', content: taskDescription }],
        agents,
        tools,
        plan: task.plan,
        originalTask: taskDescription,
        stepAnswers,
        signal: controller.signal,
        onEvent: (event) => {
          console.log('[task-orch] event', event.type, event)
          switch (event.type) {
            case 'run.started':
              patch({ run_id: event.run_id })
              break
            case 'step.started':
              setActiveStepId(event.step_id)
              setStepStates((prev) => ({
                ...prev,
                [event.step_id]: { status: 'running', text: '', toolCalls: [], startTime: Date.now() },
              }))
              break
            case 'step.text':
              setStepStates((prev) => {
                const p = prev[event.step_id] || { status: 'running', text: '', toolCalls: [] }
                return { ...prev, [event.step_id]: { ...p, text: (p.text || '') + event.value } }
              })
              break
            case 'step.tool_call_start':
              setStepStates((prev) => {
                const p = prev[event.step_id] || { status: 'running', text: '', toolCalls: [] }
                return {
                  ...prev,
                  [event.step_id]: {
                    ...p,
                    toolCalls: [...(p.toolCalls || []), { id: event.tool_call_id, name: event.name, input: event.input, status: 'running' }],
                  },
                }
              })
              break
            case 'step.tool_call_done':
              if (event.artifact) collectedArtifacts.push(event.artifact)
              setStepStates((prev) => {
                const p = prev[event.step_id]
                if (!p) return prev
                const toolCalls = (p.toolCalls || []).map((tc) =>
                  tc.id === event.tool_call_id
                    ? { ...tc, status: event.status || 'done', summary: event.summary, error: event.error, artifact: event.artifact, duration_ms: event.duration_ms }
                    : tc,
                )
                return { ...prev, [event.step_id]: { ...p, toolCalls } }
              })
              break
            case 'step.done':
              setStepStates((prev) => {
                const p = prev[event.step_id] || { text: '', toolCalls: [] }
                return { ...prev, [event.step_id]: { ...p, status: 'done', duration_ms: event.duration_ms, tokens_in: event.tokens_in, tokens_out: event.tokens_out } }
              })
              break
            case 'step.error':
              setStepStates((prev) => {
                const p = prev[event.step_id] || { text: '', toolCalls: [] }
                return { ...prev, [event.step_id]: { ...p, status: 'error', error: event.error } }
              })
              break
            case 'run.done':
              setActiveStepId(null)
              setRunSummary({ duration_ms: event.duration_ms, tokens_in: event.total_tokens_in, tokens_out: event.total_tokens_out })
              patch({ status: 'done', artifacts: collectedArtifacts.length > 0 ? collectedArtifacts : [] })
              break
            case 'run.error': {
              setActiveStepId(null)
              setRunError(event.error)
              setFailedStepId(event.failed_step_id)
              setStepStates((prev) => {
                const next = { ...prev }
                for (const [sid, s] of Object.entries(next)) {
                  if (s?.status === 'running') next[sid] = { ...s, status: 'error', error: s.error || event.error || 'run aborted' }
                }
                return next
              })
              patch({ status: 'error', error_message: event.error })
              break
            }
            default:
              break
          }
        },
      }).catch((err) => {
        if (err.name !== 'AbortError') {
          patch({ status: 'error', error_message: err.message })
        }
      })
    },
    [task, agents, tools, patch],
  )

  const cancel = useCallback(() => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = null
    patch({ status: 'cancelled', error_message: 'Cancelled by user' })
  }, [patch])

  return {
    stepStates,
    activeStepId,
    runSummary,
    runError,
    failedStepId,
    startPlanning,
    approve,
    cancel,
  }
}
