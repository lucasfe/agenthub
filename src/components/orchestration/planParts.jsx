// Shared building blocks for the plan UI. Used by both PlanCard (compact
// summary in the chat feed) and PlanReviewPanel (full detail view in the
// right-side panel). Keep this file purely presentational — state management
// lives in the parents.

import { useState } from 'react'
import * as Icons from 'lucide-react'
import { downloadText, safeFilename } from '../../lib/download'

// ─── Color palette ──────────────────────────────────────────────────────────

export const colorMap = {
  blue:   { bg: 'from-blue-500/15 to-blue-600/5',     border: 'border-blue-500/30',    icon: 'text-blue-400',    btn: 'bg-blue-500 hover:bg-blue-600',    ring: 'ring-blue-500/40' },
  green:  { bg: 'from-emerald-500/15 to-emerald-600/5', border: 'border-emerald-500/30', icon: 'text-emerald-400', btn: 'bg-emerald-500 hover:bg-emerald-600', ring: 'ring-emerald-500/40' },
  purple: { bg: 'from-purple-500/15 to-purple-600/5',  border: 'border-purple-500/30',  icon: 'text-purple-400',  btn: 'bg-purple-500 hover:bg-purple-600',  ring: 'ring-purple-500/40' },
  amber:  { bg: 'from-amber-500/15 to-amber-600/5',    border: 'border-amber-500/30',   icon: 'text-amber-400',   btn: 'bg-amber-500 hover:bg-amber-600',   ring: 'ring-amber-500/40' },
  rose:   { bg: 'from-rose-500/15 to-rose-600/5',      border: 'border-rose-500/30',    icon: 'text-rose-400',    btn: 'bg-rose-500 hover:bg-rose-600',     ring: 'ring-rose-500/40' },
  cyan:   { bg: 'from-cyan-500/15 to-cyan-600/5',      border: 'border-cyan-500/30',    icon: 'text-cyan-400',    btn: 'bg-cyan-500 hover:bg-cyan-600',     ring: 'ring-cyan-500/40' },
}

// ─── Formatting helpers ─────────────────────────────────────────────────────

export function formatDuration(ms) {
  if (!ms || typeof ms !== 'number') return null
  if (ms < 1000) return `${ms}ms`
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `~${sec}s`
  return `~${Math.round(sec / 60)}min`
}

export function truncate(text, max = 200) {
  if (!text) return ''
  return text.length > max ? text.slice(0, max) + '…' : text
}

// ─── Derived-state helpers ──────────────────────────────────────────────────

export function countMissingRequired(plan, stepAnswers) {
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
}

export function collectDownloadableSteps(plan, stepStates) {
  if (!plan?.steps) return []
  return plan.steps
    .map((step) => {
      const state = stepStates?.[step.id]
      const text = state?.text?.trim() || ''
      if (!text) return null
      return { step, state, text }
    })
    .filter(Boolean)
}

export function downloadAllOutputs(downloadableSteps) {
  if (!downloadableSteps || downloadableSteps.length === 0) return
  const header = `# Plan output\n\n`
  const body = downloadableSteps
    .map(({ step, text }) => {
      const name = step.agent_name || step.agent_id
      return `## Step ${step.id} — ${name}\n\n_${step.task}_\n\n${text}`
    })
    .join('\n\n---\n\n')
  downloadText(header + body, 'plan-output.md', 'text/markdown')
}

export function getCurrentlyRunningStep(plan, stepStates, activeStepId) {
  if (!plan?.steps) return null
  if (activeStepId) {
    return plan.steps.find((s) => s.id === activeStepId) || null
  }
  return (
    plan.steps.find((s) => stepStates?.[s.id]?.status === 'running') || null
  )
}

// ─── Phase descriptor ───────────────────────────────────────────────────────
// Each planStatus has a distinct header look + summary copy.

