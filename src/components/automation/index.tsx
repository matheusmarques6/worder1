'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  Save,
  Undo,
  Redo,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Plus,
  Trash2,
  Copy,
  Settings,
  Mail,
  MessageSquare,
  Clock,
  GitBranch,
  Users,
  ShoppingCart,
  Tag,
  Bell,
  Filter,
  Zap,
  ArrowRight,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  Grip,
  Target,
  Send,
  Timer,
  Split,
  UserPlus,
  Package,
  CreditCard,
  Star,
  Heart,
  Webhook,
  Database,
} from 'lucide-react';
import { Button, Input, Card, Badge, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';
import { AutomationNode, AutomationTrigger, AutomationEdge } from '@/types';

// ============================================
// Node Type Definitions
// ============================================

export const NODE_TYPES = {
  triggers: [
    { type: 'trigger_order', label: 'Pedido Realizado', icon: ShoppingCart, color: 'emerald' },
    { type: 'trigger_abandon', label: 'Carrinho Abandonado', icon: Package, color: 'amber' },
    { type: 'trigger_signup', label: 'Novo Cadastro', icon: UserPlus, color: 'blue' },
    { type: 'trigger_tag', label: 'Tag Adicionada', icon: Tag, color: 'purple' },
    { type: 'trigger_date', label: 'Data Especial', icon: Star, color: 'pink' },
    { type: 'trigger_segment', label: 'Entrou em Segmento', icon: Users, color: 'cyan' },
    { type: 'trigger_webhook', label: 'Webhook', icon: Webhook, color: 'orange' },
  ],
  actions: [
    { type: 'action_email', label: 'Enviar Email', icon: Mail, color: 'violet' },
    { type: 'action_whatsapp', label: 'Enviar WhatsApp', icon: MessageSquare, color: 'green' },
    { type: 'action_sms', label: 'Enviar SMS', icon: Send, color: 'blue' },
    { type: 'action_tag', label: 'Adicionar Tag', icon: Tag, color: 'purple' },
    { type: 'action_notify', label: 'Notificação Interna', icon: Bell, color: 'amber' },
    { type: 'action_webhook', label: 'Chamar Webhook', icon: Webhook, color: 'slate' },
    { type: 'action_update', label: 'Atualizar Contato', icon: Database, color: 'cyan' },
  ],
  logic: [
    { type: 'logic_delay', label: 'Aguardar', icon: Clock, color: 'slate' },
    { type: 'logic_condition', label: 'Condição', icon: GitBranch, color: 'orange' },
    { type: 'logic_split', label: 'Teste A/B', icon: Split, color: 'pink' },
    { type: 'logic_filter', label: 'Filtrar', icon: Filter, color: 'indigo' },
  ],
} as const;

const getNodeColor = (color: string) => {
  const colors: Record<string, { bg: string; border: string; text: string; glow: string }> = {
    emerald: { bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', text: 'text-emerald-400', glow: 'shadow-emerald-500/20' },
    amber: { bg: 'bg-amber-500/20', border: 'border-amber-500/50', text: 'text-amber-400', glow: 'shadow-amber-500/20' },
    blue: { bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'text-blue-400', glow: 'shadow-blue-500/20' },
    purple: { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-400', glow: 'shadow-purple-500/20' },
    pink: { bg: 'bg-pink-500/20', border: 'border-pink-500/50', text: 'text-pink-400', glow: 'shadow-pink-500/20' },
    cyan: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/50', text: 'text-cyan-400', glow: 'shadow-cyan-500/20' },
    orange: { bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'text-orange-400', glow: 'shadow-orange-500/20' },
    violet: { bg: 'bg-violet-500/20', border: 'border-violet-500/50', text: 'text-violet-400', glow: 'shadow-violet-500/20' },
    green: { bg: 'bg-green-500/20', border: 'border-green-500/50', text: 'text-green-400', glow: 'shadow-green-500/20' },
    slate: { bg: 'bg-slate-500/20', border: 'border-slate-500/50', text: 'text-slate-400', glow: 'shadow-slate-500/20' },
    indigo: { bg: 'bg-indigo-500/20', border: 'border-indigo-500/50', text: 'text-indigo-400', glow: 'shadow-indigo-500/20' },
  };
  return colors[color] || colors.slate;
};

// ============================================
// Automation Canvas Node
// ============================================

interface CanvasNodeProps {
  node: AutomationNode;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  onConnect: (fromHandle: 'output' | 'true' | 'false') => void;
  zoom: number;
}

export function CanvasNode({
  node,
  isSelected,
  onSelect,
  onDelete,
  onDragStart,
  onConnect,
  zoom,
}: CanvasNodeProps) {
  const allNodes = [...NODE_TYPES.triggers, ...NODE_TYPES.actions, ...NODE_TYPES.logic];
  const nodeType = allNodes.find((n) => n.type === node.type);
  const colors = getNodeColor(nodeType?.color || 'slate');
  const Icon = nodeType?.icon || Zap;

  const isCondition = node.type === 'logic_condition' || node.type === 'logic_split';
  const isTrigger = node.type.startsWith('trigger_');

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        'absolute cursor-move select-none',
        'w-[220px] rounded-xl border backdrop-blur-sm',
        'transition-all duration-200',
        colors.bg,
        colors.border,
        isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        isSelected && colors.glow,
        isSelected && 'shadow-lg'
      )}
      style={{
        left: node.position.x,
        top: node.position.y,
        transform: `scale(${zoom})`,
        transformOrigin: 'top left',
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onMouseDown={onDragStart}
    >
      {/* Input Handle */}
      {!isTrigger && (
        <div
          className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-slate-700 border-2 border-slate-500 hover:bg-primary hover:border-primary transition-colors cursor-crosshair"
          title="Conectar entrada"
        />
      )}

      {/* Header */}
      <div className={cn('flex items-center gap-2 p-3 border-b', colors.border)}>
        <div className={cn('p-1.5 rounded-lg', colors.bg)}>
          <Icon className={cn('w-4 h-4', colors.text)} />
        </div>
        <span className="text-sm font-medium text-white flex-1 truncate">
          {node.data.label || nodeType?.label}
        </span>
        {isSelected && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        {node.data.description && (
          <p className="text-xs text-slate-400 mb-2">{node.data.description}</p>
        )}
        
        {/* Node-specific preview */}
        {node.type === 'logic_delay' && node.data.config?.delay && (
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <Timer className="w-3.5 h-3.5" />
            <span>
              {node.data.config.delay.value} {node.data.config.delay.unit}
            </span>
          </div>
        )}
        
        {node.type === 'action_email' && node.data.config?.subject && (
          <div className="text-xs text-slate-300 truncate">
            "{node.data.config.subject}"
          </div>
        )}

        {node.data.stats && (
          <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/5">
            <div className="text-xs">
              <span className="text-slate-500">Enviados:</span>
              <span className="text-white ml-1">{node.data.stats.sent || 0}</span>
            </div>
            {node.data.stats.opened && (
              <div className="text-xs">
                <span className="text-slate-500">Abertos:</span>
                <span className="text-emerald-400 ml-1">{node.data.stats.opened}%</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Output Handles */}
      {isCondition ? (
        <>
          <div
            className="absolute -bottom-2 left-1/4 -translate-x-1/2 w-4 h-4 rounded-full bg-emerald-600 border-2 border-emerald-400 hover:bg-emerald-500 transition-colors cursor-crosshair"
            title="Sim"
            onClick={(e) => {
              e.stopPropagation();
              onConnect('true');
            }}
          />
          <div
            className="absolute -bottom-2 left-3/4 -translate-x-1/2 w-4 h-4 rounded-full bg-red-600 border-2 border-red-400 hover:bg-red-500 transition-colors cursor-crosshair"
            title="Não"
            onClick={(e) => {
              e.stopPropagation();
              onConnect('false');
            }}
          />
        </>
      ) : (
        <div
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-slate-700 border-2 border-slate-500 hover:bg-primary hover:border-primary transition-colors cursor-crosshair"
          title="Conectar saída"
          onClick={(e) => {
            e.stopPropagation();
            onConnect('output');
          }}
        />
      )}
    </motion.div>
  );
}

// ============================================
// Edge Component
// ============================================

interface EdgeProps {
  edge: AutomationEdge;
  nodes: AutomationNode[];
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  zoom: number;
}

export function CanvasEdge({ edge, nodes, isSelected, onSelect, onDelete, zoom }: EdgeProps) {
  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);

  if (!sourceNode || !targetNode) return null;

  const sourceX = sourceNode.position.x + 110; // center of 220px node
  const sourceY = sourceNode.position.y + 100; // bottom of node
  const targetX = targetNode.position.x + 110;
  const targetY = targetNode.position.y;

  // Adjust source position for condition nodes
  if (edge.sourceHandle === 'true') {
    // Left handle
  } else if (edge.sourceHandle === 'false') {
    // Right handle
  }

  const midY = (sourceY + targetY) / 2;

  const path = `M ${sourceX} ${sourceY} C ${sourceX} ${midY}, ${targetX} ${midY}, ${targetX} ${targetY}`;

  const edgeColor = edge.sourceHandle === 'true' 
    ? '#10b981' 
    : edge.sourceHandle === 'false' 
    ? '#ef4444' 
    : '#8b5cf6';

  return (
    <g onClick={onSelect} className="cursor-pointer">
      {/* Invisible wider path for easier clicking */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
      />
      {/* Visible path */}
      <path
        d={path}
        fill="none"
        stroke={isSelected ? '#ffffff' : edgeColor}
        strokeWidth={isSelected ? 3 : 2}
        strokeDasharray={edge.animated ? '5,5' : undefined}
        className={cn(edge.animated && 'animate-dash')}
      />
      {/* Arrow */}
      <circle
        cx={targetX}
        cy={targetY - 8}
        r={4}
        fill={isSelected ? '#ffffff' : edgeColor}
      />
      {/* Delete button when selected */}
      {isSelected && (
        <g
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="cursor-pointer"
        >
          <circle
            cx={(sourceX + targetX) / 2}
            cy={(sourceY + targetY) / 2}
            r={12}
            fill="#1e293b"
            stroke="#ef4444"
            strokeWidth={2}
          />
          <text
            x={(sourceX + targetX) / 2}
            y={(sourceY + targetY) / 2 + 4}
            textAnchor="middle"
            fill="#ef4444"
            fontSize={14}
          >
            ×
          </text>
        </g>
      )}
    </g>
  );
}

// ============================================
// Node Palette
// ============================================

interface NodePaletteProps {
  onAddNode: (type: string) => void;
}

export function NodePalette({ onAddNode }: NodePaletteProps) {
  const [expanded, setExpanded] = useState<string | null>('triggers');

  const sections = [
    { id: 'triggers', label: 'Gatilhos', icon: Zap, nodes: NODE_TYPES.triggers },
    { id: 'actions', label: 'Ações', icon: Send, nodes: NODE_TYPES.actions },
    { id: 'logic', label: 'Lógica', icon: GitBranch, nodes: NODE_TYPES.logic },
  ];

  return (
    <div className="w-64 bg-slate-900/50 border-r border-white/5 overflow-y-auto">
      <div className="p-4 border-b border-white/5">
        <h3 className="text-sm font-semibold text-white">Blocos</h3>
        <p className="text-xs text-slate-400 mt-1">Arraste para o canvas</p>
      </div>

      {sections.map((section) => (
        <div key={section.id} className="border-b border-white/5">
          <button
            onClick={() => setExpanded(expanded === section.id ? null : section.id)}
            className="w-full flex items-center gap-2 p-3 hover:bg-white/5 transition-colors"
          >
            <section.icon className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-white flex-1 text-left">
              {section.label}
            </span>
            {expanded === section.id ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
          </button>

          <AnimatePresence>
            {expanded === section.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-2 space-y-1">
                  {section.nodes.map((node) => {
                    const colors = getNodeColor(node.color);
                    return (
                      <button
                        key={node.type}
                        onClick={() => onAddNode(node.type)}
                        className={cn(
                          'w-full flex items-center gap-2 p-2 rounded-lg',
                          'border border-transparent',
                          'hover:border-white/10 hover:bg-white/5',
                          'transition-all duration-200',
                          'group cursor-grab active:cursor-grabbing'
                        )}
                      >
                        <div className={cn('p-1.5 rounded-lg', colors.bg)}>
                          <node.icon className={cn('w-3.5 h-3.5', colors.text)} />
                        </div>
                        <span className="text-xs text-slate-300 group-hover:text-white transition-colors">
                          {node.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

// ============================================
// Node Properties Panel
// ============================================

interface NodePropertiesProps {
  node: AutomationNode | null;
  onUpdate: (updates: Partial<AutomationNode['data']>) => void;
  onClose: () => void;
}

export function NodeProperties({ node, onUpdate, onClose }: NodePropertiesProps) {
  if (!node) return null;

  const allNodes = [...NODE_TYPES.triggers, ...NODE_TYPES.actions, ...NODE_TYPES.logic];
  const nodeType = allNodes.find((n) => n.type === node.type);
  const colors = getNodeColor(nodeType?.color || 'slate');
  const Icon = nodeType?.icon || Zap;

  return (
    <div className="w-80 bg-slate-900/50 border-l border-white/5 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className={cn('p-2 rounded-lg', colors.bg)}>
            <Icon className={cn('w-4 h-4', colors.text)} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{nodeType?.label}</h3>
            <p className="text-xs text-slate-400">Configurações</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Properties Form */}
      <div className="p-4 space-y-4">
        <Input
          label="Nome do bloco"
          value={node.data.label || ''}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder={nodeType?.label}
        />

        <Textarea
          label="Descrição"
          value={node.data.description || ''}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Adicione uma descrição..."
          rows={2}
        />

        {/* Type-specific fields */}
        {node.type === 'logic_delay' && (
          <div className="space-y-3">
            <label className="text-sm font-medium text-white">Tempo de espera</label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={node.data.config?.delay?.value || 1}
                onChange={(e) =>
                  onUpdate({
                    config: {
                      ...node.data.config,
                      delay: {
                        ...node.data.config?.delay,
                        value: parseInt(e.target.value),
                      },
                    },
                  })
                }
                className="flex-1"
              />
              <select
                value={node.data.config?.delay?.unit || 'hours'}
                onChange={(e) =>
                  onUpdate({
                    config: {
                      ...node.data.config,
                      delay: {
                        ...node.data.config?.delay,
                        unit: e.target.value as 'minutes' | 'hours' | 'days',
                      },
                    },
                  })
                }
                className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="minutes">Minutos</option>
                <option value="hours">Horas</option>
                <option value="days">Dias</option>
              </select>
            </div>
          </div>
        )}

        {node.type === 'action_email' && (
          <div className="space-y-3">
            <Input
              label="Assunto do email"
              value={node.data.config?.subject || ''}
              onChange={(e) =>
                onUpdate({
                  config: { ...node.data.config, subject: e.target.value },
                })
              }
              placeholder="Assunto do email..."
            />
            <div>
              <label className="text-sm font-medium text-white mb-2 block">Template</label>
              <select
                value={node.data.config?.templateId || ''}
                onChange={(e) =>
                  onUpdate({
                    config: { ...node.data.config, templateId: e.target.value },
                  })
                }
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">Selecionar template...</option>
                <option value="welcome">Boas-vindas</option>
                <option value="abandon">Carrinho Abandonado</option>
                <option value="order_confirm">Confirmação de Pedido</option>
                <option value="review">Solicitar Avaliação</option>
              </select>
            </div>
          </div>
        )}

        {node.type === 'action_whatsapp' && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-white mb-2 block">Template WhatsApp</label>
              <select
                value={node.data.config?.templateId || ''}
                onChange={(e) =>
                  onUpdate({
                    config: { ...node.data.config, templateId: e.target.value },
                  })
                }
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">Selecionar template...</option>
                <option value="order_update">Atualização de Pedido</option>
                <option value="abandon_cart">Lembrete Carrinho</option>
                <option value="promo">Promoção</option>
              </select>
            </div>
          </div>
        )}

        {node.type === 'logic_condition' && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-white mb-2 block">Condição</label>
              <select
                value={node.data.config?.conditionType || ''}
                onChange={(e) =>
                  onUpdate({
                    config: { ...node.data.config, conditionType: e.target.value },
                  })
                }
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">Selecionar condição...</option>
                <option value="has_tag">Possui tag</option>
                <option value="email_opened">Abriu email anterior</option>
                <option value="order_value">Valor do pedido</option>
                <option value="order_count">Quantidade de pedidos</option>
                <option value="segment">Está em segmento</option>
              </select>
            </div>
          </div>
        )}

        {node.type === 'logic_split' && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-white mb-2 block">Distribuição</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={node.data.config?.splitPercentage || 50}
                  onChange={(e) =>
                    onUpdate({
                      config: { ...node.data.config, splitPercentage: parseInt(e.target.value) },
                    })
                  }
                  min={1}
                  max={99}
                  className="flex-1"
                />
                <span className="text-sm text-slate-400">%</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Grupo A: {node.data.config?.splitPercentage || 50}% / Grupo B: {100 - (node.data.config?.splitPercentage || 50)}%
              </p>
            </div>
          </div>
        )}

        {node.type === 'action_tag' && (
          <div className="space-y-3">
            <Input
              label="Nome da tag"
              value={node.data.config?.tagName || ''}
              onChange={(e) =>
                onUpdate({
                  config: { ...node.data.config, tagName: e.target.value },
                })
              }
              placeholder="Ex: cliente-vip"
            />
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="removeTag"
                checked={node.data.config?.removeTag || false}
                onChange={(e) =>
                  onUpdate({
                    config: { ...node.data.config, removeTag: e.target.checked },
                  })
                }
                className="rounded border-white/20 bg-slate-800 text-primary"
              />
              <label htmlFor="removeTag" className="text-sm text-slate-300">
                Remover tag (ao invés de adicionar)
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Stats (if available) */}
      {node.data.stats && (
        <div className="p-4 border-t border-white/5">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Estatísticas
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/50 rounded-lg p-3">
              <p className="text-xs text-slate-400">Processados</p>
              <p className="text-lg font-semibold text-white">{node.data.stats.sent || 0}</p>
            </div>
            {node.data.stats.opened && (
              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Taxa Abertura</p>
                <p className="text-lg font-semibold text-emerald-400">{node.data.stats.opened}%</p>
              </div>
            )}
            {node.data.stats.clicked && (
              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Taxa Cliques</p>
                <p className="text-lg font-semibold text-cyan-400">{node.data.stats.clicked}%</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Main Automation Canvas
// ============================================

interface AutomationCanvasProps {
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  onNodesChange: (nodes: AutomationNode[]) => void;
  onEdgesChange: (edges: AutomationEdge[]) => void;
}

export function AutomationCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
}: AutomationCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [connectingFrom, setConnectingFrom] = useState<{
    nodeId: string;
    handle: 'output' | 'true' | 'false';
  } | null>(null);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  const handleAddNode = useCallback(
    (type: string) => {
      const newNode: AutomationNode = {
        id: `node-${Date.now()}`,
        type,
        position: {
          x: 300 + Math.random() * 200,
          y: 100 + nodes.length * 120,
        },
        data: {
          label: '',
          config: {},
        },
      };
      onNodesChange([...nodes, newNode]);
      setSelectedNodeId(newNode.id);
    },
    [nodes, onNodesChange]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      onNodesChange(nodes.filter((n) => n.id !== nodeId));
      onEdgesChange(edges.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNodeId(null);
    },
    [nodes, edges, onNodesChange, onEdgesChange]
  );

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      onEdgesChange(edges.filter((e) => e.id !== edgeId));
      setSelectedEdgeId(null);
    },
    [edges, onEdgesChange]
  );

  const handleNodeDragStart = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setSelectedNodeId(nodeId);
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !selectedNodeId) return;

      const dx = (e.clientX - dragStart.x) / zoom;
      const dy = (e.clientY - dragStart.y) / zoom;

      onNodesChange(
        nodes.map((node) =>
          node.id === selectedNodeId
            ? {
                ...node,
                position: {
                  x: node.position.x + dx,
                  y: node.position.y + dy,
                },
              }
            : node
        )
      );

      setDragStart({ x: e.clientX, y: e.clientY });
    },
    [isDragging, selectedNodeId, dragStart, zoom, nodes, onNodesChange]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleNodeUpdateData = useCallback(
    (updates: Partial<AutomationNode['data']>) => {
      if (!selectedNodeId) return;
      onNodesChange(
        nodes.map((node) =>
          node.id === selectedNodeId
            ? { ...node, data: { ...node.data, ...updates } }
            : node
        )
      );
    },
    [selectedNodeId, nodes, onNodesChange]
  );

  const handleConnect = useCallback(
    (fromNodeId: string, fromHandle: 'output' | 'true' | 'false') => {
      if (connectingFrom) {
        // Complete connection
        if (connectingFrom.nodeId !== fromNodeId) {
          const newEdge: AutomationEdge = {
            id: `edge-${Date.now()}`,
            source: connectingFrom.nodeId,
            target: fromNodeId,
            sourceHandle: connectingFrom.handle,
          };
          onEdgesChange([...edges, newEdge]);
        }
        setConnectingFrom(null);
      } else {
        // Start connection
        setConnectingFrom({ nodeId: fromNodeId, handle: fromHandle });
      }
    },
    [connectingFrom, edges, onEdgesChange]
  );

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      {/* Node Palette */}
      <NodePalette onAddNode={handleAddNode} />

      {/* Canvas Area */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-slate-900/30">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <Undo className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <Redo className="w-4 h-4" />
            </Button>
            <div className="w-px h-6 bg-white/10 mx-2" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoom(Math.max(0.25, zoom - 0.1))}
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-sm text-slate-400 w-12 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoom(Math.min(2, zoom + 0.1))}
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setZoom(1)}>
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <Save className="w-4 h-4 mr-2" />
              Salvar
            </Button>
            <Button variant="primary" size="sm">
              <Play className="w-4 h-4 mr-2" />
              Ativar
            </Button>
          </div>
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 relative overflow-hidden bg-slate-950"
          style={{
            backgroundImage: `
              radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)
            `,
            backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={() => {
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
            setConnectingFrom(null);
          }}
        >
          {/* SVG for edges */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <g style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
              {edges.map((edge) => (
                <CanvasEdge
                  key={edge.id}
                  edge={edge}
                  nodes={nodes}
                  isSelected={selectedEdgeId === edge.id}
                  onSelect={() => {
                    setSelectedEdgeId(edge.id);
                    setSelectedNodeId(null);
                  }}
                  onDelete={() => handleDeleteEdge(edge.id)}
                  zoom={zoom}
                />
              ))}
            </g>
          </svg>

          {/* Nodes */}
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px)`,
            }}
          >
            {nodes.map((node) => (
              <CanvasNode
                key={node.id}
                node={node}
                isSelected={selectedNodeId === node.id}
                onSelect={() => {
                  setSelectedNodeId(node.id);
                  setSelectedEdgeId(null);
                }}
                onDelete={() => handleDeleteNode(node.id)}
                onDragStart={(e) => handleNodeDragStart(node.id, e)}
                onConnect={(handle) => handleConnect(node.id, handle)}
                zoom={zoom}
              />
            ))}
          </div>

          {/* Connecting indicator */}
          {connectingFrom && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-primary/20 border border-primary/50 rounded-lg px-4 py-2 text-sm text-primary">
              Clique em outro nó para conectar
              <button
                onClick={() => setConnectingFrom(null)}
                className="ml-2 text-primary/70 hover:text-primary"
              >
                (cancelar)
              </button>
            </div>
          )}

          {/* Empty state */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  Comece sua automação
                </h3>
                <p className="text-sm text-slate-400 mb-4">
                  Adicione um gatilho da barra lateral para começar
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Properties Panel */}
      {selectedNode && (
        <NodeProperties
          node={selectedNode}
          onUpdate={handleNodeUpdateData}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}

// ============================================
// Automation List Item
// ============================================

interface AutomationListItemProps {
  automation: {
    id: string;
    name: string;
    description?: string;
    status: 'active' | 'draft' | 'paused';
    trigger: string;
    stats?: {
      sent: number;
      converted: number;
      revenue: number;
    };
    updatedAt: string;
  };
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
}

export function AutomationListItem({
  automation,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleStatus,
}: AutomationListItemProps) {
  const statusColors = {
    active: 'success',
    draft: 'default',
    paused: 'warning',
  } as const;

  const statusLabels = {
    active: 'Ativa',
    draft: 'Rascunho',
    paused: 'Pausada',
  };

  const triggerInfo = NODE_TYPES.triggers.find((t) => t.type === automation.trigger);
  const TriggerIcon = triggerInfo?.icon || Zap;
  const triggerColors = getNodeColor(triggerInfo?.color || 'slate');

  return (
    <Card variant="glass" className="p-4 hover:bg-white/5 transition-colors">
      <div className="flex items-start gap-4">
        {/* Trigger Icon */}
        <div className={cn('p-3 rounded-xl', triggerColors.bg)}>
          <TriggerIcon className={cn('w-5 h-5', triggerColors.text)} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-white truncate">{automation.name}</h3>
            <Badge variant={statusColors[automation.status]}>
              {statusLabels[automation.status]}
            </Badge>
          </div>
          {automation.description && (
            <p className="text-sm text-slate-400 truncate">{automation.description}</p>
          )}
          <p className="text-xs text-slate-500 mt-1">
            {triggerInfo?.label} • Atualizada em {automation.updatedAt}
          </p>
        </div>

        {/* Stats */}
        {automation.stats && automation.status === 'active' && (
          <div className="flex items-center gap-6 text-center">
            <div>
              <p className="text-lg font-semibold text-white">
                {automation.stats.sent.toLocaleString('pt-BR')}
              </p>
              <p className="text-xs text-slate-400">Enviados</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-emerald-400">
                {automation.stats.converted.toLocaleString('pt-BR')}
              </p>
              <p className="text-xs text-slate-400">Convertidos</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-primary">
                R$ {automation.stats.revenue.toLocaleString('pt-BR')}
              </p>
              <p className="text-xs text-slate-400">Receita</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onToggleStatus}>
            {automation.status === 'active' ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Settings className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDuplicate}>
            <Copy className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="w-4 h-4 text-red-400" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ============================================
// Automation Templates
// ============================================

export const AUTOMATION_TEMPLATES = [
  {
    id: 'welcome',
    name: 'Série de Boas-vindas',
    description: 'Envie uma série de emails para novos assinantes',
    trigger: 'trigger_signup',
    nodes: 3,
    category: 'engagement',
  },
  {
    id: 'abandon',
    name: 'Recuperação de Carrinho',
    description: 'Recupere carrinhos abandonados com emails e WhatsApp',
    trigger: 'trigger_abandon',
    nodes: 5,
    category: 'recovery',
  },
  {
    id: 'post_purchase',
    name: 'Pós-compra',
    description: 'Engaje clientes após a compra com cross-sell',
    trigger: 'trigger_order',
    nodes: 4,
    category: 'sales',
  },
  {
    id: 'winback',
    name: 'Reativação',
    description: 'Reative clientes inativos com ofertas especiais',
    trigger: 'trigger_segment',
    nodes: 4,
    category: 'recovery',
  },
  {
    id: 'birthday',
    name: 'Aniversário',
    description: 'Parabenize clientes no aniversário com desconto',
    trigger: 'trigger_date',
    nodes: 2,
    category: 'engagement',
  },
  {
    id: 'review',
    name: 'Solicitar Avaliação',
    description: 'Peça avaliações após entrega do pedido',
    trigger: 'trigger_order',
    nodes: 3,
    category: 'engagement',
  },
];

interface AutomationTemplateCardProps {
  template: typeof AUTOMATION_TEMPLATES[0];
  onSelect: () => void;
}

export function AutomationTemplateCard({ template, onSelect }: AutomationTemplateCardProps) {
  const triggerInfo = NODE_TYPES.triggers.find((t) => t.type === template.trigger);
  const TriggerIcon = triggerInfo?.icon || Zap;
  const triggerColors = getNodeColor(triggerInfo?.color || 'slate');

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left p-4 rounded-xl border border-white/10',
        'bg-slate-900/50 hover:bg-slate-800/50',
        'transition-all duration-200',
        'group'
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg', triggerColors.bg)}>
          <TriggerIcon className={cn('w-4 h-4', triggerColors.text)} />
        </div>
        <div className="flex-1">
          <h4 className="font-medium text-white group-hover:text-primary transition-colors">
            {template.name}
          </h4>
          <p className="text-xs text-slate-400 mt-1">{template.description}</p>
          <p className="text-xs text-slate-500 mt-2">
            {template.nodes} blocos • {triggerInfo?.label}
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-primary group-hover:translate-x-1 transition-all" />
      </div>
    </button>
  );
}
