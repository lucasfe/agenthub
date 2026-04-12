import { Link } from 'react-router'
import * as Icons from 'lucide-react'

// Rendered when the planner returns a fallback (no suitable agent for the
// task). Offers two escapes: create a brand-new agent (Phase 1 already has the
// CreateAgentPage), or run the task with the suggested fallback agent anyway.
export default function PlanFallbackCard({
  reason,
  suggestedAgentType,
  suggestedFallbackAgentId,
  onRunWithFallback,
  availableAgents,
}) {
  const fallbackAgent = suggestedFallbackAgentId
    ? availableAgents?.find((a) => a.id === suggestedFallbackAgentId)
    : null
  const createHref = suggestedAgentType
    ? `/create?type=${encodeURIComponent(suggestedAgentType)}`
    : '/create'

  return (
    <div className="mt-3 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-600/5 overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
          <Icons.AlertTriangle size={18} className="text-amber-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            No suitable agent
          </div>
          <p className="text-sm text-text-primary mt-0.5 leading-snug">{reason}</p>
          {suggestedAgentType && (
            <p className="text-xs text-text-muted mt-2">
              Suggested agent type: <span className="text-text-secondary">{suggestedAgentType}</span>
            </p>
          )}
        </div>
      </div>

      <div className="px-4 py-3 bg-black/20 border-t border-white/5 flex items-center gap-2 flex-wrap">
        <Link
          to={createHref}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 transition-colors"
        >
          <Icons.Plus size={13} />
          Create agent
        </Link>
        {fallbackAgent && (
          <button
            type="button"
            onClick={() => onRunWithFallback?.(fallbackAgent)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
          >
            <Icons.PlayCircle size={13} />
            Run with {fallbackAgent.name} anyway
          </button>
        )}
      </div>
    </div>
  )
}
