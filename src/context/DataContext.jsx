import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { fetchAgents, fetchTeams, fetchTools, trackAgentUsage } from '../lib/api'

const DataContext = createContext()

export function DataProvider({ children }) {
  const [agents, setAgents] = useState([])
  const [teams, setTeams] = useState([])
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const results = await Promise.allSettled([
      fetchAgents(),
      fetchTeams(),
      fetchTools(),
    ])

    if (results[0].status === 'fulfilled') {
      setAgents(results[0].value)
    } else {
      console.error('Failed to load agents:', results[0].reason)
    }

    if (results[1].status === 'fulfilled') {
      setTeams(results[1].value)
    } else {
      console.error('Failed to load teams:', results[1].reason)
    }

    if (results[2].status === 'fulfilled') {
      setTools(results[2].value)
    } else {
      console.error('Failed to load tools:', results[2].reason)
    }

    const errors = results.filter(r => r.status === 'rejected').map(r => r.reason.message)
    setError(errors.length ? errors.join('; ') : null)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const refreshAgents = async () => {
    try {
      const data = await fetchAgents()
      setAgents(data)
    } catch (err) {
      console.error('Failed to refresh agents:', err)
    }
  }

  const refreshTeams = async () => {
    try {
      const data = await fetchTeams()
      setTeams(data)
    } catch (err) {
      console.error('Failed to refresh teams:', err)
    }
  }

  const refreshTools = async () => {
    try {
      const data = await fetchTools()
      setTools(data)
    } catch (err) {
      console.error('Failed to refresh tools:', err)
    }
  }

  // Optimistically bump the local counter and fire-and-forget the RPC. We
  // don't refetch on the response: a refetch would race with rapid sequential
  // bumps (e.g. adding several agents to the cart in a row) and re-order the
  // list. The optimistic update keeps the UI in sync with the user's actions
  // and matches what the next full reload will show.
  const bumpAgentUsage = useCallback((agentId, event) => {
    if (!agentId) return
    setAgents((prev) =>
      prev.map((a) =>
        a.id === agentId
          ? { ...a, usage_count: (a.usage_count ?? 0) + 1 }
          : a,
      ),
    )
    trackAgentUsage(agentId, event)
  }, [])

  return (
    <DataContext.Provider value={{ agents, teams, tools, loading, error, refreshAgents, refreshTeams, refreshTools, bumpAgentUsage }}>
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  return useContext(DataContext)
}
