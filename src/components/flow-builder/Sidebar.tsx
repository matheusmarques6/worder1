'use client';

import { useState, DragEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NODE_SECTIONS, getNodeColor, NodeTypeDefinition } from './nodes/nodeTypes';
import { useFlowStore, FlowNode } from '@/stores/flowStore';

// ============================================
// SIDEBAR COMPONENT
// ============================================

export function Sidebar() {
  const [expanded, setExpanded] = useState<string>('triggers');
  const [searchQuery, setSearchQuery] = useState('');
  const addNode = useFlowStore((state) => state.addNode);

  // Filter nodes by search
  const filteredSections = NODE_SECTIONS.map((section) => ({
    ...section,
    nodes: section.nodes.filter(
      (node) =>
        node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.description.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((section) => section.nodes.length > 0);

  // Handle drag start - passa objeto completo com todas as informações
  const handleDragStart = (e: DragEvent, node: NodeTypeDefinition) => {
    const dragData = {
      nodeType: node.type,
      label: node.label,
      description: node.description,
      category: node.category,
      icon: node.icon?.name || 'Zap',
      color: node.color,
      defaultConfig: node.defaultConfig || {},
    };
    e.dataTransfer.setData('application/reactflow', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'move';
  };

  // Handle click to add
  const handleAddNode = (nodeDef: NodeTypeDefinition) => {
    const newNode: FlowNode = {
      id: `node-${Date.now()}`,
      type: nodeDef.type,
      position: { x: 250 + Math.random() * 100, y: 100 + Math.random() * 100 },
      data: {
        label: nodeDef.label,
        description: nodeDef.description,
        category: nodeDef.category,
        nodeType: nodeDef.type,
        config: nodeDef.defaultConfig || {},
      },
    };
    addNode(newNode);
  };

  return (
    <div className="fb-sidebar w-72 bg-[#111111] border-r border-white/10 flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-white/10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            placeholder="Buscar nós..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              'w-full pl-9 pr-3 py-2 rounded-lg',
              'bg-[#0a0a0a] border border-white/10',
              'text-sm text-white placeholder-white/30',
              'focus:outline-none focus:border-blue-500/50',
              'transition-colors'
            )}
          />
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredSections.map((section) => (
          <div key={section.id} className="rounded-lg overflow-hidden">
            {/* Section Header */}
            <button
              onClick={() => setExpanded(expanded === section.id ? '' : section.id)}
              className={cn(
                'w-full flex items-center justify-between p-3 rounded-lg',
                'text-left transition-all duration-150',
                expanded === section.id 
                  ? 'bg-[#1a1a1a]' 
                  : 'hover:bg-[#1a1a1a]'
              )}
            >
              <div className="flex items-center gap-2">
                <section.icon className="w-4 h-4 text-white/40" />
                <span className="text-sm font-medium text-white">{section.label}</span>
                <span className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded">
                  {section.nodes.length}
                </span>
              </div>
              <ChevronRight
                className={cn(
                  'w-4 h-4 text-white/30 transition-transform duration-200',
                  expanded === section.id && 'rotate-90'
                )}
              />
            </button>

            {/* Section Content */}
            <AnimatePresence>
              {expanded === section.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="p-2 space-y-1.5">
                    {section.nodes.map((node) => (
                      <NodeItem
                        key={node.type}
                        node={node}
                        onDragStart={handleDragStart}
                        onClick={() => handleAddNode(node)}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div className="p-3 border-t border-white/10">
        <p className="text-[11px] text-white/30 text-center">
          Arraste ou clique para adicionar
        </p>
      </div>
    </div>
  );
}

// ============================================
// NODE ITEM COMPONENT
// ============================================

interface NodeItemProps {
  node: NodeTypeDefinition;
  onDragStart: (e: DragEvent, node: NodeTypeDefinition) => void;
  onClick: () => void;
}

function NodeItem({ node, onDragStart, onClick }: NodeItemProps) {
  const colors = getNodeColor(node.color);
  const Icon = node.icon;
  const isTrigger = node.category === 'trigger';

  return (
    <motion.button
      draggable
      onDragStart={(e) => onDragStart(e as unknown as DragEvent, node)}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 p-2.5 rounded-xl',
        'bg-[#0a0a0a] border border-white/5',
        'cursor-grab active:cursor-grabbing',
        'hover:border-white/20 hover:bg-[#141414]',
        'transition-all duration-150 group text-left'
      )}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Trigger indicator bar */}
      {isTrigger && (
        <div className={cn('w-1 h-10 rounded-full', colors.solid)} />
      )}
      
      {/* Icon */}
      <div className={cn('p-2 rounded-lg shrink-0', colors.bg)}>
        <Icon className={cn('w-4 h-4', colors.text)} />
      </div>
      
      {/* Label & Description */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/80 group-hover:text-white transition-colors truncate">
          {node.label}
        </p>
        <p className="text-[10px] text-white/30 truncate">
          {node.description}
        </p>
      </div>
    </motion.button>
  );
}

export default Sidebar;
