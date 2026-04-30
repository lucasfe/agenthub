import { Mic, Plus, Send } from 'lucide-react'

export default function MobileChat() {
  return (
    <div className="flex flex-col min-h-screen bg-bg-primary">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex flex-col leading-tight">
          <span className="text-[11px] uppercase tracking-wide text-text-muted">agenthub</span>
          <span className="text-sm font-medium text-text-primary">Auto agent</span>
        </div>
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-text-primary px-3 py-1.5 rounded-lg hover:bg-white/5"
        >
          <Plus size={16} />
          New chat
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="text-center text-text-muted text-sm mt-12">
          Start a conversation
        </div>
      </main>

      <div className="sticky bottom-0 border-t border-white/10 bg-bg-primary px-4 py-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            disabled
            placeholder="Type a message..."
            aria-label="Message"
            className="flex-1 bg-white/5 text-text-primary text-sm px-3 py-2 rounded-xl outline-none disabled:opacity-50"
          />
          <button
            type="button"
            disabled
            aria-label="Voice input"
            className="p-2 rounded-xl bg-white/5 text-text-primary disabled:opacity-50"
          >
            <Mic size={18} />
          </button>
          <button
            type="button"
            disabled
            aria-label="Send message"
            className="p-2 rounded-xl bg-accent-blue text-white disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
