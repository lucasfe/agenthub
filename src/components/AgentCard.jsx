import { Link } from 'react-router'
import * as Icons from 'lucide-react'
import { useStack } from '../context/StackContext'

const colorMap = {
  blue: { bg: 'from-blue-500/15 to-blue-600/5', border: 'border-blue-500/20', icon: 'text-blue-400', tag: 'bg-blue-500/10 text-blue-300', glow: 'rgba(59,130,246,0.2)' },
  green: { bg: 'from-emerald-500/15 to-emerald-600/5', border: 'border-emerald-500/20', icon: 'text-emerald-400', tag: 'bg-emerald-500/10 text-emerald-300', glow: 'rgba(16,185,129,0.2)' },
  purple: { bg: 'from-purple-500/15 to-purple-600/5', border: 'border-purple-500/20', icon: 'text-purple-400', tag: 'bg-purple-500/10 text-purple-300', glow: 'rgba(139,92,246,0.2)' },
  amber: { bg: 'from-amber-500/15 to-amber-600/5', border: 'border-amber-500/20', icon: 'text-amber-400', tag: 'bg-amber-500/10 text-amber-300', glow: 'rgba(245,158,11,0.2)' },
  rose: { bg: 'from-rose-500/15 to-rose-600/5', border: 'border-rose-500/20', icon: 'text-rose-400', tag: 'bg-rose-500/10 text-rose-300', glow: 'rgba(244,63,94,0.2)' },
  cyan: { bg: 'from-cyan-500/15 to-cyan-600/5', border: 'border-cyan-500/20', icon: 'text-cyan-400', tag: 'bg-cyan-500/10 text-cyan-300', glow: 'rgba(6,182,212,0.2)' },
}

export default function AgentCard({ agent, viewMode }) {
  const colors = colorMap[agent.color] || colorMap.blue
  const IconComponent = Icons[agent.icon] || Icons.Bot
  const categorySlug = (agent.category || '').toLowerCase().replace(/\s+/g, '-')
  const detailPath = `/agent/${categorySlug}/${agent.id}`
  const { toggleAgent, isInStack } = useStack()
  const inStack = isInStack(agent.id)

  const handleToggleStack = (e) => {
    e.preventDefault()
    e.stopPropagation()
    toggleAgent(agent.id)
  }

  if (viewMode === 'list') {
    return (
      <Link to={detailPath} className={`group flex items-center gap-5 p-4 bg-bg-card border ${colors.border} rounded-xl hover:bg-bg-card-hover card-glow cursor-pointer transition-all duration-200`}>
        <div style={{'--card-icon-glow': colors.glow}} className={`card-icon w-11 h-11 rounded-xl bg-gradient-to-br ${colors.bg} flex items-center justify-center shrink-0`}>
          <IconComponent size={20} className={colors.icon} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary truncate">{agent.name}</h3>
          </div>
          <p className="text-xs text-text-secondary mt-0.5 truncate">{agent.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(agent.tags || []).slice(0, 2).map((tag) => (
            <span key={tag} className={`text-[11px] font-medium ${colors.tag} px-2 py-0.5 rounded-full`}>
              {tag}
            </span>
          ))}
          <span className="flex items-center gap-1 text-[11px] font-medium text-accent-green bg-accent-green/10 px-2 py-0.5 rounded-full">
            <Icons.Download size={10} />
            {(agent.usage_count ?? 0).toLocaleString()}
          </span>
        </div>
        <button
          onClick={handleToggleStack}
          className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
            inStack
              ? 'bg-accent-green text-white'
              : 'text-text-muted hover:text-text-primary hover:bg-white/10 opacity-0 group-hover:opacity-100'
          }`}
        >
          {inStack ? <Icons.Check size={15} strokeWidth={2.5} /> : <Icons.Plus size={15} />}
        </button>
      </Link>
    )
  }

  return (
    <Link to={detailPath} className={`group relative p-5 bg-bg-card border ${colors.border} rounded-2xl hover:bg-bg-card-hover card-glow cursor-pointer transition-all duration-200 hover:-translate-y-0.5 flex flex-col`}>
      {/* Stack toggle */}
      <button
        onClick={handleToggleStack}
        className={`absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 z-10 ${
          inStack
            ? 'bg-accent-green text-white'
            : 'text-text-muted hover:text-text-primary hover:bg-white/10 opacity-0 group-hover:opacity-100'
        }`}
      >
        {inStack ? <Icons.Check size={15} strokeWidth={2.5} /> : <Icons.Plus size={15} />}
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div style={{'--card-icon-glow': colors.glow}} className={`card-icon w-11 h-11 rounded-xl bg-gradient-to-br ${colors.bg} flex items-center justify-center`}>
          <IconComponent size={20} className={colors.icon} />
        </div>
      </div>

      {/* Title */}
      <h3 className="text-base font-semibold text-text-primary mb-1.5 group-hover:text-accent-blue transition-colors">
        {agent.name}
      </h3>

      {/* Description */}
      <p className="text-xs leading-relaxed text-text-secondary mb-4 flex-1 line-clamp-2">
        {agent.description}
      </p>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        {(agent.tags || []).map((tag) => (
          <span key={tag} className={`text-[11px] font-medium ${colors.tag} px-2.5 py-1 rounded-full`}>
            {tag}
          </span>
        ))}
      </div>

      {/* Category + downloads */}
      <div className="mt-3 pt-3 border-t border-border-subtle/50 flex items-center gap-2">
        <span className="text-[10px] font-medium text-text-muted bg-bg-input px-2 py-0.5 rounded-full">{categorySlug}</span>
        <span className="flex items-center gap-1 text-[11px] font-medium text-accent-green bg-accent-green/10 px-2 py-0.5 rounded-full">
          <Icons.Download size={10} />
          {(agent.usage_count ?? 0).toLocaleString()}
        </span>
      </div>
    </Link>
  )
}
