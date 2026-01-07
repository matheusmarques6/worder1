'use client';

import { useCallback, useRef, DragEvent } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ConnectionLineType,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
  NodeTypes,
  EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useFlowStore, FlowNode } from '@/stores/flowStore';
import { nodeTypes as customNodeTypes } from './nodes';
import { edgeTypes as customEdgeTypes } from './edges';
import { getNodeDefinition } from './nodes/nodeTypes';

// Cast to satisfy React Flow types
const nodeTypes = customNodeTypes as unknown as NodeTypes;
const edgeTypes = customEdgeTypes as unknown as EdgeTypes;

// ============================================
// CANVAS INNER COMPONENT
// ============================================

function CanvasInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  
  // Store
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const onNodesChange = useFlowStore((state) => state.onNodesChange);
  const onEdgesChange = useFlowStore((state) => state.onEdgesChange);
  const onConnect = useFlowStore((state) => state.onConnect);
  const addNode = useFlowStore((state) => state.addNode);
  const selectNode = useFlowStore((state) => state.selectNode);
  const selectedNodeId = useFlowStore((state) => state.selectedNodeId);

  // Handle node click
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: FlowNode) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  // Handle pane click (deselect)
  const handlePaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  // Handle drop from sidebar
  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type || !reactFlowWrapper.current) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const definition = getNodeDefinition(type);
      if (!definition) return;

      const newNode: FlowNode = {
        id: `node-${Date.now()}`,
        type,
        position,
        data: {
          label: definition.label,
          description: definition.description,
          category: definition.category,
          nodeType: type,
          config: definition.defaultConfig || {},
        },
      };

      addNode(newNode);
    },
    [screenToFlowPosition, addNode]
  );

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Get node color for minimap
  const getMinimapNodeColor = useCallback((node: FlowNode): string => {
    switch (node.data.category) {
      case 'trigger':
        return '#3b82f6';
      case 'action':
        return '#8b5cf6';
      case 'condition':
        return '#f59e0b';
      case 'control':
        return '#22c55e';
      default:
        return '#6b7280';
    }
  }, []);

  return (
    <div 
      ref={reactFlowWrapper} 
      className="h-full w-full bg-[#0a0a0a]"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: '#60a5fa', strokeWidth: 2 }}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { stroke: '#4b5563', strokeWidth: 2 },
        }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        snapToGrid
        snapGrid={[20, 20]}
        minZoom={0.1}
        maxZoom={2}
        nodesFocusable
        edgesFocusable
        deleteKeyCode={['Backspace', 'Delete']}
        selectionKeyCode={['Shift']}
        multiSelectionKeyCode={['Meta', 'Control']}
        panOnScroll
        selectionOnDrag
        panOnDrag={[1, 2]} // Middle and right click
        proOptions={{ hideAttribution: true }}
      >
        <Background 
          variant={BackgroundVariant.Dots}
          color="rgba(255, 255, 255, 0.05)"
          gap={20}
          size={1}
        />
        
        <Controls 
          showZoom
          showFitView
          showInteractive
          position="bottom-left"
        />
        
        <MiniMap
          nodeColor={getMinimapNodeColor}
          maskColor="rgba(0, 0, 0, 0.85)"
          pannable
          zoomable
          position="bottom-right"
        />
      </ReactFlow>
    </div>
  );
}

// ============================================
// CANVAS WRAPPER WITH PROVIDER
// ============================================

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

export default Canvas;
