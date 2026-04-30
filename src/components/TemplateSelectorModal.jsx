import { useEffect, useMemo, useRef, useState } from 'react'
import { X, LayoutTemplate, Loader2, Inbox } from 'lucide-react'
import { fetchTemplates } from '../lib/templatesApi'

function describeStepCount(plan) {
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) return 'No plan'
  const n = plan.steps.length
  return `${n} ${n === 1 ? 'step' : 'steps'}`
}

function PreviewPane({ template }) {
  if (!template) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-text-muted text-sm gap-2 px-6 text-center">
        <Inbox size={28} className="opacity-40" />
        Pick a template on the left to preview it here.
      </div>
    )
  }

  const steps = template.plan?.steps || []

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">
          Template
        </p>
        <h3 className="text-base font-semibold text-text-primary">{template.name}</h3>
        {template.description && (
          <p className="text-sm text-text-secondary mt-1 leading-relaxed">{template.description}</p>
        )}
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">
          Ticket title
        </p>
        <p className="text-sm text-text-primary">{template.task_title || '—'}</p>
      </div>

      {template.task_description && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">
            Ticket description
          </p>
          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
            {template.task_description}
          </p>
        </div>
      )}

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
          Execution plan ({steps.length} {steps.length === 1 ? 'step' : 'steps'})
        </p>
        {steps.length === 0 ? (
          <p className="text-xs text-text-muted">
            No plan attached — the new ticket will land in Todo so you can plan from scratch.
          </p>
        ) : (
          <ol className="space-y-2">
            {steps.map((step, idx) => (
              <li
                key={step.id ?? idx}
                className="rounded-xl bg-bg-input border border-border-subtle px-3 py-2.5"
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-text-muted">
                  <span className="font-mono">Step {idx + 1}</span>
                  {step.agent_name && (
                    <span className="px-1.5 py-0.5 rounded bg-bg-card text-text-secondary">
                      {step.agent_name}
                    </span>
                  )}
                </div>
                {step.task && (
                  <p className="text-sm text-text-primary mt-1.5 leading-relaxed">{step.task}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

export default function TemplateSelectorModal({ onClose, onUseTemplate }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [using, setUsing] = useState(false)
  const closeRef = useRef(onClose)

  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    let cancelled = false
    fetchTemplates()
      .then((rows) => {
        if (cancelled) return
        const list = Array.isArray(rows) ? rows : []
        setTemplates(list)
        if (list.length > 0) setSelectedId(list[0].id)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message || 'Failed to load templates')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape' && !using) closeRef.current?.() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [using])

  const selected = useMemo(
    () => templates.find((tpl) => tpl.id === selectedId) || null,
    [templates, selectedId],
  )

  const handleUse = async () => {
    if (!selected || using) return
    setUsing(true)
    try {
      await onUseTemplate(selected)
    } catch {
      setUsing(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={() => { if (!using) onClose() }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl mx-4 max-h-[80vh] rounded-2xl bg-bg-sidebar border border-border-subtle shadow-2xl flex flex-col"
      >
        <div className="h-12 border-b border-border-subtle px-5 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-semibold text-text-primary">Use a template</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={using}
            className="p-1.5 rounded-lg hover:bg-bg-input text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex">
          <div className="w-64 border-r border-border-subtle overflow-y-auto py-2">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-text-muted text-xs">
                <Loader2 size={14} className="animate-spin mr-2" />
                Loading...
              </div>
            ) : error ? (
              <div className="px-4 py-4 text-xs text-rose-300" role="alert">{error}</div>
            ) : templates.length === 0 ? (
              <div className="px-4 py-6 text-xs text-text-muted text-center">
                No templates yet. Save a board ticket as a template first.
              </div>
            ) : (
              <ul className="space-y-0.5 px-2">
                {templates.map((tpl) => {
                  const active = tpl.id === selectedId
                  return (
                    <li key={tpl.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(tpl.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg flex flex-col gap-0.5 transition-colors ${
                          active
                            ? 'bg-blue-500/10 border border-blue-500/30'
                            : 'border border-transparent hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <LayoutTemplate size={12} className="text-purple-400 shrink-0" />
                          <span className="text-sm text-text-primary truncate">{tpl.name}</span>
                        </div>
                        <span className="text-[10px] text-text-muted ml-5">
                          {describeStepCount(tpl.plan)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col">
            <PreviewPane template={selected} />
          </div>
        </div>

        <div className="border-t border-border-subtle px-5 py-3 shrink-0 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={using}
            className="px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUse}
            disabled={!selected || using}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {using && <Loader2 size={12} className="animate-spin" />}
            Use template
          </button>
        </div>
      </div>
    </div>
  )
}
