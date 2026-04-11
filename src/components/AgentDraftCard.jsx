import { useState, useMemo } from 'react'
import { Link } from 'react-router'
import * as Icons from 'lucide-react'
import { createAgent } from '../lib/api'
import { useData } from '../context/DataContext'

const VALID_CATEGORIES = ['Development Team', 'AI Specialists']
const VALID_COLORS = ['blue', 'green', 'purple', 'amber', 'rose', 'cyan']

// Predefined per-color class strings so Tailwind can statically see them.
const colorMap = {
  blue: {
    bg: 'from-blue-500/20 to-blue-600/5',
    border: 'border-blue-500/30',
    icon: 'text-blue-400',
    pill: 'bg-blue-500/10 text-blue-300',
    swatch: 'bg-blue-500',
    btn: 'bg-blue-500 hover:bg-blue-600',
  },
  green: {
    bg: 'from-emerald-500/20 to-emerald-600/5',
    border: 'border-emerald-500/30',
    icon: 'text-emerald-400',
    pill: 'bg-emerald-500/10 text-emerald-300',
    swatch: 'bg-emerald-500',
    btn: 'bg-emerald-500 hover:bg-emerald-600',
  },
  purple: {
    bg: 'from-purple-500/20 to-purple-600/5',
    border: 'border-purple-500/30',
    icon: 'text-purple-400',
    pill: 'bg-purple-500/10 text-purple-300',
    swatch: 'bg-purple-500',
    btn: 'bg-purple-500 hover:bg-purple-600',
  },
  amber: {
    bg: 'from-amber-500/20 to-amber-600/5',
    border: 'border-amber-500/30',
    icon: 'text-amber-400',
    pill: 'bg-amber-500/10 text-amber-300',
    swatch: 'bg-amber-500',
    btn: 'bg-amber-500 hover:bg-amber-600',
  },
  rose: {
    bg: 'from-rose-500/20 to-rose-600/5',
    border: 'border-rose-500/30',
    icon: 'text-rose-400',
    pill: 'bg-rose-500/10 text-rose-300',
    swatch: 'bg-rose-500',
    btn: 'bg-rose-500 hover:bg-rose-600',
  },
  cyan: {
    bg: 'from-cyan-500/20 to-cyan-600/5',
    border: 'border-cyan-500/30',
    icon: 'text-cyan-400',
    pill: 'bg-cyan-500/10 text-cyan-300',
    swatch: 'bg-cyan-500',
    btn: 'bg-cyan-500 hover:bg-cyan-600',
  },
}

function normalizeDraft(raw) {
  return {
    name: typeof raw?.name === 'string' ? raw.name : 'New Agent',
    category: VALID_CATEGORIES.includes(raw?.category) ? raw.category : 'AI Specialists',
    description: typeof raw?.description === 'string' ? raw.description : '',
    tags: Array.isArray(raw?.tags) ? raw.tags.slice(0, 6).map(String) : [],
    icon: typeof raw?.icon === 'string' && raw.icon ? raw.icon : 'Bot',
    color: VALID_COLORS.includes(raw?.color) ? raw.color : 'blue',
    content: typeof raw?.content === 'string' ? raw.content : '',
  }
}

