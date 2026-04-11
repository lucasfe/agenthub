import { useState, useMemo } from 'react'
import { Link } from 'react-router'
import * as Icons from 'lucide-react'
import { updateAgent } from '../lib/api'
import { useData } from '../context/DataContext'

const VALID_CATEGORIES = ['Development Team', 'AI Specialists']
const VALID_COLORS = ['blue', 'green', 'purple', 'amber', 'rose', 'cyan']

// Fields the assistant is allowed to change via update_agent.
const EDITABLE_FIELDS = ['name', 'description', 'category', 'tags', 'icon', 'color', 'content']

const colorMap = {
  blue: {
    bg: 'from-blue-500/20 to-blue-600/5',
    border: 'border-blue-500/30',
    icon: 'text-blue-400',
    swatch: 'bg-blue-500',
    btn: 'bg-blue-500 hover:bg-blue-600',
  },
  green: {
    bg: 'from-emerald-500/20 to-emerald-600/5',
    border: 'border-emerald-500/30',
    icon: 'text-emerald-400',
    swatch: 'bg-emerald-500',
    btn: 'bg-emerald-500 hover:bg-emerald-600',
  },
  purple: {
    bg: 'from-purple-500/20 to-purple-600/5',
    border: 'border-purple-500/30',
    icon: 'text-purple-400',
    swatch: 'bg-purple-500',
    btn: 'bg-purple-500 hover:bg-purple-600',
  },
  amber: {
    bg: 'from-amber-500/20 to-amber-600/5',
    border: 'border-amber-500/30',
    icon: 'text-amber-400',
    swatch: 'bg-amber-500',
    btn: 'bg-amber-500 hover:bg-amber-600',
  },
  rose: {
    bg: 'from-rose-500/20 to-rose-600/5',
    border: 'border-rose-500/30',
    icon: 'text-rose-400',
    swatch: 'bg-rose-500',
    btn: 'bg-rose-500 hover:bg-rose-600',
  },
  cyan: {
    bg: 'from-cyan-500/20 to-cyan-600/5',
    border: 'border-cyan-500/30',
    icon: 'text-cyan-400',
    swatch: 'bg-cyan-500',
    btn: 'bg-cyan-500 hover:bg-cyan-600',
  },
}

// Normalize the AI-provided updates: drop unknown fields, coerce types,
// and validate enums. Invalid enum values fall through and get clamped
// against the current agent later (in diffFields).
function normalizeUpdates(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = {}
  for (const key of EDITABLE_FIELDS) {
    if (!(key in raw)) continue
    const v = raw[key]
    if (v === undefined || v === null) continue
    if (key === 'tags') {
      if (Array.isArray(v)) out.tags = v.slice(0, 6).map(String)
    } else if (typeof v === 'string') {
      out[key] = v
    }
  }
  return out
}

