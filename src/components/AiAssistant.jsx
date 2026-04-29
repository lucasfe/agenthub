import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Sparkles, X, Send, Loader2, Maximize2, Minimize2, Bot, ChevronDown } from 'lucide-react'
import { startSession, isOrchestrationConfigured } from '../lib/orchestration'
import Markdown from '../lib/markdown'
import AgentDraftCard from './AgentDraftCard'
import AgentEditCard from './AgentEditCard'
import PlanCard from './orchestration/PlanCard'
import PlanReviewPanel from './orchestration/PlanReviewPanel'
import PlanFallbackCard from './orchestration/PlanFallbackCard'
import { useData } from '../context/DataContext'

const WELCOME_MESSAGE = {
  role: 'assistant',
  content:
    "Hi! I'm your AI assistant. Ask me anything about agents, teams, or how to get the most out of this hub.",
}

const INITIAL_MESSAGES = [WELCOME_MESSAGE]

export default function AiAssistant({ open, onClose }) {
  const { agents, tools } = useData()
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  // Which assistant message (by index) is currently opened in the side
  // review panel. null means no panel is open. One panel at a time.
  const [reviewPanelMsgIdx, setReviewPanelMsgIdx] = useState(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  // Tracks the currently running session and which message index it writes to.
  const sessionRef = useRef(null)

  // Focus the input when the panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Auto-scroll to the latest message
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, isStreaming])

  // Cancel the active session on unmount
  useEffect(() => {
    return () => sessionRef.current?.session?.cancel('unmount')
  }, [])

  // Patches the assistant message at a specific index. Used for stream-in
  // updates (text deltas, plan events). If the index is out of range or the
  // target isn't an assistant message, it's a no-op.
  const patchMessageAt = (index, patch) => {
    setMessages((prev) => {
      if (index < 0 || index >= prev.length) return prev
      const target = prev[index]
      if (!target || target.role !== 'assistant') return prev
      const next = [...prev]
      const patched = typeof patch === 'function' ? patch(target) : { ...target, ...patch }
      next[index] = patched
      return next
    })
  }

  const appendDelta = (index, delta) => {
    patchMessageAt(index, (msg) => ({ ...msg, content: (msg.content || '') + delta }))
  }

  const showErrorAt = (index, message) => {
    setMessages((prev) => {
      if (index < 0 || index >= prev.length) return prev
      const target = prev[index]
      if (!target || target.role !== 'assistant') return prev
      const next = [...prev]
      if (!target.content) {
        next[index] = { role: 'assistant', content: `⚠️ ${message}`, error: true }
      } else {
        next[index] = { ...target }
        next.push({ role: 'assistant', content: `⚠️ ${message}`, error: true })
      }
      return next
    })
  }

  // Generic event dispatcher bound to a specific message slot. Returns an
  // unsubscribe-friendly handler that closes itself when a terminal event
  // arrives (done / error / cancelled).
  const subscribeSession = useCallback((session, messageIdx) => {
    const unsubscribe = session.subscribe((event) => {
      switch (event.type) {
        case 'router.classified':
          break
        // ── Chat branch ─────────────────────────────────
        case 'chat.text':
          appendDelta(messageIdx, event.value)
          break
        case 'chat.tool_call':
          patchMessageAt(messageIdx, {
            toolCall: { name: event.name, input: event.input },
          })
          break
        case 'chat.done':
          setIsStreaming(false)
          sessionRef.current = null
          unsubscribe()
          break
        case 'chat.error':
          showErrorAt(messageIdx, event.error || 'stream error')
          setIsStreaming(false)
          sessionRef.current = null
          unsubscribe()
          break
        // ── Planner branch ──────────────────────────────
        case 'plan.proposing':
          patchMessageAt(messageIdx, { planStatus: 'proposing' })
          break
        case 'plan.analyzing_requirements':
          patchMessageAt(messageIdx, { planStatus: 'analyzing' })
          break
        case 'plan.proposed':
          patchMessageAt(messageIdx, (msg) => ({
            ...msg,
            plan: event.plan,
            planStatus: 'proposed',
            planFallback: null,
            refineError: null,
            stepAnswers: seedStepAnswers(event.plan, msg.stepAnswers),
          }))
          setIsStreaming(false)
          sessionRef.current = null
          unsubscribe()
          break
        case 'plan.fallback':
          patchMessageAt(messageIdx, (msg) => ({
            ...msg,
            plan: null,
            planStatus: 'fallback',
            planFallback: {
              reason: event.reason,
              suggested_agent_type: event.suggested_agent_type,
              suggested_fallback_agent_id: event.suggested_fallback_agent_id,
            },
            refineError: null,
          }))
          setIsStreaming(false)
          sessionRef.current = null
          unsubscribe()
          break
        case 'plan.error':
          // Surface as a refine error if we had a previous plan, otherwise
          // turn the message into a generic error bubble.
          setMessages((prev) => {
            if (messageIdx < 0 || messageIdx >= prev.length) return prev
            const target = prev[messageIdx]
            if (!target) return prev
            if (target.plan) {
              const next = [...prev]
              next[messageIdx] = {
                ...target,
                planStatus: 'proposed',
                refineError: event.error,
              }
              return next
            }
            return prev
          })
          if (!messages[messageIdx]?.plan) {
            showErrorAt(messageIdx, event.error || 'planner error')
          }
          setIsStreaming(false)
          sessionRef.current = null
          unsubscribe()
          break
        // ── Executor branch (Phase 4) ───────────────────
        case 'run.started':
          patchMessageAt(messageIdx, (msg) => ({
            ...msg,
            planStatus: 'executing',
            runId: event.run_id,
            stepStates: {},
            activeStepId: null,
          }))
          break
        case 'step.started':
          patchMessageAt(messageIdx, (msg) => ({
            ...msg,
            activeStepId: event.step_id,
            stepStates: {
              ...(msg.stepStates || {}),
              [event.step_id]: {
                status: 'running',
                text: '',
                toolCalls: [],
                startTime: Date.now(),
              },
            },
          }))
          break
        case 'step.text':
          patchMessageAt(messageIdx, (msg) => {
            const prev = msg.stepStates?.[event.step_id] || {
              status: 'running',
              text: '',
              toolCalls: [],
            }
            return {
              ...msg,
              stepStates: {
                ...(msg.stepStates || {}),
                [event.step_id]: {
                  ...prev,
                  text: (prev.text || '') + event.value,
                },
              },
            }
          })
          break
        case 'step.tool_call_start':
          patchMessageAt(messageIdx, (msg) => {
            const prev = msg.stepStates?.[event.step_id] || {
              status: 'running',
              text: '',
              toolCalls: [],
            }
            return {
              ...msg,
              stepStates: {
                ...(msg.stepStates || {}),
                [event.step_id]: {
                  ...prev,
                  toolCalls: [
                    ...(prev.toolCalls || []),
                    {
                      id: event.tool_call_id,
                      name: event.name,
                      input: event.input,
                      status: 'running',
                    },
                  ],
                },
              },
            }
          })
          break
        case 'step.tool_call_done':
          patchMessageAt(messageIdx, (msg) => {
            const prev = msg.stepStates?.[event.step_id]
            if (!prev) return msg
            const toolCalls = (prev.toolCalls || []).map((tc) =>
              tc.id === event.tool_call_id
                ? {
                    ...tc,
                    status: event.status || 'done',
                    summary: event.summary,
                    error: event.error,
                    artifact: event.artifact,
                    duration_ms: event.duration_ms,
                  }
                : tc,
            )
            return {
              ...msg,
              stepStates: {
                ...(msg.stepStates || {}),
                [event.step_id]: { ...prev, toolCalls },
              },
            }
          })
          break
        case 'step.done':
          patchMessageAt(messageIdx, (msg) => {
            const prev = msg.stepStates?.[event.step_id] || {
              text: '',
              toolCalls: [],
            }
            return {
              ...msg,
              stepStates: {
                ...(msg.stepStates || {}),
                [event.step_id]: {
                  ...prev,
                  status: 'done',
                  duration_ms: event.duration_ms,
                  tokens_in: event.tokens_in,
                  tokens_out: event.tokens_out,
                },
              },
            }
          })
          break
        case 'step.error':
          patchMessageAt(messageIdx, (msg) => {
            const prev = msg.stepStates?.[event.step_id] || {
              text: '',
              toolCalls: [],
            }
            return {
              ...msg,
              stepStates: {
                ...(msg.stepStates || {}),
                [event.step_id]: {
                  ...prev,
                  status: 'error',
                  error: event.error,
                },
              },
            }
          })
          break
        case 'run.done':
          patchMessageAt(messageIdx, (msg) => ({
            ...msg,
            planStatus: 'done',
            activeStepId: null,
            runSummary: {
              duration_ms: event.duration_ms,
              tokens_in: event.total_tokens_in,
              tokens_out: event.total_tokens_out,
            },
          }))
          setIsStreaming(false)
          sessionRef.current = null
          unsubscribe()
          break
        case 'run.error':
          patchMessageAt(messageIdx, (msg) => {
            // Cascade the error to any step that was still in a running
            // state — the server should also emit step.error, but we do it
            // here as defense-in-depth so the UI never shows a step
            // perpetually "running" after a run failure.
            const nextStepStates = { ...(msg.stepStates || {}) }
            for (const [stepId, state] of Object.entries(nextStepStates)) {
              if (state?.status === 'running') {
                nextStepStates[stepId] = {
                  ...state,
                  status: 'error',
                  error: state.error || event.error || 'run aborted',
                }
              }
            }
            return {
              ...msg,
              planStatus: 'error',
              activeStepId: null,
              stepStates: nextStepStates,
              runError: event.error,
              failedStepId: event.failed_step_id,
            }
          })
          setIsStreaming(false)
          sessionRef.current = null
          unsubscribe()
          break
        case 'run.cancelled':
          setIsStreaming(false)
          sessionRef.current = null
          unsubscribe()
          break
        default:
          break
      }
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const buildOutgoing = (allMessages) =>
    allMessages
      .filter((m) => !m.error && m !== WELCOME_MESSAGE)
      .map((m) => {
        if (m.role === 'assistant' && m.toolCall) {
          const summary = serializeToolCall(m.toolCall)
          return { role: m.role, content: (m.content || '') + summary }
        }
        return { role: m.role, content: m.content }
      })
      .filter((m) => m.content && m.content.trim())

  const handleSend = (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isStreaming) return

    if (!isOrchestrationConfigured()) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: text },
        {
          role: 'assistant',
          content:
            'Chat is not configured. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then deploy the `chat` Edge Function with `ANTHROPIC_API_KEY` secret.',
          error: true,
        },
      ])
      setInput('')
      return
    }

    const userMessage = { role: 'user', content: text }
    const nextMessages = [...messages, userMessage]
    const outgoing = buildOutgoing(nextMessages)

    const assistantMessage = {
      role: 'assistant',
      content: '',
      originalTask: text,
      outgoingSnapshot: outgoing,
    }
    const withAssistant = [...nextMessages, assistantMessage]
    const assistantIdx = withAssistant.length - 1

    setMessages(withAssistant)
    setInput('')
    setIsStreaming(true)

    const session = startSession({
      mode: 'chat',
      messages: outgoing,
      agents,
      tools,
    })
    sessionRef.current = { session, messageIdx: assistantIdx }
    subscribeSession(session, assistantIdx)
  }

  const handleRefinePlan = (messageIdx, instructions) => {
    if (isStreaming) return
    const target = messages[messageIdx]
    if (!target || !target.plan) return

    const outgoing = target.outgoingSnapshot || buildOutgoing(messages.slice(0, messageIdx))

    patchMessageAt(messageIdx, {
      planStatus: 'refining',
      refineError: null,
    })
    setIsStreaming(true)

    const session = startSession({
      mode: 'planned',
      messages: outgoing,
      agents,
      tools,
      refinement: {
        previous_plan: target.plan,
        instructions,
      },
    })
    sessionRef.current = { session, messageIdx }
    subscribeSession(session, messageIdx)
  }

  const handleApprovePlan = (messageIdx) => {
    if (isStreaming) return
    const target = messages[messageIdx]
    if (!target || !target.plan) return
    // Block approval when required requirements are missing. UI already
    // reflects this via a disabled button, but defend against calls.
    if (countMissingRequired(target.plan, target.stepAnswers || {}) > 0) return

    // If the review panel was open for this message, close it now so the
    // user can watch execution in the chat card. They can re-open it via
    // the "Open live view" button.
    if (reviewPanelMsgIdx === messageIdx) setReviewPanelMsgIdx(null)

    patchMessageAt(messageIdx, {
      planStatus: 'executing',
      stepStates: {},
      activeStepId: null,
      runError: null,
    })
    setIsStreaming(true)

    const session = startSession({
      mode: 'execute',
      messages: target.outgoingSnapshot || [],
      agents,
      tools,
      plan: target.plan,
      originalTask: target.originalTask || '',
      stepAnswers: target.stepAnswers || {},
    })
    sessionRef.current = { session, messageIdx }
    subscribeSession(session, messageIdx)
  }

  const handleAnswerChange = (messageIdx, stepId, key, value) => {
    patchMessageAt(messageIdx, (msg) => ({
      ...msg,
      stepAnswers: {
        ...(msg.stepAnswers || {}),
        [stepId]: {
          ...(msg.stepAnswers?.[stepId] || {}),
          [key]: value,
        },
      },
    }))
  }

  const openReviewPanel = (messageIdx) => setReviewPanelMsgIdx(messageIdx)
  const closeReviewPanel = () => setReviewPanelMsgIdx(null)

  // Auto-open the review panel in fullscreen when a plan is proposed and it
  // has required requirements waiting for answers. Compact mode preserves
  // the chat flow and requires an explicit click.
  useEffect(() => {
    if (!fullscreen) return
    const lastIdx = messages.length - 1
    if (lastIdx < 0) return
    const last = messages[lastIdx]
    if (!last || last.role !== 'assistant') return
    if (last.planStatus !== 'proposed' || !last.plan) return
    // Already open for this message
    if (reviewPanelMsgIdx === lastIdx) return
    // Only auto-open if there are required fields to fill
    const required = countMissingRequired(last.plan, last.stepAnswers || {})
    if (required > 0) {
      setReviewPanelMsgIdx(lastIdx)
    }
  }, [messages, fullscreen, reviewPanelMsgIdx])

  const handleCancelPlan = (messageIdx) => {
    const target = messages[messageIdx]
    if (target?.planStatus === 'executing') {
      sessionRef.current?.session?.cancel('user')
    }
    patchMessageAt(messageIdx, { planStatus: 'cancelled' })
  }

  const handleClear = () => {
    sessionRef.current?.session?.cancel('clear')
    sessionRef.current = null
    setIsStreaming(false)
    setMessages(INITIAL_MESSAGES)
  }

  if (!open) return null

  // Resolve which message (if any) is currently shown in the review panel.
  const reviewPanelOpen =
    reviewPanelMsgIdx !== null &&
    reviewPanelMsgIdx >= 0 &&
    reviewPanelMsgIdx < messages.length
  const reviewMsg = reviewPanelOpen ? messages[reviewPanelMsgIdx] : null
  // In compact mode the aside is 400px wide — no room for a split view, so
  // the panel overlays the chat. In fullscreen we split horizontally.
  const compactPanelOverlay = reviewPanelOpen && !fullscreen

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — slide-out on the right, or full screen */}
      <aside
        role="dialog"
        aria-label="AI Assistant"
        className={`fixed z-50 bg-bg-sidebar shadow-2xl flex flex-row ${
          fullscreen
            ? 'inset-0'
            : 'top-0 right-0 h-full w-full max-w-md border-l border-border-subtle'
        }`}
      >
        {/* Chat column (hidden when panel overlays in compact mode) */}
        <div
          className={`flex flex-col min-w-0 ${
            compactPanelOverlay ? 'hidden' : 'flex-1'
          }`}
        >
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
              <Sparkles size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">AI Assistant</h2>
              <p className="text-[11px] text-text-muted">Ask me anything</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleClear}
              className="text-[11px] text-text-muted hover:text-text-primary transition-colors px-2 py-1 rounded-md hover:bg-bg-input"
              aria-label="Clear conversation"
            >
              Clear
            </button>
            <button
              onClick={() => setFullscreen((v) => !v)}
              className="p-2 rounded-lg hover:bg-bg-input text-text-secondary hover:text-text-primary transition-colors"
              aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-bg-input text-text-secondary hover:text-text-primary transition-colors"
              aria-label="Close assistant"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto px-5 py-5"
        >
          <div
            className={`space-y-4 ${fullscreen ? 'max-w-3xl mx-auto' : ''}`}
          >
            {messages.map((msg, i) => {
              const isLast = i === messages.length - 1
              const showCursor =
                isStreaming && isLast && msg.role === 'assistant' && !msg.error
              return (
                <MessageBubble
                  key={i}
                  role={msg.role}
                  content={msg.content}
                  error={msg.error}
                  showCursor={showCursor}
                  toolCall={msg.toolCall}
                  plan={msg.plan}
                  planStatus={msg.planStatus}
                  planFallback={msg.planFallback}
                  stepStates={msg.stepStates}
                  activeStepId={msg.activeStepId}
                  runSummary={msg.runSummary}
                  runError={msg.runError}
                  failedStepId={msg.failedStepId}
                  stepAnswers={msg.stepAnswers}
                  availableAgents={agents}
                  onOpenReview={() => openReviewPanel(i)}
                  onApprovePlan={() => handleApprovePlan(i)}
                  onCancelPlan={() => handleCancelPlan(i)}
                />
              )
            })}
            {isStreaming &&
              messages[messages.length - 1]?.role === 'assistant' &&
              messages[messages.length - 1]?.content === '' &&
              !messages[messages.length - 1]?.toolCall &&
              !messages[messages.length - 1]?.plan &&
              messages[messages.length - 1]?.planStatus !== 'proposing' && (
                <div className="flex items-center gap-2 text-text-muted text-sm">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Thinking…</span>
                </div>
              )}
            {isStreaming &&
              messages[messages.length - 1]?.planStatus === 'proposing' && (
                <div className="flex items-center gap-2 text-text-muted text-sm">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Planning…</span>
                </div>
              )}
            {isStreaming &&
              messages[messages.length - 1]?.planStatus === 'analyzing' && (
                <div className="flex items-center gap-2 text-text-muted text-sm">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Analyzing requirements…</span>
                </div>
              )}
          </div>
        </div>

        {/* Input */}
        <form
          onSubmit={handleSend}
          className="border-t border-border-subtle p-4 shrink-0"
        >
          <div
            className={`flex items-end gap-2 bg-bg-input border border-border-subtle rounded-xl px-3 py-2 focus-within:border-border-hover transition-colors ${
              fullscreen ? 'max-w-3xl mx-auto' : ''
            }`}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none py-1.5"
              disabled={isStreaming}
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              aria-label="Send message"
            >
              {isStreaming ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
            </button>
          </div>
          <p
            className={`text-[10px] text-text-muted mt-2 px-1 ${
              fullscreen ? 'max-w-3xl mx-auto' : ''
            }`}
          >
            Powered by Claude via Supabase Edge Functions.
          </p>
        </form>
        </div>
        {/* End chat column */}

        {/* Review panel column */}
        {reviewPanelOpen && reviewMsg && (
          <div
            className={`flex flex-col min-w-0 ${
              fullscreen ? 'w-[560px] shrink-0' : 'flex-1'
            }`}
          >
            <PlanReviewPanel
              plan={reviewMsg.plan}
              status={reviewMsg.planStatus || 'proposed'}
              refineError={reviewMsg.refineError}
              stepStates={reviewMsg.stepStates}
              activeStepId={reviewMsg.activeStepId}
              runSummary={reviewMsg.runSummary}
              runError={reviewMsg.runError}
              failedStepId={reviewMsg.failedStepId}
              stepAnswers={reviewMsg.stepAnswers}
              availableTools={tools}
              onRefine={(text) => handleRefinePlan(reviewPanelMsgIdx, text)}
              onApprove={() => handleApprovePlan(reviewPanelMsgIdx)}
              onCancel={() => handleCancelPlan(reviewPanelMsgIdx)}
              onAnswerChange={(stepId, key, value) =>
                handleAnswerChange(reviewPanelMsgIdx, stepId, key, value)
              }
              onClose={closeReviewPanel}
            />
          </div>
        )}
      </aside>
    </>
  )
}

