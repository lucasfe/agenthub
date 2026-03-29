import { useParams, Link } from 'react-router'
import * as Icons from 'lucide-react'
import teamsData from '../data/teams.json'
import agentsData from '../data/agents.json'

const colorMap = {
  blue: { bg: 'from-blue-500/15 to-blue-600/5', border: 'border-blue-500/20', icon: 'text-blue-400', tag: 'bg-blue-500/10 text-blue-300' },
  green: { bg: 'from-emerald-500/15 to-emerald-600/5', border: 'border-emerald-500/20', icon: 'text-emerald-400', tag: 'bg-emerald-500/10 text-emerald-300' },
  purple: { bg: 'from-purple-500/15 to-purple-600/5', border: 'border-purple-500/20', icon: 'text-purple-400', tag: 'bg-purple-500/10 text-purple-300' },
  amber: { bg: 'from-amber-500/15 to-amber-600/5', border: 'border-amber-500/20', icon: 'text-amber-400', tag: 'bg-amber-500/10 text-amber-300' },
  rose: { bg: 'from-rose-500/15 to-rose-600/5', border: 'border-rose-500/20', icon: 'text-rose-400', tag: 'bg-rose-500/10 text-rose-300' },
  cyan: { bg: 'from-cyan-500/15 to-cyan-600/5', border: 'border-cyan-500/20', icon: 'text-cyan-400', tag: 'bg-cyan-500/10 text-cyan-300' },
}

const agentColorMap = {
  blue: { bg: 'from-blue-500/15 to-blue-600/5', icon: 'text-blue-400', border: 'border-blue-500/20' },
  green: { bg: 'from-emerald-500/15 to-emerald-600/5', icon: 'text-emerald-400', border: 'border-emerald-500/20' },
  purple: { bg: 'from-purple-500/15 to-purple-600/5', icon: 'text-purple-400', border: 'border-purple-500/20' },
  amber: { bg: 'from-amber-500/15 to-amber-600/5', icon: 'text-amber-400', border: 'border-amber-500/20' },
  rose: { bg: 'from-rose-500/15 to-rose-600/5', icon: 'text-rose-400', border: 'border-rose-500/20' },
  cyan: { bg: 'from-cyan-500/15 to-cyan-600/5', icon: 'text-cyan-400', border: 'border-cyan-500/20' },
}

export default function TeamDetailPage() {
  const { teamId } = useParams()
  const team = teamsData.find((t) => t.id === teamId)

  if (!team) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-text-muted text-lg">Team not found</p>
          <Link to="/teams" className="text-accent-blue text-sm mt-2 inline-block hover:underline">
            Back to teams
          </Link>
        </div>
      </div>
    )
  }

  const colors = colorMap[team.color] || colorMap.blue
  const teamAgents = team.agents
    .map((id) => agentsData.find((a) => a.id === id))
    .filter(Boolean)

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="px-8 py-6 max-w-5xl">
        {/* Back link */}
        <Link
          to="/teams"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mb-6"
        >
          <Icons.ArrowLeft size={16} />
          Back to teams
        </Link>

        {/* Hero */}
        <div className="flex items-start gap-5 mb-6">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${colors.bg} flex items-center justify-center shrink-0`}>
            <Icons.Users size={28} className={colors.icon} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-text-primary">{team.name}</h1>
              <span className={`text-[11px] font-medium ${colors.tag} px-2 py-0.5 rounded-full`}>
                {teamAgents.length} agents
              </span>
            </div>
            <p className="text-sm text-text-secondary">{team.description}</p>
          </div>
          <Link
            to={`/teams/${team.id}/edit`}
            className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:text-text-primary border border-border-subtle rounded-xl hover:bg-white/5 transition-colors shrink-0"
          >
            <Icons.Pencil size={14} />
            Edit
          </Link>
        </div>

        {/* Agents list */}
        <div className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-4">Team Members</h2>
          <div className="space-y-2">
            {teamAgents.map((agent) => {
              const ac = agentColorMap[agent.color] || agentColorMap.blue
              const Ic = Icons[agent.icon] || Icons.Bot
              const categorySlug = agent.category.toLowerCase().replace(/\s+/g, '-')
              return (
                <Link
                  key={agent.id}
                  to={`/agent/${categorySlug}/${agent.id}`}
                  className={`group flex items-center gap-4 p-4 bg-bg-card border ${ac.border} rounded-xl hover:bg-bg-card-hover transition-all duration-200`}
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${ac.bg} flex items-center justify-center shrink-0`}>
                    <Ic size={18} className={ac.icon} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent-blue transition-colors">
                      {agent.name}
                    </h3>
                    <p className="text-xs text-text-secondary mt-0.5 truncate">{agent.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {agent.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="text-[11px] font-medium bg-white/5 text-text-muted px-2 py-0.5 rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <Icons.ChevronRight size={16} className="text-text-muted shrink-0" />
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
