import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Loader2, Mic, Plus, Send, Square } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { isOrchestrationConfigured, startSession } from '../../lib/orchestration'
import { startRecognition } from '../../lib/voice'
import MobileAgentPicker from './MobileAgentPicker'
import MobileApprovalCard from './MobileApprovalCard'
import MobilePlanCard from './MobilePlanCard'

const INITIAL_MESSAGES = []

export default function MobileChat() {
  const data = useData() || {}
  const agents = data.agents || []
  const tools = data.tools || []
  const bumpAgentUsage = data.bumpAgentUsage
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const [toast, setToast] = useState(null)
  const sessionRef = useRef(null)
  const recognitionRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, isStreaming])

  useEffect(() => {
    return () => {
      sessionRef.current?.session?.cancel('unmount')
      recognitionRef.current?.stop?.()
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const handle = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(handle)
  }, [toast])

  const patchMessageAt = (index, patch) => {
    setMessages((prev) => {
      if (index < 0 || index >= prev.length) return prev
      const target = prev[index]
      if (!target || target.role !== 'assistant') return prev
      const next = [...prev]
      next[index] = typeof patch === 'function' ? patch(target) : { ...target, ...patch }
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

  const subscribeSession = useCallback((session, messageIdx) => {
    const unsubscribe = session.subscribe((event) => {
      switch (event.type) {
        case 'router.classified':
          break
        case 'chat.text':
          appendDelta(messageIdx, event.value)
          break
        case 'chat.tool_call':
          patchMessageAt(messageIdx, (msg) => {
            if (event.requires_approval) {
              return {
                ...msg,
                approval: {
                  name: event.name,
                  input: event.input,
                  toolCallId: event.tool_call_id,
                  status: 'pending',
                  session,
                },
              }
            }
            return {
              ...msg,
              toolCall: { name: event.name, input: event.input },
            }
          })
          break
        case 'chat.tool_call_start':
          patchMessageAt(messageIdx, (msg) => ({
            ...msg,
            agentToolCalls: [
              ...(msg.agentToolCalls || []),
              {
                id: event.tool_call_id,
                name: event.name,
                input: event.input,
                status: 'running',
              },
            ],
          }))
          break
        case 'chat.tool_call_done':
          patchMessageAt(messageIdx, (msg) => {
            const list = msg.agentToolCalls || []
            const next = list.map((tc) =>
              tc.id === event.tool_call_id
                ? {
                    ...tc,
                    status: event.status || 'done',
                    summary: event.summary,
                    error: event.error,
                  }
                : tc,
            )
            return { ...msg, agentToolCalls: next }
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
        case 'plan.proposing':
          patchMessageAt(messageIdx, { planStatus: 'proposing' })
          break
        case 'plan.proposed':
          patchMessageAt(messageIdx, {
            plan: event.plan,
            planStatus: 'proposed',
          })
          setIsStreaming(false)
          sessionRef.current = null
          unsubscribe()
          break
        case 'plan.error':
          showErrorAt(messageIdx, event.error || 'planner error')
          setIsStreaming(false)
          sessionRef.current = null
          unsubscribe()
          break
        case 'run.started':
          patchMessageAt(messageIdx, { planStatus: 'executing' })
          break
        case 'run.done':
          patchMessageAt(messageIdx, { planStatus: 'done' })
          setIsStreaming(false)
          sessionRef.current = null
          unsubscribe()
          break
        case 'run.error':
          patchMessageAt(messageIdx, { planStatus: 'error', runError: event.error })
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
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, content: m.content }))
      .filter((m) => m.content && m.content.trim())

  const handleSend = (e) => {
    e?.preventDefault?.()
    const text = input.trim()
    if (!text || isStreaming) return

    if (!isOrchestrationConfigured()) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: text },
        {
          role: 'assistant',
          content: 'Chat is not configured. Set Supabase env vars and deploy the chat function.',
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

    if (selectedAgentId) {
      bumpAgentUsage?.(selectedAgentId, 'orchestrator_invoke')
    }

    const session = startSession({
      mode: 'chat',
      messages: outgoing,
      agents,
      tools,
      selectedAgentId,
    })
    sessionRef.current = { session, messageIdx: assistantIdx }
    subscribeSession(session, assistantIdx)
  }

  const handleApproveTool = (messageIdx) => {
    const msg = messages[messageIdx]
    const approval = msg?.approval
    if (!approval || approval.status !== 'pending') return
    approval.session?.approve?.(approval.toolCallId)
    patchMessageAt(messageIdx, (m) => ({
      ...m,
      approval: { ...m.approval, status: 'approved' },
    }))
  }

  const handleRejectTool = (messageIdx) => {
    const msg = messages[messageIdx]
    const approval = msg?.approval
    if (!approval || approval.status !== 'pending') return
    approval.session?.reject?.(approval.toolCallId)
    patchMessageAt(messageIdx, (m) => ({
      ...m,
      approval: { ...m.approval, status: 'rejected' },
    }))
  }

  const handleNewChat = () => {
    sessionRef.current?.session?.cancel('new-chat')
    sessionRef.current = null
    setIsStreaming(false)
    setMessages(INITIAL_MESSAGES)
    setInput('')
  }

  const stopVoice = () => {
    recognitionRef.current?.stop?.()
    recognitionRef.current = null
    setListening(false)
  }

  const startVoice = () => {
    if (listening) {
      stopVoice()
      return
    }
    let finalText = ''
    setListening(true)
    const handle = startRecognition({
      lang: 'pt-BR',
      onResult: ({ transcript, isFinal }) => {
        if (isFinal) {
          finalText = transcript
        }
      },
      onError: (err) => {
        if (err?.code === 'not-allowed' || err?.code === 'service-not-allowed') {
          setToast({
            kind: 'error',
            text: 'Microphone permission denied. Open iOS Settings → Safari → Microphone to allow it.',
          })
        } else if (err?.code === 'unsupported') {
          setToast({
            kind: 'error',
            text: 'Voice input is not supported on this browser.',
          })
        } else if (err?.code) {
          setToast({ kind: 'error', text: `Voice error: ${err.code}` })
        }
      },
      onEnd: () => {
        recognitionRef.current = null
        setListening(false)
        if (finalText) {
          setInput((prev) => (prev ? `${prev}${finalText}` : finalText))
        }
      },
    })
    recognitionRef.current = handle
  }

  const selectedAgent =
    selectedAgentId && Array.isArray(agents)
      ? agents.find((a) => a.id === selectedAgentId)
      : null

  return (
    <div className="flex flex-col min-h-screen bg-bg-primary">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button
          type="button"
          aria-label="Select agent"
          onClick={() => setPickerOpen(true)}
          className="flex flex-col items-start leading-tight text-left"
        >
          <span className="text-[11px] uppercase tracking-wide text-text-muted">agenthub</span>
          <span className="flex items-center gap-1 text-sm font-medium text-text-primary">
            <Bot size={14} />
            {selectedAgent ? selectedAgent.name : 'Auto agent'}
          </span>
        </button>
        <button
          type="button"
          onClick={handleNewChat}
          className="flex items-center gap-1 text-sm text-text-primary px-3 py-1.5 rounded-lg hover:bg-white/5"
        >
          <Plus size={16} />
          New chat
        </button>
      </header>

      <main ref={listRef} className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="text-center text-text-muted text-sm mt-12">
            Start a conversation
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((msg, i) => (
              <li
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-accent-blue text-white whitespace-pre-wrap'
                      : msg.error
                        ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300 whitespace-pre-wrap'
                        : 'bg-white/5 border border-white/10 text-text-primary'
                  }`}
                >
                  {msg.content && <div className="whitespace-pre-wrap">{msg.content}</div>}
                  {msg.toolCall && (
                    <div className="mt-2 text-xs font-mono text-text-secondary">
                      {msg.toolCall.name}
                    </div>
                  )}
                  {msg.approval && (
                    <MobileApprovalCard
                      name={msg.approval.name}
                      input={msg.approval.input}
                      status={msg.approval.status}
                      onApprove={() => handleApproveTool(i)}
                      onReject={() => handleRejectTool(i)}
                    />
                  )}
                  {msg.plan && (
                    <MobilePlanCard
                      plan={msg.plan}
                      status={msg.planStatus || 'proposed'}
                      onApprove={() => {
                        // Plan approval kicks off an execute session; this is a
                        // mobile-friendly pass-through that mirrors the desktop
                        // behavior without the requirements panel.
                        const target = messages[i]
                        if (!target?.plan || isStreaming) return
                        patchMessageAt(i, { planStatus: 'executing' })
                        setIsStreaming(true)
                        const next = startSession({
                          mode: 'execute',
                          messages: target.outgoingSnapshot || [],
                          agents,
                          tools,
                          plan: target.plan,
                          originalTask: target.originalTask || '',
                        })
                        sessionRef.current = { session: next, messageIdx: i }
                        subscribeSession(next, i)
                      }}
                      onCancel={() => patchMessageAt(i, { planStatus: 'cancelled' })}
                    />
                  )}
                  {Array.isArray(msg.agentToolCalls) && msg.agentToolCalls.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {msg.agentToolCalls.map((tc) => (
                        <span
                          key={tc.id}
                          className="text-[11px] px-2 py-0.5 rounded bg-black/30 text-text-secondary font-mono"
                          title={tc.summary || tc.error || ''}
                        >
                          {tc.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
            {isStreaming &&
              messages[messages.length - 1]?.role === 'assistant' &&
              !messages[messages.length - 1]?.content &&
              !messages[messages.length - 1]?.toolCall &&
              !messages[messages.length - 1]?.plan && (
                <li className="flex items-center gap-2 text-text-muted text-xs">
                  <Loader2 size={12} className="animate-spin" />
                  <span>Thinking…</span>
                </li>
              )}
          </ul>
        )}
      </main>

      {listening && (
        <div className="px-4 pb-2 flex items-center gap-2 text-xs text-text-muted">
          <span className="h-2 w-2 rounded-full bg-rose-400 animate-pulse" />
          <span>Listening…</span>
        </div>
      )}

      {toast && (
        <div
          role="alert"
          className="mx-4 mb-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs px-3 py-2"
        >
          {toast.text}
        </div>
      )}

      <form
        onSubmit={handleSend}
        className="sticky bottom-0 border-t border-white/10 bg-bg-primary px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            aria-label="Message"
            disabled={isStreaming}
            className="flex-1 bg-white/5 text-text-primary text-sm px-3 py-2 rounded-xl outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={startVoice}
            aria-label={listening ? 'Stop voice input' : 'Voice input'}
            className={`p-2 rounded-xl text-white ${
              listening ? 'bg-rose-500 animate-pulse' : 'bg-white/10 text-text-primary'
            }`}
          >
            {listening ? <Square size={18} /> : <Mic size={18} />}
          </button>
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            aria-label="Send message"
            className="p-2 rounded-xl bg-accent-blue text-white disabled:opacity-50"
          >
            {isStreaming ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </form>

      <MobileAgentPicker
        open={pickerOpen}
        agents={agents}
        selectedAgentId={selectedAgentId}
        onSelect={setSelectedAgentId}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  )
}
