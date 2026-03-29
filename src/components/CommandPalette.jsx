import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router'
import * as Icons from 'lucide-react'
import agentsData from '../data/agents.json'
import teamsData from '../data/teams.json'

export default function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const navigate = useNavigate()

  const results = useMemo(() => {
    const items = []

    const agents = agentsData.map((a) => ({
      id: a.id,
      name: a.name,
      type: 'Agent',
      icon: a.icon,
      category: a.category.toLowerCase().replace(/\s+/g, '-'),
      path: `/agent/${a.category.toLowerCase().replace(/\s+/g, '-')}/${a.id}`,
    }))

    const teams = teamsData.map((t) => ({
      id: t.id,
      name: t.name,
      type: 'Team',
      icon: null,
      category: null,
      path: `/teams/${t.id}`,
    }))

    const all = [...agents, ...teams]

    if (!query.trim()) return all.slice(0, 10)

    const q = query.toLowerCase()
    return all
      .filter((item) => item.name.toLowerCase().includes(q))
      .slice(0, 10)
  }, [query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        onClose()
        navigate(results[selectedIndex].path)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, results, selectedIndex, navigate, onClose])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[selectedIndex]
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50">
        <div className="bg-bg-card border border-border-subtle rounded-2xl shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 border-b border-border-subtle">
            <Icons.Search size={16} className="text-text-muted shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents and teams..."
              className="flex-1 bg-transparent py-4 text-sm text-text-primary placeholder:text-text-muted outline-none"
            />
            <kbd className="text-[10px] text-text-muted bg-bg-primary border border-border-subtle rounded px-1.5 py-0.5 font-mono shrink-0">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
            {results.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-text-muted">
                No results found
              </div>
            ) : (
              results.map((item, index) => {
                const Ic = item.type === 'Team' ? Icons.Users : (Icons[item.icon] || Icons.Bot)
                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    onClick={() => {
                      onClose()
                      navigate(item.path)
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      index === selectedIndex
                        ? 'bg-white/5'
                        : ''
                    }`}
                  >
                    <Ic size={16} className="text-text-muted shrink-0" />
                    <span className="text-sm text-text-primary flex-1 truncate">{item.name}</span>
                    <span className="text-[11px] text-text-muted">{item.type}</span>
                    {item.category && (
                      <span className="text-[10px] text-text-muted bg-bg-input px-2 py-0.5 rounded-full">
                        {item.category}
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </div>

          {/* Footer hints */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border-subtle text-[11px] text-text-muted">
            <span className="flex items-center gap-1">
              <kbd className="bg-bg-input border border-border-subtle rounded px-1 py-0.5 font-mono">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-bg-input border border-border-subtle rounded px-1 py-0.5 font-mono">↵</kbd>
              open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-bg-input border border-border-subtle rounded px-1 py-0.5 font-mono">esc</kbd>
              close
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
