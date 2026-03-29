import { Link } from 'react-router'
import * as Icons from 'lucide-react'
import { useStack } from '../context/StackContext'
import { useData } from '../context/DataContext'

const colorMap = {
  blue: { bg: 'from-blue-500/15 to-blue-600/5', border: 'border-blue-500/20', icon: 'text-blue-400', badge: 'bg-blue-500/10 text-blue-300' },
  green: { bg: 'from-emerald-500/15 to-emerald-600/5', border: 'border-emerald-500/20', icon: 'text-emerald-400', badge: 'bg-emerald-500/10 text-emerald-300' },
  purple: { bg: 'from-purple-500/15 to-purple-600/5', border: 'border-purple-500/20', icon: 'text-purple-400', badge: 'bg-purple-500/10 text-purple-300' },
  amber: { bg: 'from-amber-500/15 to-amber-600/5', border: 'border-amber-500/20', icon: 'text-amber-400', badge: 'bg-amber-500/10 text-amber-300' },
  rose: { bg: 'from-rose-500/15 to-rose-600/5', border: 'border-rose-500/20', icon: 'text-rose-400', badge: 'bg-rose-500/10 text-rose-300' },
  cyan: { bg: 'from-cyan-500/15 to-cyan-600/5', border: 'border-cyan-500/20', icon: 'text-cyan-400', badge: 'bg-cyan-500/10 text-cyan-300' },
}

const agentColorMap = {
  blue: 'border-blue-500/30',
  green: 'border-emerald-500/30',
  purple: 'border-purple-500/30',
  amber: 'border-amber-500/30',
  rose: 'border-rose-500/30',
  cyan: 'border-cyan-500/30',
}

export default function TeamCard({ team }) {
  const colors = colorMap[team.color] || colorMap.blue
  const { addAgents, removeAgents, hasAllAgents } = useStack()
  const { agents } = useData()
  const teamAgents = (team.agents || [])
    .map((id) => agents.find((a) => a.id === id))
    .filter(Boolean)
  const agentIds = team.agents || []
  const allInStack = hasAllAgents(agentIds)

  const handleToggleStack = (e) => {
    e.preventDefault()
    e.stopPropagation()
    addAgents(agentIds)
  }

  return (
    <Link
      to={`/teams/${team.id}`}
      className={`group relative p-5 bg-bg-card border ${colors.border} rounded-2xl hover:bg-bg-card-hover card-glow cursor-pointer transition-all duration-200 hover:-translate-y-0.5 flex flex-col`}
    >
      {/* Stack toggle */}
      <button
        onClick={handleToggleStack}
        className={`absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 z-10 ${
          allInStack
            ? 'bg-accent-green text-white'
            : 'text-text-muted hover:text-text-primary hover:bg-white/10 opacity-0 group-hover:opacity-100'
        }`}
      >
        {allInStack ? <Icons.Check size={15} strokeWidth={2.5} /> : <Icons.Plus size={15} />}
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className={`card-icon w-11 h-11 rounded-xl bg-gradient-to-br ${colors.bg} flex items-center justify-center`}>
          <Icons.Users size={20} className={colors.icon} />
        </div>
      </div>

      {/* Title */}
      <h3 className="text-base font-semibold text-text-primary mb-1.5 group-hover:text-accent-blue transition-colors">
        {team.name}
      </h3>

      {/* Description */}
      <p className="text-xs leading-relaxed text-text-secondary mb-4 flex-1 line-clamp-2">
        {team.description}
      </p>

      {/* Agent avatars + count */}
      <div className="flex items-center justify-between">
        <div className="flex -space-x-2">
          {teamAgents.slice(0, 5).map((agent) => {
            const Ic = Icons[agent.icon] || Icons.Bot
            const borderColor = agentColorMap[agent.color] || 'border-border-subtle'
            return (
              <div
                key={agent.id}
                className={`w-8 h-8 rounded-full bg-bg-primary border-2 ${borderColor} flex items-center justify-center`}
                title={agent.name}
              >
                <Ic size={12} className="text-text-muted" />
              </div>
            )
          })}
          {teamAgents.length > 5 && (
            <div className="w-8 h-8 rounded-full bg-bg-primary border-2 border-border-subtle flex items-center justify-center">
              <span className="text-[10px] text-text-muted font-medium">+{teamAgents.length - 5}</span>
            </div>
          )}
        </div>
        <span className={`text-[11px] font-medium ${colors.badge} px-2 py-0.5 rounded-full`}>
          {teamAgents.length} agents
        </span>
      </div>
    </Link>
  )
}
