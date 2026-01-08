'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { 
  Node, 
  Edge, 
  NodeChange, 
  EdgeChange, 
  Connection,
  applyNodeChanges, 
  applyEdgeChanges
} from '@xyflow/react';

// ============================================
// TYPES
// ============================================

export type NodeCategory = 'trigger' | 'action' | 'condition' | 'control' | 'transform';

export type NodeStatus = 'idle' | 'running' | 'success' | 'error' | 'warning' | 'skipped';

export interface FlowNodeData {
  // Identifiers
  label: string;
  description?: string;
  category: NodeCategory;
  nodeType: string;
  
  // Appearance
  icon?: string;
  color?: string;
  
  // Configuration
  config: Record<string, any>;
  credentialId?: string;
  
  // Execution status
  status?: NodeStatus;
  statusMessage?: string;
  executionTime?: number;
  
  // Metadata
  disabled?: boolean;
  notes?: string;
  
  // For React Flow compatibility
  [key: string]: unknown;
}

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge;

export interface ExecutionStep {
  nodeId: string;
  nodeName: string;
  status: NodeStatus;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  input?: any;
  output?: any;
  error?: string;
}

export interface TestExecution {
  isRunning: boolean;
  executionId?: string;
  steps: ExecutionStep[];
  triggerData?: any;
  totalDuration?: number;
  success?: boolean;
  error?: string;
}

interface HistoryEntry {
  nodes: FlowNode[];
  edges: FlowEdge[];
  timestamp: number;
}

// ============================================
// STORE INTERFACE
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
  automationDescription: string;
  automationStatus: 'draft' | 'active' | 'paused' | 'error';
  
  // History (undo/redo)
  past: HistoryEntry[];
  future: HistoryEntry[];
  
  // UI state
  isSaving: boolean;
  isDirty: boolean;
  lastSavedAt: Date | null;
  showPropertiesPanel: boolean;
  showHistoryPanel: boolean;
  showTestModal: boolean;
  showCredentialsModal: boolean;
  
  // Test execution
  testExecution: TestExecution;
  
  // ============================================
  // ACTIONS - Nodes
  // ============================================
  setNodes: (nodes: FlowNode[]) => void;
  addNode: (node: FlowNode) => void;
  updateNode: (nodeId: string, data: Partial<FlowNodeData>) => void;
  updateNodeConfig: (nodeId: string, config: Record<string, any>) => void;
  removeNode: (nodeId: string) => void;
  duplicateNode: (nodeId: string) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  
  // ============================================
  // ACTIONS - Edges
  // ============================================
  setEdges: (edges: FlowEdge[]) => void;
  addEdge: (edge: FlowEdge) => void;
  removeEdge: (edgeId: string) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  
  // ============================================
  // ACTIONS - Selection
  // ============================================
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  clearSelection: () => void;
  
  // ============================================
  // ACTIONS - History (Undo/Redo)
  // ============================================
  saveToHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  
  // ============================================
  // ACTIONS - Metadata
  // ============================================
  setAutomationId: (id: string | null) => void;
  setAutomationName: (name: string) => void;
  setAutomationDescription: (description: string) => void;
  setAutomationStatus: (status: 'draft' | 'active' | 'paused' | 'error') => void;
  
  // ============================================
  // ACTIONS - UI
  // ============================================
  setSaving: (saving: boolean) => void;
  setDirty: (dirty: boolean) => void;
  markSaved: () => void;
  togglePropertiesPanel: () => void;
  toggleHistoryPanel: () => void;
  toggleTestModal: () => void;
  toggleCredentialsModal: () => void;
  openPropertiesPanel: () => void;
  closePropertiesPanel: () => void;
  
  // ============================================
  // ACTIONS - Execution
  // ============================================
  setTestExecution: (execution: Partial<TestExecution>) => void;
  updateNodeStatus: (nodeId: string, status: NodeStatus, message?: string, time?: number) => void;
  resetNodeStatuses: () => void;
  startExecution: (executionId: string, triggerData?: any) => void;
  completeExecution: (success: boolean, error?: string) => void;
  
  // ============================================
  // ACTIONS - Bulk Operations
  // ============================================
  loadAutomation: (data: {
    id: string;
    name: string;
    description?: string;
    status: 'draft' | 'active' | 'paused' | 'error';
    nodes: FlowNode[];
    edges: FlowEdge[];
  }) => void;
  resetStore: () => void;
  
  // ============================================
  // VALIDATION
  // ============================================
  validateFlow: () => { valid: boolean; errors: string[] };
  getExecutionOrder: () => FlowNode[];
}

