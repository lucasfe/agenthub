import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  Plus, GripVertical, X, MoreHorizontal, Trash2, ChevronDown,
  Loader2, AlertCircle, CheckCircle2, Clock, Play, Square, Eye, RefreshCw, Bookmark,
  LayoutTemplate,
} from 'lucide-react'
import Header from './Header'
import { supabase } from '../lib/supabase'
import { useData } from '../context/DataContext'
import { useTaskOrchestration } from '../lib/taskOrchestration'
import { insertTemplate } from '../lib/templatesApi'
import { cloneTemplateToTask } from '../lib/templates'
import SaveAsTemplateModal from './SaveAsTemplateModal'
import TemplateSelectorModal from './TemplateSelectorModal'
import {
  StepRow,
  formatDuration,
  countMissingRequired,
  collectDownloadableSteps,
  downloadAllOutputs,
} from './orchestration/planParts'

const COLUMNS = [
  { id: 'todo', label: 'Todo', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', dot: 'bg-blue-400' },
  { id: 'in_progress', label: 'In Progress', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', dot: 'bg-amber-400' },
  { id: 'done', label: 'Done', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', dot: 'bg-emerald-400' },
]

const COLUMN_BY_ID = Object.fromEntries(COLUMNS.map((c) => [c.id, c]))

const STATUS_TO_COLUMN = {
  todo: 'todo',
  planning: 'in_progress',
  awaiting_approval: 'in_progress',
  executing: 'in_progress',
  done: 'done',
  error: 'done',
  cancelled: 'done',
}

const STATUS_BADGES = {
  planning: { icon: Loader2, label: 'Planning...', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20', spin: true },
  awaiting_approval: { icon: Eye, label: 'Review plan', cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  executing: { icon: Loader2, label: 'Running...', cls: 'text-purple-400 bg-purple-500/10 border-purple-500/20', spin: true },
  done: { icon: CheckCircle2, label: 'Done', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  error: { icon: AlertCircle, label: 'Error', cls: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  cancelled: { icon: Square, label: 'Cancelled', cls: 'text-text-muted bg-white/5 border-border-subtle' },
}

// ─── Supabase helpers ─────────────────────────────────────────────────────

async function fetchTasks() {
  if (!supabase) return []
  const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: true })
  if (error) { console.error('[board] fetch tasks', error); return [] }
  return data || []
}

async function insertTask(task) {
  if (!supabase) return null
  const { data, error } = await supabase.from('tasks').insert(task).select().single()
  if (error) { console.error('[board] insert task', error); return null }
  return data
}

async function updateTask(id, updates) {
  if (!supabase) return
  const { error } = await supabase.from('tasks').update(updates).eq('id', id)
  if (error) console.error('[board] update task', error)
}

async function deleteTask(id) {
  if (!supabase) return
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) console.error('[board] delete task', error)
}

// ─── CreateTaskForm ───────────────────────────────────────────────────────

function CreateTaskForm({ onSubmit, onCancel }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    onSubmit({ title: title.trim(), description: description.trim() })
    setTitle('')
    setDescription('')
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-bg-card border border-border-subtle p-3 space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title"
        autoFocus
        className="w-full bg-transparent text-sm font-medium text-text-primary placeholder:text-text-muted outline-none"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="w-full bg-transparent text-xs text-text-secondary placeholder:text-text-muted outline-none resize-none"
      />
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={!title.trim()} className="px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          Add task
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ─── TaskCard ─────────────────────────────────────────────────────────────

function TaskCard({ task, onDelete, onDragStart, onClick }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const badge = STATUS_BADGES[task.status]
  const stepCount = task.plan?.steps?.length

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart(task.id)
      }}
      onClick={onClick}
      className="group rounded-xl bg-bg-card border border-border-subtle p-3 cursor-grab active:cursor-grabbing hover:border-border-hover transition-colors"
    >
      <div className="flex items-start gap-2">
        <GripVertical size={14} className="text-text-muted/40 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-medium text-text-primary leading-snug">{task.title}</h4>
            <div className="relative shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
                className="p-1 rounded-md text-text-muted/40 hover:text-text-muted hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-all"
              >
                <MoreHorizontal size={14} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-32 py-1 rounded-lg bg-bg-card border border-border-subtle shadow-xl z-10">
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(task.id) }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
          {task.description && (
            <p className="text-xs text-text-muted mt-1 leading-relaxed line-clamp-2">{task.description}</p>
          )}
          {badge && (
            <div className={`inline-flex items-center gap-1.5 mt-2 px-2 py-1 rounded-md text-[10px] font-medium border ${badge.cls}`}>
              <badge.icon size={11} className={badge.spin ? 'animate-spin' : ''} />
              {badge.label}
              {task.status === 'executing' && stepCount && (
                <span className="opacity-70">({stepCount} steps)</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── TaskDetailPanel ──────────────────────────────────────────────────────

function TaskDetailPanel({ task, agents, tools, onUpdate, onDelete, onClose }) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [statusOpen, setStatusOpen] = useState(false)
  const [stepAnswers, setStepAnswers] = useState({})
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const statusRef = useRef(null)

  const orch = useTaskOrchestration({ task, agents, tools, onTaskUpdate: onUpdate })
  const autoStartedRef = useRef(false)

  // Sync local fields when task changes from outside
  const taskId = task.id
  const taskTitle = task.title
  const taskDesc = task.description
  useEffect(() => { setTitle(taskTitle) }, [taskId, taskTitle]) // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => { setDescription(taskDesc) }, [taskId, taskDesc]) // eslint-disable-line react-hooks/set-state-in-effect

  // Auto-start planning when the panel opens on a task that just moved to planning
  const { startPlanning } = orch
  useEffect(() => {
    if (task.status === 'planning' && !task.plan && !autoStartedRef.current) {
      autoStartedRef.current = true
      startPlanning()
    }
  }, [task.status, task.plan, startPlanning])

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    if (!statusOpen) return
    const handleClick = (e) => {
      if (statusRef.current && !statusRef.current.contains(e.target)) setStatusOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [statusOpen])

  const handleTitleBlur = () => {
    const trimmed = title.trim()
    if (trimmed && trimmed !== task.title) onUpdate(task.id, { title: trimmed })
    else setTitle(task.title)
  }

  const handleDescBlur = () => {
    if (description.trim() !== task.description) onUpdate(task.id, { description: description.trim() })
  }

  const handleAnswerChange = (stepId, key, value) => {
    setStepAnswers((prev) => ({
      ...prev,
      [stepId]: { ...(prev[stepId] || {}), [key]: value },
    }))
  }

  const isExecutionPhase = ['planning', 'awaiting_approval', 'executing', 'done', 'error', 'cancelled'].includes(task.status)
  const plan = task.plan
  const missingRequired = plan ? countMissingRequired(plan, stepAnswers) : 0
  const downloadableSteps = plan ? collectDownloadableSteps(plan, orch.stepStates) : []
  const badge = STATUS_BADGES[task.status]

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full max-w-lg bg-bg-sidebar border-l border-border-subtle z-50 flex flex-col shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="h-14 border-b border-border-subtle px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted font-mono">TASK</span>
            {badge && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${badge.cls}`}>
                <badge.icon size={10} className={badge.spin ? 'animate-spin' : ''} />
                {badge.label}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-input text-text-muted hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Title */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
            disabled={task.status === 'executing'}
            className="w-full text-lg font-bold text-text-primary bg-transparent outline-none border-b border-transparent focus:border-border-hover pb-1 transition-colors disabled:opacity-60"
          />

          {/* Description */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescBlur}
              placeholder="Add a description..."
              rows={3}
              disabled={task.status === 'executing'}
              className="w-full bg-bg-input border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover resize-none transition-colors disabled:opacity-60"
            />
          </div>

          {/* Error banner */}
          {(task.status === 'error' || task.status === 'cancelled') && task.error_message && (
            <div className="px-4 py-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
              <AlertCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />
              <p className="text-sm text-rose-300">{task.error_message}</p>
            </div>
          )}

          {/* Plan section */}
          {isExecutionPhase && plan && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block mb-2">
                Execution Plan ({plan.steps?.length || 0} steps)
              </label>
              <div className="space-y-2">
                {(plan.steps || []).map((step) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    state={orch.stepStates[step.id]}
                    isActive={orch.activeStepId === step.id}
                    availableTools={tools}
                    answers={stepAnswers[step.id] || {}}
                    editable={task.status === 'awaiting_approval'}
                    wide
                    onAnswerChange={(key, value) => handleAnswerChange(step.id, key, value)}
                  />
                ))}
              </div>

              {/* Run summary */}
              {task.status === 'done' && orch.runSummary && (
                <div className="mt-3 px-4 py-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-3">
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                  <p className="text-xs text-emerald-300 flex-1">
                    Completed{orch.runSummary.duration_ms ? ` in ${formatDuration(orch.runSummary.duration_ms)}` : ''}
                  </p>
                  {downloadableSteps.length > 0 && (
                    <button
                      onClick={() => downloadAllOutputs(downloadableSteps)}
                      className="text-[10px] text-emerald-300 hover:text-emerald-200 underline"
                    >
                      Download outputs
                    </button>
                  )}
                </div>
              )}

              {/* Run error */}
              {orch.runError && (
                <div className="mt-3 px-4 py-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
                  <AlertCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-300">{orch.runError}</p>
                </div>
              )}
            </div>
          )}

          {/* Artifacts */}
          {task.artifacts && task.artifacts.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block mb-2">Artifacts</label>
              <div className="space-y-1.5">
                {task.artifacts.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-input border border-border-subtle">
                    <span className="text-xs text-text-primary flex-1 truncate">{a.name || `artifact-${i + 1}`}</span>
                    <span className="text-[10px] text-text-muted uppercase">{a.format || a.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Created at */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block mb-1">Created</label>
            <span className="text-xs text-text-secondary">{new Date(task.created_at).toLocaleString()}</span>
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-border-subtle px-5 py-3 shrink-0 flex items-center gap-2">
          {task.status === 'todo' && (
            <button
              onClick={() => orch.startPlanning()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors"
            >
              <Play size={12} />
              Start planning
            </button>
          )}
          {task.status === 'awaiting_approval' && (
            <button
              onClick={() => orch.approve(stepAnswers)}
              disabled={missingRequired > 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play size={12} />
              Approve & run
            </button>
          )}
          {(task.status === 'planning' || task.status === 'executing') && (
            <button
              onClick={() => orch.cancel()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-rose-300 border border-rose-500/30 hover:bg-rose-500/10 transition-colors"
            >
              <Square size={12} />
              Cancel
            </button>
          )}
          {['awaiting_approval', 'done', 'error', 'cancelled'].includes(task.status) && (
            <button
              onClick={() => orch.replan()}
              disabled={orch.replanInFlight}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-text-secondary border border-border-subtle hover:bg-white/5 hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={12} className={orch.replanInFlight ? 'animate-spin' : ''} />
              Re-plan
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setSaveTemplateOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-white/5 border border-border-subtle transition-colors"
            >
              <Bookmark size={12} />
              Save as template
            </button>
            <button
              onClick={() => { onDelete(task.id); onClose() }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-colors"
            >
              <Trash2 size={12} />
              Delete
            </button>
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>

      {saveTemplateOpen && (
        <SaveAsTemplateModal
          task={task}
          onClose={() => setSaveTemplateOpen(false)}
          onSave={insertTemplate}
        />
      )}
    </>
  )
}

// ─── Column ───────────────────────────────────────────────────────────────

function Column({ column, tasks, onAddTask, onDeleteTask, onDragStart, onDrop, onClickTask }) {
  const [showForm, setShowForm] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => setDragOver(false), [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const taskId = e.dataTransfer.getData('text/plain')
    if (taskId) onDrop(taskId, column.id)
  }, [column.id, onDrop])

  return (
    <div
      className={`flex flex-col min-w-[300px] w-[340px] shrink-0 rounded-2xl border transition-colors ${
        dragOver ? `${column.bg} ${column.border}` : 'bg-bg-sidebar/50 border-border-subtle'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="px-4 py-3 flex items-center gap-2.5">
        <div className={`w-2 h-2 rounded-full ${column.dot}`} />
        <h3 className={`text-sm font-semibold ${column.color}`}>{column.label}</h3>
        <span className="text-xs text-text-muted font-mono ml-auto">{tasks.length}</span>
      </div>

      <div className="flex-1 px-3 pb-3 space-y-2 overflow-y-auto max-h-[calc(100vh-220px)]">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onDelete={onDeleteTask}
            onDragStart={onDragStart}
            onClick={() => onClickTask(task.id)}
          />
        ))}
        {column.id === 'todo' && (
          showForm ? (
            <CreateTaskForm
              onSubmit={(data) => { onAddTask(data); setShowForm(false) }}
              onCancel={() => setShowForm(false)}
            />
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors"
            >
              <Plus size={14} />
              Add task
            </button>
          )
        )}
      </div>
    </div>
  )
}

// ─── BoardPage ────────────────────────────────────────────────────────────

export default function BoardPage() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [, setDraggingId] = useState(null)
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const { agents, tools } = useData()

  const selectedTask = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) : null

  useEffect(() => {
    fetchTasks().then((data) => { setTasks(data); setLoading(false) })
  }, [])

  const handleAddTask = useCallback(async (data) => {
    const row = await insertTask({ title: data.title, description: data.description, status: 'todo' })
    if (row) setTasks((prev) => [...prev, row])
  }, [])

  const handleDeleteTask = useCallback(async (taskId) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    setSelectedTaskId((prev) => (prev === taskId ? null : prev))
    await deleteTask(taskId)
  }, [])

  const handleUpdateTask = useCallback(async (taskId, updates) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t)))
    await updateTask(taskId, updates)
  }, [])

  const handleDrop = useCallback(async (taskId, columnId) => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return

    const currentColumn = STATUS_TO_COLUMN[task.status]
    if (currentColumn === columnId) return

    if (columnId === 'in_progress' && task.status === 'todo') {
      // Trigger orchestration — status will be set to 'planning' by the hook
      setSelectedTaskId(taskId)
      // Small delay to let the panel render, then startPlanning is called from the panel
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: 'planning' } : t)))
      await updateTask(taskId, { status: 'planning' })
    } else if (columnId === 'todo') {
      if (['planning', 'awaiting_approval', 'executing'].includes(task.status)) {
        handleUpdateTask(taskId, { status: 'cancelled', error_message: 'Cancelled by user' })
      } else {
        handleUpdateTask(taskId, { status: 'todo', plan: null, error_message: null, artifacts: [] })
      }
    } else if (columnId === 'done') {
      handleUpdateTask(taskId, { status: 'done' })
    }

    setDraggingId(null)
  }, [tasks, handleUpdateTask])

  const todoTasks = useMemo(() => tasks.filter((t) => STATUS_TO_COLUMN[t.status] === 'todo'), [tasks])
  const inProgressTasks = useMemo(() => tasks.filter((t) => STATUS_TO_COLUMN[t.status] === 'in_progress'), [tasks])
  const doneTasks = useMemo(() => tasks.filter((t) => STATUS_TO_COLUMN[t.status] === 'done'), [tasks])
  const tasksByColumn = { todo: todoTasks, in_progress: inProgressTasks, done: doneTasks }

  if (loading) {
    return (
      <>
        <Header />
        <div className="flex items-center justify-center h-64">
          <Loader2 size={24} className="text-text-muted animate-spin" />
        </div>
      </>
    )
  }

  return (
    <>
      <Header />
      <div className="px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Board</h1>
          <p className="text-sm text-text-muted mt-1">Manage your tasks across stages</p>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <Column
              key={col.id}
              column={col}
              tasks={tasksByColumn[col.id]}
              onAddTask={handleAddTask}
              onDeleteTask={handleDeleteTask}
              onDragStart={setDraggingId}
              onDrop={handleDrop}
              onClickTask={setSelectedTaskId}
            />
          ))}
        </div>
      </div>

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          agents={agents}
          tools={tools}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </>
  )
}
