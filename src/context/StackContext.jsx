import { createContext, useContext, useState } from 'react'

const StackContext = createContext()

export function StackProvider({ children }) {
  const [stack, setStack] = useState([])
  const [panelOpen, setPanelOpen] = useState(false)

  const toggleAgent = (agentId) => {
    setStack((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    )
  }

  const removeAgent = (agentId) => {
    setStack((prev) => prev.filter((id) => id !== agentId))
  }

  const clearStack = () => {
    setStack([])
    setPanelOpen(false)
  }

  const addAgents = (agentIds) => {
    setStack((prev) => [...new Set([...prev, ...agentIds])])
  }

  const removeAgents = (agentIds) => {
    setStack((prev) => prev.filter((id) => !agentIds.includes(id)))
  }

  const hasAllAgents = (agentIds) => agentIds.length > 0 && agentIds.every((id) => stack.includes(id))

  const isInStack = (agentId) => stack.includes(agentId)

  return (
    <StackContext.Provider value={{ stack, toggleAgent, removeAgent, addAgents, removeAgents, hasAllAgents, clearStack, isInStack, panelOpen, setPanelOpen }}>
      {children}
    </StackContext.Provider>
  )
}

export function useStack() {
  return useContext(StackContext)
}
