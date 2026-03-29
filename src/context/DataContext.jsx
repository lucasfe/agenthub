import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { fetchAgents, fetchTeams } from '../lib/api'

const DataContext = createContext()

export function DataProvider({ children }) {
  const [agents, setAgents] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [agentsData, teamsData] = await Promise.all([
        fetchAgents(),
        fetchTeams(),
      ])
      setAgents(agentsData)
      setTeams(teamsData)
      setError(null)
    } catch (err) {
      console.error('Failed to load data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const refreshAgents = async () => {
    const data = await fetchAgents()
    setAgents(data)
  }

  const refreshTeams = async () => {
    const data = await fetchTeams()
    setTeams(data)
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
