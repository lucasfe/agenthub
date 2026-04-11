import { useState, useEffect, useRef } from 'react'
import { Sparkles, X, Send, Loader2, Maximize2, Minimize2 } from 'lucide-react'
import { streamChat, isChatConfigured } from '../lib/chat'
import Markdown from '../lib/markdown'
import AgentDraftCard from './AgentDraftCard'
import AgentEditCard from './AgentEditCard'
import { useData } from '../context/DataContext'

const WELCOME_MESSAGE = {
  role: 'assistant',
  content:
    "Hi! I'm your AI assistant. Ask me anything about agents, teams, or how to get the most out of this hub.",
}

const INITIAL_MESSAGES = [WELCOME_MESSAGE]

export default function AiAssistant({ open, onClose }) {
  const { agents } = useData()
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const abortRef = useRef(null)

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

  // Abort any in-flight stream on unmount
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const handleSend = async (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isStreaming) return

    if (!isChatConfigured()) {
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

    // Build the outgoing history: strip the welcome message and any error
    // bubbles so we don't feed them back to the model. For assistant messages
    // that had a previous toolCall, serialize it as text so Claude has
    // context for iteration without needing to re-send tool_use blocks.
    const userMessage = { role: 'user', content: text }
    const nextMessages = [...messages, userMessage]
    const outgoing = nextMessages
      .filter((m) => !m.error && m !== WELCOME_MESSAGE)
      .map((m) => {
        if (m.role === 'assistant' && m.toolCall) {
          const summary = serializeToolCall(m.toolCall)
          return { role: m.role, content: (m.content || '') + summary }
        }
        return { role: m.role, content: m.content }
      })
      .filter((m) => m.content && m.content.trim())

    // Add the user message plus an empty assistant placeholder to stream into
    setMessages([...nextMessages, { role: 'assistant', content: '' }])
    setInput('')
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    await streamChat({
      messages: outgoing,
      signal: controller.signal,
      onDelta: (delta) => {
        setMessages((prev) => {
          const copy = [...prev]
          const last = copy[copy.length - 1]
          if (last && last.role === 'assistant') {
            copy[copy.length - 1] = { ...last, content: last.content + delta }
          }
          return copy
        })
      },
      onToolCall: ({ name, input }) => {
        setMessages((prev) => {
          const copy = [...prev]
          const last = copy[copy.length - 1]
          if (last && last.role === 'assistant') {
            copy[copy.length - 1] = { ...last, toolCall: { name, input } }
          }
          return copy
        })
      },
      onDone: () => {
        setIsStreaming(false)
        abortRef.current = null
      },
      onError: (err) => {
        setMessages((prev) => {
          const copy = [...prev]
          const last = copy[copy.length - 1]
          if (last && last.role === 'assistant' && last.content === '') {
            copy[copy.length - 1] = {
              role: 'assistant',
              content: `⚠️ ${err.message}`,
              error: true,
            }
          } else {
            copy.push({
              role: 'assistant',
              content: `⚠️ ${err.message}`,
              error: true,
            })
          }
          return copy
        })
        setIsStreaming(false)
        abortRef.current = null
      },
    })
  }

  const handleClear = () => {
    abortRef.current?.abort()
    abortRef.current = null
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
                />
              )
            })}
            {isStreaming &&
              messages[messages.length - 1]?.role === 'assistant' &&
              messages[messages.length - 1]?.content === '' &&
              !messages[messages.length - 1]?.toolCall && (
                <div className="flex items-center gap-2 text-text-muted text-sm">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Thinking…</span>
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

function MessageBubble({ role, content, error, showCursor, toolCall }) {
  const isUser = role === 'user'
  if (!content && !showCursor && !toolCall) return null

  // Render markdown for assistant (non-error) messages; everything else is plain text.
  const renderAsMarkdown = role === 'assistant' && !error
  // When a toolCall is present, let the bubble grow wider so the card has room.
  const widthClass = toolCall ? 'max-w-[95%] w-full' : 'max-w-[85%]'

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
      </div>
    </div>
  )
}