// Compute the diff: only fields whose proposed value differs from the
// current agent. Invalid enum values (bad category/color) are dropped
// so they never reach the DB.
function diffFields(agent, updates) {
  const diff = {}
  for (const key of Object.keys(updates)) {
    const next = updates[key]
    const current = agent[key]
    if (key === 'category' && !VALID_CATEGORIES.includes(next)) continue
    if (key === 'color' && !VALID_COLORS.includes(next)) continue
    if (key === 'tags') {
      if (!arraysEqual(current || [], next || [])) diff[key] = next
      continue
    }
    if ((current ?? '') !== (next ?? '')) diff[key] = next
  }
  return diff
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function formatValue(value) {
  if (Array.isArray(value)) return value.join(', ')
  if (value === undefined || value === null || value === '') return '(empty)'
  if (typeof value === 'string' && value.length > 80) return value.slice(0, 80) + '…'
  return String(value)
}

export default function AgentEditCard({ targetId, updates: rawUpdates }) {
  const { agents, refreshAgents } = useData()
  const [overrides, setOverrides] = useState({}) // user's inline edits to the proposed changes
  const [mode, setMode] = useState('preview') // preview | editing | applying | applied | error
  const [error, setError] = useState(null)

  const agent = useMemo(
    () => agents.find((a) => a.id === targetId),
    [agents, targetId],
  )

  const proposedUpdates = useMemo(
    () => ({ ...normalizeUpdates(rawUpdates), ...overrides }),
    [rawUpdates, overrides],
  )

  const diff = useMemo(
    () => (agent ? diffFields(agent, proposedUpdates) : {}),
    [agent, proposedUpdates],
  )

  // ── Missing target ─────────────────────────────────────────────
  if (!agent) {
    return (
      <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 flex items-center gap-3">
        <Icons.AlertCircle size={18} className="text-rose-400 shrink-0" />
        <p className="text-xs text-rose-300 flex-1">
          Could not find an agent with ID{' '}
          <code className="bg-black/20 px-1 rounded">{targetId}</code>
        </p>
      </div>
    )
  }

  const colors = colorMap[agent.color] || colorMap.blue
  const IconComponent = Icons[agent.icon] || Icons.Bot
  const categorySlug = (agent.category || '').toLowerCase().replace(/\s+/g, '-')
  const hasChanges = Object.keys(diff).length > 0

  const handleApply = async () => {
    if (!hasChanges) return
    setMode('applying')
    setError(null)
    try {
      await updateAgent(agent.id, diff)
      await refreshAgents()
      setMode('applied')
    } catch (err) {
      setError(err.message || 'Failed to update agent')
      setMode('error')
    }
  }

  // ── Applied state ──────────────────────────────────────────────
  if (mode === 'applied') {
    return (
      <div className="mt-3 rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Icons.Check size={20} className="text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-300">Changes applied</p>
            <p className="text-xs text-text-muted truncate">{agent.name}</p>
          </div>
          <Link
            to={`/agent/${categorySlug}/${agent.id}`}
            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors inline-flex items-center gap-1 shrink-0"
          >
            View page
            <Icons.ArrowRight size={12} />
          </Link>
        </div>
      </div>
    )
  }

  // ── Editing state ──────────────────────────────────────────────
  if (mode === 'editing') {
    return (
      <InlineDiffEditor
        agent={agent}
        updates={proposedUpdates}
        onSave={(newUpdates) => {
          setOverrides(newUpdates)
          setMode('preview')
        }}
        onCancel={() => setMode('preview')}
      />
    )
  }

  // ── Preview / applying / error ─────────────────────────────────
  return (
    <div
      className={`mt-3 rounded-xl border ${colors.border} bg-gradient-to-br ${colors.bg} overflow-hidden`}
    >
      {/* Header: the target agent */}
      <div className="p-4 flex items-start gap-3">
        <div
          className={`w-11 h-11 rounded-xl bg-black/20 border ${colors.border} flex items-center justify-center shrink-0`}
        >
          <IconComponent size={22} className={colors.icon} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
              Edit proposal
            </span>
          </div>
          <h3 className="text-sm font-semibold text-text-primary truncate mt-0.5">
            {agent.name}
          </h3>
          <p className="text-[11px] text-text-muted truncate">
            {agent.id} · {agent.category}
          </p>
        </div>
      </div>

      {/* Diff */}
      <div className="px-4 pb-3">
        {!hasChanges ? (
          <p className="text-xs text-text-muted italic">
            No changes proposed — edit the draft or dismiss.
          </p>
        ) : (
          <div className="space-y-2">
            {Object.keys(diff).map((field) => (
              <DiffRow
                key={field}
                field={field}
                oldValue={agent[field]}
                newValue={diff[field]}
              />
            ))}
          </div>
        )}
      </div>

      {/* Error banner */}
      {mode === 'error' && error && (
        <div className="px-4 py-2 bg-rose-500/10 border-t border-rose-500/20 flex items-center gap-2">
          <Icons.AlertCircle size={14} className="text-rose-400 shrink-0" />
          <p className="text-xs text-rose-300 flex-1">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 bg-black/20 border-t border-white/5 flex items-center gap-2">
        <button
          onClick={handleApply}
          disabled={mode === 'applying' || !hasChanges}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${colors.btn}`}
        >
          {mode === 'applying' ? (
            <Icons.Loader2 size={13} className="animate-spin" />
          ) : (
            <Icons.Check size={13} />
          )}
          {mode === 'applying' ? 'Applying...' : 'Apply changes'}
        </button>
        <button
          onClick={() => setMode('editing')}
          disabled={mode === 'applying'}
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

// A single row showing "field: old → new"
function DiffRow({ field, oldValue, newValue }) {
  return (
    <div className="text-[11px]">
      <div className="text-text-muted uppercase tracking-wider font-medium mb-0.5">
        {field}
      </div>
      <div className="flex items-start gap-2 flex-wrap">
        <span className="text-rose-300/80 line-through bg-rose-500/10 px-1.5 py-0.5 rounded">
          {formatValue(oldValue)}
        </span>
        <Icons.ArrowRight size={12} className="text-text-muted mt-0.5 shrink-0" />
        <span className="text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded">
          {formatValue(newValue)}
        </span>
      </div>
    </div>
  )
}

// Inline editor — lets the user tweak the proposed updates before applying.
// Pre-fills with the current proposed values, and saving returns a new
// updates object containing ONLY fields that differ from the original agent.
function InlineDiffEditor({ agent, updates, onSave, onCancel }) {
  const [name, setName] = useState(updates.name ?? agent.name)
  const [description, setDescription] = useState(updates.description ?? agent.description)
  const [category, setCategory] = useState(updates.category ?? agent.category)
  const [tagsText, setTagsText] = useState(
    (updates.tags ?? agent.tags ?? []).join(', '),
  )
  const [icon, setIcon] = useState(updates.icon ?? agent.icon)
  const [color, setColor] = useState(updates.color ?? agent.color)
  const [content, setContent] = useState(updates.content ?? agent.content ?? '')

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
          Edit changes for {agent.name}
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
          Save changes
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
