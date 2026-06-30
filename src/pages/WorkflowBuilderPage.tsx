import { useCallback, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  ReactFlowProvider,
} from '@xyflow/react'
import { Copy, Download, Play, Save, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { NodePalette } from '@/components/workflow/NodePalette'
import { NodeConfigDrawer } from '@/components/workflow/NodeConfigDrawer'
import { ExecutionLogPanel } from '@/components/workflow/ExecutionLogPanel'
import { PharmaNode } from '@/components/workflow/PharmaNode'
import { WorkflowStatusBadge } from '@/components/shared/StatusBadge'
import { useWorkflowSimulation } from '@/hooks/useWorkflowSimulation'
import { createPaletteNode, parseWorkflowImport, workflowToExport } from '@/lib/workflow-utils'
import { initialWorkflows } from '@/data/mockData'
import { formatTime } from '@/lib/utils'
import type { PaletteNodeDef, Workflow, WorkflowNode, WorkflowNodeData } from '@/types'

type FlowNode = {
  id: string
  type: string
  position: { x: number; y: number }
  data: WorkflowNodeData
}
const nodeTypes = { pharma: PharmaNode }

function toFlowNodes(nodes: WorkflowNode[]): FlowNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: 'pharma',
    position: n.position,
    data: n.data,
  }))
}

function toFlowEdges(edges: Workflow['edges']): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: e.animated,
    labelStyle: { fontSize: 10 },
  }))
}

