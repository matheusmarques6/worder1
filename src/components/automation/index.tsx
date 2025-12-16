'use client';

import React, { useState, useCallback, useRef, useEffect, DragEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  Save,
  ZoomIn,
  ZoomOut,
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
  ChevronRight,
  Send,
  Split,
  UserPlus,
  Package,
  Star,
  Webhook,
  Database,
  Trophy,
  XCircle,
  PlusCircle,
  MoveRight,
  Briefcase,
  PlayCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { Button, Input, Badge, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';
import { AutomationNode, AutomationEdge } from '@/types';

// ============================================
// Node Type Definitions
// ============================================

export const NODE_TYPES = {
  triggers: [
    { type: 'trigger_order', label: 'Pedido Realizado', icon: ShoppingCart, color: 'emerald' },
    { type: 'trigger_abandon', label: 'Carrinho Abandonado', icon: Package, color: 'amber' },
    { type: 'trigger_signup', label: 'Novo Cadastro', icon: UserPlus, color: 'blue' },
    { type: 'trigger_tag', label: 'Tag Adicionada', icon: Tag, color: 'purple' },
    { type: 'trigger_deal_created', label: 'Deal Criado', icon: Briefcase, color: 'blue' },
    { type: 'trigger_deal_stage', label: 'Deal Mudou Estágio', icon: MoveRight, color: 'violet' },
    { type: 'trigger_deal_won', label: 'Deal Ganho', icon: Trophy, color: 'emerald' },
    { type: 'trigger_deal_lost', label: 'Deal Perdido', icon: XCircle, color: 'red' },
    { type: 'trigger_date', label: 'Data Especial', icon: Star, color: 'pink' },
    { type: 'trigger_segment', label: 'Entrou em Segmento', icon: Users, color: 'cyan' },
    { type: 'trigger_webhook', label: 'Webhook', icon: Webhook, color: 'orange' },
  ],
  actions: [
    { type: 'action_email', label: 'Enviar Email', icon: Mail, color: 'violet' },
    { type: 'action_whatsapp', label: 'Enviar WhatsApp', icon: MessageSquare, color: 'green' },
    { type: 'action_sms', label: 'Enviar SMS', icon: Send, color: 'blue' },
    { type: 'action_tag', label: 'Adicionar Tag', icon: Tag, color: 'purple' },
    { type: 'action_update', label: 'Atualizar Contato', icon: Database, color: 'cyan' },
    { type: 'action_create_deal', label: 'Criar Deal', icon: PlusCircle, color: 'blue' },
    { type: 'action_move_deal', label: 'Mover Deal', icon: MoveRight, color: 'violet' },
    { type: 'action_assign_deal', label: 'Atribuir Deal', icon: UserPlus, color: 'cyan' },
    { type: 'action_notify', label: 'Notificação Interna', icon: Bell, color: 'amber' },
    { type: 'action_webhook', label: 'Chamar Webhook', icon: Webhook, color: 'slate' },
  ],
  logic: [
    { type: 'logic_delay', label: 'Aguardar', icon: Clock, color: 'slate' },
    { type: 'logic_condition', label: 'Condição', icon: GitBranch, color: 'orange' },
    { type: 'logic_split', label: 'Teste A/B', icon: Split, color: 'pink' },
    { type: 'logic_filter', label: 'Filtrar', icon: Filter, color: 'indigo' },
  ],
} as const;

// ============================================
// Color Utilities
// ============================================

const getNodeColor = (color: string) => {
  const colors: Record<string, { bg: string; border: string; text: string; glow: string; solid: string }> = {
    emerald: { bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', text: 'text-emerald-400', glow: 'shadow-emerald-500/30', solid: 'bg-emerald-500' },
    amber: { bg: 'bg-amber-500/20', border: 'border-amber-500/50', text: 'text-amber-400', glow: 'shadow-amber-500/30', solid: 'bg-amber-500' },
    blue: { bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'text-blue-400', glow: 'shadow-blue-500/30', solid: 'bg-blue-500' },
    purple: { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-400', glow: 'shadow-purple-500/30', solid: 'bg-purple-500' },
    pink: { bg: 'bg-pink-500/20', border: 'border-pink-500/50', text: 'text-pink-400', glow: 'shadow-pink-500/30', solid: 'bg-pink-500' },
    cyan: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/50', text: 'text-cyan-400', glow: 'shadow-cyan-500/30', solid: 'bg-cyan-500' },
    orange: { bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'text-orange-400', glow: 'shadow-orange-500/30', solid: 'bg-orange-500' },
    violet: { bg: 'bg-violet-500/20', border: 'border-violet-500/50', text: 'text-violet-400', glow: 'shadow-violet-500/30', solid: 'bg-violet-500' },
    green: { bg: 'bg-green-500/20', border: 'border-green-500/50', text: 'text-green-400', glow: 'shadow-green-500/30', solid: 'bg-green-500' },
    slate: { bg: 'bg-dark-600/20', border: 'border-dark-600/50', text: 'text-dark-500', glow: 'shadow-dark-600/30', solid: 'bg-dark-600' },
    indigo: { bg: 'bg-indigo-500/20', border: 'border-indigo-500/50', text: 'text-indigo-400', glow: 'shadow-indigo-500/30', solid: 'bg-indigo-500' },
    red: { bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'text-red-400', glow: 'shadow-red-500/30', solid: 'bg-red-500' },
  };
  return colors[color] || colors.slate;
};

// ============================================
// Canvas Node Component
// ============================================

interface CanvasNodeProps {
  node: AutomationNode;
  isSelected: boolean;
  onSelect: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  onStartConnection: (handle: string) => void;
  onEndConnection: () => void;
  isConnecting: boolean;
}

function CanvasNode({
  node,
  isSelected,
  onSelect,
  onDragStart,
  onStartConnection,
  onEndConnection,
  isConnecting,
}: CanvasNodeProps) {
  const [isHoveringInput, setIsHoveringInput] = useState(false);
  
  const allNodes = [...NODE_TYPES.triggers, ...NODE_TYPES.actions, ...NODE_TYPES.logic];
  const nodeType = allNodes.find((n) => n.type === node.type);
  const colors = getNodeColor(nodeType?.color || 'slate');
  const Icon = nodeType?.icon || Zap;
  
  const isTrigger = node.type?.startsWith('trigger_');
  const isCondition = node.type === 'logic_condition' || node.type === 'logic_split';

  // Handler para iniciar conexão (mousedown no handle de saída)
  const handleOutputMouseDown = (e: React.MouseEvent, handle: string = 'output') => {
    e.stopPropagation();
    e.preventDefault();
    onStartConnection(handle);
  };

  // Efeito para detectar mouseup global quando está conectando
  useEffect(() => {
    if (!isConnecting) return;
    
    const handleGlobalMouseUp = () => {
      if (isHoveringInput) {
        onEndConnection();
      }
    };
    
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isConnecting, isHoveringInput, onEndConnection]);

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="absolute"
      style={{
        left: node.position.x,
        top: node.position.y,
        zIndex: isSelected ? 10 : 1,
      }}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onMouseDown={(e) => {
          // Só inicia drag se não clicar em um handle
          const target = e.target as HTMLElement;
          if (!target.classList.contains('connection-handle')) {
            onDragStart(e);
          }
        }}
        className={cn(
          'relative cursor-move select-none transition-all duration-200',
          isSelected && 'scale-105'
        )}
      >
        {/* Container do Nó */}
        <div
          className={cn(
            'relative min-w-[220px] rounded-2xl overflow-hidden',
            'backdrop-blur-sm transition-all duration-200',
            isSelected 
              ? `ring-2 ring-white/50 shadow-2xl ${colors.glow}` 
              : 'hover:ring-1 hover:ring-white/20 shadow-lg'
          )}
        >
          {/* Header colorido para Triggers */}
          {isTrigger && (
            <div className={cn(
              'px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white flex items-center gap-2',
              colors.solid
            )}>
              <Zap className="w-3.5 h-3.5" />
              Gatilho
            </div>
          )}
          
          {/* Corpo do nó */}
          <div className={cn(
            'p-4',
            isTrigger 
              ? 'bg-dark-950/95 border-x-2 border-b-2 border-dark-800/50 rounded-b-2xl' 
              : `bg-dark-900/90 border-2 ${colors.border} rounded-2xl`
          )}>
            <div className="flex items-center gap-3">
              {/* Ícone */}
              <div className={cn(
                'p-3 rounded-xl',
                isTrigger ? colors.bg : 'bg-white/10'
              )}>
                <Icon className={cn('w-5 h-5', colors.text)} />
              </div>
              
              {/* Label */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white text-sm truncate">
                  {node.data.label || nodeType?.label}
                </p>
                {node.data.description && (
                  <p className="text-xs text-dark-500 truncate mt-0.5">
                    {node.data.description}
                  </p>
                )}
              </div>
            </div>

            {/* Config Preview */}
            {node.data.config && Object.keys(node.data.config).length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <div className="flex flex-wrap gap-1.5">
                  {node.data.config.tagName && (
                    <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-[10px] rounded-full">
                      #{node.data.config.tagName}
                    </span>
                  )}
                  {node.data.config.delay && (
                    <span className="px-2 py-0.5 bg-dark-600/20 text-dark-400 text-[10px] rounded-full">
                      ⏱ {node.data.config.delay.value} {node.data.config.delay.unit}
                    </span>
                  )}
                  {node.data.config.subject && (
                    <span className="px-2 py-0.5 bg-violet-500/20 text-violet-300 text-[10px] rounded-full truncate max-w-[150px]">
                      📧 {node.data.config.subject}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Handle de Entrada (topo) - RECEBE conexão */}
        {!isTrigger && (
          <div
            onMouseEnter={() => setIsHoveringInput(true)}
            onMouseLeave={() => setIsHoveringInput(false)}
            className={cn(
              'connection-handle absolute -top-4 left-1/2 -translate-x-1/2',
              'w-8 h-8 rounded-full',
              'flex items-center justify-center',
              'transition-all duration-150 cursor-crosshair z-20',
              isConnecting && isHoveringInput
                ? 'bg-emerald-500 border-4 border-white scale-150 shadow-lg shadow-emerald-500/50' 
                : isConnecting 
                  ? 'bg-emerald-500/50 border-4 border-emerald-300 scale-125 animate-pulse shadow-lg shadow-emerald-500/30' 
                  : 'bg-[#1a1a1a] border-4 border-[#333333] hover:border-emerald-400 hover:bg-emerald-500 hover:scale-110'
            )}
          >
            <div className={cn(
              'w-2 h-2 rounded-full',
              isConnecting ? 'bg-white' : 'bg-gray-500'
            )} />
          </div>
        )}

        {/* Handle de Saída (baixo) - INICIA conexão */}
        {!isCondition ? (
          <div
            onMouseDown={(e) => handleOutputMouseDown(e, 'output')}
            className={cn(
              'connection-handle absolute -bottom-4 left-1/2 -translate-x-1/2',
              'w-8 h-8 rounded-full',
              'flex items-center justify-center',
              'transition-all duration-150 cursor-crosshair z-20',
              'bg-[#1a1a1a] border-4 border-[#333333] hover:border-primary-500 hover:bg-primary-500 hover:scale-110'
            )}
          >
            <div className="w-2 h-2 rounded-full bg-gray-500" />
          </div>
        ) : (
          <>
            {/* Handle Verdadeiro */}
            <div
              onMouseDown={(e) => handleOutputMouseDown(e, 'true')}
              className={cn(
                'connection-handle absolute -bottom-4 left-1/4 -translate-x-1/2',
                'w-7 h-7 rounded-full',
                'flex items-center justify-center',
                'bg-emerald-500/30 border-4 border-emerald-500',
                'hover:bg-emerald-500 hover:scale-110',
                'transition-all duration-150 cursor-crosshair z-20'
              )}
            >
              <div className="w-2 h-2 rounded-full bg-emerald-300" />
            </div>
            {/* Handle Falso */}
            <div
              onMouseDown={(e) => handleOutputMouseDown(e, 'false')}
              className={cn(
                'connection-handle absolute -bottom-4 left-3/4 -translate-x-1/2',
                'w-7 h-7 rounded-full',
                'flex items-center justify-center',
                'bg-red-500/30 border-4 border-red-500',
                'hover:bg-red-500 hover:scale-110',
                'transition-all duration-150 cursor-crosshair z-20'
              )}
            >
              <div className="w-2 h-2 rounded-full bg-red-300" />
            </div>
            <span className="absolute -bottom-10 left-1/4 -translate-x-1/2 text-[10px] text-emerald-400 font-semibold">Sim</span>
            <span className="absolute -bottom-10 left-3/4 -translate-x-1/2 text-[10px] text-red-400 font-semibold">Não</span>
          </>
        )}
      </div>
    </motion.div>
  );
}

// ============================================
// Connection Lines
// ============================================

interface ConnectionLinesProps {
  edges: AutomationEdge[];
  nodes: AutomationNode[];
  tempConnection: { fromNode: string; fromHandle: string; toX: number; toY: number } | null;
}

function ConnectionLines({ edges, nodes, tempConnection }: ConnectionLinesProps) {
  const getOutputPosition = (nodeId: string, handle: string = 'output') => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };
    
    const isTrigger = node.type?.startsWith('trigger_');
    const isCondition = node.type === 'logic_condition' || node.type === 'logic_split';
    
    const width = 220;
    const height = isTrigger ? 100 : 80;
    
    if (isCondition) {
      if (handle === 'true') {
        return { x: node.position.x + width * 0.25, y: node.position.y + height + 16 };
      }
      if (handle === 'false') {
        return { x: node.position.x + width * 0.75, y: node.position.y + height + 16 };
      }
    }
    
    return { x: node.position.x + width / 2, y: node.position.y + height + 16 };
  };

  const getInputPosition = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };
    
    const width = 220;
    return { x: node.position.x + width / 2, y: node.position.y - 16 };
  };

  const createSmoothPath = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Curva mais suave baseada na distância
    const curvature = Math.min(distance * 0.4, 120);
    
    // Pontos de controle para curva Bezier
    const c1x = from.x;
    const c1y = from.y + curvature;
    const c2x = to.x;
    const c2y = to.y - curvature;
    
    return `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`;
  };

  // Calcular bounding box
  const allPositions = nodes.flatMap(n => [
    { x: n.position.x - 50, y: n.position.y - 50 },
    { x: n.position.x + 300, y: n.position.y + 200 }
  ]);
  
  if (tempConnection) {
    allPositions.push({ x: tempConnection.toX - 50, y: tempConnection.toY - 50 });
    allPositions.push({ x: tempConnection.toX + 50, y: tempConnection.toY + 50 });
  }

  if (allPositions.length === 0) {
    return null;
  }

  const minX = Math.min(...allPositions.map(p => p.x));
  const minY = Math.min(...allPositions.map(p => p.y));
  const maxX = Math.max(...allPositions.map(p => p.x));
  const maxY = Math.max(...allPositions.map(p => p.y));
  
  const width = maxX - minX || 100;
  const height = maxY - minY || 100;

  return (
    <svg 
      className="absolute pointer-events-none overflow-visible"
      style={{ 
        left: minX,
        top: minY,
        width: width,
        height: height,
        zIndex: 0,
      }}
      viewBox={`${minX} ${minY} ${width} ${height}`}
    >
      <defs>
        {/* Animação de fluxo */}
        <style>
          {`
            @keyframes flowAnimation {
              from { stroke-dashoffset: 24; }
              to { stroke-dashoffset: 0; }
            }
            @keyframes flowAnimationReverse {
              from { stroke-dashoffset: 0; }
              to { stroke-dashoffset: 24; }
            }
            .flow-line {
              animation: flowAnimation 1s linear infinite;
            }
            .flow-line-temp {
              animation: flowAnimation 0.5s linear infinite;
            }
          `}
        </style>
        
        {/* Gradientes */}
        <linearGradient id="lineGradientBlue" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        
        <linearGradient id="lineGradientGreen" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="50%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
        
        <linearGradient id="lineGradientRed" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="50%" stopColor="#f87171" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>

        {/* Glow filter */}
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Conexões salvas */}
      {edges.map((edge) => {
        const from = getOutputPosition(edge.source, edge.sourceHandle || 'output');
        const to = getInputPosition(edge.target);
        
        const targetNode = nodes.find(n => n.id === edge.target);
        if (!targetNode) return null;
        
        const isTrue = edge.sourceHandle === 'true';
        const isFalse = edge.sourceHandle === 'false';
        const gradient = isTrue ? 'url(#lineGradientGreen)' : isFalse ? 'url(#lineGradientRed)' : 'url(#lineGradientBlue)';
        const solidColor = isTrue ? '#10b981' : isFalse ? '#ef4444' : '#6366f1';
        const glowColor = isTrue ? '#10b98150' : isFalse ? '#ef444450' : '#6366f150';
        
        const path = createSmoothPath(from, to);
        
        return (
          <g key={edge.id}>
            {/* Glow/sombra da linha */}
            <path
              d={path}
              fill="none"
              stroke={glowColor}
              strokeWidth="8"
              strokeLinecap="round"
            />
            
            {/* Linha base (fundo) */}
            <path
              d={path}
              fill="none"
              stroke={solidColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeOpacity="0.3"
            />
            
            {/* Linha animada (tracejada fluindo) */}
            <path
              d={path}
              fill="none"
              stroke={solidColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="8 4"
              className="flow-line"
            />
            
            {/* Círculo no ponto de origem */}
            <circle
              cx={from.x}
              cy={from.y}
              r="5"
              fill={solidColor}
              stroke="#0a0a0a"
              strokeWidth="2"
            />
            
            {/* Círculo no ponto de destino */}
            <circle
              cx={to.x}
              cy={to.y}
              r="5"
              fill={solidColor}
              stroke="#0a0a0a"
              strokeWidth="2"
            />
          </g>
        );
      })}
      
      {/* Conexão temporária (enquanto arrasta) */}
      {tempConnection && (() => {
        const from = getOutputPosition(tempConnection.fromNode, tempConnection.fromHandle);
        const to = { x: tempConnection.toX, y: tempConnection.toY };
        const path = createSmoothPath(from, to);
        
        return (
          <g>
            {/* Glow da linha temporária */}
            <path
              d={path}
              fill="none"
              stroke="#6366f130"
              strokeWidth="10"
              strokeLinecap="round"
            />
            
            {/* Linha tracejada animada */}
            <path
              d={path}
              fill="none"
              stroke="#818cf8"
              strokeWidth="3"
              strokeDasharray="8 4"
              strokeLinecap="round"
              className="flow-line-temp"
            />
            
            {/* Círculo na origem */}
            <circle
              cx={from.x}
              cy={from.y}
              r="6"
              fill="#818cf8"
              stroke="#0a0a0a"
              strokeWidth="2"
            />
            
            {/* Círculo no cursor */}
            <circle
              cx={to.x}
              cy={to.y}
              r="6"
              fill="#818cf8"
              stroke="#0a0a0a"
              strokeWidth="2"
              opacity="0.7"
            />
          </g>
        );
      })()}
    </svg>
  );
}

// ============================================
// Node Palette
// ============================================

interface NodePaletteProps {
  onAddNode: (type: string, position?: { x: number; y: number }) => void;
}

function NodePalette({ onAddNode }: NodePaletteProps) {
  const [expanded, setExpanded] = useState<string>('triggers');

  const sections = [
    { id: 'triggers', label: 'Gatilhos', icon: Zap, nodes: NODE_TYPES.triggers },
    { id: 'actions', label: 'Ações', icon: Play, nodes: NODE_TYPES.actions },
    { id: 'logic', label: 'Lógica', icon: GitBranch, nodes: NODE_TYPES.logic },
  ];

  const handleDragStart = (e: DragEvent<HTMLButtonElement>, type: string) => {
    e.dataTransfer.setData('nodeType', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="w-64 bg-[#111111] border-r border-[#222222] overflow-y-auto flex-shrink-0">
      <div className="p-4 border-b border-[#222222]">
        <h3 className="font-semibold text-white">Blocos</h3>
        <p className="text-xs text-[#555555] mt-1">Arraste para o canvas</p>
      </div>

      <div className="p-2 space-y-1">
        {sections.map((section) => (
          <div key={section.id}>
            <button
              onClick={() => setExpanded(expanded === section.id ? '' : section.id)}
              className={cn(
                'w-full flex items-center justify-between p-3 rounded-lg',
                'text-left transition-all duration-150',
                expanded === section.id ? 'bg-[#1a1a1a]' : 'hover:bg-[#1a1a1a]'
              )}
            >
              <div className="flex items-center gap-2">
                <section.icon className="w-4 h-4 text-[#666666]" />
                <span className="text-sm font-medium text-white">{section.label}</span>
              </div>
              <ChevronRight
                className={cn(
                  'w-4 h-4 text-[#555555] transition-transform',
                  expanded === section.id && 'rotate-90'
                )}
              />
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
                      const isTrigger = section.id === 'triggers';
                      
                      return (
                        <button
                          key={node.type}
                          draggable
                          onDragStart={(e) => handleDragStart(e, node.type)}
                          onClick={() => onAddNode(node.type)}
                          className={cn(
                            'w-full flex items-center gap-3 p-2.5 rounded-xl',
                            'bg-[#0a0a0a] border border-[#1a1a1a]',
                            'cursor-grab active:cursor-grabbing',
                            'hover:border-[#333333] hover:bg-[#141414]',
                            'transition-all duration-150 group'
                          )}
                        >
                          {isTrigger && (
                            <div className={cn('w-1.5 h-10 rounded-full', colors.solid)} />
                          )}
                          <div className={cn('p-2.5 rounded-xl', colors.bg)}>
                            <node.icon className={cn('w-4 h-4', colors.text)} />
                          </div>
                          <span className="text-sm text-[#888888] group-hover:text-white transition-colors">
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
    </div>
  );
}

// ============================================
// Node Properties Panel
// ============================================

interface NodePropertiesProps {
  node: AutomationNode | null;
  onUpdate: (updates: Partial<AutomationNode['data']>) => void;
  onDelete: () => void;
  onClose: () => void;
  organizationId?: string;
}

interface PipelineOption {
  id: string;
  name: string;
  stages: { id: string; name: string; color: string }[];
}

function NodeProperties({ node, onUpdate, onDelete, onClose, organizationId }: NodePropertiesProps) {
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [loadingPipelines, setLoadingPipelines] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    
    async function fetchPipelines() {
      setLoadingPipelines(true);
      try {
        const res = await fetch(`/api/deals?type=pipelines&organizationId=${organizationId}`);
        if (res.ok) {
          const data = await res.json();
          setPipelines(data.pipelines || []);
        }
      } catch (e) {
        console.error('Erro ao buscar pipelines:', e);
      } finally {
        setLoadingPipelines(false);
      }
    }
    fetchPipelines();
  }, [organizationId]);

  const selectedPipeline = pipelines.find(p => p.id === node?.data.config?.pipelineId);
  const stages = selectedPipeline?.stages || [];

  if (!node) return null;

  const allNodes = [...NODE_TYPES.triggers, ...NODE_TYPES.actions, ...NODE_TYPES.logic];
  const nodeType = allNodes.find((n) => n.type === node.type);
  const colors = getNodeColor(nodeType?.color || 'slate');
  const Icon = nodeType?.icon || Zap;
  const isTrigger = node.type?.startsWith('trigger_');

  return (
    <div className="w-80 bg-[#111111] border-l border-[#222222] overflow-y-auto flex-shrink-0">
      <div className="flex items-center justify-between p-4 border-b border-[#222222]">
        <div className="flex items-center gap-3">
          {isTrigger && (
            <span className={cn('px-2 py-0.5 text-[10px] font-bold rounded', colors.solid, 'text-white')}>
              GATILHO
            </span>
          )}
          <div className={cn('p-2 rounded-lg', colors.bg)}>
            <Icon className={cn('w-4 h-4', colors.text)} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{nodeType?.label}</h3>
            <p className="text-xs text-[#555555]">Configurações</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[#1a1a1a] text-[#555555] hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

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
                      delay: { ...node.data.config?.delay, value: parseInt(e.target.value) },
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
                      delay: { ...node.data.config?.delay, unit: e.target.value },
                    },
                  })
                }
                className="bg-[#0d0d0d] border border-[#222222] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500/50"
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
              onChange={(e) => onUpdate({ config: { ...node.data.config, subject: e.target.value } })}
              placeholder="Assunto do email..."
            />
            <div>
              <label className="text-sm font-medium text-white mb-2 block">Template</label>
              <select
                value={node.data.config?.templateId || ''}
                onChange={(e) => onUpdate({ config: { ...node.data.config, templateId: e.target.value } })}
                className="w-full bg-[#0d0d0d] border border-[#222222] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500/50"
              >
                <option value="">Selecionar template...</option>
                <option value="welcome">Boas-vindas</option>
                <option value="abandon">Carrinho Abandonado</option>
                <option value="order_confirm">Confirmação de Pedido</option>
              </select>
            </div>
          </div>
        )}

        {node.type === 'action_tag' && (
          <Input
            label="Nome da tag"
            value={node.data.config?.tagName || ''}
            onChange={(e) => onUpdate({ config: { ...node.data.config, tagName: e.target.value } })}
            placeholder="Ex: cliente-vip"
          />
        )}

        {(node.type?.includes('deal') || node.type === 'action_create_deal') && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-white mb-2 block">Pipeline</label>
              <select
                value={node.data.config?.pipelineId || ''}
                onChange={(e) =>
                  onUpdate({ config: { ...node.data.config, pipelineId: e.target.value, stageId: undefined } })
                }
                className="w-full bg-[#0d0d0d] border border-[#222222] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500/50"
                disabled={loadingPipelines}
              >
                <option value="">{loadingPipelines ? 'Carregando...' : 'Selecionar pipeline...'}</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {!loadingPipelines && pipelines.length === 0 && (
                <p className="text-xs text-amber-400 mt-1">
                  Nenhuma pipeline encontrada. Crie uma no CRM primeiro.
                </p>
              )}
            </div>
            
            {stages.length > 0 && (node.type === 'trigger_deal_stage' || node.type === 'action_create_deal' || node.type === 'action_move_deal') && (
              <div>
                <label className="text-sm font-medium text-white mb-2 block">Estágio</label>
                <select
                  value={node.data.config?.stageId || ''}
                  onChange={(e) => onUpdate({ config: { ...node.data.config, stageId: e.target.value } })}
                  className="w-full bg-[#0d0d0d] border border-[#222222] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500/50"
                >
                  <option value="">Selecionar estágio...</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {node.type === 'action_notify' && (
          <div className="space-y-3">
            <Input
              label="Título"
              value={node.data.config?.title || ''}
              onChange={(e) => onUpdate({ config: { ...node.data.config, title: e.target.value } })}
              placeholder="Título da notificação"
            />
            <Textarea
              label="Mensagem"
              value={node.data.config?.message || ''}
              onChange={(e) => onUpdate({ config: { ...node.data.config, message: e.target.value } })}
              placeholder="Mensagem..."
              rows={3}
            />
          </div>
        )}
      </div>

      <div className="p-4 border-t border-white/10">
        <Button variant="ghost" className="w-full text-red-400 hover:bg-red-500/10" onClick={onDelete}>
          <Trash2 className="w-4 h-4 mr-2" />
          Excluir bloco
        </Button>
      </div>
    </div>
  );
}

// ============================================
// Main Automation Canvas
// ============================================

interface AutomationCanvasProps {
  automationId?: string;
  automationName: string;
  automationStatus: 'draft' | 'active' | 'paused';
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  onNodesChange: (nodes: AutomationNode[]) => void;
  onEdgesChange: (edges: AutomationEdge[]) => void;
  onNameChange: (name: string) => void;
  onSave: () => Promise<void>;
  onActivate: () => Promise<void>;
  onTest: () => Promise<void>;
  onBack: () => void;
  organizationId?: string;
}

export function AutomationCanvas({
  automationName,
  automationStatus,
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNameChange,
  onSave,
  onActivate,
  onTest,
  onBack,
  organizationId: propOrgId,
}: AutomationCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 50, y: 50 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  const [connectingFrom, setConnectingFrom] = useState<{ nodeId: string; handle: string } | null>(null);
  const [tempConnection, setTempConnection] = useState<{ fromNode: string; fromHandle: string; toX: number; toY: number } | null>(null);
  
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [orgId, setOrgId] = useState<string | undefined>(propOrgId);
  const [isDraggingFromPalette, setIsDraggingFromPalette] = useState(false);
  
  useEffect(() => {
    if (!propOrgId) {
      try {
        const authData = localStorage.getItem('auth-storage');
        if (authData) {
          const parsed = JSON.parse(authData);
          setOrgId(parsed?.state?.user?.organization_id);
        }
      } catch (e) {}
    }
  }, [propOrgId]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  const handleAddNode = useCallback((type: string, position?: { x: number; y: number }) => {
    const newNode: AutomationNode = {
      id: `node-${Date.now()}`,
      type,
      position: position || { x: 250 + Math.random() * 50, y: 50 + nodes.length * 150 },
      data: { label: '', config: {} },
    };
    onNodesChange([...nodes, newNode]);
    setSelectedNodeId(newNode.id);
  }, [nodes, onNodesChange]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    onNodesChange(nodes.filter((n) => n.id !== nodeId));
    onEdgesChange(edges.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId(null);
  }, [nodes, edges, onNodesChange, onEdgesChange]);

  // ESC para cancelar operações + Delete para excluir nó
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Cancelar conexão em andamento
        setConnectingFrom(null);
        setTempConnection(null);
        // Cancelar drag de nó
        setIsDraggingNode(false);
        // Deselecionar nó
        setSelectedNodeId(null);
      }
      
      // Delete para excluir nó selecionado
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        const target = e.target as HTMLElement;
        // Não excluir se estiver digitando em um input
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          onNodesChange(nodes.filter((n) => n.id !== selectedNodeId));
          onEdgesChange(edges.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
          setSelectedNodeId(null);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, nodes, edges, onNodesChange, onEdgesChange]);

  const handleNodeUpdateData = useCallback((updates: Partial<AutomationNode['data']>) => {
    if (!selectedNodeId) return;
    onNodesChange(
      nodes.map((node) =>
        node.id === selectedNodeId
          ? { ...node, data: { ...node.data, ...updates } }
          : node
      )
    );
  }, [selectedNodeId, nodes, onNodesChange]);

  const handleNodeDragStart = useCallback((nodeId: string, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setIsDraggingNode(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setSelectedNodeId(nodeId);
  }, []);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current && e.button === 0) {
      setSelectedNodeId(null);
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDraggingNode && selectedNodeId) {
      const dx = (e.clientX - dragStart.x) / zoom;
      const dy = (e.clientY - dragStart.y) / zoom;
      
      onNodesChange(
        nodes.map((node) =>
          node.id === selectedNodeId
            ? { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } }
            : node
        )
      );
      setDragStart({ x: e.clientX, y: e.clientY });
    }
    
    if (isPanning && !isDraggingNode) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }

    if (connectingFrom && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setTempConnection({
        fromNode: connectingFrom.nodeId,
        fromHandle: connectingFrom.handle,
        toX: (e.clientX - rect.left - pan.x) / zoom,
        toY: (e.clientY - rect.top - pan.y) / zoom,
      });
    }
  }, [isDraggingNode, selectedNodeId, dragStart, zoom, isPanning, panStart, nodes, onNodesChange, connectingFrom, pan]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    setIsDraggingNode(false);
    setIsPanning(false);
    // NÃO cancela conexão aqui - deixa o handle de entrada fazer isso
  }, []);

  // Cancelar conexão ao clicar no fundo do canvas
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    // Só cancela se clicar diretamente no canvas (não em um nó)
    if (connectingFrom && (e.target as HTMLElement).classList.contains('canvas-background')) {
      setConnectingFrom(null);
      setTempConnection(null);
    }
  }, [connectingFrom]);

  const handleStartConnection = useCallback((nodeId: string, handle: string) => {
    setConnectingFrom({ nodeId, handle });
  }, []);

  const handleEndConnection = useCallback((targetNodeId: string) => {
    if (!connectingFrom) return;
    if (connectingFrom.nodeId === targetNodeId) {
      // Não pode conectar a si mesmo
      setConnectingFrom(null);
      setTempConnection(null);
      return;
    }
    
    const newEdge: AutomationEdge = {
      id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      source: connectingFrom.nodeId,
      target: targetNodeId,
      sourceHandle: connectingFrom.handle,
    };
    
    const exists = edges.some(
      (e) => e.source === newEdge.source && e.target === newEdge.target && e.sourceHandle === newEdge.sourceHandle
    );
    
    if (!exists) {
      console.log('✅ Criando conexão:', newEdge);
      onEdgesChange([...edges, newEdge]);
    }
    
    setConnectingFrom(null);
    setTempConnection(null);
  }, [connectingFrom, edges, onEdgesChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('nodeType');
    if (!type || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;
    
    handleAddNode(type, { x, y });
  }, [handleAddNode, pan, zoom]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.min(Math.max(z * delta, 0.25), 2));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    setActivating(true);
    try {
      await onActivate();
    } finally {
      setActivating(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await onTest();
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#222222] bg-[#111111] flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
            Voltar
          </Button>
          <div className="w-px h-6 bg-[#222222]" />
          
          <input
            type="text"
            value={automationName}
            onChange={(e) => onNameChange(e.target.value)}
            className="bg-transparent border-none text-lg font-semibold text-white focus:outline-none focus:ring-2 focus:ring-primary/50 rounded px-2 py-1 min-w-[200px]"
            placeholder="Nome da automação"
          />
          
          <Badge 
            variant={automationStatus === 'active' ? 'success' : automationStatus === 'paused' ? 'warning' : 'default'}
          >
            {automationStatus === 'active' ? 'Ativo' : automationStatus === 'paused' ? 'Pausado' : 'Rascunho'}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 mr-4">
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.1, 0.25))}
              className="p-2 rounded-lg hover:bg-[#1a1a1a] text-[#555555] hover:text-white transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-[#555555] w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.1, 2))}
              className="p-2 rounded-lg hover:bg-[#1a1a1a] text-[#555555] hover:text-white transition-colors"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <Button variant="secondary" size="sm" onClick={handleTest} disabled={testing || nodes.length === 0}>
            {testing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <PlayCircle className="w-4 h-4 mr-2" />
            )}
            Testar
          </Button>

          <Button variant="secondary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : saveSuccess ? (
              <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {saveSuccess ? 'Salvo!' : 'Salvar'}
          </Button>

          <Button 
            variant="primary" 
            size="sm" 
            onClick={handleActivate} 
            disabled={activating || nodes.length === 0}
          >
            {activating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : automationStatus === 'active' ? (
              <Pause className="w-4 h-4 mr-2" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            {automationStatus === 'active' ? 'Pausar' : 'Ativar'}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <NodePalette onAddNode={handleAddNode} />

        <div
          ref={canvasRef}
          className="flex-1 relative overflow-hidden bg-[#0a0a0a]"
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            setIsDraggingNode(false);
            setIsPanning(false);
          }}
          onWheel={handleWheel}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          style={{ cursor: isPanning ? 'grabbing' : connectingFrom ? 'crosshair' : 'default' }}
        >
          {/* Grid background - clicável para cancelar conexão */}
          <div
            className="canvas-background absolute inset-0"
            onClick={handleCanvasClick}
            style={{
              backgroundImage: `
                linear-gradient(to right, #1a1a1a 1px, transparent 1px),
                linear-gradient(to bottom, #1a1a1a 1px, transparent 1px)
              `,
              backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
              backgroundPosition: `${pan.x}px ${pan.y}px`,
            }}
          />

          <div
            className="absolute"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
            }}
          >
            <ConnectionLines edges={edges} nodes={nodes} tempConnection={tempConnection} />

            {nodes.map((node) => (
              <CanvasNode
                key={node.id}
                node={node}
                isSelected={selectedNodeId === node.id}
                onSelect={() => setSelectedNodeId(node.id)}
                onDragStart={(e) => handleNodeDragStart(node.id, e)}
                onStartConnection={(handle) => handleStartConnection(node.id, handle)}
                onEndConnection={() => handleEndConnection(node.id)}
                isConnecting={!!connectingFrom}
              />
            ))}
          </div>

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#111111] border border-[#222222] flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-8 h-8 text-[#444444]" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Canvas vazio</h3>
                <p className="text-[#555555] text-sm">
                  Arraste um gatilho da sidebar para começar
                </p>
              </div>
            </div>
          )}

          {/* Mensagem de ajuda quando conectando */}
          {connectingFrom && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
              <div className="bg-[#111111] border border-primary-500/50 rounded-lg px-4 py-2 shadow-lg">
                <p className="text-sm text-white">
                  🔗 Clique no <span className="text-emerald-400 font-semibold">ponto verde</span> de outro bloco para conectar
                </p>
              </div>
            </div>
          )}
        </div>

        {selectedNode && (
          <NodeProperties
            node={selectedNode}
            onUpdate={handleNodeUpdateData}
            onDelete={() => handleDeleteNode(selectedNodeId!)}
            onClose={() => setSelectedNodeId(null)}
            organizationId={orgId}
          />
        )}
      </div>
    </div>
  );
}

