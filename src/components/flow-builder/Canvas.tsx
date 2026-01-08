'use client';

import { useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  BackgroundVariant,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useFlowStore } from '@/stores/flowStore';
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';
import { cn } from '@/lib/utils';

// ============================================
// CANVAS COMPONENT
// ============================================

export function Canvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Store state
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const addEdgeToStore = useFlowStore((s) => s.addEdge);
  const addNode = useFlowStore((s) => s.addNode);
  const setSelectedNode = useFlowStore((s) => s.setSelectedNode);

  // Handle new connections
  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        addEdgeToStore({
          id: `e-${connection.source}-${connection.target}-${Date.now()}`,
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle || undefined,
          targetHandle: connection.targetHandle || undefined,
          type: 'animated',
        });
      }
    },
    [addEdgeToStore]
  );

  // Handle drop from sidebar
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const data = event.dataTransfer.getData('application/reactflow');
      if (!data) return;

      try {
        const nodeData = JSON.parse(data);
        const bounds = reactFlowWrapper.current?.getBoundingClientRect();
        
        if (!bounds) return;

        const position = {
          x: event.clientX - bounds.left - 100,
          y: event.clientY - bounds.top - 30,
        };

        addNode({
          id: `node-${Date.now()}`,
          type: nodeData.nodeType,
          position,
          data: {
            label: nodeData.label,
            description: nodeData.description,
            category: nodeData.category,
            nodeType: nodeData.nodeType,
            icon: nodeData.icon,
            config: nodeData.defaultConfig || {},
          },
        });
      } catch (error) {
        console.error('Error adding node:', error);
      }
    },
    [addNode]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Handle node click
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      setSelectedNode(node.id);
    },
    [setSelectedNode]
  );

  // Handle pane click (deselect)
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  return (
    <div ref={reactFlowWrapper} className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        defaultEdgeOptions={{
          type: 'animated',
          animated: true,
        }}
        proOptions={{ hideAttribution: true }}
        className="bg-[#0a0a0a]"
      >
        {/* Background */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#262626"
        />

        {/* Controls */}
        <Controls
          className={cn(
            '[&>button]:bg-[#1a1a1a] [&>button]:border-white/10',
            '[&>button]:text-white/60 [&>button:hover]:bg-white/10',
            '[&>button:hover]:text-white'
          )}
        />

        {/* MiniMap */}
        <MiniMap
          nodeColor={(node) => {
            const category = node.data?.category;
            switch (category) {
              case 'trigger':
                return '#10b981';
              case 'action':
                return '#3b82f6';
              case 'condition':
                return '#f59e0b';
              case 'control':
                return '#a855f7';
              default:
                return '#525252';
            }
          }}
          maskColor="rgba(0, 0, 0, 0.8)"
          className="!bg-[#1a1a1a] !border-white/10"
        />

        {/* Empty state */}
        {nodes.length === 0 && (
          <Panel position="top-center" className="mt-20">
            <div className="text-center text-white/40 p-8">
              <p className="text-lg mb-2">Arraste componentes da barra lateral</p>
              <p className="text-sm">ou clique duas vezes para adicionar</p>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

export default Canvas;
