import { createContext, useContext, useState } from 'react'
import { useData } from './DataContext'

const StackContext = createContext()

export function StackProvider({ children }) {
  const [stack, setStack] = useState([])
  const [panelOpen, setPanelOpen] = useState(false)
  // DataContext is optional in tests that render StackProvider in isolation,
  // so guard against an undefined context.
  const data = useData()
  const bumpAgentUsage = data?.bumpAgentUsage

  const toggleAgent = (agentId) => {
    setStack((prev) => {
      if (prev.includes(agentId)) return prev.filter((id) => id !== agentId)
      bumpAgentUsage?.(agentId, 'cart_add')
      return [...prev, agentId]
    })
  }

  const removeAgent = (agentId) => {
    setStack((prev) => prev.filter((id) => id !== agentId))
  }

  const clearStack = () => {
    setStack([])
    setPanelOpen(false)
  }

  const addAgents = (agentIds) => {
    setStack((prev) => {
      const existing = new Set(prev)
      const added = agentIds.filter((id) => !existing.has(id))
      added.forEach((id) => bumpAgentUsage?.(id, 'cart_add'))
      return [...prev, ...added]
    })
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
