import { useState, useEffect, useCallback } from 'react'
import { Search, GitBranch, Moon, Sun, Sparkles } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import CommandPalette from './CommandPalette'
import AiAssistant from './AiAssistant'

export default function Header() {
  const { theme, toggleTheme } = useTheme()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)

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
        {/* Search trigger */}
        <button
          onClick={() => setPaletteOpen(true)}
          className="relative flex-1 max-w-xl flex items-center gap-3 bg-bg-input border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-muted hover:border-border-hover transition-colors text-left"
        >
          <Search size={16} />
          <span className="flex-1">Search components...</span>
          <kbd className="text-[11px] text-text-muted bg-bg-primary border border-border-subtle rounded-md px-1.5 py-0.5 font-mono">
            ⌘K
          </kbd>
        </button>

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
    </>
  )
}
