// Compact plan summary rendered inline in the chat message list.
//
// Shows the current phase status as a short "recibo" (1–2 lines) plus
// contextual action buttons. The full detail view lives in PlanReviewPanel,
// opened via the "Review" button (or automatically in fullscreen when the
// plan has required requirements).

import * as Icons from 'lucide-react'
import {
  getPhaseDescriptor,
  formatDuration,
  countMissingRequired,
  collectDownloadableSteps,
  downloadAllOutputs,
  getCurrentlyRunningStep,
} from './planParts'

export default function PlanCard({
  plan,
  status = 'proposed',
  stepStates = {},
  activeStepId,
  runSummary,
  runError,
  failedStepId,
  stepAnswers = {},
  onOpenReview,
  onApprove,
  onCancel,
}) {
  const stepCount = plan?.steps?.length ?? 0
  const phase = getPhaseDescriptor(status)
  const isProposing = status === 'proposing'
  const isAnalyzing = status === 'analyzing'
  const isRefining = status === 'refining'
  const isProposed = status === 'proposed'
  const isExecuting = status === 'executing'
  const isDone = status === 'done'
  const isError = status === 'error'
  const isCancelled = status === 'cancelled'
  const isLoading = isProposing || isAnalyzing || isRefining
  const isLocked = isExecuting || isDone || isError || isCancelled

  const missingRequired = countMissingRequired(plan, stepAnswers)
  const downloadableSteps = collectDownloadableSteps(plan, stepStates)
  const currentRunning = getCurrentlyRunningStep(plan, stepStates, activeStepId)

  // Second line of the summary — varies by phase.
  let detail = null
  if (isLoading) {
    detail =
      isAnalyzing ? 'Looking at agent prompts to extract requirements…'
      : isRefining ? 'Regenerating plan with your feedback…'
      : 'Picking the right agents for your task…'
  } else if (isProposed) {
    const parts = []
    parts.push(`${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`)
    const estimated = formatDuration(plan?.estimated_duration_ms)
    if (estimated) parts.push(estimated)
    if (missingRequired > 0) {
      parts.push(
        `${missingRequired} required field${missingRequired === 1 ? '' : 's'}`,
      )
    }
    detail = parts.join(' · ')
  } else if (isExecuting) {
    detail = currentRunning
      ? `Step ${currentRunning.id} of ${stepCount} · ${currentRunning.agent_name || currentRunning.agent_id}`
      : `Running ${stepCount} ${stepCount === 1 ? 'step' : 'steps'}…`
  } else if (isDone) {
    const parts = []
    parts.push(`${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`)
    const dur = formatDuration(runSummary?.duration_ms)
    if (dur) parts.push(dur.replace(/^~/, ''))
    const tokens = (runSummary?.tokens_in || 0) + (runSummary?.tokens_out || 0)
    if (tokens > 0) parts.push(`${tokens.toLocaleString()} tokens`)
    detail = parts.join(' · ')
  } else if (isError) {
    detail = runError
      ? typeof failedStepId === 'number'
        ? `Failed at step ${failedStepId}: ${runError}`
        : runError
      : 'Something went wrong'
  } else if (isCancelled) {
    const completed = Object.values(stepStates).filter(
      (s) => s?.status === 'done',
    ).length
    detail = `${completed} of ${stepCount} steps completed`
  }

  const handleDownloadAll = () => downloadAllOutputs(downloadableSteps)

  return (
    <div className="mt-3 rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-600/5 overflow-hidden">
      {/* Header row — status chip + phase label + optional Running indicator */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${phase.chip}`}>
          <phase.Icon size={18} className={phase.iconClass} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            {phase.label}
          </div>
          <div className="text-sm font-medium text-text-primary truncate">
            {detail || (stepCount > 0 ? `${stepCount} steps` : '—')}
          </div>
        </div>
        {isExecuting && (
          <Icons.Loader2
            size={14}
            className="text-blue-300 animate-spin shrink-0"
            aria-label="Running"
          />
        )}
      </div>

      {/* Actions row — phase-specific */}
      {!isLoading && (
        <div className="px-4 py-3 bg-black/20 border-t border-white/5 flex items-center gap-2 flex-wrap">
          {/* Proposed → main action: Review/Approve, plus Cancel */}
          {isProposed && (
            <>
              <button
                onClick={onOpenReview}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors"
              >
                <Icons.ListChecks size={13} />
                Review & approve
                <Icons.ArrowRight size={12} />
              </button>
              {missingRequired === 0 && (
                <button
                  onClick={onApprove}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-200 border border-blue-500/30 hover:bg-blue-500/10 transition-colors"
                  title="Run without opening the detail view"
                >
                  <Icons.Play size={12} />
                  Quick approve
                </button>
              )}
              <button
                onClick={onCancel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors ml-auto"
              >
                Cancel
              </button>
            </>
          )}

          {/* Executing → open live view + stop */}
          {isExecuting && (
            <>
              <button
                onClick={onOpenReview}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors"
              >
                <Icons.Eye size={13} />
                Open live view
                <Icons.ArrowRight size={12} />
              </button>
              <button
                onClick={onCancel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-300 border border-rose-500/30 hover:bg-rose-500/10 transition-colors ml-auto"
              >
                <Icons.Square size={12} />
                Stop
              </button>
            </>
          )}

          {/* Done → open details + download all */}
          {isDone && (
            <>
              <button
                onClick={onOpenReview}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
              >
                <Icons.FileCheck size={13} />
                Open details
                <Icons.ArrowRight size={12} />
              </button>
              {downloadableSteps.length > 0 && (
                <button
                  onClick={handleDownloadAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/10 transition-colors ml-auto"
                >
                  <Icons.Download size={12} />
                  Download all
                </button>
              )}
            </>
          )}

          {/* Error → open details */}
          {isError && (
            <button
              onClick={onOpenReview}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 transition-colors"
            >
              <Icons.AlertOctagon size={13} />
              Open details
              <Icons.ArrowRight size={12} />
            </button>
          )}

          {/* Cancelled → open details, no destructive actions */}
          {isCancelled && (
            <button
              onClick={onOpenReview}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-text-secondary border border-border-subtle hover:bg-white/5 transition-colors"
            >
              <Icons.Eye size={13} />
              Open details
            </button>
          )}
        </div>
      )}
    </div>
  )
}