// ============================================
// INITIAL STATE
// ============================================

const initialState = {
  nodes: [] as FlowNode[],
  edges: [] as FlowEdge[],
  selectedNodeId: null as string | null,
  selectedEdgeId: null as string | null,
  automationId: null as string | null,
  automationName: 'Nova Automação',
  automationDescription: '',
  automationStatus: 'draft' as const,
  past: [] as HistoryEntry[],
  future: [] as HistoryEntry[],
  isSaving: false,
  isDirty: false,
  lastSavedAt: null as Date | null,
  showPropertiesPanel: false,
  showHistoryPanel: false,
  showTestModal: false,
  showCredentialsModal: false,
  testExecution: {
    isRunning: false,
    steps: [],
  } as TestExecution,
};

// ============================================
// STORE IMPLEMENTATION
// ============================================

export const useFlowStore = create<FlowStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // ============================================
      // NODES
      // ============================================
      
      setNodes: (nodes) => {
        get().saveToHistory();
        set({ nodes, isDirty: true });
      },
      
      addNode: (node) => {
        get().saveToHistory();
        set((state) => ({ 
          nodes: [...state.nodes, node],
          isDirty: true,
          selectedNodeId: node.id,
          showPropertiesPanel: true,
        }));
      },
      
      updateNode: (nodeId, data) => set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, ...data } }
            : node
        ),
        isDirty: true,
      })),
      
      updateNodeConfig: (nodeId, config) => set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, config: { ...node.data.config, ...config } } }
            : node
        ),
        isDirty: true,
      })),
      
      removeNode: (nodeId) => {
        get().saveToHistory();
        set((state) => ({
          nodes: state.nodes.filter((n) => n.id !== nodeId),
          edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
          selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
          showPropertiesPanel: state.selectedNodeId === nodeId ? false : state.showPropertiesPanel,
          isDirty: true,
        }));
      },
      
      duplicateNode: (nodeId) => {
        const state = get();
        const node = state.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        
        get().saveToHistory();
        
        const newNode: FlowNode = {
          ...node,
          id: `${node.data.nodeType}_${Date.now()}`,
          position: {
            x: node.position.x + 50,
            y: node.position.y + 50,
          },
          data: {
            ...node.data,
            label: `${node.data.label} (cópia)`,
            status: undefined,
            statusMessage: undefined,
            executionTime: undefined,
          },
          selected: false,
        };
        
        set((state) => ({
          nodes: [...state.nodes, newNode],
          selectedNodeId: newNode.id,
          showPropertiesPanel: true,
          isDirty: true,
        }));
      },
      
      onNodesChange: (changes) => {
        // Only save to history for significant changes
        const significantChange = changes.some(
          (c) => c.type === 'remove' || c.type === 'add'
        );
        if (significantChange) {
          get().saveToHistory();
        }
        
        set((state) => ({
          nodes: applyNodeChanges(changes, state.nodes) as FlowNode[],
          isDirty: true,
        }));
      },

      // ============================================
      // EDGES
      // ============================================
      
      setEdges: (edges) => {
        get().saveToHistory();
        set({ edges, isDirty: true });
      },
      
      addEdge: (edge) => {
        get().saveToHistory();
        set((state) => ({
          edges: [...state.edges, edge],
          isDirty: true,
        }));
      },
      
      removeEdge: (edgeId) => {
        get().saveToHistory();
        set((state) => ({
          edges: state.edges.filter((e) => e.id !== edgeId),
          selectedEdgeId: state.selectedEdgeId === edgeId ? null : state.selectedEdgeId,
          isDirty: true,
        }));
      },
      
      onEdgesChange: (changes) => set((state) => ({
        edges: applyEdgeChanges(changes, state.edges),
        isDirty: true,
      })),
      
      onConnect: (connection) => {
        const state = get();
        
        // Validations
        if (!connection.source || !connection.target) return;
        if (connection.source === connection.target) return;
        
        // Check if target is a trigger (triggers can't receive connections)
        const targetNode = state.nodes.find((n) => n.id === connection.target);
        if (targetNode?.data.category === 'trigger') return;
        
        // Check if connection already exists
        const exists = state.edges.some(
          (e) => 
            e.source === connection.source && 
            e.target === connection.target &&
            e.sourceHandle === connection.sourceHandle
        );
        if (exists) return;
        
        get().saveToHistory();
        
        const newEdge: FlowEdge = {
          id: `edge_${Date.now()}`,
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle ?? undefined,
          targetHandle: connection.targetHandle ?? undefined,
          type: 'smoothstep',
          animated: false,
        };
        
        set((state) => ({
          edges: [...state.edges, newEdge],
          isDirty: true,
        }));
      },

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
      
      clearSelection: () => set({
        selectedNodeId: null,
        selectedEdgeId: null,
      }),

      // ============================================
      // HISTORY (UNDO/REDO)
      // ============================================
      
      saveToHistory: () => {
        const { nodes, edges, past } = get();
        
        // Limit history to 50 entries
        const newPast = [...past.slice(-49), { 
          nodes: JSON.parse(JSON.stringify(nodes)),
          edges: JSON.parse(JSON.stringify(edges)),
          timestamp: Date.now(),
        }];
        
        set({ past: newPast, future: [] });
      },
      
      undo: () => {
        const { past, nodes, edges, future } = get();
        if (past.length === 0) return;
        
        const previous = past[past.length - 1];
        const newPast = past.slice(0, -1);
        
        set({
          nodes: previous.nodes,
          edges: previous.edges,
          past: newPast,
          future: [{ nodes, edges, timestamp: Date.now() }, ...future.slice(0, 49)],
          isDirty: true,
          selectedNodeId: null,
        });
      },
      
      redo: () => {
        const { future, nodes, edges, past } = get();
        if (future.length === 0) return;
        
        const next = future[0];
        const newFuture = future.slice(1);
        
        set({
          nodes: next.nodes,
          edges: next.edges,
          future: newFuture,
          past: [...past, { nodes, edges, timestamp: Date.now() }],
          isDirty: true,
          selectedNodeId: null,
        });
      },
      
      canUndo: () => get().past.length > 0,
      canRedo: () => get().future.length > 0,

      // ============================================
      // METADATA
      // ============================================
      
      setAutomationId: (id) => set({ automationId: id }),
      setAutomationName: (name) => set({ automationName: name, isDirty: true }),
      setAutomationDescription: (description) => set({ automationDescription: description, isDirty: true }),
      setAutomationStatus: (status) => set({ automationStatus: status }),

      // ============================================
      // UI STATE
      // ============================================
      
      setSaving: (saving) => set({ isSaving: saving }),
      setDirty: (dirty) => set({ isDirty: dirty }),
      markSaved: () => set({ isDirty: false, lastSavedAt: new Date() }),
      togglePropertiesPanel: () => set((state) => ({ showPropertiesPanel: !state.showPropertiesPanel })),
      toggleHistoryPanel: () => set((state) => ({ showHistoryPanel: !state.showHistoryPanel })),
      toggleTestModal: () => set((state) => ({ showTestModal: !state.showTestModal })),
      toggleCredentialsModal: () => set((state) => ({ showCredentialsModal: !state.showCredentialsModal })),
      openPropertiesPanel: () => set({ showPropertiesPanel: true }),
      closePropertiesPanel: () => set({ showPropertiesPanel: false }),

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
      
      startExecution: (executionId, triggerData) => set({
        testExecution: {
          isRunning: true,
          executionId,
          steps: [],
          triggerData,
          success: undefined,
          error: undefined,
        },
      }),
      
      completeExecution: (success, error) => set((state) => ({
        testExecution: {
          ...state.testExecution,
          isRunning: false,
          success,
          error,
          totalDuration: state.testExecution.steps.reduce(
            (sum, step) => sum + (step.duration || 0), 
            0
          ),
        },
      })),

      // ============================================
      // BULK OPERATIONS
      // ============================================
      
      loadAutomation: (data) => set({
        automationId: data.id,
        automationName: data.name,
        automationDescription: data.description || '',
        automationStatus: data.status,
        nodes: data.nodes,
        edges: data.edges,
        isDirty: false,
        past: [],
        future: [],
        selectedNodeId: null,
        selectedEdgeId: null,
        showPropertiesPanel: false,
      }),
      
      resetStore: () => set(initialState),

      // ============================================
      // VALIDATION
      // ============================================
      
      validateFlow: () => {
        const { nodes, edges } = get();
        const errors: string[] = [];
        
        // Must have at least one trigger
        const triggers = nodes.filter((n) => n.data.category === 'trigger');
        if (triggers.length === 0) {
          errors.push('Adicione um gatilho para iniciar a automação');
        }
        
        // Must have at least one action
        const actions = nodes.filter((n) => n.data.category === 'action');
        if (actions.length === 0) {
          errors.push('Adicione pelo menos uma ação');
        }
        
        // All non-trigger nodes must be connected
        const connectedNodeIds = new Set([
          ...edges.map((e) => e.source),
          ...edges.map((e) => e.target),
        ]);
        
        for (const node of nodes) {
          if (node.data.category !== 'trigger' && !connectedNodeIds.has(node.id)) {
            errors.push(`O nó "${node.data.label}" não está conectado ao fluxo`);
          }
        }
        
        // Check for cycles
        if (hasCycle(nodes, edges)) {
          errors.push('O fluxo contém ciclos, o que não é permitido');
        }
        
        // Check triggers have outgoing connections
        for (const trigger of triggers) {
          const hasOutgoing = edges.some((e) => e.source === trigger.id);
          if (!hasOutgoing) {
            errors.push(`O gatilho "${trigger.data.label}" precisa estar conectado a um próximo nó`);
          }
        }
        
        return {
          valid: errors.length === 0,
          errors,
        };
      },
      
      getExecutionOrder: () => {
        const { nodes, edges } = get();
        return topologicalSort(nodes, edges);
      },
    }),
    { name: 'FlowStore' }
  )
);

