import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router'
import * as Icons from 'lucide-react'
import { useData } from '../context/DataContext'
import { fetchTeam, createTeam, updateTeam } from '../lib/api'

const colorOptions = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'green', label: 'Green', class: 'bg-emerald-500' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { value: 'amber', label: 'Amber', class: 'bg-amber-500' },
  { value: 'rose', label: 'Rose', class: 'bg-rose-500' },
  { value: 'cyan', label: 'Cyan', class: 'bg-cyan-500' },
]

const agentColorMap = {
  blue: { bg: 'from-blue-500/15 to-blue-600/5', icon: 'text-blue-400', border: 'border-blue-500/20' },
  green: { bg: 'from-emerald-500/15 to-emerald-600/5', icon: 'text-emerald-400', border: 'border-emerald-500/20' },
  purple: { bg: 'from-purple-500/15 to-purple-600/5', icon: 'text-purple-400', border: 'border-purple-500/20' },
  amber: { bg: 'from-amber-500/15 to-amber-600/5', icon: 'text-amber-400', border: 'border-amber-500/20' },
  rose: { bg: 'from-rose-500/15 to-rose-600/5', icon: 'text-rose-400', border: 'border-rose-500/20' },
  cyan: { bg: 'from-cyan-500/15 to-cyan-600/5', icon: 'text-cyan-400', border: 'border-cyan-500/20' },
}

export default function CreateTeamPage() {
  const { teamId } = useParams()
  const navigate = useNavigate()
  const { agents, refreshTeams } = useData()
  const [isEditing, setIsEditing] = useState(false)
  const [pageLoading, setPageLoading] = useState(!!teamId)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('blue')
  const [selectedAgents, setSelectedAgents] = useState([])
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!teamId) return
    let cancelled = false
    setPageLoading(true)
    fetchTeam(teamId)
      .then((data) => {
        if (cancelled) return
        if (data) {
          setIsEditing(true)
          setName(data.name || '')
          setDescription(data.description || '')
          setColor(data.color || 'blue')
          setSelectedAgents(data.agents || [])
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPageLoading(false)
      })
    return () => { cancelled = true }
  }, [teamId])

  if (pageLoading) {
    return <div className="p-8 text-text-muted">Loading...</div>
  }

  const toggleAgent = (agentId) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    )
  }

  const filteredAgents = agents.filter((a) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q))
    )
  })

  const categories = [...new Set(agents.map((a) => a.category))]

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const teamData = {
        name,
        description,
        color,
        agents: selectedAgents,
      }
      if (isEditing) {
        await updateTeam(teamId, teamData)
      } else {
        teamData.id = name.toLowerCase().replace(/\s+/g, '-')
        await createTeam(teamData)
      }
      await refreshTeams()
      navigate(isEditing ? `/teams/${teamId}` : '/teams')
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="px-8 py-6 max-w-3xl">
        {/* Back link */}
        <Link
          to={isEditing ? `/teams/${teamId}` : '/teams'}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mb-6"
        >
          <Icons.ArrowLeft size={16} />
          {isEditing ? 'Back to team' : 'Back to teams'}
        </Link>

        <h1 className="text-2xl font-bold text-text-primary mb-1">
          {isEditing ? 'Edit Team' : 'Create Team'}
        </h1>
        <p className="text-sm text-text-secondary mb-8">
          {isEditing
            ? 'Update your team configuration and agent assignments.'
            : 'Group agents together to work as a coordinated team.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Details section */}
          <section className="space-y-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Details</h2>

            {/* Color */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Color</label>
              <div className="flex gap-2">
                {colorOptions.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    className={`w-9 h-9 rounded-xl ${c.class} transition-all ${
                      color === c.value
                        ? 'ring-2 ring-white/40 ring-offset-2 ring-offset-bg-primary scale-110'
                        : 'opacity-50 hover:opacity-75'
                    }`}
                    title={c.label}
                  />
                ))}
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Web App Squad"
                required
                className="w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this team do..."
                rows={3}
                required
                className="w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 resize-none"
              />
            </div>
          </section>

          {/* Agents section */}
          <section className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Agents
                {selectedAgents.length > 0 && (
                  <span className="ml-2 text-accent-blue">{selectedAgents.length} selected</span>
                )}
              </h2>
            </div>

            {/* Agent search */}
            <div className="relative">
              <Icons.Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search agents..."
                className="w-full bg-bg-input border border-border-subtle rounded-xl pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20"
              />
            </div>

            {/* Selected agents */}
            {selectedAgents.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedAgents.map((agentId) => {
                  const agent = agents.find((a) => a.id === agentId)
                  if (!agent) return null
                  const Ic = Icons[agent.icon] || Icons.Bot
                  const ac = agentColorMap[agent.color] || agentColorMap.blue
                  return (
                    <button
                      key={agentId}
                      type="button"
                      onClick={() => toggleAgent(agentId)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${ac.border} bg-gradient-to-r ${ac.bg} text-sm text-text-primary hover:brightness-125 transition-all group`}
                    >
                      <Ic size={13} className={ac.icon} />
                      {agent.name}
                      <Icons.X size={12} className="text-text-muted group-hover:text-text-primary transition-colors" />
                    </button>
                  )
                })}
              </div>
            )}

            {/* Agent list by category */}
            <div className="space-y-6">
              {categories.map((cat) => {
                const catAgents = filteredAgents.filter((a) => a.category === cat)
                if (catAgents.length === 0) return null
                return (
                  <div key={cat}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">{cat}</p>
                    <div className="space-y-1.5">
                      {catAgents.map((agent) => {
                        const isSelected = selectedAgents.includes(agent.id)
                        const Ic = Icons[agent.icon] || Icons.Bot
                        const ac = agentColorMap[agent.color] || agentColorMap.blue
                        return (
                          <button
                            key={agent.id}
                            type="button"
                            onClick={() => toggleAgent(agent.id)}
                            className={`w-full flex items-center gap-4 p-3 rounded-xl border transition-all duration-150 text-left ${
                              isSelected
                                ? `${ac.border} bg-gradient-to-r ${ac.bg}`
                                : 'border-border-subtle bg-bg-card hover:bg-bg-card-hover'
                            }`}
                          >
                            <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${ac.bg} flex items-center justify-center shrink-0`}>
                              <Ic size={16} className={ac.icon} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-text-primary truncate">{agent.name}</p>
                              <p className="text-xs text-text-secondary truncate">{agent.description}</p>
                            </div>
                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-accent-blue border-accent-blue'
                                : 'border-border-hover'
                            }`}>
                              {isSelected && <Icons.Check size={12} className="text-white" />}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t border-border-subtle">
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-2.5 bg-accent-blue text-white text-sm font-medium rounded-xl hover:bg-accent-blue/90 transition-colors"
            >
              {isEditing ? (
                <>
                  <Icons.Save size={16} />
                  Save Changes
                </>
              ) : (
                <>
                  <Icons.Plus size={16} />
                  Create Team
                </>
              )}
            </button>
            <Link
              to={isEditing ? `/teams/${teamId}` : '/teams'}
              className="px-5 py-2.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
