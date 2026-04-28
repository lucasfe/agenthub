import { useState, useMemo } from 'react'
import { Routes, Route } from 'react-router'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import HeroSection from './components/HeroSection'
import SearchFilterBar from './components/SearchFilterBar'
import AgentCard from './components/AgentCard'
import AgentDetailPage from './components/AgentDetailPage'
import CreateAgentPage from './components/CreateAgentPage'
import TeamCard from './components/TeamCard'
import TeamDetailPage from './components/TeamDetailPage'
import CreateTeamPage from './components/CreateTeamPage'
import SettingsPage from './components/SettingsPage'
import LoginPage from './components/LoginPage'
import BoardPage from './components/BoardPage'
import SkillsPage from './components/SkillsPage'
import RequireAuth from './components/RequireAuth'
import StackButton from './components/StackButton'
import { StackProvider } from './context/StackContext'
import { useData } from './context/DataContext'

function AgentListPage() {
  const { agents, loading, error } = useData()
  const [searchQuery, setSearchQuery] = useState('')
  const [category, setCategory] = useState('All categories')
  const [sortBy, setSortBy] = useState('Most Popular')
  const [viewMode, setViewMode] = useState('grid')

  const filteredAgents = useMemo(() => {
    let results = [...agents]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      results = results.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          (a.tags || []).some((t) => t.toLowerCase().includes(q))
      )
    }

    if (category !== 'All categories') {
      results = results.filter((a) => a.category === category)
    }

    switch (sortBy) {
      case 'Most Popular':
        results.sort((a, b) => b.popularity - a.popularity)
        break
      case 'A-Z':
        results.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'Z-A':
        results.sort((a, b) => b.name.localeCompare(a.name))
        break
      case 'Newest':
        results.reverse()
        break
    }

    return results
  }, [agents, searchQuery, category, sortBy])

  if (loading) return <div className="p-8 text-text-muted">Loading agents...</div>

  if (error && agents.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <p className="text-text-muted text-lg">Failed to load agents</p>
          <p className="text-text-muted/60 text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <Header />
      <HeroSection />
      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        category={category}
        onCategoryChange={setCategory}
        sortBy={sortBy}
        onSortChange={setSortBy}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        totalCount={filteredAgents.length}
      />
      <div className="px-8 pb-12">
        {filteredAgents.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-text-muted text-lg">No agents found</p>
            <p className="text-text-muted/60 text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} viewMode="grid" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} viewMode="list" />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function TeamsListPage() {
  const { teams, loading, error } = useData()
  const [searchQuery, setSearchQuery] = useState('')

  const filteredTeams = useMemo(() => {
    if (!searchQuery.trim()) return teams
    const q = searchQuery.toLowerCase()
    return teams.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    )
  }, [teams, searchQuery])

  if (loading) return <div className="p-8 text-text-muted">Loading teams...</div>

  if (error && teams.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <p className="text-text-muted text-lg">Failed to load teams</p>
          <p className="text-text-muted/60 text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <Header />
      <HeroSection variant="teams" />
      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalCount={filteredTeams.length}
        variant="teams"
      />
      <div className="px-8 pb-12">
        {filteredTeams.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-text-muted text-lg">No teams found</p>
            <p className="text-text-muted/60 text-sm mt-1">Try adjusting your search</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTeams.map((team) => (
              <TeamCard key={team.id} team={team} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function ProtectedShell() {
  return (
    <StackProvider>
      <div className="flex min-h-screen bg-bg-primary">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-y-auto">
          <Routes>
            <Route path="/" element={<AgentListPage />} />
            <Route path="/agent/:category/:agentId" element={<AgentDetailPage />} />
            <Route path="/create" element={<CreateAgentPage />} />
            <Route path="/teams" element={<TeamsListPage />} />
            <Route path="/teams/:teamId" element={<TeamDetailPage />} />
            <Route path="/teams/create" element={<CreateTeamPage />} />
            <Route path="/teams/:teamId/edit" element={<CreateTeamPage />} />
            <Route path="/board" element={<BoardPage />} />
            <Route path="/skills" element={<SkillsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
        <StackButton />
      </div>
    </StackProvider>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <ProtectedShell />
          </RequireAuth>
        }
      />
    </Routes>
  )
}
