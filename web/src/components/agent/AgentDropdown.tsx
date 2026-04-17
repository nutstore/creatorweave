/**
 * AgentDropdown — active agent selector with create/delete actions.
 */

import { useEffect, useState } from 'react'
import { Check, ChevronDown, Plus, Trash2 } from 'lucide-react'
import type { AgentMeta } from '@/opfs'

interface AgentDropdownProps {
  allAgents: AgentMeta[]
  activeAgentId: string | null
  setActiveAgent: (agentId: string) => void | Promise<void>
  createAgent: (agentId: string) => Promise<{ id: string } | null>
  deleteAgent: (agentId: string) => Promise<boolean>
}

export function AgentDropdown({
  allAgents,
  activeAgentId,
  setActiveAgent,
  createAgent,
  deleteAgent,
}: AgentDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isCreatingAgent, setIsCreatingAgent] = useState(false)
  const [newAgentId, setNewAgentId] = useState('')

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.agent-dropdown-container')) {
        setIsOpen(false)
        setIsCreatingAgent(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleCreateAgent = async () => {
    const id = newAgentId.trim()
    if (!id) return
    const created = await createAgent(id)
    if (!created) return
    await setActiveAgent(created.id)
    setNewAgentId('')
    setIsCreatingAgent(false)
  }

  const handleDeleteAgent = async (agentId: string) => {
    if (agentId === 'default') return
    if (!window.confirm(`Delete agent "${agentId}"?`)) return
    await deleteAgent(agentId)
  }

  return (
    <div className="agent-dropdown-container relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-700"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${activeAgentId ? 'bg-emerald-500' : 'bg-neutral-400'}`}
        />
        <span className="max-w-[120px] truncate">@{activeAgentId || 'default'}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-52 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <div className="max-h-48 overflow-y-auto py-1">
            {allAgents.map((agent) => {
              const isActive = activeAgentId === agent.id
              return (
                <div
                  key={agent.id}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <button
                    type="button"
                    onClick={() => {
                      void setActiveAgent(agent.id)
                      setIsOpen(false)
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span
                      className={`font-medium ${isActive ? 'dark:text-primary-400 text-primary-600' : 'text-neutral-700 dark:text-neutral-300'}`}
                    >
                      @{agent.id}
                    </span>
                  </button>
                  <div className="ml-2 flex items-center gap-1">
                    {isActive && <Check className="h-3 w-3 text-primary-500" />}
                    {agent.id !== 'default' && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteAgent(agent.id)}
                        className="rounded p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-red-500 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-red-400"
                        title={`Delete ${agent.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="border-t border-neutral-200 p-2 dark:border-neutral-700">
            {isCreatingAgent ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={newAgentId}
                  onChange={(e) => setNewAgentId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleCreateAgent()
                    } else if (e.key === 'Escape') {
                      setIsCreatingAgent(false)
                      setNewAgentId('')
                    }
                  }}
                  placeholder="agent-id"
                  autoFocus
                  className="h-7 flex-1 rounded border border-neutral-300 bg-white px-2 text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                />
                <button
                  type="button"
                  onClick={() => void handleCreateAgent()}
                  disabled={!newAgentId.trim()}
                  className="rounded bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-700 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsCreatingAgent(true)}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                <Plus className="h-3 w-3" />
                New agent
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
