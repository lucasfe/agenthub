// PlanReviewPanel — the full-detail review/edit view that opens in the side
// panel next to the chat. Receives the same plan state as PlanCard but
// renders every step, requirement input, live text, tool call, etc. in
// a wider layout with room to breathe.
//
// Props are identical to the old inline PlanCard plus an `onClose` handler.

import * as Icons from 'lucide-react'
import {
  StepRow,
  RefineInput,
  getPhaseDescriptor,
  formatDuration,
  countMissingRequired,
  collectDownloadableSteps,
  downloadAllOutputs,
} from './planParts'

export default function PlanReviewPanel({
  plan,
  status = 'proposed',
  refineError,
  stepStates = {},
  activeStepId,
  runSummary,
  runError,
  failedStepId,
  stepAnswers = {},
  availableTools,
  onRefine,
  onApprove,
  onCancel,
  onAnswerChange,
  onClose,
}) {
  const phase = getPhaseDescriptor(status)
  const isRefining = status === 'refining'
  const isProposed = status === 'proposed'
  const isExecuting = status === 'executing'
  const isDone = status === 'done'
  const isError = status === 'error'
  const isCancelled = status === 'cancelled'
  const isLocked = isExecuting || isDone || isError || isCancelled

  const missingRequired = countMissingRequired(plan, stepAnswers)
  const downloadableSteps = collectDownloadableSteps(plan, stepStates)
  const stepCount = plan?.steps?.length ?? 0

  const handleDownloadAll = () => downloadAllOutputs(downloadableSteps)

  return (
    <div className="flex flex-col h-full bg-bg-sidebar border-l border-border-subtle">
      {/* Header */}
      <div className="h-16 border-b border-border-subtle shrink-0 px-5 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${phase.chip}`}>
          <phase.Icon size={18} className={phase.iconClass} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            {phase.label}
          </div>
          <h3 className="text-sm font-semibold text-text-primary truncate">
            {stepCount} {stepCount === 1 ? 'step' : 'steps'}
            {plan?.estimated_duration_ms && !isDone && !isError
              ? ` · ${formatDuration(plan.estimated_duration_ms)}`
              : ''}
            {runSummary?.duration_ms && (isDone || isError)
              ? ` · ${formatDuration(runSummary.duration_ms)}`
              : ''}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close review panel"
          className="p-2 rounded-lg hover:bg-bg-input text-text-secondary hover:text-text-primary transition-colors shrink-0"
        >
          <Icons.X size={18} />
        </button>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3">
        {/* Run error banner */}
        {isError && runError && (
          <div className="px-4 py-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
            <Icons.AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
            <div className="text-sm text-rose-300">
              <div>{runError}</div>
              {typeof failedStepId === 'number' && (
                <div className="text-xs text-rose-400/70 mt-1">Failed at step {failedStepId}</div>
              )}
            </div>
          </div>
        )}

        {/* Run summary when done */}
        {isDone && runSummary && (
          <div className="px-4 py-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-3">
            <Icons.Sparkles size={16} className="text-emerald-300 shrink-0" />
            <p className="text-sm text-emerald-200/90 flex-1">
              All steps completed
              {runSummary.duration_ms ? ` in ${formatDuration(runSummary.duration_ms)}` : ''}
              {runSummary.tokens_in || runSummary.tokens_out
                ? ` · ${(runSummary.tokens_in || 0) + (runSummary.tokens_out || 0)} tokens`
                : ''}
            </p>
            {downloadableSteps.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadAll}
                className="flex items-center gap-1.5 text-xs text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-md px-3 py-1.5 transition-colors shrink-0"
              >
                <Icons.Download size={13} />
                Download all
              </button>
            )}
          </div>
        )}

        {/* Missing required warning */}
        {!isLocked && missingRequired > 0 && (
          <div className="px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
            <Icons.AlertTriangle size={16} className="text-amber-400 shrink-0" />
            <p className="text-sm text-amber-200/90">
              {missingRequired} required field{missingRequired === 1 ? '' : 's'} needed before running. Fill them in below.
            </p>
          </div>
        )}

        {/* Refine error */}
        {refineError && !isLocked && (
          <div className="px-4 py-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center gap-3">
            <Icons.AlertCircle size={14} className="text-rose-400 shrink-0" />
            <p className="text-sm text-rose-300">{refineError}</p>
          </div>
        )}

        {/* Steps */}
        <div className="space-y-3">
          {(plan?.steps || []).map((step) => {
            const state = stepStates[step.id]
            const isActive = activeStepId === step.id
            return (
              <StepRow
                key={step.id}
                step={step}
                state={state}
                isActive={isActive}
                availableTools={availableTools}
                answers={stepAnswers?.[step.id] || {}}
                editable={!isLocked}
                wide
                onAnswerChange={(key, value) => onAnswerChange?.(step.id, key, value)}
              />
            )
          })}
        </div>

        {/* Refine input — only in proposed/refining */}
        {!isLocked && (
          <div className="pt-2">
            <RefineInput isRefining={isRefining} onSubmit={onRefine} />
          </div>
        )}
      </div>

      {/* Footer actions */}
      {!isLocked && (
        <div className="border-t border-border-subtle px-5 py-4 shrink-0 flex items-center gap-2">
          <button
            onClick={onApprove}
            disabled={isRefining || missingRequired > 0}
            title={
              missingRequired > 0
                ? `${missingRequired} required field${missingRequired === 1 ? '' : 's'} pending`
                : undefined
            }
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icons.Play size={14} />
            Approve & run
          </button>
          <button
            onClick={onCancel}
            disabled={isRefining}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}

      {isExecuting && (
        <div className="border-t border-border-subtle px-5 py-4 shrink-0 flex items-center gap-2">
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium text-rose-300 border border-rose-500/30 hover:bg-rose-500/10 transition-colors"
          >
            <Icons.Square size={13} />
            Stop run
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors ml-auto"
          >
            Close
          </button>
        </div>
      )}

      {(isDone || isError || isCancelled) && (
        <div className="border-t border-border-subtle px-5 py-4 shrink-0 flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium text-text-secondary border border-border-subtle hover:bg-white/5 transition-colors"
          >
            Close
          </button>
          {isDone && downloadableSteps.length > 0 && (
            <button
              onClick={handleDownloadAll}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/10 transition-colors ml-auto"
            >
              <Icons.Download size={13} />
              Download all
            </button>
          )}
        </div>
      )}
    </div>
  )
}
