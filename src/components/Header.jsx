import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Moon, Sun, Sparkles, LogOut, Settings, ChevronDown } from 'lucide-react'
import { Link } from 'react-router'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import CommandPalette from './CommandPalette'
import AiAssistant from './AiAssistant'

export default function Header() {
  const { theme, toggleTheme } = useTheme()
  const { user, signOut } = useAuth()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!userMenuOpen) return
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [userMenuOpen])

  const closePalette = useCallback(() => setPaletteOpen(false), [])
  const closeAssistant = useCallback(() => setAssistantOpen(false), [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <header className="h-16 border-b border-border-subtle flex items-center justify-between px-6 bg-bg-sidebar/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="flex-1 max-w-xl flex items-center gap-3">
          {/* Search trigger */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="relative flex-1 flex items-center gap-3 bg-bg-input border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-muted hover:border-border-hover transition-colors text-left"
          >
            <Search size={16} />
            <span className="flex-1">Search components...</span>
            <kbd className="text-[11px] text-text-muted bg-bg-primary border border-border-subtle rounded-md px-1.5 py-0.5 font-mono">
              ⌘K
            </kbd>
          </button>

          {/* AI Assistant trigger */}
          <button
            onClick={() => setAssistantOpen(true)}
            aria-label="Open AI assistant"
            title="AI Assistant"
            className="group relative shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-md hover:shadow-lg hover:scale-105 transition-all"
          >
            <Sparkles size={18} className="text-white" />
            <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-purple-400 to-blue-400 opacity-0 group-hover:opacity-40 blur-md transition-opacity -z-10" />
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3 ml-6">
          <a
            href="#"
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <GitBranch size={18} />
            <span className="hidden md:inline">GitHub</span>
          </a>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-bg-input text-text-secondary hover:text-text-primary transition-colors"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={closePalette} />
      <AiAssistant open={assistantOpen} onClose={closeAssistant} />
    </>
  )
}