export function getPhaseDescriptor(status) {
  switch (status) {
    case 'proposing':
      return {
        label: 'Generating plan',
        Icon: Icons.Loader2,
        iconClass: 'text-blue-300 animate-spin',
        chip: 'bg-blue-500/20 border-blue-500/30',
      }
    case 'analyzing':
      return {
        label: 'Analyzing requirements',
        Icon: Icons.Loader2,
        iconClass: 'text-blue-300 animate-spin',
        chip: 'bg-blue-500/20 border-blue-500/30',
      }
    case 'refining':
      return {
        label: 'Refining plan',
        Icon: Icons.Loader2,
        iconClass: 'text-blue-300 animate-spin',
        chip: 'bg-blue-500/20 border-blue-500/30',
      }
    case 'proposed':
      return {
        label: 'Plan proposed',
        Icon: Icons.ListChecks,
        iconClass: 'text-blue-300',
        chip: 'bg-blue-500/20 border-blue-500/30',
      }
    case 'executing':
      return {
        label: 'Executing plan',
        Icon: Icons.Play,
        iconClass: 'text-blue-300',
        chip: 'bg-blue-500/20 border-blue-500/30',
      }
    case 'done':
      return {
        label: 'Plan completed',
        Icon: Icons.CheckCheck,
        iconClass: 'text-emerald-300',
        chip: 'bg-emerald-500/20 border-emerald-500/30',
      }
    case 'error':
      return {
        label: 'Plan failed',
        Icon: Icons.AlertOctagon,
        iconClass: 'text-rose-300',
        chip: 'bg-rose-500/20 border-rose-500/30',
      }
    case 'cancelled':
      return {
        label: 'Plan cancelled',
        Icon: Icons.X,
        iconClass: 'text-text-muted',
        chip: 'bg-white/5 border-white/10',
      }
    default:
      return {
        label: 'Plan',
        Icon: Icons.ListChecks,
        iconClass: 'text-blue-300',
        chip: 'bg-blue-500/20 border-blue-500/30',
      }
  }
}

// ─── StepRow ────────────────────────────────────────────────────────────────
// Core building block: renders a single step with its metadata, requirement
// inputs (editable), and live execution state (text, tool calls, errors).
// Shared between the chat card and the side panel.

