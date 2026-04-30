import { useEffect, useRef, useState } from 'react'
import { X, Loader2 } from 'lucide-react'

export default function CreateTemplateModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [description, setDescription] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const nameRef = useRef(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, saving])

  const trimmedName = name.trim()
  const trimmedTaskTitle = taskTitle.trim()
  const canSave = trimmedName.length > 0 && trimmedTaskTitle.length > 0 && !saving

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      await onCreate({
        name: trimmedName,
        description: description.trim() || null,
        task_title: trimmedTaskTitle,
        task_description: taskDescription.trim(),
        plan: null,
      })
      onClose()
    } catch (err) {
      setError(err?.message || 'Failed to create template')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={() => { if (!saving) onClose() }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md mx-4 rounded-2xl bg-bg-sidebar border border-border-subtle shadow-2xl"
      >
        <div className="h-12 border-b border-border-subtle px-5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">New template</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg hover:bg-bg-input text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label
              htmlFor="create-template-name"
              className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5"
            >
              Template name
            </label>
            <input
              id="create-template-name"
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Bug fix"
              className="w-full bg-bg-input border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="create-template-description"
              className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5"
            >
              Template description
            </label>
            <textarea
              id="create-template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — describe when to reuse this template"
              rows={2}
              className="w-full bg-bg-input border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover resize-none transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="create-template-task-title"
              className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5"
            >
              Task title
            </label>
            <input
              id="create-template-task-title"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              required
              placeholder="The title shown on the Kanban ticket"
              className="w-full bg-bg-input border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="create-template-task-description"
              className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5"
            >
              Task description
            </label>
            <textarea
              id="create-template-task-description"
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Optional — extra detail for the ticket body"
              rows={3}
              className="w-full bg-bg-input border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover resize-none transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs text-rose-300" role="alert">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
