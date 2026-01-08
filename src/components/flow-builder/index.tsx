'use client';

import { useEffect, useCallback, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '@/styles/flow-builder.css';

import { Canvas } from './Canvas';
import { Sidebar } from './Sidebar';
import { Toolbar } from './Toolbar';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { TestModal } from './panels/TestModal';
import { HistoryPanel } from './panels/HistoryPanel';
import { useFlowStore, FlowNode, FlowNodeData } from '@/stores/flowStore';
import { getNodeDefinition } from './nodes/nodeTypes';

// Re-exports
export { Canvas } from './Canvas';
export { Sidebar } from './Sidebar';
export { Toolbar } from './Toolbar';
export { PropertiesPanel } from './panels/PropertiesPanel';
export { TestModal } from './panels/TestModal';
export { HistoryPanel } from './panels/HistoryPanel';
export * from './nodes';
export * from './edges';

// ============================================
// FLOW BUILDER MAIN COMPONENT
// ============================================

interface FlowBuilderProps {
  automationId?: string;
  automationName?: string;
  automationStatus?: 'draft' | 'active' | 'paused' | 'error';
  initialNodes?: any[];
  initialEdges?: any[];
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
  // Store
  const loadAutomation = useFlowStore((state) => state.loadAutomation);
  const resetStore = useFlowStore((state) => state.resetStore);
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const showPropertiesPanel = useFlowStore((state) => state.showPropertiesPanel);
  const showTestModal = useFlowStore((state) => state.showTestModal);
  const toggleTestModal = useFlowStore((state) => state.toggleTestModal);
  const showHistoryPanel = useFlowStore((state) => state.showHistoryPanel);
  const toggleHistoryPanel = useFlowStore((state) => state.toggleHistoryPanel);

  // Local state for saved automation ID
  const [savedAutomationId, setSavedAutomationId] = useState<string | undefined>(automationId);

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
    const result = await onSave();
    if (result) {
      setSavedAutomationId(result);
    }
    return result;
  }, [onSave]);

  // Handle test - open modal
  const handleTest = useCallback(() => {
    if (onTest) {
      onTest();
    } else {
      toggleTestModal();
    }
  }, [onTest, toggleTestModal]);

  // Handle close test modal
  const handleCloseTestModal = useCallback(() => {
    toggleTestModal();
  }, [toggleTestModal]);

  // Handle close history panel
  const handleCloseHistoryPanel = useCallback(() => {
    toggleHistoryPanel();
  }, [toggleHistoryPanel]);

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
            <PropertiesPanel organizationId={organizationId} automationId={savedAutomationId} />
          )}
        </div>

        {/* Test Modal */}
        {showTestModal && savedAutomationId && organizationId && (
          <TestModal
            automationId={savedAutomationId}
            organizationId={organizationId}
            onClose={handleCloseTestModal}
          />
        )}

        {/* Test Modal - Fallback for unsaved automations */}
        {showTestModal && (!savedAutomationId || !organizationId) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#111111] border border-white/10 rounded-xl p-6 max-w-md">
              <h3 className="text-lg font-semibold text-white mb-2">
                Salve a automação primeiro
              </h3>
              <p className="text-white/60 text-sm mb-4">
                Para testar a automação, você precisa salvá-la primeiro.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleCloseTestModal}
                  className="px-4 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                >
                  Fechar
                </button>
                <button
                  onClick={async () => {
                    handleCloseTestModal();
                    await handleSave();
                  }}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                >
                  Salvar Agora
                </button>
              </div>
            </div>
          </div>
        )}

        {/* History Panel */}
        {showHistoryPanel && savedAutomationId && organizationId && (
          <HistoryPanel
            automationId={savedAutomationId}
            organizationId={organizationId}
            onClose={handleCloseHistoryPanel}
          />
        )}

        {/* History Panel - Fallback for unsaved automations */}
        {showHistoryPanel && (!savedAutomationId || !organizationId) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#111111] border border-white/10 rounded-xl p-6 max-w-md">
              <h3 className="text-lg font-semibold text-white mb-2">
                Automação não salva
              </h3>
              <p className="text-white/60 text-sm mb-4">
                O histórico de execuções só está disponível após salvar a automação.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleCloseHistoryPanel}
                  className="px-4 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                >
                  Fechar
                </button>
                <button
                  onClick={async () => {
                    handleCloseHistoryPanel();
                    await handleSave();
                  }}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                >
                  Salvar Agora
                </button>
              </div>
            </div>
          </div>
        )}
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
