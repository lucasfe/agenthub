import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router'
import * as Icons from 'lucide-react'
import { fetchAgent, deleteAgent, updateAgent } from '../lib/api'
import { useData } from '../context/DataContext'

const colorMap = {
  blue: { bg: 'from-blue-500/15 to-blue-600/5', border: 'border-blue-500/20', icon: 'text-blue-400', tag: 'bg-blue-500/10 text-blue-300' },
  green: { bg: 'from-emerald-500/15 to-emerald-600/5', border: 'border-emerald-500/20', icon: 'text-emerald-400', tag: 'bg-emerald-500/10 text-emerald-300' },
  purple: { bg: 'from-purple-500/15 to-purple-600/5', border: 'border-purple-500/20', icon: 'text-purple-400', tag: 'bg-purple-500/10 text-purple-300' },
  amber: { bg: 'from-amber-500/15 to-amber-600/5', border: 'border-amber-500/20', icon: 'text-amber-400', tag: 'bg-amber-500/10 text-amber-300' },
  rose: { bg: 'from-rose-500/15 to-rose-600/5', border: 'border-rose-500/20', icon: 'text-rose-400', tag: 'bg-rose-500/10 text-rose-300' },
  cyan: { bg: 'from-cyan-500/15 to-cyan-600/5', border: 'border-cyan-500/20', icon: 'text-cyan-400', tag: 'bg-cyan-500/10 text-cyan-300' },
}

const defaultTools = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep']

function renderMarkdown(text) {
  const lines = text.split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      elements.push(
        <div key={elements.length} className="my-4 rounded-xl border border-border-subtle overflow-hidden">
          {lang && (
            <div className="px-4 py-2 bg-white/3 border-b border-border-subtle text-[11px] uppercase tracking-wider text-text-muted font-medium">
              {lang}
            </div>
          )}
          <pre className="px-4 py-4 overflow-x-auto bg-bg-primary/50">
            <code className="text-sm font-mono text-text-secondary leading-relaxed">{codeLines.join('\n')}</code>
          </pre>
        </div>
      )
      continue
    }

    // H2
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={elements.length} className="text-xl font-bold text-text-primary mt-8 mb-2 pb-2 border-b border-border-subtle/50">
          {line.slice(3)}
        </h2>
      )
      i++
      continue
    }

    // H3
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={elements.length} className="text-base font-semibold text-text-primary mt-6 mb-2">
          {line.slice(4)}
        </h3>
      )
      i++
      continue
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      elements.push(
        <ol key={elements.length} className="my-3 space-y-1.5 list-decimal list-inside">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm text-text-secondary leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ol>
      )
      continue
    }

    // Unordered list
    if (line.startsWith('- ')) {
      const items = []
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2))
        i++
      }
      elements.push(
        <ul key={elements.length} className="my-3 space-y-1.5 list-disc list-inside">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm text-text-secondary leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Empty line
    if (line.trim() === '') {
      i++
      continue
    }

    // Paragraph
    elements.push(
      <p key={elements.length} className="text-sm text-text-secondary leading-relaxed my-3">
        {renderInline(line)}
      </p>
    )
    i++
  }

  return elements
}

function renderInline(text) {
  const parts = []
  const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className="font-semibold text-text-primary">{match[2]}</strong>)
    } else if (match[4]) {
      parts.push(<code key={match.index} className="text-xs bg-white/5 text-text-secondary px-1.5 py-0.5 rounded font-mono">{match[4]}</code>)
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : text
}

