import { useState, useMemo } from 'react'
import * as Icons from 'lucide-react'
import { downloadText, safeFilename } from '../../lib/download'

const colorMap = {
  blue:   { bg: 'from-blue-500/15 to-blue-600/5',     border: 'border-blue-500/30',    icon: 'text-blue-400',    btn: 'bg-blue-500 hover:bg-blue-600',    ring: 'ring-blue-500/40' },
  green:  { bg: 'from-emerald-500/15 to-emerald-600/5', border: 'border-emerald-500/30', icon: 'text-emerald-400', btn: 'bg-emerald-500 hover:bg-emerald-600', ring: 'ring-emerald-500/40' },
  purple: { bg: 'from-purple-500/15 to-purple-600/5',  border: 'border-purple-500/30',  icon: 'text-purple-400',  btn: 'bg-purple-500 hover:bg-purple-600',  ring: 'ring-purple-500/40' },
  amber:  { bg: 'from-amber-500/15 to-amber-600/5',    border: 'border-amber-500/30',   icon: 'text-amber-400',   btn: 'bg-amber-500 hover:bg-amber-600',   ring: 'ring-amber-500/40' },
  rose:   { bg: 'from-rose-500/15 to-rose-600/5',      border: 'border-rose-500/30',    icon: 'text-rose-400',    btn: 'bg-rose-500 hover:bg-rose-600',     ring: 'ring-rose-500/40' },
  cyan:   { bg: 'from-cyan-500/15 to-cyan-600/5',      border: 'border-cyan-500/30',    icon: 'text-cyan-400',    btn: 'bg-cyan-500 hover:bg-cyan-600',     ring: 'ring-cyan-500/40' },
}

function formatDuration(ms) {
  if (!ms || typeof ms !== 'number') return null
  if (ms < 1000) return `${ms}ms`
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `~${sec}s`
  return `~${Math.round(sec / 60)}min`
}

function truncate(text, max = 200) {
  if (!text) return ''
  return text.length > max ? text.slice(0, max) + '…' : text
}

