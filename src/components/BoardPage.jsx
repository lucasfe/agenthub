import { useState, useRef, useCallback } from 'react'
import { Plus, GripVertical, X, MoreHorizontal, Trash2 } from 'lucide-react'
import Header from './Header'

const COLUMNS = [
  { id: 'todo', label: 'Todo', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', dot: 'bg-blue-400' },
  { id: 'in_progress', label: 'In Progress', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', dot: 'bg-amber-400' },
  { id: 'done', label: 'Done', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', dot: 'bg-emerald-400' },
]

let nextId = 1

function CreateTaskForm({ onSubmit, onCancel }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const titleRef = useRef(null)

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
        ref={titleRef}
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
        <button
          type="submit"
          disabled={!title.trim()}
          className="px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add task
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function TaskCard({ task, onDelete, onDragStart }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id.toString())
        e.dataTransfer.effectAllowed = 'move'
        onDragStart(task.id)
      }}
      className="group rounded-xl bg-bg-card border border-border-subtle p-3 cursor-grab active:cursor-grabbing hover:border-border-hover transition-colors"
    >
      <div className="flex items-start gap-2">
        <GripVertical size={14} className="text-text-muted/40 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-medium text-text-primary leading-snug">{task.title}</h4>
            <div className="relative shrink-0" ref={menuRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
                className="p-1 rounded-md text-text-muted/40 hover:text-text-muted hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-all"
              >
                <MoreHorizontal size={14} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-32 py-1 rounded-lg bg-bg-card border border-border-subtle shadow-xl z-10">
                  <button
                    onClick={() => { setMenuOpen(false); onDelete(task.id) }}
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
            <p className="text-xs text-text-muted mt-1 leading-relaxed line-clamp-3">{task.description}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Column({ column, tasks, onAddTask, onDeleteTask, onDragStart, onDrop }) {
  const [showForm, setShowForm] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const taskId = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (!isNaN(taskId)) onDrop(taskId, column.id)
  }, [column.id, onDrop])

  return (
    <div
      className={`flex flex-col min-w-[300px] w-[340px] shrink-0 rounded-2xl border transition-colors ${
        dragOver
          ? `${column.bg} ${column.border}`
          : 'bg-bg-sidebar/50 border-border-subtle'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column header */}
      <div className="px-4 py-3 flex items-center gap-2.5">
        <div className={`w-2 h-2 rounded-full ${column.dot}`} />
        <h3 className={`text-sm font-semibold ${column.color}`}>{column.label}</h3>
        <span className="text-xs text-text-muted font-mono ml-auto">{tasks.length}</span>
      </div>

      {/* Cards */}
      <div className="flex-1 px-3 pb-3 space-y-2 overflow-y-auto max-h-[calc(100vh-220px)]">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onDelete={onDeleteTask}
            onDragStart={onDragStart}
          />
        ))}

        {showForm ? (
          <CreateTaskForm
            onSubmit={(data) => {
              onAddTask(column.id, data)
              setShowForm(false)
            }}
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
        )}
      </div>
    </div>
  )
}

export default function BoardPage() {
  const [tasks, setTasks] = useState([])
  const [draggingId, setDraggingId] = useState(null)

  const handleAddTask = useCallback((columnId, data) => {
    setTasks((prev) => [
      ...prev,
      { id: nextId++, status: columnId, title: data.title, description: data.description, createdAt: Date.now() },
    ])
  }, [])

  const handleDeleteTask = useCallback((taskId) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
  }, [])

  const handleDrop = useCallback((taskId, newStatus) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
    )
    setDraggingId(null)
  }, [])

  const handleDragStart = useCallback((taskId) => {
    setDraggingId(taskId)
  }, [])

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
              tasks={tasks.filter((t) => t.status === col.id)}
              onAddTask={handleAddTask}
              onDeleteTask={handleDeleteTask}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
            />
          ))}
        </div>
      </div>
    </>
  )
}
