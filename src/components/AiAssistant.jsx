import { useState, useEffect, useRef } from 'react'
import { Sparkles, X, Send, Loader2 } from 'lucide-react'

const INITIAL_MESSAGES = [
  {
    role: 'assistant',
    content:
      "Hi! I'm your AI assistant. Ask me anything about agents, teams, or how to get the most out of this hub.",
  },
]

// Placeholder replies until a real backend is wired up.
const MOCK_REPLIES = [
  "Great question! I can help you explore agents and teams — try describing the task you want to accomplish.",
  "You can stack multiple agents together and download them as a ZIP using the stack button in the bottom-right.",
  "Teams are curated bundles of agents. Browse them in the Teams section or create your own from scratch.",
  "Use ⌘K anywhere to quickly jump to any agent or team by name.",
]

export default function AiAssistant({ open, onClose }) {
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const inputRef = useRef(null)
  const listRef = useRef(null)

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
  }, [messages, isTyping])

  const handleSend = (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isTyping) return

    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    setIsTyping(true)

    // Mock an assistant reply. Replace with a real API call later.
    const reply = MOCK_REPLIES[Math.floor(Math.random() * MOCK_REPLIES.length)]
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
      setIsTyping(false)
    }, 700)
  }

  const handleClear = () => {
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

      {/* Slide-out panel */}
      <aside
        role="dialog"
        aria-label="AI Assistant"
        className="fixed top-0 right-0 h-full w-full max-w-md z-50 bg-bg-sidebar border-l border-border-subtle shadow-2xl flex flex-col"
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
          className="flex-1 overflow-y-auto px-5 py-5 space-y-4"
        >
          {messages.map((msg, i) => (
            <MessageBubble key={i} role={msg.role} content={msg.content} />
          ))}
          {isTyping && (
            <div className="flex items-center gap-2 text-text-muted text-sm">
              <Loader2 size={14} className="animate-spin" />
              <span>Thinking…</span>
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={handleSend}
          className="border-t border-border-subtle p-4 shrink-0"
        >
          <div className="flex items-end gap-2 bg-bg-input border border-border-subtle rounded-xl px-3 py-2 focus-within:border-border-hover transition-colors">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none py-1.5"
              disabled={isTyping}
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              aria-label="Send message"
            >
              <Send size={14} />
            </button>
          </div>
          <p className="text-[10px] text-text-muted mt-2 px-1">
            Responses are currently mocked — wire this up to a real API later.
          </p>
        </form>
      </aside>
    </>
  )
}

function MessageBubble({ role, content }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-gradient-to-br from-purple-500 to-blue-500 text-white rounded-br-sm'
            : 'bg-bg-card border border-border-subtle text-text-primary rounded-bl-sm'
        }`}
      >
        {content}
      </div>
    </div>
  )
}