// ============================================
// Exports
// ============================================

export function AutomationListItem({
  automation,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleStatus,
}: {
  automation: {
    id: string;
    name: string;
    description?: string;
    status: 'active' | 'draft' | 'paused';
    trigger: string;
    stats?: { sent?: number; converted?: number; revenue?: number };
  };
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
}) {
  const triggerType = NODE_TYPES.triggers.find((t) => t.type === automation.trigger);
  const colors = getNodeColor(triggerType?.color || 'slate');
  const Icon = triggerType?.icon || Zap;

  return (
    <div className="group p-4 bg-[#0d0d0d] hover:bg-[#111111] border border-[#1a1a1a] hover:border-[#222222] rounded-xl transition-all">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className={cn('p-3 rounded-xl', colors.bg)}>
            <Icon className={cn('w-5 h-5', colors.text)} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white">{automation.name}</h3>
              <Badge
                variant={automation.status === 'active' ? 'success' : automation.status === 'paused' ? 'warning' : 'default'}
              >
                {automation.status === 'active' ? 'Ativo' : automation.status === 'paused' ? 'Pausado' : 'Rascunho'}
              </Badge>
            </div>
            {automation.description && (
              <p className="text-sm text-[#555555] mt-1">{automation.description}</p>
            )}
            {automation.stats && (
              <div className="flex items-center gap-4 mt-3 text-xs text-[#555555]">
                <span>{automation.stats.sent?.toLocaleString()} enviados</span>
                <span>{automation.stats.converted?.toLocaleString()} conversões</span>
                {automation.stats.revenue && (
                  <span className="text-emerald-400">R$ {automation.stats.revenue.toLocaleString()}</span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="sm" onClick={onEdit}><Settings className="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm" onClick={onDuplicate}><Copy className="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm" onClick={onToggleStatus}>
            {automation.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-400 hover:bg-red-500/10">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export const AUTOMATION_TEMPLATES = [
  { id: 'abandon-cart', name: 'Carrinho Abandonado', description: 'Recupere vendas', trigger: 'trigger_abandon', category: 'e-commerce' },
  { id: 'welcome-series', name: 'Boas-vindas', description: 'Série para novos leads', trigger: 'trigger_signup', category: 'engajamento' },
  { id: 'post-purchase', name: 'Pós-compra', description: 'Follow-up após compra', trigger: 'trigger_order', category: 'e-commerce' },
  { id: 'deal-won', name: 'Deal Fechado', description: 'Ações quando deal é ganho', trigger: 'trigger_deal_won', category: 'crm' },
];

export function AutomationTemplateCard({ template, onSelect }: { template: (typeof AUTOMATION_TEMPLATES)[0]; onSelect: () => void }) {
  const triggerType = NODE_TYPES.triggers.find((t) => t.type === template.trigger);
  const colors = getNodeColor(triggerType?.color || 'slate');
  const Icon = triggerType?.icon || Zap;

  return (
    <button onClick={onSelect} className="w-full p-4 rounded-xl bg-[#0d0d0d] border border-[#1a1a1a] hover:border-[#333333] hover:bg-[#111111] transition-all text-left group">
      <div className="flex items-center gap-3">
        <div className={cn('p-2.5 rounded-lg', colors.bg)}>
          <Icon className={cn('w-5 h-5', colors.text)} />
        </div>
        <div>
          <h4 className="font-medium text-white group-hover:text-primary transition-colors">{template.name}</h4>
          <p className="text-xs text-[#555555]">{template.description}</p>
        </div>
      </div>
    </button>
  );
}
