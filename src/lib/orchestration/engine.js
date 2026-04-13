// Orchestration engine — Session abstraction for a single run.
//
// A Session is the unit of work for the orchestrator. It wraps the underlying
// SSE stream, tracks status, and lets consumers subscribe to events. Sessions
// are local to whoever creates them: there is no global registry. Multiple
// sessions can exist concurrently, each isolated.
//
// Phase 2 scope: only `mode: 'chat'` is implemented end-to-end. Other modes
// (`planned`, `direct`, `team`) are accepted in the API shape but the engine
// still routes everything through the chat flow on the server side.

import { streamOrchestration } from './stream'

export const SESSION_STATUS = Object.freeze({
  IDLE: 'idle',
  STREAMING: 'streaming',
  DONE: 'done',
  ERROR: 'error',
  CANCELLED: 'cancelled',
})

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'session-' + Math.random().toString(36).slice(2, 11)
}

export class Session {
  constructor({ id, mode }) {
    this.id = id || makeId()
    this.mode = mode || 'chat'
    this.status = SESSION_STATUS.IDLE
    this.error = null
    this.routerClassification = null
    this._subscribers = new Set()
    this._abort = new AbortController()
  }

  get signal() {
    return this._abort.signal
  }

  subscribe(fn) {
    this._subscribers.add(fn)
    return () => this._subscribers.delete(fn)
  }

  _emit(event) {
    if (event.type === 'router.classified') {
      this.routerClassification = event.mode
    }
    for (const fn of this._subscribers) {
      try {
        fn(event)
      } catch (err) {
        console.error('[orchestration] subscriber error', err)
      }
    }
  }

  cancel(reason = 'user') {
    if (
      this.status === SESSION_STATUS.DONE ||
      this.status === SESSION_STATUS.ERROR ||
      this.status === SESSION_STATUS.CANCELLED
    ) {
      return
    }
    this._abort.abort()
    this.status = SESSION_STATUS.CANCELLED
    this._emit({
      type: 'run.cancelled',
      session_id: this.id,
      timestamp: Date.now(),
      by: reason,
    })
  }
}

// Kick off a session and start streaming. Returns the Session synchronously so
// callers can subscribe immediately, even if the network request hasn't left.
export function startSession({
  mode = 'chat',
  messages,
  agents,
  tools,
  refinement,
  plan,
  originalTask,
  stepAnswers,
}) {
  const session = new Session({ mode })
  session.status = SESSION_STATUS.STREAMING

  // Fire and forget — the session owns the stream lifecycle through its own
  // status flags and subscribers. Errors bubble through `_emit` as error events.
  streamOrchestration({
    mode,
    sessionId: session.id,
    messages,
    agents,
    tools,
    refinement,
    plan,
    originalTask,
    stepAnswers,
    signal: session.signal,
    onEvent: (evt) => {
      // Ensure every event carries the session_id the caller expects.
      session._emit({ ...evt, session_id: session.id })
    },
  })
    .then(() => {
      // Server should have emitted a terminal event already; if not, treat
      // stream end as done.
      if (session.status === SESSION_STATUS.STREAMING) {
        session.status = SESSION_STATUS.DONE
        // Terminal event type depends on which branch ran. For safety, emit
        // a generic chat.done — subscribers that only care about plan events
        // just ignore it.
        session._emit({
          type: 'chat.done',
          session_id: session.id,
          timestamp: Date.now(),
        })
      }
    })
    .catch((err) => {
      if (session.status === SESSION_STATUS.CANCELLED) return
      session.status = SESSION_STATUS.ERROR
      session.error = err.message || String(err)
      session._emit({
        type: 'chat.error',
        session_id: session.id,
        timestamp: Date.now(),
        error: session.error,
      })
    })

  return session
}
