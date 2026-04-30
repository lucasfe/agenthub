import { LayoutTemplate } from 'lucide-react'

function describePlan(plan) {
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
    return 'No plan yet'
  }
  const count = plan.steps.length
  return `${count} ${count === 1 ? 'step' : 'steps'}`
}

export default function TemplateCard({ template }) {
  const planLabel = describePlan(template.plan)

  return (
    <article
      aria-label={template.name}
      className="group relative p-5 bg-bg-card border border-border-subtle rounded-2xl card-glow transition-all duration-200 flex flex-col"
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

      <div className="mt-auto pt-3 border-t border-border-subtle/50 flex items-center justify-between text-xs text-text-muted">
        <span>{planLabel}</span>
      </div>
    </article>
  )
}