function slug(name) {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

export default function AgentDraftCard({ draft: initialDraft }) {
  const { agents, refreshAgents } = useData()
  const [draft, setDraft] = useState(() => normalizeDraft(initialDraft))
  const [mode, setMode] = useState('preview') // preview | editing | creating | created | error
  const [error, setError] = useState(null)
  const [createdAgent, setCreatedAgent] = useState(null)
  const [showPrompt, setShowPrompt] = useState(false)

  const derivedId = useMemo(() => slug(draft.name), [draft.name])
  const idTaken = useMemo(
    () => agents.some((a) => a.id === derivedId),
    [agents, derivedId],
  )
  const iconValid = Boolean(Icons[draft.icon])
  const IconComponent = iconValid ? Icons[draft.icon] : Icons.Bot
  const colors = colorMap[draft.color] || colorMap.blue
  const categorySlug = draft.category.toLowerCase().replace(/\s+/g, '-')

  const handleCreate = async () => {
    if (!draft.name.trim()) {
      setError('Name is required')
      setMode('error')
      return
    }
    if (idTaken) {
      setError(`An agent with ID "${derivedId}" already exists`)
      setMode('error')
      return
    }
    setMode('creating')
    setError(null)
    try {
      await createAgent({
        id: derivedId,
        name: draft.name,
        category: draft.category,
        description: draft.description,
        tags: draft.tags,
        icon: iconValid ? draft.icon : 'Bot',
        color: draft.color,
        featured: false,
        popularity: 50,
        content: draft.content,
      })
      await refreshAgents()
      setCreatedAgent({ id: derivedId, categorySlug, name: draft.name })
      setMode('created')
    } catch (err) {
      setError(err.message || 'Failed to create agent')
      setMode('error')
    }
  }

  const handleSaveEdit = (updated) => {
    setDraft(normalizeDraft(updated))
    setMode('preview')
  }

  // ── Created state ─────────────────────────────────────────────
  if (mode === 'created' && createdAgent) {
    return (
      <div
        className={`mt-3 rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 p-4`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Icons.Check size={20} className="text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-300">Agent created</p>
            <p className="text-xs text-text-muted truncate">{createdAgent.name}</p>
          </div>
          <Link
            to={`/agent/${createdAgent.categorySlug}/${createdAgent.id}`}
            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors inline-flex items-center gap-1 shrink-0"
          >
            View page
            <Icons.ArrowRight size={12} />
          </Link>
        </div>
      </div>
    )
  }

  // ── Editing state ─────────────────────────────────────────────
  if (mode === 'editing') {
    return (
      <DraftEditor
        draft={draft}
        onSave={handleSaveEdit}
        onCancel={() => setMode('preview')}
      />
    )
  }

  // ── Preview / creating / error state ──────────────────────────
  return (
    <div
      className={`mt-3 rounded-xl border ${colors.border} bg-gradient-to-br ${colors.bg} overflow-hidden`}
    >
      {/* Header */}
      <div className="p-4 flex items-start gap-3">
        <div
          className={`w-11 h-11 rounded-xl bg-black/20 border ${colors.border} flex items-center justify-center shrink-0`}
        >
          <IconComponent size={22} className={colors.icon} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-text-primary truncate">
              {draft.name}
            </h3>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colors.pill}`}
            >
              {draft.category}
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-1 leading-relaxed">
            {draft.description}
          </p>
        </div>
      </div>

      {/* Tags */}
      {draft.tags.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {draft.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-text-secondary"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* System prompt accordion */}
      {draft.content && (
        <div className="border-t border-white/5">
          <button
            onClick={() => setShowPrompt((v) => !v)}
            className="w-full px-4 py-2 flex items-center justify-between text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <span className="font-medium uppercase tracking-wider">System prompt</span>
            {showPrompt ? <Icons.ChevronUp size={14} /> : <Icons.ChevronDown size={14} />}
          </button>
          {showPrompt && (
            <div className="px-4 pb-3 max-h-48 overflow-y-auto">
              <pre className="text-[11px] text-text-secondary whitespace-pre-wrap font-mono leading-relaxed">
                {draft.content}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Error banner */}
      {mode === 'error' && error && (
        <div className="px-4 py-2 bg-rose-500/10 border-t border-rose-500/20 flex items-center gap-2">
          <Icons.AlertCircle size={14} className="text-rose-400 shrink-0" />
          <p className="text-xs text-rose-300 flex-1">{error}</p>
        </div>
      )}

      {/* Warnings */}
      {mode === 'preview' && idTaken && (
        <div className="px-4 py-2 bg-amber-500/10 border-t border-amber-500/20 flex items-center gap-2">
          <Icons.AlertTriangle size={14} className="text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300 flex-1">
            ID <code className="bg-black/20 px-1 rounded">{derivedId}</code> is
            already taken — edit the name before creating.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 bg-black/20 border-t border-white/5 flex items-center gap-2">
        <button
          onClick={handleCreate}
          disabled={mode === 'creating' || idTaken}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${colors.btn}`}
        >
          {mode === 'creating' ? (
            <Icons.Loader2 size={13} className="animate-spin" />
          ) : (
            <Icons.Plus size={13} />
          )}
          {mode === 'creating' ? 'Creating...' : 'Create agent'}
        </button>
        <button
          onClick={() => setMode('editing')}
          disabled={mode === 'creating'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors disabled:opacity-50"
        >
          <Icons.Pencil size={13} />
          Edit
        </button>
        {mode === 'error' && (
          <button
            onClick={() => {
              setError(null)
              setMode('preview')
            }}
            className="ml-auto text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  )
}

// ── Inline editor ───────────────────────────────────────────────
function DraftEditor({ draft, onSave, onCancel }) {
  const [name, setName] = useState(draft.name)
  const [description, setDescription] = useState(draft.description)
  const [category, setCategory] = useState(draft.category)
  const [tagsText, setTagsText] = useState(draft.tags.join(', '))
  const [icon, setIcon] = useState(draft.icon)
  const [color, setColor] = useState(draft.color)
  const [content, setContent] = useState(draft.content)

  const iconValid = Boolean(Icons[icon])
  const IconPreview = iconValid ? Icons[icon] : Icons.Bot
  const colors = colorMap[color] || colorMap.blue

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      name: name.trim(),
      description: description.trim(),
      category,
      tags: tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      icon: iconValid ? icon : 'Bot',
      color,
      content,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`mt-3 rounded-xl border ${colors.border} bg-gradient-to-br ${colors.bg} p-4 space-y-3`}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          className={`w-8 h-8 rounded-lg bg-black/20 border ${colors.border} flex items-center justify-center shrink-0`}
        >
          <IconPreview size={16} className={colors.icon} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Edit draft
        </span>
      </div>

      <Field label="Name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="editor-input"
          required
        />
      </Field>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="editor-input resize-none"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="editor-input"
          >
            {VALID_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Icon (lucide)">
          <input
            type="text"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className="editor-input"
            placeholder="Bot"
          />
          {!iconValid && (
            <p className="text-[10px] text-amber-400 mt-1">
              Unknown icon — will fall back to Bot
            </p>
          )}
        </Field>
      </div>

      <Field label="Tags (comma-separated)">
        <input
          type="text"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          className="editor-input"
          placeholder="React, TypeScript, CSS"
        />
      </Field>

      <Field label="Color">
        <div className="flex gap-2">
          {VALID_COLORS.map((c) => {
            const cl = colorMap[c]
            return (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-lg ${cl.swatch} transition-all ${
                  color === c
                    ? 'ring-2 ring-white/50 ring-offset-2 ring-offset-bg-card scale-110'
                    : 'opacity-60 hover:opacity-100'
                }`}
                title={c}
              />
            )
          })}
        </div>
      </Field>

      <Field label="System prompt">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          className="editor-input resize-none font-mono text-[11px]"
        />
      </Field>

      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
        <button
          type="submit"
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white transition-colors ${colors.btn}`}
        >
          <Icons.Check size={13} />
          Save draft
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
        >
          Cancel
        </button>
      </div>

      <style>{`
        .editor-input {
          width: 100%;
          background: rgba(0,0,0,0.25);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 0.5rem;
          padding: 0.375rem 0.625rem;
          font-size: 0.75rem;
          color: var(--theme-text-primary);
          outline: none;
          transition: border-color 0.15s;
        }
        .editor-input:focus {
          border-color: rgba(255,255,255,0.25);
        }
      `}</style>
    </form>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium uppercase tracking-wider text-text-muted mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}
