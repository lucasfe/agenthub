import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import * as Icons from 'lucide-react'
import { createAgent } from '../lib/api'
import { useData } from '../context/DataContext'

const iconOptions = ['Bot', 'Monitor', 'Server', 'Layers', 'Brain', 'Sparkles', 'Shield', 'Database', 'Terminal', 'MessageSquare', 'Eye', 'Network', 'Palette', 'Smartphone', 'FileText', 'Microscope', 'Languages', 'Scale', 'BarChart3', 'GitPullRequest', 'Container', 'ShieldCheck', 'Cpu', 'Wrench', 'Zap']

const colorOptions = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'green', label: 'Green', class: 'bg-emerald-500' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { value: 'amber', label: 'Amber', class: 'bg-amber-500' },
  { value: 'rose', label: 'Rose', class: 'bg-rose-500' },
  { value: 'cyan', label: 'Cyan', class: 'bg-cyan-500' },
]

const categoryOptions = ['Development Team', 'AI Specialists']

const DEFAULT_MODEL = 'claude-sonnet-4-6'

const modelOptions = [
  {
    id: 'claude-opus-4-6',
    label: 'Claude Opus',
    hint: 'Best for complex reasoning, planning, ambiguous tasks. ~5× cost.',
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet',
    hint: 'Balanced default — great for most writing, coding and analysis.',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku',
    hint: 'Fastest and cheapest. Best for classification, rewriting, short replies.',
  },
]

export default function CreateAgentPage() {
  const navigate = useNavigate()
  const { refreshAgents, tools: availableTools } = useData()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Development Team')
  const [icon, setIcon] = useState('Bot')
  const [color, setColor] = useState('blue')
  const [tags, setTags] = useState('')
  const [tools, setTools] = useState([])
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [capabilities, setCapabilities] = useState('')
  const [content, setContent] = useState('')
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const IconPreview = Icons[icon] || Icons.Bot

  const toolsByCategory = useMemo(() => {
    const groups = new Map()
    for (const t of availableTools || []) {
      const cat = t.category || 'other'
      if (!groups.has(cat)) groups.set(cat, [])
      groups.get(cat).push(t)
    }
    return Array.from(groups.entries())
  }, [availableTools])

  const toggleTool = (toolId) => {
    setTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const agentId = name.toLowerCase().replace(/\s+/g, '-')
    const categorySlug = category.toLowerCase().replace(/\s+/g, '-')

    try {
      await createAgent({
        id: agentId,
        name,
        category,
        description,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        icon,
        color,
        featured: false,
        popularity: 0,
        content,
        tools,
        model,
        capabilities: capabilities
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
      })
      await refreshAgents()
      navigate(`/agent/${categorySlug}/${agentId}`)
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
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mb-6"
        >
          <Icons.ArrowLeft size={16} />
          Back to agents
        </Link>

        <h1 className="text-2xl font-bold text-text-primary mb-1">Create Agent</h1>
        <p className="text-sm text-text-secondary mb-8">Define a new AI agent with custom instructions and tools.</p>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Identity section */}
          <section className="space-y-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Identity</h2>

            {/* Icon + Color row */}
            <div className="flex items-start gap-5">
              {/* Icon picker */}
              <div className="relative">
                <label className="block text-sm font-medium text-text-secondary mb-2">Icon</label>
                <button
                  type="button"
                  onClick={() => setIconPickerOpen(!iconPickerOpen)}
                  className={`w-14 h-14 rounded-2xl bg-gradient-to-br from-${color === 'green' ? 'emerald' : color}-500/15 to-${color === 'green' ? 'emerald' : color}-500/5 border border-${color === 'green' ? 'emerald' : color}-500/20 flex items-center justify-center hover:brightness-125 transition-all`}
                >
                  <IconPreview size={28} className={`text-${color === 'green' ? 'emerald' : color}-400`} />
                </button>
                {iconPickerOpen && (
                  <div className="absolute top-full left-0 mt-2 z-50 bg-bg-card border border-border-subtle rounded-xl p-3 shadow-2xl w-64 grid grid-cols-6 gap-1.5">
                    {iconOptions.map((name) => {
                      const Ic = Icons[name]
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => { setIcon(name); setIconPickerOpen(false) }}
                          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                            icon === name ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:bg-white/5 hover:text-text-secondary'
                          }`}
                          title={name}
                        >
                          <Ic size={16} />
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

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
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Frontend Developer"
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
                placeholder="A short summary of what this agent does..."
                rows={3}
                required
                className="w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 resize-none"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Category</label>
              <div className="flex gap-2">
                {categoryOptions.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                      category === cat
                        ? 'bg-accent-blue/10 border-accent-blue/30 text-accent-blue'
                        : 'bg-bg-input border-border-subtle text-text-secondary hover:border-border-hover'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Tags</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="React, TypeScript, CSS (comma-separated)"
                className="w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20"
              />
            </div>
          </section>

          {/* Configuration section */}
          <section className="space-y-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Configuration</h2>

            {/* Tools */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Tools</label>
              <div className="flex flex-wrap gap-2">
                {toolOptions.map((tool) => (
                  <button
                    key={tool}
                    type="button"
                    onClick={() => toggleTool(tool)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      tools.includes(tool)
                        ? 'bg-accent-blue/10 border-accent-blue/30 text-accent-blue'
                        : 'bg-bg-input border-border-subtle text-text-muted hover:border-border-hover hover:text-text-secondary'
                    }`}
                  >
                    <Icons.Wrench size={13} />
                    {tool}
                  </button>
                ))}
              </div>
            </div>

            {/* Model */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Model</label>
              <div className="flex gap-2">
                {modelOptions.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModel(m)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      model === m
                        ? 'bg-accent-blue/10 border-accent-blue/30 text-accent-blue'
                        : 'bg-bg-input border-border-subtle text-text-secondary hover:border-border-hover'
                    }`}
                  >
                    <Icons.Cpu size={13} />
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Content section */}
          <section className="space-y-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">System Prompt</h2>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Agent Instructions</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={"You are a senior developer specializing in...\n\n## Communication Protocol\n\n### Required Initial Step: Project Context Gathering\n\nAlways begin by requesting project context..."}
                rows={16}
                className="w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 resize-none font-mono leading-relaxed"
              />
              <p className="text-xs text-text-muted mt-2">Supports Markdown formatting. This will appear in the Content section of your agent's page.</p>
            </div>
          </section>

          {/* Actions */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-sm text-rose-400">
              <Icons.AlertCircle size={16} />
              {error}
            </div>
          )}
          <div className="flex items-center gap-3 pt-4 border-t border-border-subtle">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 bg-accent-blue text-white text-sm font-medium rounded-xl hover:bg-accent-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <Icons.Loader2 size={16} className="animate-spin" /> : <Icons.Plus size={16} />}
              {submitting ? 'Creating...' : 'Create Agent'}
            </button>
            <Link
              to="/"
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
