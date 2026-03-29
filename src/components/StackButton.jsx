import { useState } from 'react'
import JSZip from 'jszip'
import * as Icons from 'lucide-react'
import { useStack } from '../context/StackContext'
import agentsData from '../data/agents.json'
import agentContent from '../data/agentContent'

export default function StackButton() {
  const { stack, removeAgent, clearStack, panelOpen, setPanelOpen } = useStack()
  const [copied, setCopied] = useState(false)

  const stackAgents = stack
    .map((id) => agentsData.find((a) => a.id === id))
    .filter(Boolean)

  const handleDownload = async () => {
    const zip = new JSZip()
    stackAgents.forEach((agent) => {
      const content = agentContent[agent.id] || agent.description
      zip.file(`${agent.id}.md`, content)
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'lucas-aihub-stack.zip'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (stack.length === 0) return null

  return (
    <>
      {/* Backdrop */}
      {panelOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={() => setPanelOpen(false)}
        />
      )}

      {/* Side panel */}
      <div
        className={`fixed top-0 right-0 h-full w-96 bg-bg-sidebar border-l border-border-subtle z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          panelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-blue/15 flex items-center justify-center">
              <Icons.Layers size={20} className="text-accent-blue" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">Stack Builder</h2>
              <p className="text-xs text-text-muted">{stack.length} component{stack.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearStack}
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              Clear All
            </button>
            <button
              onClick={() => setPanelOpen(false)}
              className="p-1 text-text-muted hover:text-text-primary transition-colors"
            >
              <Icons.X size={18} />
            </button>
          </div>
        </div>

        {/* Agents section */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Icons.Bot size={16} className="text-text-muted" />
              <span className="text-sm font-semibold text-text-primary">Agents</span>
            </div>
            <span className="text-xs text-text-muted bg-white/5 px-2 py-0.5 rounded-full font-mono">
              {stack.length}
            </span>
          </div>

          <div className="space-y-1">
            {stackAgents.map((agent) => {
              const Ic = Icons[agent.icon] || Icons.Bot
              return (
                <div
                  key={agent.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 group transition-colors"
                >
                  <Ic size={16} className="text-text-muted shrink-0" />
                  <span className="text-sm text-text-secondary flex-1 truncate">{agent.name}</span>
                  <button
                    onClick={() => removeAgent(agent.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-text-primary transition-all"
                  >
                    <Icons.X size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border-subtle flex items-center gap-2.5">
          <button
            onClick={() => {
              const text = stackAgents.map((a) => a.name).join(', ')
              navigator.clipboard.writeText(text)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-600 text-white text-sm font-medium rounded-xl hover:bg-amber-600/90 transition-colors"
          >
            {copied ? (
              <>
                <Icons.Check size={16} />
                Copied!
              </>
            ) : (
              <>
                <Icons.Copy size={16} />
                Copy to Clipboard
              </>
            )}
          </button>
          <button
            onClick={handleDownload}
            className="w-10 h-10 shrink-0 flex items-center justify-center bg-accent-purple/15 text-accent-purple border border-accent-purple/20 rounded-xl hover:bg-accent-purple/25 transition-colors"
            title="Download as ZIP"
          >
            <Icons.Download size={18} />
          </button>
        </div>
      </div>

      {/* Floating button */}
      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3 bg-accent-blue text-white text-sm font-medium rounded-2xl shadow-lg shadow-accent-blue/25 hover:bg-accent-blue/90 transition-all hover:scale-105 active:scale-95"
        >
          <Icons.Layers size={18} />
          Stack
          <span className="min-w-[22px] h-[22px] flex items-center justify-center bg-white/20 text-white text-xs font-bold rounded-full px-1.5">
            {stack.length}
          </span>
        </button>
      )}
    </>
  )
}