// ============================================
// HELPER FUNCTIONS
// ============================================

function hasCycle(nodes: FlowNode[], edges: FlowEdge[]): boolean {
  const adjacencyList = new Map<string, string[]>();
  
  nodes.forEach((n) => adjacencyList.set(n.id, []));
  edges.forEach((e) => {
    const list = adjacencyList.get(e.source) || [];
    list.push(e.target);
    adjacencyList.set(e.source, list);
  });
  
  const visited = new Set<string>();
  const recStack = new Set<string>();
  
  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recStack.add(nodeId);
    
    const neighbors = adjacencyList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        return true;
      }
    }
    
    recStack.delete(nodeId);
    return false;
  }
  
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (dfs(node.id)) return true;
    }
  }
  
  return false;
}

function topologicalSort(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const result: FlowNode[] = [];
  const visited = new Set<string>();
  const adjacencyList = new Map<string, string[]>();
  
  nodes.forEach((n) => adjacencyList.set(n.id, []));
  edges.forEach((e) => {
    const list = adjacencyList.get(e.source) || [];
    list.push(e.target);
    adjacencyList.set(e.source, list);
  });
  
  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    
    const neighbors = adjacencyList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      visit(neighbor);
    }
    
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      result.unshift(node);
    }
  }
  
  // Start from triggers
  const triggers = nodes.filter((n) => n.data.category === 'trigger');
  for (const trigger of triggers) {
    visit(trigger.id);
  }
  
  // Visit remaining nodes
  for (const node of nodes) {
    visit(node.id);
  }
  
  return result;
}

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

export const useActionNodes = () => {
  const nodes = useFlowStore((state) => state.nodes);
  return nodes.filter((n) => n.data.category === 'action');
};

export const useIsValidFlow = () => {
  const validateFlow = useFlowStore((state) => state.validateFlow);
  return validateFlow();
};

export const useCanUndo = () => {
  return useFlowStore((state) => state.past.length > 0);
};

export const useCanRedo = () => {
  return useFlowStore((state) => state.future.length > 0);
};
