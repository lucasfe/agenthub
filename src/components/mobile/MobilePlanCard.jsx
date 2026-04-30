// Compact plan summary tailored for the mobile chat. Renders the proposed
// steps and exposes Approve/Cancel buttons. Mirrors the desktop PlanCard but
// drops layout that does not fit the narrow viewport.

import { Loader2 } from 'lucide-react'

export default function MobilePlanCard({ plan, status = 'proposed', onApprove, onCancel }) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : []
  const stepCount = steps.length
  const isProposed = status === 'proposed'
  const isExecuting = status === 'executing'
  const isDone = status === 'done'
  const isError = status === 'error'

  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-text-muted">Plan</div>
        <div className="text-xs text-text-muted">
          {stepCount} {stepCount === 1 ? 'step' : 'steps'}
        </div>
      </div>
      <ol className="mt-2 space-y-2">
        {steps.map((step, idx) => (
          <li
            key={step.id ?? idx}
            className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"
          >
            <div className="text-sm text-text-primary truncate">
              {step.agent_name || step.agent_id}
            </div>
            {step.task && (
              <div className="text-xs text-text-secondary mt-0.5 line-clamp-2">{step.task}</div>
            )}
          </li>
        ))}
      </ol>
      {isProposed && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onApprove}
            className="flex-1 px-3 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 rounded-lg bg-white/10 text-text-primary text-sm"
          >
            Cancel
          </button>
        </div>
      )}
      {isExecuting && (
        <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
          <Loader2 size={12} className="animate-spin" />
          <span>Executing…</span>
        </div>
      )}
      {isDone && (
        <div className="mt-3 text-xs text-emerald-400">Done</div>
      )}
      {isError && (
        <div className="mt-3 text-xs text-rose-400">Error</div>
      )}
    </div>
  )
}
