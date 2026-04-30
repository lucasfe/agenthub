import { useEffect, useState } from 'react'
import { X, Loader2, Trash2 } from 'lucide-react'

function clonePlanForEdit(plan) {
  if (!plan || !Array.isArray(plan.steps)) return plan
  return {
    ...plan,
    steps: plan.steps.map((step) => ({ ...step })),
  }
}

export default function TemplateEditDrawer({ template, onClose, onSave, onDelete }) {
  const [name, setName] = useState(template.name ?? '')
  const [description, setDescription] = useState(template.description ?? '')
  const [taskTitle, setTaskTitle] = useState(template.task_title ?? '')
  const [taskDescription, setTaskDescription] = useState(template.task_description ?? '')
  const [stepTasks, setStepTasks] = useState(() => {
    const steps = template.plan?.steps
    if (!Array.isArray(steps)) return {}
    const map = {}
    for (const step of steps) {
      map[step.id] = step.task ?? ''
    }
    return map
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && !saving && !deleting) onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, saving, deleting])

  const trimmedName = name.trim()
  const trimmedTaskTitle = taskTitle.trim()
  const canSave =
    trimmedName.length > 0 && trimmedTaskTitle.length > 0 && !saving && !deleting

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const planSteps = template.plan?.steps
      const updatedPlan = Array.isArray(planSteps)
        ? {
            ...clonePlanForEdit(template.plan),
            steps: planSteps.map((step) => ({
              ...step,
              task: stepTasks[step.id] ?? step.task ?? '',
            })),
          }
        : template.plan ?? null
      await onSave({
        name: trimmedName,
        description: description.trim() || null,
        task_title: trimmedTaskTitle,
        task_description: taskDescription.trim(),
        plan: updatedPlan,
      })
      onClose()
    } catch (err) {
      setError(err?.message || 'Failed to save template')
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      await onDelete()
      onClose()
    } catch (err) {
      setError(err?.message || 'Failed to delete template')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const planSteps = template.plan?.steps
  const hasPlanSteps = Array.isArray(planSteps) && planSteps.length > 0

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={() => {
          if (!saving && !deleting) onClose()
        }}
      />
      <div
        role="dialog"
        aria-label="Edit template"
        className="fixed top-0 right-0 h-full w-full max-w-lg bg-bg-sidebar border-l border-border-subtle z-50 flex flex-col shadow-2xl animate-slide-in-right"
      >
        <div className="h-14 border-b border-border-subtle px-5 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-semibold text-text-primary">Edit template</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving || deleting}
            className="p-1.5 rounded-lg hover:bg-bg-input text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          <div>
            <label
              htmlFor="edit-template-name"
              className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5"
            >
              Template name
            </label>
            <input
              id="edit-template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-bg-input border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="edit-template-description"
              className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5"
            >
              Template description
            </label>
            <textarea
              id="edit-template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-bg-input border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover resize-none transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="edit-template-task-title"
              className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5"
            >
              Task title
            </label>
            <input
              id="edit-template-task-title"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              className="w-full bg-bg-input border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="edit-template-task-description"
              className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5"
            >
              Task description
            </label>
            <textarea
              id="edit-template-task-description"
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              rows={3}
              className="w-full bg-bg-input border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover resize-none transition-colors"
            />
          </div>

          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block mb-2">
              Plan steps
            </span>
            {hasPlanSteps ? (
              <div className="space-y-3">
                {planSteps.map((step, idx) => {
                  const inputId = `edit-template-step-${step.id}`
                  const stepLabel = `Step ${idx + 1} — ${step.agent_name || step.agent_id || 'Agent'}`
                  return (
                    <div key={step.id}>
                      <label
                        htmlFor={inputId}
                        className="text-xs font-medium text-text-secondary block mb-1.5"
                      >
                        {stepLabel}
                      </label>
                      <textarea
                        id={inputId}
                        value={stepTasks[step.id] ?? ''}
                        onChange={(e) =>
                          setStepTasks((prev) => ({ ...prev, [step.id]: e.target.value }))
                        }
                        rows={2}
                        className="w-full bg-bg-input border border-border-subtle rounded-xl px-3.5 py-2 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover resize-none transition-colors"
                      />
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-text-muted italic">No plan attached</p>
            )}
          </div>

          {error && (
            <p className="text-xs text-rose-300" role="alert">{error}</p>
          )}
        </div>

        <div className="border-t border-border-subtle px-5 py-3 shrink-0 flex items-center gap-2">
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-rose-500 hover:bg-rose-600 transition-colors disabled:opacity-50"
              >
                {deleting && <Loader2 size={12} className="animate-spin" />}
                Confirm delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                Cancel delete
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={saving || deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-colors disabled:opacity-50"
            >
              <Trash2 size={12} />
              Delete template
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || deleting}
              className="px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
