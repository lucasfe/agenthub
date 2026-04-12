import { useState, useEffect, useRef, useCallback } from 'react'
import { Sparkles, X, Send, Loader2, Maximize2, Minimize2 } from 'lucide-react'
import { startSession, isOrchestrationConfigured } from '../lib/orchestration'
import Markdown from '../lib/markdown'
import AgentDraftCard from './AgentDraftCard'
import AgentEditCard from './AgentEditCard'
import PlanCard from './orchestration/PlanCard'
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
        case 'plan.proposed':
          patchMessageAt(messageIdx, (msg) => ({
            ...msg,
            plan: event.plan,
            planStatus: 'proposed',
            planFallback: null,
            refineError: null,
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
    patchMessageAt(messageIdx, { planStatus: 'approved' })
  }

  const handleCancelPlan = (messageIdx) => {
    patchMessageAt(messageIdx, { planStatus: 'cancelled' })
  }

  const handleClear = () => {
    sessionRef.current?.session?.cancel('clear')
    sessionRef.current = null
    setIsStreaming(false)
    setMessages(INITIAL_MESSAGES)
  }

  if (!open) return null

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
        className={`fixed z-50 bg-bg-sidebar shadow-2xl flex flex-col ${
          fullscreen
            ? 'inset-0'
            : 'top-0 right-0 h-full w-full max-w-md border-l border-border-subtle'
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
                  refineError={msg.refineError}
                  availableTools={tools}
                  availableAgents={agents}
                  onRefinePlan={(text) => handleRefinePlan(i, text)}
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
  refineError,
  availableTools,
  availableAgents,
  onRefinePlan,
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
              : 'bg-bg-card border border-border-subtle text-text-primary rounded-bl-sm'
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
            refineError={refineError}
            availableTools={availableTools}
            onRefine={onRefinePlan}
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
