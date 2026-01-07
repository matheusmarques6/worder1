'use client';

import { create } from 'zustand';
import { Node, Edge, NodeChange, EdgeChange, applyNodeChanges, applyEdgeChanges, Connection, addEdge } from '@xyflow/react';

// ============================================
// TYPES
// ============================================

export type NodeCategory = 'trigger' | 'action' | 'condition' | 'control';

export type NodeStatus = 'idle' | 'running' | 'success' | 'error' | 'warning' | 'skipped';

export interface FlowNodeData {
  label: string;
  description?: string;
  category: NodeCategory;
  nodeType: string;
  config: Record<string, any>;
  status?: NodeStatus;
  statusMessage?: string;
  executionTime?: number;
  [key: string]: unknown; // Index signature for React Flow compatibility
}

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge;

export interface ExecutionStep {
  nodeId: string;
  status: NodeStatus;
  startedAt?: Date;
  completedAt?: Date;
  output?: any;
  error?: string;
}

export interface TestExecution {
  isRunning: boolean;
  steps: ExecutionStep[];
  contact?: any;
  totalDuration?: number;
  success?: boolean;
}

// ============================================
// STORE
// ============================================

interface FlowStore {
  // Flow data
  nodes: FlowNode[];
  edges: FlowEdge[];
  
  // Selection
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  
  // Automation metadata
  automationId: string | null;
  automationName: string;
  automationStatus: 'draft' | 'active' | 'paused';
  
  // UI state
  isSaving: boolean;
  isDirty: boolean;
  showPropertiesPanel: boolean;
  showHistoryPanel: boolean;
  showTestModal: boolean;
  
  // Test execution
  testExecution: TestExecution;
  
  // Actions - Nodes
  setNodes: (nodes: FlowNode[]) => void;
  addNode: (node: FlowNode) => void;
  updateNode: (nodeId: string, data: Partial<FlowNodeData>) => void;
  removeNode: (nodeId: string) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  
  // Actions - Edges
  setEdges: (edges: FlowEdge[]) => void;
  addEdge: (edge: FlowEdge) => void;
  removeEdge: (edgeId: string) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  
  // Actions - Selection
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  
  // Actions - Metadata
  setAutomationId: (id: string | null) => void;
  setAutomationName: (name: string) => void;
  setAutomationStatus: (status: 'draft' | 'active' | 'paused') => void;
  
  // Actions - UI
  setSaving: (saving: boolean) => void;
  setDirty: (dirty: boolean) => void;
  togglePropertiesPanel: () => void;
  toggleHistoryPanel: () => void;
  toggleTestModal: () => void;
  
  // Actions - Execution
  setTestExecution: (execution: Partial<TestExecution>) => void;
  updateNodeStatus: (nodeId: string, status: NodeStatus, message?: string, time?: number) => void;
  resetNodeStatuses: () => void;
  
  // Actions - Bulk
  loadAutomation: (data: {
    id: string;
    name: string;
    status: 'draft' | 'active' | 'paused';
    nodes: FlowNode[];
    edges: FlowEdge[];
  }) => void;
  resetStore: () => void;
}

const initialState = {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  automationId: null,
  automationName: 'Nova Automação',
  automationStatus: 'draft' as const,
  isSaving: false,
  isDirty: false,
  showPropertiesPanel: true,
  showHistoryPanel: false,
  showTestModal: false,
  testExecution: {
    isRunning: false,
    steps: [],
  },
};

