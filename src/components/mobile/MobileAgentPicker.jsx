import { useEffect, useMemo } from 'react'
import { X } from 'lucide-react'

export default function MobileAgentPicker({ open, agents, selectedAgentId, onSelect, onClose }) {
  const sorted = useMemo(() => {
    if (!Array.isArray(agents)) return []
    return [...agents].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [agents])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close picker"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Pick an agent"
        aria-modal="true"
        className="relative bg-bg-sidebar rounded-t-2xl border-t border-white/10 max-h-[75vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-semibold text-text-primary">Pick an agent</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg hover:bg-white/5 text-text-muted"
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto py-1">
          <button
            type="button"
            onClick={() => {
              onSelect?.(null)
              onClose?.()
            }}
            className={`w-full text-left px-4 py-3 hover:bg-white/5 ${
              selectedAgentId == null ? 'text-text-primary' : 'text-text-secondary'
            }`}
          >
            <div className="text-sm font-medium">Auto</div>
            <div className="text-xs text-text-muted">Let the router pick the best path</div>
          </button>
          {sorted.length > 0 && <div className="border-t border-white/10 mx-4" />}
          {sorted.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => {
                onSelect?.(agent.id)
                onClose?.()
              }}
              className={`w-full text-left px-4 py-3 hover:bg-white/5 ${
                selectedAgentId === agent.id ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              <div className="text-sm font-medium truncate">{agent.name}</div>
              {agent.category && (
                <div className="text-xs text-text-muted truncate">{agent.category}</div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
