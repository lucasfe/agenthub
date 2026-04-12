import { useState } from 'react'
import { Bot, Users, LogIn, LogOut, Settings, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'

export default function Sidebar() {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const { agents, teams } = useData()
  const { user, signOut } = useAuth()

  const browseItems = [
    { icon: Bot, label: 'Agents', count: agents.length, path: '/' },
    { icon: Users, label: 'Teams', count: teams.length, path: '/teams' },
  ]

  return (
    <aside className={`${collapsed ? 'w-[68px]' : 'w-56'} min-h-screen bg-bg-sidebar border-r border-border-subtle flex flex-col shrink-0 transition-all duration-200`}>
      {/* Logo + collapse toggle */}
      <div className={`flex items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-5'} py-5`}>
        <Link to="/" className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-lg bg-accent-blue flex items-center justify-center shrink-0">
            <Bot size={18} className="text-white" />
          </div>
          {!collapsed && (
            <span className="text-text-primary font-semibold text-base tracking-tight">Lucas AI Hub</span>
          )}
        </Link>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 text-text-muted hover:text-text-primary transition-colors rounded-md hover:bg-white/5"
          >
            <ChevronsLeft size={16} />
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <div className="flex justify-center mb-2">
          <button
            onClick={() => setCollapsed(false)}
            className="p-1.5 text-text-muted hover:text-text-primary transition-colors rounded-md hover:bg-white/5"
          >
            <ChevronsRight size={16} />
          </button>
        </div>
      )}

      {/* Browse Section */}
      <div className={`${collapsed ? 'px-2' : 'px-4'} mt-2`}>
        {!collapsed && (
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted px-2 mb-2">Browse</p>
        )}
        <nav className="flex flex-col gap-0.5">
          {browseItems.map((item) => {
            const isActive = item.path === '/'
              ? location.pathname === '/' || location.pathname.startsWith('/agent') || location.pathname === '/create'
              : location.pathname.startsWith(item.path)
            return (
              <Link
                key={item.label}
                to={item.path}
                title={collapsed ? item.label : undefined}
                className={`flex items-center ${collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2'} rounded-lg text-sm transition-all duration-150 group ${
                  isActive
                    ? 'bg-accent-blue/10 text-accent-blue font-medium'
                    : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
                }`}
              >
                <item.icon size={18} className={isActive ? 'text-accent-blue' : 'text-text-muted group-hover:text-text-secondary'} />
                {!collapsed && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    {item.count && (
                      <span className={`text-xs font-mono ${isActive ? 'text-accent-blue/70' : 'text-text-muted'}`}>
                        {item.count}
                      </span>
                    )}
                  </>
                )}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Sign In */}
      <div className={`mt-auto ${collapsed ? 'px-2' : 'px-4'} pb-5`}>
        <a
          href="#"
          title={collapsed ? 'Sign In' : undefined}
          className={`flex items-center ${collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2'} rounded-lg text-sm text-text-secondary hover:bg-white/5 hover:text-text-primary transition-all duration-150`}
        >
          <LogIn size={18} className="text-text-muted" />
          {!collapsed && <span>Sign In</span>}
        </a>
      </div>
    </aside>
  )
}