function MessageBubble({
  role,
  content,
  error,
  showCursor,
  toolCall,
  plan,
  planStatus,
  planFallback,
  stepStates,
  activeStepId,
  runSummary,
  runError,
  failedStepId,
  stepAnswers,
  availableAgents,
  onOpenReview,
  onApprovePlan,
  onCancelPlan,
}) {
  const isUser = role === 'user'
  const hasPlan = Boolean(plan || planFallback || planStatus === 'proposing')
  if (!content && !showCursor && !toolCall && !hasPlan) return null

  // Render markdown for assistant (non-error) messages; everything else is plain text.
  const renderAsMarkdown = role === 'assistant' && !error
  // Wider bubble when it contains a card.
  const widthClass = toolCall || hasPlan ? 'max-w-[95%] w-full' : 'max-w-[85%]'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`${widthClass} rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-gradient-to-br from-purple-500 to-blue-500 text-white rounded-br-sm whitespace-pre-wrap'
            : error
              ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-bl-sm whitespace-pre-wrap'
              : 'bg-bg-card border border-border-subtle text-text-primary rounded-bl-sm overflow-hidden'
        }`}
      >
        {content && (
          renderAsMarkdown ? (
            <Markdown text={content} variant="chat" />
          ) : (
            content
          )
        )}
        {showCursor && (
          <span className="inline-block w-1.5 h-4 ml-0.5 bg-current align-middle animate-pulse" />
        )}
        {toolCall?.name === 'draft_agent' && (
          <AgentDraftCard draft={toolCall.input} />
        )}
        {toolCall?.name === 'update_agent' && (
          <AgentEditCard
            targetId={toolCall.input?.id}
            updates={toolCall.input?.updates}
          />
        )}
        {plan && (
          <PlanCard
            plan={plan}
            status={planStatus || 'proposed'}
            stepStates={stepStates}
            activeStepId={activeStepId}
            runSummary={runSummary}
            runError={runError}
            failedStepId={failedStepId}
            stepAnswers={stepAnswers}
            onOpenReview={onOpenReview}
            onApprove={onApprovePlan}
            onCancel={onCancelPlan}
          />
        )}
        {planFallback && !plan && (
          <PlanFallbackCard
            reason={planFallback.reason}
            suggestedAgentType={planFallback.suggested_agent_type}
            suggestedFallbackAgentId={planFallback.suggested_fallback_agent_id}
            availableAgents={availableAgents}
          />
        )}
      </div>
    </div>
  )
}