export default function AgentDetailPage() {
  const { category, agentId } = useParams()
  const navigate = useNavigate()
  const { refreshAgents } = useData()
  const [agent, setAgent] = useState(null)
  const [agentLoading, setAgentLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('description')
  const [contentView, setContentView] = useState('preview')

  const [contentCopied, setContentCopied] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)

  useEffect(() => {
    let cancelled = false
    setAgentLoading(true)
    fetchAgent(agentId)
      .then((data) => {
        if (!cancelled) {
          setAgent(data)
          setEditContent(data?.content || '')
        }
      })
      .catch(() => {
        if (!cancelled) setAgent(null)
      })
      .finally(() => {
        if (!cancelled) setAgentLoading(false)
      })
    return () => { cancelled = true }
  }, [agentId])

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && showDeleteConfirm && !isDeleting) {
        setShowDeleteConfirm(false)
        setDeleteConfirmInput('')
        setDeleteError(null)
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [showDeleteConfirm, isDeleting])

  const handleDeleteAgent = async () => {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteAgent(agentId)
      await refreshAgents()
      navigate('/')
    } catch (err) {
      setDeleteError(err.message)
      setIsDeleting(false)
    }
  }

  const handleSaveContent = async () => {
    setIsSaving(true)
    setSaveStatus(null)
    try {
      const updated = await updateAgent(agentId, { content: editContent })
      setAgent(updated)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(null), 2000)
    } catch (err) {
      setSaveStatus('error')
    } finally {
      setIsSaving(false)
    }
  }

  const hasContentChanges = agent && editContent !== (agent.content || '')

  if (agentLoading) {
    return <div className="p-8 text-text-muted">Loading...</div>
  }

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-text-muted text-lg">Agent not found</p>
          <Link to="/" className="text-accent-blue text-sm mt-2 inline-block hover:underline">
            Back to agents
          </Link>
        </div>
      </div>
    )
  }

  const colors = colorMap[agent.color] || colorMap.blue
  const IconComponent = Icons[agent.icon] || Icons.Bot
  const categorySlug = (agent.category || '').toLowerCase().replace(/\s+/g, '-')
  const content = agent.content || ''

  const handleContentCopy = () => {
    navigator.clipboard.writeText(content)
    setContentCopied(true)
    setTimeout(() => setContentCopied(false), 2000)
  }

  const tabs = [
    { id: 'description', label: 'Description' },
    { id: 'tools', label: 'Tools' },
    { id: 'model', label: 'Model' },
  ]

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="px-8 py-6 max-w-5xl">
        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mb-6"
        >
          <Icons.ArrowLeft size={16} />
          Back to agents
        </Link>

        {/* Hero */}
        <div className="flex items-start gap-5 mb-6">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${colors.bg} flex items-center justify-center shrink-0`}>
            <IconComponent size={28} className={colors.icon} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-text-primary">{agent.name}</h1>
            </div>
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <Icons.Bot size={12} />
                Agent
              </span>
              <span className={`${colors.tag} px-2 py-0.5 rounded-full font-medium`}>
                {categorySlug}
              </span>
              <span className="flex items-center gap-1">
                <Icons.Download size={12} />
                {(agent.popularity * 243).toLocaleString()}
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-rose-400 border border-rose-500/30 rounded-xl hover:border-rose-500/60 hover:bg-rose-500/10 transition-all duration-200 shrink-0 active:scale-95"
            aria-label="Delete this agent"
          >
            <Icons.Trash2 size={14} />
            Delete
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-border-subtle">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
                activeTab === tab.id
                  ? 'text-accent-blue'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-blue rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="pb-12">
          {activeTab === 'description' && content && (
            <div>
              {/* Content header */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Content</p>
                <button
                  onClick={handleContentCopy}
                  className="text-xs text-text-muted hover:text-text-primary transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5 flex items-center gap-1.5"
                >
                  {contentCopied ? <Icons.Check size={12} className="text-emerald-400" /> : <Icons.Copy size={12} />}
                  Copy
                </button>
              </div>

              {/* Code / Preview toggle + Search */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex bg-bg-card rounded-full p-0.5 border border-border-subtle">
                  <button
                    onClick={() => setContentView('code')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      contentView === 'code'
                        ? 'bg-white/10 text-text-primary'
                        : 'text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    <Icons.Code size={12} />
                    Code
                  </button>
                  <button
                    onClick={() => setContentView('preview')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      contentView === 'preview'
                        ? 'bg-white/10 text-text-primary'
                        : 'text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    <Icons.Eye size={12} />
                    Preview
                  </button>
                </div>

                {/* Search */}
                {searchOpen ? (
                  <div className="flex items-center gap-2 flex-1 max-w-xs">
                    <div className="flex items-center gap-2 flex-1 bg-bg-card border border-border-subtle rounded-lg px-3 py-1.5">
                      <Icons.Search size={12} className="text-text-muted shrink-0" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search content..."
                        className="bg-transparent text-xs text-text-primary placeholder:text-text-muted outline-none flex-1"
                        autoFocus
                      />
                    </div>
                    <button
                      onClick={() => { setSearchOpen(false); setSearchQuery('') }}
                      className="text-text-muted hover:text-text-primary transition-colors"
                    >
                      <Icons.X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setSearchOpen(true)}
                    className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
                  >
                    <Icons.Search size={12} />
                    Search
                    <kbd className="text-[10px] text-text-muted/60 bg-white/5 px-1 py-0.5 rounded ml-0.5">⌘F</kbd>
                  </button>
                )}
              </div>

              {/* Content area */}
              <div className={`bg-bg-card border border-border-subtle rounded-2xl overflow-hidden ${!expanded ? 'max-h-[500px] relative' : ''}`}>
                <div className="p-6">
                  {contentView === 'code' ? (
                    <pre className="text-sm font-mono text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
                      {content}
                    </pre>
                  ) : (
                    <div className="prose-dark">
                      {renderMarkdown(content)}
                    </div>
                  )}
                </div>

                {/* Gradient fade */}
                {!expanded && (
                  <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-bg-card to-transparent pointer-events-none" />
                )}
              </div>

              {/* Show full document button */}
              {!expanded && (
                <div className="flex justify-center mt-4">
                  <button
                    onClick={() => setExpanded(true)}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm text-text-secondary hover:text-text-primary bg-bg-card border border-border-subtle rounded-xl hover:bg-bg-card-hover transition-all"
                  >
                    <Icons.ChevronDown size={16} />
                    Show full document
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'tools' && (
            <div>
              <h2 className="text-base font-semibold text-text-primary mb-3">Available Tools</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(agent.tools || defaultTools).map((tool) => (
                  <div
                    key={tool}
                    className="flex items-center gap-2.5 px-4 py-3 bg-bg-card border border-border-subtle rounded-xl"
                  >
                    <Icons.Wrench size={14} className="text-text-muted" />
                    <span className="text-sm text-text-secondary font-mono">{tool}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'model' && (
            <div>
              <h2 className="text-base font-semibold text-text-primary mb-3">Model</h2>
              <div className="inline-flex items-center gap-2.5 px-4 py-3 bg-bg-card border border-border-subtle rounded-xl">
                <Icons.Cpu size={14} className="text-text-muted" />
                <span className="text-sm text-text-secondary font-medium">{agent.model || 'Claude Sonnet'}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={() => { if (!isDeleting) { setShowDeleteConfirm(false); setDeleteConfirmInput(''); setDeleteError(null) } }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="bg-bg-card border border-rose-500/30 rounded-2xl max-w-sm w-full shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-border-subtle flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icons.AlertTriangle size={18} className="text-rose-400" />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-text-primary">
                    Delete &ldquo;{agent.name}&rdquo;?
                  </h2>
                  <p className="text-xs text-text-muted mt-1">
                    This action cannot be undone.
                  </p>
                </div>
              </div>

              {/* Content */}
              <div className="px-6 py-4 space-y-4">
                <p className="text-sm text-text-secondary leading-relaxed">
                  All associated data, tools configuration, and model settings will be permanently deleted.
                </p>

                <div>
                  <label className="block text-xs font-medium text-text-muted mb-2">
                    Type <code className="bg-white/5 px-2 py-1 rounded text-text-primary">{agent.name}</code> to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmInput}
                    onChange={(e) => setDeleteConfirmInput(e.target.value)}
                    placeholder={agent.name}
                    className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/20 transition-colors"
                    disabled={isDeleting}
                    autoFocus
                  />
                </div>

                {deleteError && (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg">
                    <Icons.AlertCircle size={14} className="text-rose-400 shrink-0" />
                    <p className="text-xs text-rose-300">{deleteError}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="px-6 py-3 border-t border-border-subtle flex gap-2">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmInput(''); setDeleteError(null) }}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary border border-border-subtle rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAgent}
                  disabled={deleteConfirmInput !== agent.name || isDeleting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? (
                    <>
                      <Icons.Loader2 size={14} className="animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Icons.Trash2 size={14} />
                      Delete agent
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
