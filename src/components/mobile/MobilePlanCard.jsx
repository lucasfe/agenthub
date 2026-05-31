// Compact plan summary tailored for the mobile chat. Renders the proposed
// steps and exposes Approve/Cancel buttons. Mirrors the desktop PlanCard but
// drops layout that does not fit the narrow viewport. The card is expandable:
// tapping the toggle reveals every step in full (no truncation), each step's
// live status / result text, and any error surfaced during execution.

import { useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Loader2,
} from 'lucide-react'

function StepStatusIcon({ status }) {
  if (status === 'running') {
    return <Loader2 size={14} className="animate-spin text-blue-300 shrink-0" />
  }
  if (status === 'done') {
    return <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
  }
  if (status === 'error') {
    return <AlertCircle size={14} className="text-rose-400 shrink-0" />
  }
  return <Circle size={14} className="text-text-muted shrink-0" />
}

export default function MobilePlanCard({
  plan,
  status = 'proposed',
  stepStates = {},
  runError,
  runSummary,
  onApprove,
  onCancel,
}) {
  const [expanded, setExpanded] = useState(false)
  const steps = Array.isArray(plan?.steps) ? plan.steps : []
  const stepCount = steps.length
  const isProposed = status === 'proposed'
  const isExecuting = status === 'executing'
  const isDone = status === 'done'
  const isError = status === 'error'

  const toggleLabel = expanded ? 'Hide details' : 'Show details'

  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-text-muted">Plan</div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Hide details' : 'Show details'}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
        >
          <span>
            {stepCount} {stepCount === 1 ? 'step' : 'steps'}
          </span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      <ol className="mt-2 space-y-2">
        {steps.map((step, idx) => {
          const stepState = stepStates?.[step.id] || stepStates?.[idx + 1]
          const stepStatus = stepState?.status
          return (
            <li
              key={step.id ?? idx}
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                {(isExecuting || isDone || isError) && (
                  <StepStatusIcon status={stepStatus} />
                )}
                <div className="text-sm text-text-primary truncate flex-1">
                  {step.agent_name || step.agent_id}
                </div>
              </div>
              {step.task && (
                <div
                  className={`text-xs text-text-secondary mt-0.5 ${
                    expanded ? 'whitespace-pre-wrap break-words' : 'line-clamp-2'
                  }`}
                >
                  {step.task}
                </div>
              )}
              {expanded && stepState?.text && (
                <div className="mt-2 rounded-md bg-black/30 px-2 py-1.5 text-xs text-text-primary whitespace-pre-wrap break-words">
                  {stepState.text}
                </div>
              )}
              {expanded && stepState?.error && (
                <div className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-300 whitespace-pre-wrap break-words">
                  {stepState.error}
                </div>
              )}
            </li>
          )
        })}
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
        <div className="mt-3 text-xs text-emerald-400">
          Done
          {runSummary?.duration_ms != null && (
            <span className="ml-1 text-text-muted">
              · {Math.max(1, Math.round(runSummary.duration_ms / 1000))}s
            </span>
          )}
        </div>
      )}
      {isError && (
        <div className="mt-3 text-xs text-rose-400 whitespace-pre-wrap break-words">
          {runError || 'Error'}
        </div>
      )}
      {/* Keep the toggle label discoverable for assistive tech / tests. */}
      <span className="sr-only">{toggleLabel}</span>
    </div>
  )
}