// Build an initial stepAnswers map for a newly-arrived plan.
// - Pre-fills each requirement with its `suggested` default (if any)
// - Preserves previous user answers by matching (stepId, key) — so refining
//   a plan doesn't wipe values the user already typed
function seedStepAnswers(plan, prevStepAnswers = {}) {
  const seeded = {}
  if (!plan || !Array.isArray(plan.steps)) return seeded
  for (const step of plan.steps) {
    const reqs = Array.isArray(step.requirements) ? step.requirements : []
    if (reqs.length === 0) continue
    const prev = prevStepAnswers?.[step.id] || {}
    const stepSeed = {}
    for (const req of reqs) {
      if (!req || typeof req.key !== 'string') continue
      if (prev[req.key] != null && prev[req.key] !== '') {
        stepSeed[req.key] = prev[req.key]
      } else if (typeof req.suggested === 'string' && req.suggested) {
        stepSeed[req.key] = req.suggested
      } else {
        stepSeed[req.key] = ''
      }
    }
    seeded[step.id] = stepSeed
  }
  return seeded
}

// Count required requirements that don't yet have a non-empty answer.
function countMissingRequired(plan, stepAnswers) {
  if (!plan || !Array.isArray(plan.steps)) return 0
  let count = 0
  for (const step of plan.steps) {
    const reqs = Array.isArray(step.requirements) ? step.requirements : []
    const answers = stepAnswers?.[step.id] || {}
    for (const req of reqs) {
      if (!req || req.required !== true) continue
      const val = answers[req.key]
      if (typeof val !== 'string' || !val.trim()) count += 1
    }
  }
  return count
}

// Serialize a previous assistant tool call as a short text summary, so the
// next outgoing request gives Claude enough context to iterate without having
// to re-send the full tool_use block (which would require tool_result).
function serializeToolCall(toolCall) {
  if (!toolCall) return ''
  if (toolCall.name === 'draft_agent') {
    return `\n\n[I drafted a new agent with these fields: ${JSON.stringify(toolCall.input)}]`
  }
  if (toolCall.name === 'update_agent') {
    return `\n\n[I proposed an update to agent "${toolCall.input?.id}" with these changes: ${JSON.stringify(toolCall.input?.updates ?? {})}]`
  }
  return `\n\n[I called the "${toolCall.name}" tool with: ${JSON.stringify(toolCall.input)}]`
}
