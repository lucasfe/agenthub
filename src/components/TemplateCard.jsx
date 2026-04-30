import { AlertTriangle, LayoutTemplate } from 'lucide-react'
import { findMissingAgents } from '../lib/templates'

function describePlan(plan) {
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
    return 'No plan yet'
  }
  const count = plan.steps.length
  return `${count} ${count === 1 ? 'step' : 'steps'}`
}

export default function TemplateCard({ template, agents = [], onClick }) {
  const planLabel = describePlan(template.plan)
  const missingAgents = findMissingAgents(template.plan, agents)
  const missingSet = new Set(missingAgents)
  const stepsNeedingAttention = (template.plan?.steps || []).filter(
    (step) => missingSet.has(step?.agent_id),
  ).length

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={template.name}
      className="group relative p-5 bg-bg-card border border-border-subtle rounded-2xl card-glow transition-all duration-200 flex flex-col text-left w-full hover:border-border-hover focus:outline-none focus:border-border-hover"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="card-icon w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500/15 to-purple-600/5 flex items-center justify-center">
          <LayoutTemplate size={20} className="text-purple-400" />
        </div>
      </div>

      <h3 className="text-base font-semibold text-text-primary mb-1.5">
        {template.name}
      </h3>

      {template.description && (
        <p className="text-xs leading-relaxed text-text-secondary mb-4 flex-1 line-clamp-3">
          {template.description}
        </p>
      )}

      {stepsNeedingAttention > 0 && (
        <div className="mb-3 inline-flex items-center self-start gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-[10px] font-medium text-amber-300">
          <AlertTriangle size={11} />
          {stepsNeedingAttention} {stepsNeedingAttention === 1 ? 'step needs' : 'steps need'} attention
        </div>
      )}

      <div className="mt-auto pt-3 border-t border-border-subtle/50 flex items-center justify-between text-xs text-text-muted">
        <span>{planLabel}</span>
      </div>
    </button>
  )
}