export default function PlanCard({
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
}) {
  const [refineText, setRefineText] = useState('')
  const isRefining = status === 'refining'
  const isExecuting = status === 'executing'
  const isDone = status === 'done'
  const isError = status === 'error'
  const isCancelled = status === 'cancelled'
  const isLocked = isExecuting || isDone || isError || isCancelled

  const handleRefine = (e) => {
    e.preventDefault()
    const text = refineText.trim()
    if (!text || isRefining || isLocked) return
    onRefine?.(text)
    setRefineText('')
  }

  const estimatedDuration = formatDuration(plan?.estimated_duration_ms)
  const actualDuration = formatDuration(runSummary?.duration_ms)
  const stepCount = plan?.steps?.length ?? 0

  // Count required requirements that are still missing an answer. Used to
  // gate the Approve & run button and surface a warning message.
  const missingRequiredCount = useMemo(() => {
    if (!plan?.steps) return 0
    let count = 0
    for (const step of plan.steps) {
      const reqs = Array.isArray(step.requirements) ? step.requirements : []
      const answers = stepAnswers?.[step.id] || {}
      for (const req of reqs) {
        if (!req || req.required !== true) continue
        const v = answers[req.key]
        if (typeof v !== 'string' || !v.trim()) count += 1
      }
    }
    return count
  }, [plan, stepAnswers])

  // Any step output we can offer as a download? Collects done/error steps
  // that produced any text. Also used to decide whether "Download all" shows.
  const downloadableSteps = useMemo(() => {
    if (!plan?.steps) return []
    return plan.steps
      .map((step) => {
        const state = stepStates?.[step.id]
        const text = state?.text?.trim() || ''
        if (!text) return null
        return { step, state, text }
      })
      .filter(Boolean)
  }, [plan, stepStates])

  const handleDownloadAll = () => {
    if (downloadableSteps.length === 0) return
    const header = `# Plan output\n\n`
    const body = downloadableSteps
      .map(({ step, text }) => {
        const name = step.agent_name || step.agent_id
        return `## Step ${step.id} — ${name}\n\n_${step.task}_\n\n${text}`
      })
      .join('\n\n---\n\n')
    downloadText(header + body, 'plan-output.md', 'text/markdown')
  }

  let headerLabel = 'Proposed plan'
  let HeaderIcon = Icons.ListChecks
  let headerTone = 'text-blue-300'
  let headerBg = 'bg-blue-500/20 border-blue-500/30'
  if (isExecuting) {
    headerLabel = 'Executing plan'
    HeaderIcon = Icons.Play
    headerTone = 'text-blue-300'
  } else if (isDone) {
    headerLabel = 'Plan completed'
    HeaderIcon = Icons.CheckCheck
    headerTone = 'text-emerald-300'
    headerBg = 'bg-emerald-500/20 border-emerald-500/30'
  } else if (isError) {
    headerLabel = 'Plan failed'
    HeaderIcon = Icons.AlertOctagon
    headerTone = 'text-rose-300'
    headerBg = 'bg-rose-500/20 border-rose-500/30'
  } else if (isCancelled) {
    headerLabel = 'Plan cancelled'
    HeaderIcon = Icons.X
    headerTone = 'text-text-muted'
    headerBg = 'bg-white/5 border-white/10'
  }

  const durationText = actualDuration || estimatedDuration
  const durationPrefix = isDone || isError ? '' : '~'
  const duration =
    actualDuration && isDone ? actualDuration
    : actualDuration && isError ? actualDuration
    : estimatedDuration ? `${durationPrefix}${estimatedDuration.replace(/^~/, '')}`
    : null

  return (
    <div className="mt-3 rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-600/5 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${headerBg}`}>
          <HeaderIcon size={18} className={headerTone} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            {headerLabel}
          </div>
          <div className="text-sm font-semibold text-text-primary">
            {stepCount} {stepCount === 1 ? 'step' : 'steps'}
            {duration ? ` · ${duration}` : ''}
          </div>
        </div>
        {isExecuting && (
          <Icons.Loader2 size={14} className="text-blue-300 animate-spin shrink-0" />
        )}
      </div>

      {/* Steps */}
      <div className="px-4 py-3 space-y-2">
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
              onAnswerChange={(key, value) => onAnswerChange?.(step.id, key, value)}
            />
          )
        })}
      </div>

      {/* Run error banner */}
      {isError && runError && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-start gap-2">
          <Icons.AlertCircle size={13} className="text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs text-rose-300">
            <div>{runError}</div>
            {typeof failedStepId === 'number' && (
              <div className="text-[10px] text-rose-400/70 mt-0.5">Failed at step {failedStepId}</div>
            )}
          </div>
        </div>
      )}

      {/* Run summary when done */}
      {isDone && runSummary && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-2">
          <Icons.Sparkles size={13} className="text-emerald-300 shrink-0" />
          <p className="text-[11px] text-emerald-200/90 flex-1">
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
              className="flex items-center gap-1.5 text-[11px] text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-md px-2 py-1 transition-colors"
            >
              <Icons.Download size={11} />
              Download all
            </button>
          )}
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
          <div className="flex items-center gap-2 bg-bg-input border border-border-subtle rounded-lg pl-3 pr-1.5 py-1 focus-within:border-border-hover transition-colors">
            <Icons.Wand2 size={13} className="text-text-muted shrink-0" />
            <input
              type="text"
              value={refineText}
              onChange={(e) => setRefineText(e.target.value)}
              placeholder={isRefining ? 'Refining plan…' : 'Refine plan (e.g. "remove step 3")'}
              className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted outline-none py-1.5"
              disabled={isRefining}
            />
            <button
              type="submit"
              disabled={isRefining || !refineText.trim()}
              aria-label="Refine plan"
              className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isRefining ? (
                <Icons.Loader2 size={13} className="animate-spin" />
              ) : (
                <Icons.ArrowRight size={13} />
              )}
            </button>
          </div>
        </form>
      )}

      {/* Missing required warning */}
      {!isLocked && missingRequiredCount > 0 && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
          <Icons.AlertTriangle size={13} className="text-amber-400 shrink-0" />
          <p className="text-xs text-amber-200/90">
            {missingRequiredCount} required field
            {missingRequiredCount === 1 ? '' : 's'} needed before running.
          </p>
        </div>
      )}

      {/* Actions */}
      {!isLocked && (
        <div className="px-4 py-3 bg-black/20 border-t border-white/5 flex items-center gap-2">
          <button
            onClick={onApprove}
            disabled={isRefining || missingRequiredCount > 0}
            title={
              missingRequiredCount > 0
                ? `${missingRequiredCount} required field${missingRequiredCount === 1 ? '' : 's'} pending`
                : undefined
            }
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icons.Play size={13} />
            Approve & run
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

      {/* Stop button while executing */}
      {isExecuting && (
        <div className="px-4 py-3 bg-black/20 border-t border-white/5 flex items-center gap-2">
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-rose-300 border border-rose-500/30 hover:bg-rose-500/10 transition-colors"
          >
            <Icons.Square size={12} />
            Stop run
          </button>
        </div>
      )}
    </div>
  )
}

