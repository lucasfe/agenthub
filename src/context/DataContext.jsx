import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { fetchAgents, fetchTeams } from '../lib/api'

const DataContext = createContext()

export function DataProvider({ children }) {
  const [agents, setAgents] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const results = await Promise.allSettled([
      fetchAgents(),
      fetchTeams(),
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

  return (
    <DataContext.Provider value={{ agents, teams, loading, error, refreshAgents, refreshTeams }}>
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  return useContext(DataContext)
}
