import { useEffect } from 'react'
import { AlertTriangle, FileText, Ticket } from 'lucide-react'

export default function AgentReferencesModal({
  agentName,
  templates = [],
  tasks = [],
  onCancel,
  onConfirm,
}) {
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onCancel?.()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel])

  const hasTemplates = templates.length > 0
  const hasTasks = tasks.length > 0

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onCancel}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-bg-card border border-amber-500/30 rounded-2xl max-w-md w-full shadow-lg max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-border-subtle flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle size={18} className="text-amber-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-text-primary">
                &ldquo;{agentName}&rdquo; is still referenced
              </h2>
              <p className="text-xs text-text-muted mt-1">
                Deleting this agent will leave broken references in the items
                below.
              </p>
            </div>
          </div>

          <div className="px-6 py-4 space-y-4 overflow-y-auto">
            {hasTemplates && (
              <section>
                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                  <FileText size={12} />
                  Templates ({templates.length})
                </h3>
                <ul className="space-y-1">
                  {templates.map((tpl) => (
                    <li
                      key={tpl.id}
                      className="text-sm text-text-secondary px-3 py-2 bg-white/5 rounded-lg"
                    >
                      {tpl.name}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {hasTasks && (
              <section>
                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                  <Ticket size={12} />
                  Active tickets ({tasks.length})
                </h3>
                <ul className="space-y-1">
                  {tasks.map((task) => (
                    <li
                      key={task.id}
                      className="text-sm text-text-secondary px-3 py-2 bg-white/5 rounded-lg"
                    >
                      {task.title}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="px-6 py-3 border-t border-border-subtle flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary border border-border-subtle rounded-lg hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors"
            >
              Delete anyway
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