function StepRow({ step, state, isActive, availableTools }) {
  const colors = colorMap[step.agent_color] || colorMap.blue
  const IconComponent = Icons[step.agent_icon] || Icons.Bot
  const inputs = Array.isArray(step.inputs) ? step.inputs : []
  const declaredTools = Array.isArray(step.tools_used) ? step.tools_used : []
  const hasSensitive = declaredTools.some((toolId) => {
    const meta = availableTools?.find((t) => t.id === toolId)
    return meta?.requires_approval
  })

  const status = state?.status ?? 'pending'
  const showExpanded = isActive || status === 'done' || status === 'error'
  const liveText = state?.text || ''
  const liveTools = state?.toolCalls || []
  const stepDuration = formatDuration(state?.duration_ms)
  const hasDownloadableText =
    (status === 'done' || status === 'error') && liveText.trim().length > 0

  const handleDownloadStep = () => {
    const filename = `${safeFilename(step.agent_id)}_step_${step.id}.md`
    const header = `# Step ${step.id} — ${step.agent_name || step.agent_id}\n\n_${step.task}_\n\n`
    downloadText(header + liveText, filename, 'text/markdown')
  }

  let statusBadge = null
  if (status === 'running') {
    statusBadge = (
      <span className="flex items-center gap-1 text-[10px] text-blue-300">
        <Icons.Loader2 size={10} className="animate-spin" />
        Running
      </span>
    )
  } else if (status === 'done') {
    statusBadge = (
      <span className="flex items-center gap-1 text-[10px] text-emerald-300">
        <Icons.Check size={10} />
        {stepDuration || 'Done'}
      </span>
    )
  } else if (status === 'error') {
    statusBadge = (
      <span className="flex items-center gap-1 text-[10px] text-rose-300">
        <Icons.AlertCircle size={10} />
        Error
      </span>
    )
  }

  const rowClass = isActive
    ? `rounded-lg border ${colors.border} bg-gradient-to-br ${colors.bg} ring-2 ${colors.ring}`
    : `rounded-lg border ${colors.border} bg-gradient-to-br ${colors.bg}`

  return (
    <div className={`${rowClass} px-3 py-2.5`}>
      <div className="flex items-start gap-3">
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
            <span className="ml-auto flex items-center gap-1.5">
              {statusBadge}
              {hasDownloadableText && (
                <button
                  type="button"
                  onClick={handleDownloadStep}
                  aria-label={`Download step ${step.id} output`}
                  className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-white/10 transition-colors"
                  title="Download this step's output"
                >
                  <Icons.Download size={11} />
                </button>
              )}
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-1 leading-snug">{step.task}</p>

          {/* Declared tools / inputs (always visible) */}
          {(declaredTools.length > 0 || inputs.length > 0) && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {declaredTools.map((toolId) => {
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

          {/* Expanded area — live text + tool calls + error */}
          {showExpanded && (liveText || liveTools.length > 0 || state?.error) && (
            <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
              {liveTools.map((tc) => (
                <ToolCallBadge key={tc.id} call={tc} availableTools={availableTools} />
              ))}
              {liveText && (
                <div className="text-[11px] text-text-primary/90 bg-black/20 rounded-md px-2.5 py-2 leading-relaxed whitespace-pre-wrap">
                  {status === 'running' ? liveText : truncate(liveText, 600)}
                  {status === 'running' && (
                    <span className="inline-block w-1 h-3 ml-0.5 bg-current align-middle animate-pulse" />
                  )}
                </div>
              )}
              {state?.error && (
                <div className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-md px-2.5 py-1.5">
                  {state.error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ToolCallBadge({ call, availableTools }) {
  const meta = availableTools?.find((t) => t.id === call.name)
  const ToolIcon = Icons[meta?.icon] || Icons.Wrench
  const isRunning = call.status === 'running'
  const isError = call.status === 'error'
  const inputPreview = (() => {
    if (!call.input) return ''
    try {
      const s = JSON.stringify(call.input)
      return s.length > 60 ? s.slice(0, 60) + '…' : s
    } catch {
      return ''
    }
  })()

  let statusIcon = null
  if (isRunning) statusIcon = <Icons.Loader2 size={10} className="animate-spin text-blue-300" />
  else if (isError) statusIcon = <Icons.AlertCircle size={10} className="text-rose-400" />
  else statusIcon = <Icons.Check size={10} className="text-emerald-400" />

  const artifact = call.artifact
  const artifactFilename =
    artifact && typeof artifact.content === 'string'
      ? `${safeFilename(artifact.name || 'artifact')}.${artifact.format || 'md'}`
      : null
  const handleDownloadArtifact = () => {
    if (!artifact || typeof artifact.content !== 'string') return
    downloadText(artifact.content, artifactFilename)
  }

  return (
    <div className="flex items-start gap-2 text-[11px] bg-black/20 border border-white/5 rounded-md px-2 py-1.5">
      <ToolIcon size={11} className="text-text-muted shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-text-primary">{meta?.name || call.name}</span>
          {statusIcon}
        </div>
        {inputPreview && (
          <div className="text-[10px] text-text-muted mt-0.5 font-mono truncate" title={JSON.stringify(call.input)}>
            {inputPreview}
          </div>
        )}
        {call.summary && !isError && (
          <div className="text-[10px] text-text-secondary mt-0.5">{call.summary}</div>
        )}
        {call.error && (
          <div className="text-[10px] text-rose-300 mt-0.5">{call.error}</div>
        )}
        {artifact && (
          <button
            type="button"
            onClick={handleDownloadArtifact}
            disabled={typeof artifact.content !== 'string'}
            className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded px-1.5 py-0.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={`Download ${artifactFilename || 'artifact'}`}
          >
            <Icons.Download size={9} />
            {artifactFilename || 'artifact'}
          </button>
        )}
      </div>
    </div>
  )
}