function WorkflowBuilderInner() {
  const [workflows, setWorkflows] = useState(initialWorkflows)
  const [activeId, setActiveId] = useState(initialWorkflows[0]?.id ?? '')
  const [lastSaved, setLastSaved] = useState(new Date())
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { running, logs, runTest, clearLogs } = useWorkflowSimulation()

  const workflow = workflows.find((w) => w.id === activeId) ?? workflows[0]

  const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(workflow?.nodes ?? []))
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(workflow?.edges ?? []))

  const syncWorkflow = useCallback(
    (newNodes: FlowNode[], newEdges: Edge[]) => {
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === activeId
            ? {
                ...w,
                nodes: newNodes.map((n) => ({
                  id: n.id,
                  type: 'pharma',
                  position: n.position,
                  data: n.data,
                })),
                edges: newEdges.map((e) => ({
                  id: e.id,
                  source: e.source,
                  target: e.target,
                  label: typeof e.label === 'string' ? e.label : undefined,
                  animated: e.animated,
                })),
              }
            : w,
        ),
      )
    },
    [activeId],
  )

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const next = addEdge({ ...params, animated: false }, eds)
        syncWorkflow(nodes, next)
        return next
      })
    },
    [nodes, setEdges, syncWorkflow],
  )

  const switchWorkflow = (id: string) => {
    const w = workflows.find((wf) => wf.id === id)
    if (!w) return
    setActiveId(id)
    setNodes(toFlowNodes(w.nodes))
    setEdges(toFlowEdges(w.edges))
    setSelectedNodeId(null)
    clearLogs()
  }

  const workflowNodes = workflow?.nodes ?? []
  const selectedNode = workflowNodes.find((n) => n.id === selectedNodeId) ?? null

  const onAddNode = useCallback((def: PaletteNodeDef) => {
    const newNode = createPaletteNode(def.type, def.label, def.category, {
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
    })
    setNodes((nds) => {
      const next = [...nds, { id: newNode.id, type: 'pharma', position: newNode.position, data: newNode.data }]
      syncWorkflow(next, edges)
      return next
    })
    toast.success(`Added ${def.label}`)
  }, [edges, setNodes, syncWorkflow])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const raw = e.dataTransfer.getData('application/pharmaflow-node')
      if (!raw || !reactFlowWrapper.current) return
      const def = JSON.parse(raw) as PaletteNodeDef
      const bounds = reactFlowWrapper.current.getBoundingClientRect()
      onAddNode(def)
      void bounds
    },
    [onAddNode],
  )

  const handleSave = () => {
    syncWorkflow(nodes, edges)
    setLastSaved(new Date())
    toast.success('Workflow saved in memory')
  }

  const handleExport = () => {
    const blob = new Blob([workflowToExport(workflow)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${workflow.name.replace(/\s+/g, '-').toLowerCase()}.json`
    a.click()
    toast.success('Workflow exported')
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const text = await file.text()
      const parsed = parseWorkflowImport(text)
      if (!parsed) {
        toast.error('Invalid workflow JSON')
        return
      }
      setNodes(toFlowNodes(parsed.nodes))
      setEdges(toFlowEdges(parsed.edges))
      syncWorkflow(toFlowNodes(parsed.nodes), toFlowEdges(parsed.edges))
      toast.success('Workflow imported')
    }
    input.click()
  }

  const handleDuplicate = () => {
    const copy: Workflow = {
      ...workflow,
      id: crypto.randomUUID(),
      name: `${workflow.name} (copy)`,
      status: 'draft',
      updatedAt: new Date().toISOString(),
      nodes: workflow.nodes.map((n) => ({ ...n, id: crypto.randomUUID() })),
    }
    setWorkflows((prev) => [...prev, copy])
    toast.success('Workflow duplicated')
  }

  const handleTestRun = async () => {
    const wf = {
      ...workflow,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: 'pharma',
        position: n.position,
        data: n.data as WorkflowNode['data'],
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: typeof e.label === 'string' ? e.label : undefined,
      })),
    }
    await runTest(
      wf,
      (updater) => {
        setNodes((nds) => {
          const updated = updater(
            nds.map((n) => ({
              id: n.id,
              type: 'pharma',
              position: n.position,
              data: n.data as WorkflowNode['data'],
            })),
          )
          return updated.map((n) => ({
            id: n.id,
            type: 'pharma',
            position: n.position,
            data: n.data,
          }))
        })
      },
      (updater) => {
        setEdges((eds) => {
          const updated = updater(
            eds.map((e) => ({
              id: e.id,
              source: e.source,
              target: e.target,
              label: typeof e.label === 'string' ? e.label : undefined,
              animated: e.animated,
            })),
          )
          return updated.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            label: e.label,
            animated: e.animated,
          }))
        })
      },
    )
    toast.success('Test workflow completed')
  }

  if (!workflow) {
    return (
      <div className="-m-4 flex h-[calc(100vh-3.5rem-8rem)] flex-col items-center justify-center gap-3 text-sm text-muted-foreground lg:-m-6">
        <p className="font-medium">No workflow loaded</p>
        <p>Drag nodes from the left palette, or use <strong>Import</strong> to load a saved workflow JSON.</p>
      </div>
    )
  }

  return (
    <div className="-m-4 flex h-[calc(100vh-3.5rem-8rem)] flex-col lg:-m-6">
      <div className="px-4 pt-2">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2">
          <Select value={activeId} onValueChange={switchWorkflow}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {workflows.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <WorkflowStatusBadge status={workflow.status} />
          <span className="text-xs text-muted-foreground">
            Last saved {formatTime(lastSaved.toISOString())}
          </span>
          <div className="ml-auto flex flex-wrap gap-1">
            <Button variant="outline" size="sm" onClick={handleSave}>
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
            <Button variant="outline" size="sm" onClick={handleDuplicate}>
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={handleImport}>
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
            <Button size="sm" onClick={handleTestRun} disabled={running}>
              <Play className="h-3.5 w-3.5" /> Run Test Workflow
            </Button>
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <NodePalette onAdd={onAddNode} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            ref={reactFlowWrapper}
            className="flex-1"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={(ch) => {
                onNodesChange(ch)
                setNodes((nds) => {
                  syncWorkflow(nds, edges)
                  return nds
                })
              }}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, n) => setSelectedNodeId(n.id)}
              onPaneClick={() => setSelectedNodeId(null)}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.2}
              maxZoom={1.5}
              deleteKeyCode={['Backspace', 'Delete']}
            >
              <Background gap={16} size={1} />
              <Controls />
              <MiniMap
                nodeColor={(n) => {
                  const cat = (n.data as WorkflowNode['data']).category
                  return cat === 'trigger' ? '#0891b2' : '#0d9488'
                }}
                maskColor="rgba(0,0,0,0.08)"
              />
            </ReactFlow>
          </div>
          <ExecutionLogPanel logs={logs} />
        </div>
        <NodeConfigDrawer
          node={selectedNode}
          onClose={() => setSelectedNodeId(null)}
          onUpdate={(nodeId, config) => {
            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId ? { ...n, data: { ...(n.data as WorkflowNode['data']), config } } : n,
              ),
            )
          }}
        />
      </div>
    </div>
  )
}

export function WorkflowBuilderPage() {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderInner />
    </ReactFlowProvider>
  )
}