export function StepRow({
  step,
  state,
  isActive,
  availableTools,
  answers = {},
  editable = false,
  wide = false,
  onAnswerChange,
}) {
  const colors = colorMap[step.agent_color] || colorMap.blue
  const IconComponent = Icons[step.agent_icon] || Icons.Bot
  const inputs = Array.isArray(step.inputs) ? step.inputs : []
  const declaredTools = Array.isArray(step.tools_used) ? step.tools_used : []
  const requirements = Array.isArray(step.requirements) ? step.requirements : []
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

  const outerPadding = wide ? 'px-5 py-4' : 'px-3 py-2.5'
  const iconSize = wide ? 'w-10 h-10' : 'w-8 h-8'
  const titleSize = wide ? 'text-sm' : 'text-xs'
  const taskSize = wide ? 'text-sm' : 'text-xs'
  const liveTextSize = wide ? 'text-xs' : 'text-[11px]'

  const rowClass = isActive
    ? `rounded-lg border ${colors.border} bg-gradient-to-br ${colors.bg} ring-2 ${colors.ring}`
    : `rounded-lg border ${colors.border} bg-gradient-to-br ${colors.bg}`

  return (
    <div className={`${rowClass} ${outerPadding}`}>
      <div className="flex items-start gap-3">
        <div className={`${iconSize} rounded-lg bg-black/20 border ${colors.border} flex items-center justify-center shrink-0`}>
          <IconComponent size={wide ? 18 : 15} className={colors.icon} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Step {step.id}
            </span>
            <span className={`${titleSize} font-semibold text-text-primary truncate`}>
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
          <p className={`${taskSize} text-text-secondary mt-1 leading-snug`}>{step.task}</p>

          {/* Declared tools / inputs */}
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

          {/* Needs from you — inline requirement inputs */}
          {requirements.length > 0 && editable && (
            <div className="mt-3 space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/80 flex items-center gap-1">
                <Icons.HelpCircle size={10} />
                Needs from you
              </div>
              {requirements.map((req) => (
                <RequirementInput
                  key={req.key}
                  req={req}
                  value={answers[req.key] ?? ''}
                  onChange={(v) => onAnswerChange?.(req.key, v)}
                />
              ))}
            </div>
          )}

          {/* Needs from you — read-only echo when the step is already running */}
          {requirements.length > 0 && !editable && (
            <div className="mt-3 space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Inputs provided
              </div>
              {requirements.map((req) => {
                const v = answers[req.key]
                return (
                  <div
                    key={req.key}
                    className="text-[10px] text-text-muted flex gap-1.5 items-baseline"
                  >
                    <span className="font-semibold text-text-secondary">{req.question}</span>
                    <span className="text-text-primary truncate">
                      {typeof v === 'string' && v ? v : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Live text + tool calls + error */}
          {showExpanded && (liveText || liveTools.length > 0 || state?.error) && (
            <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
              {liveTools.map((tc) => (
                <ToolCallBadge key={tc.id} call={tc} availableTools={availableTools} />
              ))}
              {liveText && (
                <div className={`${liveTextSize} text-text-primary/90 bg-black/20 rounded-md px-2.5 py-2 leading-relaxed whitespace-pre-wrap`}>
                  {status === 'running' || wide ? liveText : truncate(liveText, 600)}
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

// ─── RequirementInput ───────────────────────────────────────────────────────

export function RequirementInput({ req, value, onChange }) {
  const isRequired = req?.required === true
  const hasValue = typeof value === 'string' && value.trim().length > 0
  const missing = isRequired && !hasValue

  return (
    <div>
      <label className="block text-[11px] text-text-secondary mb-1">
        {req.question}
        {isRequired && <span className="text-amber-300 ml-1">*</span>}
      </label>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={req.suggested || req.hint || ''}
        className={`w-full bg-bg-input border rounded-md px-2 py-1.5 text-[11px] text-text-primary placeholder:text-text-muted/70 outline-none transition-colors ${
          missing
            ? 'border-amber-500/40 focus:border-amber-500/70'
            : 'border-border-subtle focus:border-border-hover'
        }`}
      />
      {req.hint && !missing && (
        <p className="text-[10px] text-text-muted/80 mt-0.5">{req.hint}</p>
      )}
      {missing && (
        <p className="text-[10px] text-amber-300/80 mt-0.5">Required</p>
      )}
    </div>
  )
}

// ─── ToolCallBadge ──────────────────────────────────────────────────────────

export function ToolCallBadge({ call, availableTools }) {
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

// ─── RefineInput (shared) ───────────────────────────────────────────────────

export function RefineInput({ isRefining, onSubmit }) {
  const [text, setText] = useState('')
  const handleSubmit = (e) => {
    e.preventDefault()
    const v = text.trim()
    if (!v || isRefining) return
    onSubmit?.(v)
    setText('')
  }
  return (
    <form onSubmit={handleSubmit}>
      <div className="flex items-center gap-2 bg-bg-input border border-border-subtle rounded-lg pl-3 pr-1.5 py-1 focus-within:border-border-hover transition-colors">
        <Icons.Wand2 size={13} className="text-text-muted shrink-0" />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isRefining ? 'Refining plan…' : 'Refine plan (e.g. "remove step 3")'}
          className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted outline-none py-1.5"
          disabled={isRefining}
        />
        <button
          type="submit"
          disabled={isRefining || !text.trim()}
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
  )
}
// Re-export React for the one JSX helper that uses useState. (Not ideal, but
// keeps all shared UI in one file without a second import in each consumer.)
// eslint-disable-next-line no-unused-vars
import React from 'react'