export const useFlowStore = create<FlowStore>((set, get) => ({
  ...initialState,

  // ============================================
  // NODES
  // ============================================
  
  setNodes: (nodes) => set({ nodes, isDirty: true }),
  
  addNode: (node) => set((state) => ({ 
    nodes: [...state.nodes, node],
    isDirty: true,
    selectedNodeId: node.id,
  })),
  
  updateNode: (nodeId, data) => set((state) => ({
    nodes: state.nodes.map((node) =>
      node.id === nodeId
        ? { ...node, data: { ...node.data, ...data } }
        : node
    ),
    isDirty: true,
  })),
  
  removeNode: (nodeId) => set((state) => ({
    nodes: state.nodes.filter((n) => n.id !== nodeId),
    edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
    isDirty: true,
  })),
  
  onNodesChange: (changes) => set((state) => ({
    nodes: applyNodeChanges(changes, state.nodes) as FlowNode[],
    isDirty: true,
  })),

  // ============================================
  // EDGES
  // ============================================
  
  setEdges: (edges) => set({ edges, isDirty: true }),
  
  addEdge: (edge) => set((state) => ({
    edges: [...state.edges, edge],
    isDirty: true,
  })),
  
  removeEdge: (edgeId) => set((state) => ({
    edges: state.edges.filter((e) => e.id !== edgeId),
    selectedEdgeId: state.selectedEdgeId === edgeId ? null : state.selectedEdgeId,
    isDirty: true,
  })),
  
  onEdgesChange: (changes) => set((state) => ({
    edges: applyEdgeChanges(changes, state.edges),
    isDirty: true,
  })),
  
  onConnect: (connection) => set((state) => {
    // Validate connection
    if (!connection.source || !connection.target) return state;
    if (connection.source === connection.target) return state;
    
    // Check if target is a trigger (triggers can't receive connections)
    const targetNode = state.nodes.find((n) => n.id === connection.target);
    if (targetNode?.data.category === 'trigger') return state;
    
    // Check if connection already exists
    const exists = state.edges.some(
      (e) => e.source === connection.source && e.target === connection.target
    );
    if (exists) return state;
    
    const newEdge: FlowEdge = {
      id: `edge-${Date.now()}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle ?? undefined,
      targetHandle: connection.targetHandle ?? undefined,
      type: 'smoothstep',
    };
    
    return {
      edges: [...state.edges, newEdge],
      isDirty: true,
    };
  }),

  // ============================================
  // SELECTION
  // ============================================
  
  selectNode: (nodeId) => set({ 
    selectedNodeId: nodeId,
    selectedEdgeId: null,
    showPropertiesPanel: nodeId !== null,
  }),
  
  selectEdge: (edgeId) => set({ 
    selectedEdgeId: edgeId,
    selectedNodeId: null,
  }),

  // ============================================
  // METADATA
  // ============================================
  
  setAutomationId: (id) => set({ automationId: id }),
  setAutomationName: (name) => set({ automationName: name, isDirty: true }),
  setAutomationStatus: (status) => set({ automationStatus: status, isDirty: true }),

  // ============================================
  // UI STATE
  // ============================================
  
  setSaving: (saving) => set({ isSaving: saving }),
  setDirty: (dirty) => set({ isDirty: dirty }),
  togglePropertiesPanel: () => set((state) => ({ showPropertiesPanel: !state.showPropertiesPanel })),
  toggleHistoryPanel: () => set((state) => ({ showHistoryPanel: !state.showHistoryPanel })),
  toggleTestModal: () => set((state) => ({ showTestModal: !state.showTestModal })),

  // ============================================
  // EXECUTION
  // ============================================
  
  setTestExecution: (execution) => set((state) => ({
    testExecution: { ...state.testExecution, ...execution },
  })),
  
  updateNodeStatus: (nodeId, status, message, time) => set((state) => ({
    nodes: state.nodes.map((node) =>
      node.id === nodeId
        ? { 
            ...node, 
            data: { 
              ...node.data, 
              status,
              statusMessage: message,
              executionTime: time,
            } 
          }
        : node
    ),
  })),
  
  resetNodeStatuses: () => set((state) => ({
    nodes: state.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        status: undefined,
        statusMessage: undefined,
        executionTime: undefined,
      },
    })),
    testExecution: { isRunning: false, steps: [] },
  })),

  // ============================================
  // BULK OPERATIONS
  // ============================================
  
  loadAutomation: (data) => set({
    automationId: data.id,
    automationName: data.name,
    automationStatus: data.status,
    nodes: data.nodes,
    edges: data.edges,
    isDirty: false,
    selectedNodeId: null,
    selectedEdgeId: null,
  }),
  
  resetStore: () => set(initialState),
}));

// ============================================
// SELECTORS
// ============================================

export const useSelectedNode = () => {
  const nodes = useFlowStore((state) => state.nodes);
  const selectedNodeId = useFlowStore((state) => state.selectedNodeId);
  return nodes.find((n) => n.id === selectedNodeId) || null;
};

export const useNodeById = (nodeId: string) => {
  const nodes = useFlowStore((state) => state.nodes);
  return nodes.find((n) => n.id === nodeId) || null;
};

export const useTriggerNodes = () => {
  const nodes = useFlowStore((state) => state.nodes);
  return nodes.filter((n) => n.data.category === 'trigger');
};

export const useIsValidFlow = () => {
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  
  // Must have at least one trigger
  const hasTrigger = nodes.some((n) => n.data.category === 'trigger');
  if (!hasTrigger) return { valid: false, error: 'Adicione um gatilho para iniciar a automação' };
  
  // Must have at least one action
  const hasAction = nodes.some((n) => n.data.category === 'action');
  if (!hasAction) return { valid: false, error: 'Adicione pelo menos uma ação' };
  
  // All nodes (except triggers) must be connected
  const connectedNodeIds = new Set([
    ...edges.map((e) => e.source),
    ...edges.map((e) => e.target),
  ]);
  
  for (const node of nodes) {
    if (node.data.category !== 'trigger' && !connectedNodeIds.has(node.id)) {
      return { valid: false, error: `O nó "${node.data.label}" não está conectado ao fluxo` };
    }
  }
  
  return { valid: true, error: null };
};
