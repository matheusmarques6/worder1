'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '@/styles/flow-builder.css';

import { Canvas } from './Canvas';
import { Sidebar } from './Sidebar';
import { Toolbar } from './Toolbar';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { ExecutionPanel } from './panels/ExecutionPanel';
import { HistoryPanel } from './panels/HistoryPanel';
import { useFlowStore, FlowNode, FlowNodeData } from '@/stores/flowStore';
import { getNodeDefinition } from './nodes/nodeTypes';

// Re-exports
export { Canvas } from './Canvas';
export { Sidebar } from './Sidebar';
export { Toolbar } from './Toolbar';
export { PropertiesPanel } from './panels/PropertiesPanel';
export { ExecutionPanel } from './panels/ExecutionPanel';
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
  const isFullscreen = useFlowStore((state) => state.isFullscreen);
  const showAnalytics = useFlowStore((state) => state.showAnalytics);
  const setAnalyticsData = useFlowStore((state) => state.setAnalyticsData);
  const analyticsTimeframe = useFlowStore((state) => state.analyticsTimeframe);

  // Local state for saved automation ID
  const [savedAutomationId, setSavedAutomationId] = useState<string | undefined>(automationId);

  // Fetch analytics when toggle is on
  useEffect(() => {
    if (!showAnalytics || !savedAutomationId || savedAutomationId === 'new') return;

    const fetchAnalytics = async () => {
      try {
        const res = await fetch(
          `/api/automations/${savedAutomationId}/stats?timeframe=${analyticsTimeframe}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.nodeStats) {
            setAnalyticsData(data.nodeStats);
          }
        }
      } catch {
        // Non-blocking
      }
    };

    fetchAnalytics();
  }, [showAnalytics, savedAutomationId, analyticsTimeframe, setAnalyticsData]);

  // Auto-save: debounced save when flow changes
  const isDirty = useFlowStore((state) => state.isDirty);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isDirty || !savedAutomationId || savedAutomationId === 'new') return;

    // Clear previous timer
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    // Debounce: save after 2 seconds of no changes
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        await onSave();
        useFlowStore.getState().setDirty(false);
      } catch {
        // Silent fail — user can still manual save
      }
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [isDirty, savedAutomationId, onSave]);

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
          icon: node.data?.icon || definition?.icon?.name || '',
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

    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger in input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useFlowStore.getState().undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        useFlowStore.getState().redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        useFlowStore.getState().redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
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
      <div className="h-screen w-screen flex flex-col bg-white overflow-hidden">
        {/* Toolbar */}
        <Toolbar
          onSave={handleSave}
          onTest={handleTest}
          onBack={onBack}
          organizationId={organizationId}
        />

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar - hidden in fullscreen */}
          {!isFullscreen && <Sidebar />}

          {/* Canvas */}
          <div className="flex-1 relative">
            <Canvas />
          </div>

          {/* Properties Panel - hidden in fullscreen */}
          {showPropertiesPanel && !isFullscreen && (
            <PropertiesPanel organizationId={organizationId} automationId={savedAutomationId} />
          )}
        </div>

        {/* Execution Panel */}
        {showTestModal && savedAutomationId && savedAutomationId !== 'new' && organizationId && (
          <ExecutionPanel
            automationId={savedAutomationId}
            organizationId={organizationId}
            onClose={handleCloseTestModal}
          />
        )}

        {/* Execution Panel - Fallback for unsaved automations */}
        {showTestModal && (!savedAutomationId || savedAutomationId === 'new' || !organizationId) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-white border border-gray-300 rounded-xl p-6 max-w-md shadow-xl">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Salve a automação primeiro
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                Para testar a automação, você precisa salvá-la primeiro.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleCloseTestModal}
                  className="px-4 py-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                >
                  Fechar
                </button>
                <button
                  onClick={async () => {
                    handleCloseTestModal();
                    await handleSave();
                  }}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  Salvar Agora
                </button>
              </div>
            </div>
          </div>
        )}

        {/* History Panel */}
        {showHistoryPanel && savedAutomationId && savedAutomationId !== 'new' && organizationId && (
          <HistoryPanel
            automationId={savedAutomationId}
            organizationId={organizationId}
            onClose={handleCloseHistoryPanel}
          />
        )}

        {/* History Panel - Fallback for unsaved automations */}
        {showHistoryPanel && (!savedAutomationId || savedAutomationId === 'new' || !organizationId) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-white border border-gray-300 rounded-xl p-6 max-w-md shadow-xl">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Automação não salva
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                O histórico de execuções só está disponível após salvar a automação.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleCloseHistoryPanel}
                  className="px-4 py-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                >
                  Fechar
                </button>
                <button
                  onClick={async () => {
                    handleCloseHistoryPanel();
                    await handleSave();
                  }}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
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
