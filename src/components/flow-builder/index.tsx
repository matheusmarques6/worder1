'use client';

import { useEffect, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '@/styles/flow-builder.css';

import { Canvas } from './Canvas';
import { Sidebar } from './Sidebar';
import { Toolbar } from './Toolbar';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { useFlowStore, FlowNode, FlowNodeData } from '@/stores/flowStore';
import { getNodeDefinition } from './nodes/nodeTypes';

// Re-exports
export { Canvas } from './Canvas';
export { Sidebar } from './Sidebar';
export { Toolbar } from './Toolbar';
export { PropertiesPanel } from './panels/PropertiesPanel';
export * from './nodes';
export * from './edges';

// ============================================
// FLOW BUILDER MAIN COMPONENT
// ============================================

interface FlowBuilderProps {
  automationId?: string;
  automationName?: string;
  automationStatus?: 'draft' | 'active' | 'paused';
  initialNodes?: any[]; // Legacy AutomationNode[]
  initialEdges?: any[]; // Legacy AutomationEdge[]
  onSave: () => Promise<string | undefined>;
  onBack: () => void;
  onTest?: () => void;
  organizationId?: string;
}

export function FlowBuilder({
  automationId,
  automationName = 'Nova Automação',
  automationStatus = 'draft',
  initialNodes = [],
  initialEdges = [],
  onSave,
  onBack,
  onTest,
  organizationId,
}: FlowBuilderProps) {
  const loadAutomation = useFlowStore((state) => state.loadAutomation);
  const resetStore = useFlowStore((state) => state.resetStore);
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const showPropertiesPanel = useFlowStore((state) => state.showPropertiesPanel);

  // Convert legacy nodes to new format
  const convertLegacyNodes = useCallback((legacyNodes: any[]): FlowNode[] => {
    return legacyNodes.map((node) => {
      const definition = getNodeDefinition(node.type);
      
      // Determine category from type
      let category: FlowNodeData['category'] = 'action';
      if (node.type?.startsWith('trigger_')) category = 'trigger';
      else if (node.type?.startsWith('condition_') || node.type?.startsWith('logic_condition') || node.type?.startsWith('logic_split') || node.type?.startsWith('logic_filter')) category = 'condition';
      else if (node.type?.startsWith('control_') || node.type?.startsWith('logic_delay')) category = 'control';

      return {
        id: node.id,
        type: node.type,
        position: node.position,
        data: {
          label: node.data?.label || definition?.label || '',
          description: node.data?.description || definition?.description || '',
          category,
          nodeType: node.type,
          config: node.data?.config || {},
          status: node.data?.status,
        },
      };
    });
  }, []);

  // Convert legacy edges
  const convertLegacyEdges = useCallback((legacyEdges: any[]) => {
    return legacyEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: 'smoothstep',
    }));
  }, []);

  // Load initial data
  useEffect(() => {
    const convertedNodes = convertLegacyNodes(initialNodes);
    const convertedEdges = convertLegacyEdges(initialEdges);

    loadAutomation({
      id: automationId || 'new',
      name: automationName,
      status: automationStatus,
      nodes: convertedNodes,
      edges: convertedEdges,
    });

    // Cleanup on unmount
    return () => {
      resetStore();
    };
  }, []);

  // Handle save with conversion back to legacy format
  const handleSave = useCallback(async () => {
    // The parent component will read from store
    return onSave();
  }, [onSave]);

  // Handle test
  const handleTest = useCallback(() => {
    if (onTest) {
      onTest();
    }
  }, [onTest]);

  return (
    <ReactFlowProvider>
      <div className="h-full w-full flex flex-col bg-[#0a0a0a]">
        {/* Toolbar */}
        <Toolbar
          onSave={handleSave}
          onTest={handleTest}
          onBack={onBack}
          organizationId={organizationId}
        />

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <Sidebar />

          {/* Canvas */}
          <div className="flex-1 relative">
            <Canvas />
          </div>

          {/* Properties Panel */}
          {showPropertiesPanel && (
            <PropertiesPanel organizationId={organizationId} />
          )}
        </div>
      </div>
    </ReactFlowProvider>
  );
}

// ============================================
// HELPER TO GET STORE DATA FOR SAVING
// ============================================

export function getFlowDataForSave() {
  const state = useFlowStore.getState();
  
  // Convert back to legacy format
  const legacyNodes = state.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: {
      label: node.data.label,
      description: node.data.description,
      config: node.data.config,
    },
  }));

  const legacyEdges = state.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
  }));

  return {
    name: state.automationName,
    status: state.automationStatus,
    nodes: legacyNodes,
    edges: legacyEdges,
  };
}

export default FlowBuilder;
