import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Moon, Sun, Sparkles, LogOut, Settings, ChevronDown, Wand2 } from 'lucide-react'
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
        <div className="flex items-center gap-2 ml-6">
          <Link
            to="/skills"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-text-secondary hover:bg-bg-input hover:text-text-primary transition-colors"
          >
            <Wand2 size={16} />
            <span>Skills</span>
          </Link>

          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-bg-input text-text-secondary hover:text-text-primary transition-colors"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-bg-input transition-colors"
              >
                {user.user_metadata?.avatar_url ? (
                  <img src={user.user_metadata.avatar_url} alt="" className="w-7 h-7 rounded-full" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-accent-blue/20 flex items-center justify-center text-accent-blue text-xs font-semibold">
                    {(user.email || '?')[0].toUpperCase()}
                  </div>
                )}
                <ChevronDown size={14} className="text-text-muted" />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 py-1 rounded-xl bg-bg-card border border-border-subtle shadow-xl z-50">
                  <div className="px-3 py-2 border-b border-border-subtle">
                    <div className="text-sm font-medium text-text-primary truncate">
                      {user.user_metadata?.full_name || user.email}
                    </div>
                    <div className="text-xs text-text-muted truncate">{user.email}</div>
                  </div>
                  <Link
                    to="/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-white/5 hover:text-text-primary transition-colors"
                  >
                    <Settings size={14} />
                    Settings
                  </Link>
                  <button
                    onClick={() => { setUserMenuOpen(false); signOut() }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-accent-blue hover:bg-accent-blue/90 transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={closePalette} />
      <AiAssistant open={assistantOpen} onClose={closeAssistant} />
    </>
  )
}
