import { useState } from 'react'
import * as Icons from 'lucide-react'

const colorMap = {
  blue:   { bg: 'from-blue-500/15 to-blue-600/5',   border: 'border-blue-500/30',   icon: 'text-blue-400',   btn: 'bg-blue-500 hover:bg-blue-600' },
  green:  { bg: 'from-emerald-500/15 to-emerald-600/5', border: 'border-emerald-500/30', icon: 'text-emerald-400', btn: 'bg-emerald-500 hover:bg-emerald-600' },
  purple: { bg: 'from-purple-500/15 to-purple-600/5', border: 'border-purple-500/30', icon: 'text-purple-400', btn: 'bg-purple-500 hover:bg-purple-600' },
  amber:  { bg: 'from-amber-500/15 to-amber-600/5',  border: 'border-amber-500/30',  icon: 'text-amber-400',  btn: 'bg-amber-500 hover:bg-amber-600' },
  rose:   { bg: 'from-rose-500/15 to-rose-600/5',    border: 'border-rose-500/30',   icon: 'text-rose-400',   btn: 'bg-rose-500 hover:bg-rose-600' },
  cyan:   { bg: 'from-cyan-500/15 to-cyan-600/5',    border: 'border-cyan-500/30',   icon: 'text-cyan-400',   btn: 'bg-cyan-500 hover:bg-cyan-600' },
}

function formatDuration(ms) {
  if (!ms || typeof ms !== 'number') return null
  if (ms < 1000) return `${ms}ms`
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `~${sec}s`
  return `~${Math.round(sec / 60)}min`
}

export default function PlanCard({
  plan,
  status = 'proposed',
  refineError,
  availableTools,
  onRefine,
  onApprove,
  onCancel,
}) {
  const [refineText, setRefineText] = useState('')
  const isRefining = status === 'refining'
  const isApproved = status === 'approved'
  const isCancelled = status === 'cancelled'
  const isLocked = isApproved || isCancelled

  const handleRefine = (e) => {
    e.preventDefault()
    const text = refineText.trim()
    if (!text || isRefining || isLocked) return
    onRefine?.(text)
    setRefineText('')
  }

  const duration = formatDuration(plan?.estimated_duration_ms)
  const stepCount = plan?.steps?.length ?? 0

  return (
    <div className="mt-3 rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-600/5 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
          <Icons.ListChecks size={18} className="text-blue-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Proposed plan
          </div>
          <div className="text-sm font-semibold text-text-primary">
            {stepCount} {stepCount === 1 ? 'step' : 'steps'}
            {duration ? ` · ${duration}` : ''}
          </div>
        </div>
        {isApproved && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2.5 py-1">
            <Icons.Check size={12} />
            Approved
          </span>
        )}
        {isCancelled && (
          <span className="flex items-center gap-1.5 text-xs text-text-muted bg-white/5 border border-white/10 rounded-full px-2.5 py-1">
            <Icons.X size={12} />
            Cancelled
          </span>
        )}
      </div>

      {/* Steps */}
      <div className="px-4 py-3 space-y-2">
        {(plan?.steps || []).map((step) => (
          <StepRow key={step.id} step={step} availableTools={availableTools} />
        ))}
      </div>

      {/* Phase 3 notice when approved */}
      {isApproved && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 flex items-start gap-2">
          <Icons.Info size={14} className="text-emerald-300 shrink-0 mt-0.5" />
          <p className="text-[11px] text-emerald-200/90">
            Plan approved. Execution will start in Phase 4 — for now this just validates
            planning works end-to-end.
          </p>
        </div>
      )}

      {/* Refine error */}
      {refineError && !isLocked && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center gap-2">
          <Icons.AlertCircle size={13} className="text-rose-400 shrink-0" />
          <p className="text-xs text-rose-300">{refineError}</p>
        </div>
      )}

      {/* Refine input */}
      {!isLocked && (
        <form onSubmit={handleRefine} className="px-4 pb-3">
          <div className="flex items-center gap-2 bg-bg-input border border-border-subtle rounded-lg px-3 py-1.5 focus-within:border-border-hover transition-colors">
            <Icons.Wand2 size={13} className="text-text-muted shrink-0" />
            <input
              type="text"
              value={refineText}
              onChange={(e) => setRefineText(e.target.value)}
              placeholder={isRefining ? 'Refining plan…' : 'Refine plan (e.g. "remove step 3")'}
              className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted outline-none py-1"
              disabled={isRefining}
            />
            {isRefining && <Icons.Loader2 size={13} className="text-text-muted animate-spin" />}
          </div>
        </form>
      )}

      {/* Actions */}
      {!isLocked && (
        <div className="px-4 py-3 bg-black/20 border-t border-white/5 flex items-center gap-2">
          <button
            onClick={onApprove}
            disabled={isRefining}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icons.Check size={13} />
            Approve
          </button>
          <button
            onClick={onCancel}
            disabled={isRefining}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

function StepRow({ step, availableTools }) {
  const colors = colorMap[step.agent_color] || colorMap.blue
  const IconComponent = Icons[step.agent_icon] || Icons.Bot
  const inputs = Array.isArray(step.inputs) ? step.inputs : []
  const toolsUsed = Array.isArray(step.tools_used) ? step.tools_used : []
  const hasSensitive = toolsUsed.some((toolId) => {
    const meta = availableTools?.find((t) => t.id === toolId)
    return meta?.requires_approval
  })

  return (
    <div className={`flex items-start gap-3 rounded-lg border ${colors.border} bg-gradient-to-br ${colors.bg} px-3 py-2.5`}>
      <div className={`w-8 h-8 rounded-lg bg-black/20 border ${colors.border} flex items-center justify-center shrink-0`}>
        <IconComponent size={15} className={colors.icon} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Step {step.id}
          </span>
          <span className="text-xs font-semibold text-text-primary truncate">
            {step.agent_name || step.agent_id}
          </span>
          {hasSensitive && (
            <Icons.ShieldAlert size={11} className="text-amber-400 shrink-0" title="Uses a tool that requires approval" />
          )}
        </div>
        <p className="text-xs text-text-secondary mt-1 leading-snug">{step.task}</p>
        {(toolsUsed.length > 0 || inputs.length > 0) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {toolsUsed.map((toolId) => {
              const meta = availableTools?.find((t) => t.id === toolId)
              const ToolIcon = Icons[meta?.icon] || Icons.Wrench
              return (
                <span
                  key={`tool-${toolId}`}
                  className="inline-flex items-center gap-1 text-[10px] text-text-secondary bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5"
                  title={meta?.description || toolId}
                >
                  <ToolIcon size={10} />
                  {meta?.name || toolId}
                </span>
              )
            })}
            {inputs
              .filter((inp) => inp !== 'original_task')
              .map((inp) => (
                <span
                  key={`input-${inp}`}
                  className="inline-flex items-center gap-1 text-[10px] text-text-muted bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5"
                  title={`Uses output of ${inp}`}
                >
                  <Icons.ArrowLeftRight size={10} />
                  {inp}
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
