import { useCallback, useState } from 'react'
import type { NodeExecutionState, Workflow, WorkflowEdge, WorkflowNode } from '@/types'

export interface ExecutionLogEntry {
  id: string
  timestamp: string
  message: string
  level: 'info' | 'success' | 'warning' | 'error'
}

function topologicalOrder(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
  const ids = nodes.map((n) => n.id)
  const incoming = new Map(ids.map((id) => [id, 0]))
  const adj = new Map(ids.map((id) => [id, [] as string[]]))
  edges.forEach((e) => {
    if (!adj.has(e.source) || !incoming.has(e.target)) return
    adj.get(e.source)!.push(e.target)
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1)
  })
  const queue = ids.filter((id) => incoming.get(id) === 0)
  const order: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    for (const next of adj.get(id) ?? []) {
      incoming.set(next, (incoming.get(next) ?? 1) - 1)
      if (incoming.get(next) === 0) queue.push(next)
    }
  }
  return order.length ? order : ids
}

export function useWorkflowSimulation() {
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<ExecutionLogEntry[]>([])
  const [activeEdgeIds, setActiveEdgeIds] = useState<string[]>([])

  const runTest = useCallback(
    async (
      workflow: Workflow,
      onUpdateNodes: (updater: (nodes: WorkflowNode[]) => WorkflowNode[]) => void,
      onUpdateEdges: (updater: (edges: WorkflowEdge[]) => WorkflowEdge[]) => void,
    ) => {
      if (running) return
      setRunning(true)
      setLogs([])
      const order = topologicalOrder(workflow.nodes, workflow.edges)
      const addLog = (message: string, level: ExecutionLogEntry['level'] = 'info') => {
        setLogs((prev) => [
          ...prev,
          { id: crypto.randomUUID(), timestamp: new Date().toISOString(), message, level },
        ])
      }

      onUpdateNodes((nodes) =>
        nodes.map((n) => ({ ...n, data: { ...n.data, executionState: 'idle' as NodeExecutionState } })),
      )
      onUpdateEdges((edges) => edges.map((e) => ({ ...e, animated: false })))

      addLog(`Starting test run: ${workflow.name}`)

      for (let i = 0; i < order.length; i++) {
        const nodeId = order[i]!
        const node = workflow.nodes.find((n) => n.id === nodeId)
        if (!node) continue

        const incomingEdges = workflow.edges.filter((e) => e.target === nodeId)
        setActiveEdgeIds(incomingEdges.map((e) => e.id))
        onUpdateEdges((edges) =>
          edges.map((e) => ({ ...e, animated: incomingEdges.some((ie) => ie.id === e.id) })),
        )

        onUpdateNodes((nodes) =>
          nodes.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, executionState: 'running' as NodeExecutionState } }
              : n,
          ),
        )
        addLog(`Executing: ${node.data.label}`)

        await new Promise((r) => setTimeout(r, 600 + Math.random() * 400))

        const isEscalation = node.data.nodeType === 'Human Escalation'
        const failChance = node.data.category === 'action' && Math.random() < 0.08
        const state: NodeExecutionState = failChance
          ? 'failed'
          : isEscalation
            ? 'escalated'
            : 'success'

        onUpdateNodes((nodes) =>
          nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, executionState: state } } : n)),
        )

        if (state === 'failed') {
          addLog(`${node.data.label} failed — PMS timeout (simulated)`, 'error')
          setRunning(false)
          onUpdateEdges((edges) => edges.map((e) => ({ ...e, animated: false })))
          return
        }
        if (state === 'escalated') {
          addLog(`${node.data.label}: routed to Clinical Triage`, 'warning')
        } else {
          addLog(`${node.data.label} completed`, 'success')
        }
      }

      addLog('Workflow test completed successfully', 'success')
      setActiveEdgeIds([])
      onUpdateEdges((edges) => edges.map((e) => ({ ...e, animated: false })))
      setRunning(false)
    },
    [running],
  )

  return { running, logs, activeEdgeIds, runTest, clearLogs: () => setLogs([]) }
}
