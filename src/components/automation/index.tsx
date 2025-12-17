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
  History,
} from 'lucide-react';
import { Button, Input, Badge, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';
import { AutomationNode, AutomationEdge } from '@/types';
import { TestModal, TestResultPanel } from './TestModal';
import { ExecutionHistory } from './ExecutionHistory';

// Tipos de execução de teste
interface NodeExecutionStatus {
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  output?: any;
  error?: string;
  duration?: number;
}

interface TestExecutionState {
  isRunning: boolean;
  nodeStatuses: Record<string, NodeExecutionStatus>;
  results: any[];
  contact: any;
  totalDuration: number;
  success: boolean;
}

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
  executionStatus,
}: CanvasNodeProps & { executionStatus?: NodeExecutionStatus }) {
  const [isHoveringInput, setIsHoveringInput] = useState(false);
  
  const allNodes = [...NODE_TYPES.triggers, ...NODE_TYPES.actions, ...NODE_TYPES.logic];
  const nodeType = allNodes.find((n) => n.type === node.type);
  const colors = getNodeColor(nodeType?.color || 'slate');
  const Icon = nodeType?.icon || Zap;
  
  const isTrigger = node.type?.startsWith('trigger_');
  const isCondition = node.type === 'logic_condition' || node.type === 'logic_split';

  // Status de execução
  const isRunning = executionStatus?.status === 'running';
  const isSuccess = executionStatus?.status === 'success';
  const isError = executionStatus?.status === 'error';
  const isSkipped = executionStatus?.status === 'skipped';

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
            // Status de execução tem prioridade
            isRunning && 'ring-2 ring-amber-500 shadow-2xl shadow-amber-500/20 animate-pulse',
            isSuccess && 'ring-2 ring-green-500 shadow-xl shadow-green-500/20',
            isError && 'ring-2 ring-red-500 shadow-xl shadow-red-500/20',
            isSkipped && 'ring-1 ring-dark-600 opacity-60',
            // Seleção (só se não tiver status)
            !executionStatus && isSelected 
              ? `ring-2 ring-white/50 shadow-2xl ${colors.glow}` 
              : !executionStatus && 'hover:ring-1 hover:ring-white/20 shadow-lg'
          )}
        >
          {/* Badge de status de execução */}
          {executionStatus && executionStatus.status !== 'pending' && (
            <div className={cn(
              'absolute -top-2 -right-2 z-20 p-1.5 rounded-full shadow-lg',
              isRunning && 'bg-amber-500',
              isSuccess && 'bg-green-500',
              isError && 'bg-red-500',
              isSkipped && 'bg-dark-600',
            )}>
              {isRunning && <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />}
              {isSuccess && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
              {isError && <X className="w-3.5 h-3.5 text-white" />}
              {isSkipped && <span className="text-[10px] text-white px-1">—</span>}
            </div>
          )}

          {/* Duração se disponível */}
          {executionStatus?.duration && (isSuccess || isError) && (
            <div className="absolute -bottom-2 right-2 z-20 px-1.5 py-0.5 bg-dark-800 border border-dark-700 rounded text-[9px] text-dark-400">
              {executionStatus.duration}ms
            </div>
          )}

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

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

// Operadores para condições
const CONDITION_OPERATORS = [
  { value: 'equals', label: 'Igual a' },
  { value: 'not_equals', label: 'Diferente de' },
  { value: 'contains', label: 'Contém' },
  { value: 'not_contains', label: 'Não contém' },
  { value: 'starts_with', label: 'Começa com' },
  { value: 'ends_with', label: 'Termina com' },
  { value: 'greater_than', label: 'Maior que' },
  { value: 'less_than', label: 'Menor que' },
  { value: 'is_empty', label: 'Está vazio' },
  { value: 'is_not_empty', label: 'Não está vazio' },
  { value: 'in_list', label: 'Está na lista' },
];

// Campos disponíveis para condições
const CONDITION_FIELDS = [
  { value: 'contact.email', label: 'Email' },
  { value: 'contact.phone', label: 'Telefone' },
  { value: 'contact.first_name', label: 'Nome' },
  { value: 'contact.last_name', label: 'Sobrenome' },
  { value: 'contact.tags', label: 'Tags' },
  { value: 'contact.total_orders', label: 'Total de Pedidos' },
  { value: 'contact.total_spent', label: 'Total Gasto' },
  { value: 'contact.created_at', label: 'Data de Cadastro' },
  { value: 'contact.city', label: 'Cidade' },
  { value: 'contact.state', label: 'Estado' },
  { value: 'trigger.order_value', label: 'Valor do Pedido' },
  { value: 'trigger.cart_value', label: 'Valor do Carrinho' },
];

function NodeProperties({ node, onUpdate, onDelete, onClose, organizationId }: NodePropertiesProps) {
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [loadingPipelines, setLoadingPipelines] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [integrations, setIntegrations] = useState<Record<string, { connected: boolean }>>({});
  const [webhookUrl, setWebhookUrl] = useState('');

  // Fetch integrations status
  useEffect(() => {
    async function fetchIntegrations() {
      try {
        const res = await fetch('/api/integrations/status');
        if (res.ok) {
          const data = await res.json();
          setIntegrations(data.integrations || {});
        }
      } catch (e) {
        console.error('Erro ao buscar integrações:', e);
      }
    }
    fetchIntegrations();
  }, []);

  // Fetch pipelines
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

  // Gerar URL do webhook
  useEffect(() => {
    if (node?.type === 'trigger_webhook' && organizationId) {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      setWebhookUrl(`${baseUrl}/api/webhooks/automation/${organizationId}/${node.id}`);
    }
  }, [node?.type, node?.id, organizationId]);

  const selectedPipeline = pipelines.find(p => p.id === node?.data.config?.pipelineId);
  const stages = selectedPipeline?.stages || [];

  if (!node) return null;

  const allNodes = [...NODE_TYPES.triggers, ...NODE_TYPES.actions, ...NODE_TYPES.logic];
  const nodeType = allNodes.find((n) => n.type === node.type);
  const colors = getNodeColor(nodeType?.color || 'slate');
  const Icon = nodeType?.icon || Zap;
  const isTrigger = node.type?.startsWith('trigger_');

  // Helper para atualizar config
  const updateConfig = (key: string, value: any) => {
    onUpdate({ config: { ...node.data.config, [key]: value } });
  };

  // Helper para verificar se integração está conectada
  const isIntegrationConnected = (integrationId: string): boolean => {
    return integrations[integrationId]?.connected === true;
  };

  // Componente de Select estilizado
  const StyledSelect = ({ label, value, onChange, options, placeholder, disabled = false }: any) => (
    <div>
      <label className="text-sm font-medium text-white mb-2 block">{label}</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full bg-[#0d0d0d] border border-[#222222] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500/50 disabled:opacity-50"
      >
        <option value="">{placeholder || 'Selecionar...'}</option>
        {options.map((opt: any) => (
          <option key={opt.value || opt.id} value={opt.value || opt.id}>
            {opt.label || opt.name}
          </option>
        ))}
      </select>
    </div>
  );

  // Componente de alerta de credencial - mostra status da integração
  const CredentialAlert = ({ service, configPath, integrationId }: { service: string; configPath: string; integrationId?: string }) => {
    // Se passou integrationId e ela está conectada, mostra badge verde
    if (integrationId && isIntegrationConnected(integrationId)) {
      return (
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <p className="text-xs text-green-400">
            <strong>{service}</strong> conectado
          </p>
        </div>
      );
    }
    
    return (
      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
        <p className="text-xs text-amber-400">
          ⚠️ Requer integração com <strong>{service}</strong>
        </p>
        <a 
          href={configPath} 
          className="text-xs text-amber-300 underline hover:text-amber-200 mt-1 inline-block"
        >
          Configurar em Integrações →
      </a>
    </div>
    );
  };

  return (
    <div className="w-80 bg-[#111111] border-l border-[#222222] overflow-y-auto flex-shrink-0">
      {/* Header */}
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
        {/* Campos comuns a todos os nós */}
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

        {/* ==================== TRIGGERS ==================== */}
        
        {/* Trigger: Pedido Realizado */}
        {node.type === 'trigger_order' && (
          <div className="space-y-3">
            <CredentialAlert service="Shopify" configPath="/settings?tab=integrations" integrationId="shopify" />
            <StyledSelect
              label="Status do pedido"
              value={node.data.config?.orderStatus}
              onChange={(v: string) => updateConfig('orderStatus', v)}
              options={[
                { value: 'any', label: 'Qualquer status' },
                { value: 'paid', label: 'Pago' },
                { value: 'fulfilled', label: 'Enviado' },
                { value: 'delivered', label: 'Entregue' },
              ]}
              placeholder="Selecionar status..."
            />
            <Input
              label="Valor mínimo (R$)"
              type="number"
              value={node.data.config?.minValue || ''}
              onChange={(e) => updateConfig('minValue', e.target.value)}
              placeholder="0.00"
            />
          </div>
        )}

        {/* Trigger: Carrinho Abandonado */}
        {node.type === 'trigger_abandon' && (
          <div className="space-y-3">
            <CredentialAlert service="Shopify" configPath="/settings?tab=integrations" integrationId="shopify" />
            <div>
              <label className="text-sm font-medium text-white mb-2 block">Tempo de abandono</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={node.data.config?.abandonTime || 30}
                  onChange={(e) => updateConfig('abandonTime', parseInt(e.target.value))}
                  className="flex-1"
                />
                <select
                  value={node.data.config?.abandonTimeUnit || 'minutes'}
                  onChange={(e) => updateConfig('abandonTimeUnit', e.target.value)}
                  className="bg-[#0d0d0d] border border-[#222222] rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="minutes">Minutos</option>
                  <option value="hours">Horas</option>
                </select>
              </div>
            </div>
            <Input
              label="Valor mínimo do carrinho (R$)"
              type="number"
              value={node.data.config?.minCartValue || ''}
              onChange={(e) => updateConfig('minCartValue', e.target.value)}
              placeholder="0.00"
            />
          </div>
        )}

        {/* Trigger: Novo Cadastro */}
        {node.type === 'trigger_signup' && (
          <div className="space-y-3">
            <StyledSelect
              label="Fonte do cadastro"
              value={node.data.config?.source}
              onChange={(v: string) => updateConfig('source', v)}
              options={[
                { value: 'any', label: 'Qualquer fonte' },
                { value: 'website', label: 'Website' },
                { value: 'landing', label: 'Landing Page' },
                { value: 'import', label: 'Importação' },
                { value: 'api', label: 'API' },
              ]}
              placeholder="Selecionar fonte..."
            />
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="requireEmail"
                checked={node.data.config?.requireEmail ?? true}
                onChange={(e) => updateConfig('requireEmail', e.target.checked)}
                className="rounded bg-[#0d0d0d] border-[#333333]"
              />
              <label htmlFor="requireEmail" className="text-sm text-white">Obrigatório ter email</label>
            </div>
          </div>
        )}

        {/* Trigger: Tag Adicionada */}
        {node.type === 'trigger_tag' && (
          <div className="space-y-3">
            <Input
              label="Tags que disparam"
              value={node.data.config?.tags || ''}
              onChange={(e) => updateConfig('tags', e.target.value)}
              placeholder="vip, cliente, lead (separar por vírgula)"
            />
            <StyledSelect
              label="Condição"
              value={node.data.config?.matchType}
              onChange={(v: string) => updateConfig('matchType', v)}
              options={[
                { value: 'any', label: 'Qualquer uma das tags' },
                { value: 'all', label: 'Todas as tags' },
              ]}
            />
          </div>
        )}

        {/* Trigger: Data Especial */}
        {node.type === 'trigger_date' && (
          <div className="space-y-3">
            <StyledSelect
              label="Campo de data"
              value={node.data.config?.dateField}
              onChange={(v: string) => updateConfig('dateField', v)}
              options={[
                { value: 'birthday', label: 'Aniversário' },
                { value: 'created_at', label: 'Data de cadastro' },
                { value: 'last_purchase', label: 'Última compra' },
              ]}
              placeholder="Selecionar campo..."
            />
            <Input
              label="Dias de antecedência"
              type="number"
              value={node.data.config?.daysBefore || 0}
              onChange={(e) => updateConfig('daysBefore', parseInt(e.target.value))}
              placeholder="0"
            />
            <Input
              label="Horário de disparo"
              type="time"
              value={node.data.config?.triggerTime || '09:00'}
              onChange={(e) => updateConfig('triggerTime', e.target.value)}
            />
          </div>
        )}

        {/* Trigger: Entrou em Segmento */}
        {node.type === 'trigger_segment' && (
          <div className="space-y-3">
            <Input
              label="Nome do segmento"
              value={node.data.config?.segmentName || ''}
              onChange={(e) => updateConfig('segmentName', e.target.value)}
              placeholder="Ex: Clientes VIP"
            />
            <p className="text-xs text-[#555555]">
              O segmento será avaliado automaticamente quando houver mudanças nos contatos.
            </p>
          </div>
        )}

        {/* Trigger: Webhook */}
        {node.type === 'trigger_webhook' && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-white mb-2 block">URL do Webhook</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={webhookUrl}
                  readOnly
                  className="flex-1 bg-[#0d0d0d] border border-[#222222] rounded-lg px-3 py-2 text-xs text-[#666666] font-mono"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(webhookUrl)}
                  className="px-3 py-2 bg-[#1a1a1a] hover:bg-[#222222] rounded-lg text-white text-xs"
                >
                  Copiar
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="validatePayload"
                checked={node.data.config?.validatePayload ?? true}
                onChange={(e) => updateConfig('validatePayload', e.target.checked)}
                className="rounded bg-[#0d0d0d] border-[#333333]"
              />
              <label htmlFor="validatePayload" className="text-sm text-white">Validar assinatura</label>
            </div>
          </div>
        )}

        {/* Triggers de Deal (pipeline selector) */}
        {(node.type?.includes('deal') && node.type?.startsWith('trigger_')) && (
          <div className="space-y-3">
            <StyledSelect
              label="Pipeline"
              value={node.data.config?.pipelineId}
              onChange={(v: string) => updateConfig('pipelineId', v)}
              options={pipelines.map(p => ({ value: p.id, label: p.name }))}
              placeholder={loadingPipelines ? 'Carregando...' : 'Selecionar pipeline...'}
              disabled={loadingPipelines}
            />
            
            {stages.length > 0 && node.type === 'trigger_deal_stage' && (
              <StyledSelect
                label="Estágio"
                value={node.data.config?.stageId}
                onChange={(v: string) => updateConfig('stageId', v)}
                options={stages.map(s => ({ value: s.id, label: s.name }))}
                placeholder="Selecionar estágio..."
              />
            )}
          </div>
        )}

        {/* ==================== ACTIONS ==================== */}

        {/* Action: Enviar Email */}
        {node.type === 'action_email' && (
          <div className="space-y-3">
            <CredentialAlert service="Klaviyo ou SMTP" configPath="/settings?tab=integrations" integrationId="klaviyo" />
            <Input
              label="Assunto do email"
              value={node.data.config?.subject || ''}
              onChange={(e) => updateConfig('subject', e.target.value)}
              placeholder="Olá {{contact.first_name}}!"
            />
            <StyledSelect
              label="Template"
              value={node.data.config?.templateId}
              onChange={(v: string) => updateConfig('templateId', v)}
              options={[
                { value: 'welcome', label: 'Boas-vindas' },
                { value: 'abandon', label: 'Carrinho Abandonado' },
                { value: 'order_confirm', label: 'Confirmação de Pedido' },
                { value: 'custom', label: 'HTML Customizado' },
              ]}
              placeholder="Selecionar template..."
            />
            {node.data.config?.templateId === 'custom' && (
              <Textarea
                label="Corpo do email (HTML)"
                value={node.data.config?.body || ''}
                onChange={(e) => updateConfig('body', e.target.value)}
                placeholder="<p>Olá {{contact.first_name}},</p>"
                rows={5}
              />
            )}
          </div>
        )}

        {/* Action: Enviar WhatsApp */}
        {node.type === 'action_whatsapp' && (
          <div className="space-y-3">
            <CredentialAlert service="WhatsApp Business API" configPath="/settings?tab=integrations" integrationId="whatsapp" />
            <StyledSelect
              label="Tipo de mensagem"
              value={node.data.config?.messageType}
              onChange={(v: string) => updateConfig('messageType', v)}
              options={[
                { value: 'template', label: 'Template aprovado' },
                { value: 'text', label: 'Mensagem de texto' },
              ]}
              placeholder="Selecionar tipo..."
            />
            {node.data.config?.messageType === 'template' && (
              <Input
                label="Nome do template"
                value={node.data.config?.templateName || ''}
                onChange={(e) => updateConfig('templateName', e.target.value)}
                placeholder="Ex: pedido_confirmado"
              />
            )}
            {node.data.config?.messageType === 'text' && (
              <Textarea
                label="Mensagem"
                value={node.data.config?.message || ''}
                onChange={(e) => updateConfig('message', e.target.value)}
                placeholder="Olá {{contact.first_name}}! ..."
                rows={4}
              />
            )}
          </div>
        )}

        {/* Action: Enviar SMS */}
        {node.type === 'action_sms' && (
          <div className="space-y-3">
            <CredentialAlert service="Twilio" configPath="/settings?tab=integrations" integrationId="twilio" />
            <Textarea
              label="Mensagem (max 160 caracteres)"
              value={node.data.config?.message || ''}
              onChange={(e) => updateConfig('message', e.target.value)}
              placeholder="Olá {{contact.first_name}}!"
              rows={3}
            />
            <p className="text-xs text-[#555555]">
              {(node.data.config?.message || '').length}/160 caracteres
            </p>
          </div>
        )}

        {/* Action: Adicionar Tag */}
        {node.type === 'action_tag' && (
          <div className="space-y-3">
            <Input
              label="Nome da tag"
              value={node.data.config?.tagName || ''}
              onChange={(e) => updateConfig('tagName', e.target.value)}
              placeholder="Ex: cliente-vip"
            />
            <StyledSelect
              label="Ação"
              value={node.data.config?.tagAction}
              onChange={(v: string) => updateConfig('tagAction', v)}
              options={[
                { value: 'add', label: 'Adicionar tag' },
                { value: 'remove', label: 'Remover tag' },
              ]}
            />
          </div>
        )}

        {/* Action: Atualizar Contato */}
        {node.type === 'action_update' && (
          <div className="space-y-3">
            <StyledSelect
              label="Campo para atualizar"
              value={node.data.config?.updateField}
              onChange={(v: string) => updateConfig('updateField', v)}
              options={[
                { value: 'first_name', label: 'Nome' },
                { value: 'last_name', label: 'Sobrenome' },
                { value: 'phone', label: 'Telefone' },
                { value: 'city', label: 'Cidade' },
                { value: 'state', label: 'Estado' },
                { value: 'custom', label: 'Campo customizado' },
              ]}
              placeholder="Selecionar campo..."
            />
            {node.data.config?.updateField === 'custom' && (
              <Input
                label="Nome do campo"
                value={node.data.config?.customField || ''}
                onChange={(e) => updateConfig('customField', e.target.value)}
                placeholder="Ex: score"
              />
            )}
            <Input
              label="Novo valor"
              value={node.data.config?.updateValue || ''}
              onChange={(e) => updateConfig('updateValue', e.target.value)}
              placeholder="Valor ou {{variável}}"
            />
          </div>
        )}

        {/* Action: Criar Deal */}
        {node.type === 'action_create_deal' && (
          <div className="space-y-3">
            <StyledSelect
              label="Pipeline"
              value={node.data.config?.pipelineId}
              onChange={(v: string) => onUpdate({ config: { ...node.data.config, pipelineId: v, stageId: undefined } })}
              options={pipelines.map(p => ({ value: p.id, label: p.name }))}
              placeholder={loadingPipelines ? 'Carregando...' : 'Selecionar pipeline...'}
              disabled={loadingPipelines}
            />
            {stages.length > 0 && (
              <StyledSelect
                label="Estágio inicial"
                value={node.data.config?.stageId}
                onChange={(v: string) => updateConfig('stageId', v)}
                options={stages.map(s => ({ value: s.id, label: s.name }))}
                placeholder="Selecionar estágio..."
              />
            )}
            <Input
              label="Título do deal"
              value={node.data.config?.dealTitle || ''}
              onChange={(e) => updateConfig('dealTitle', e.target.value)}
              placeholder="Deal de {{contact.first_name}}"
            />
            <Input
              label="Valor (R$)"
              type="number"
              value={node.data.config?.dealValue || ''}
              onChange={(e) => updateConfig('dealValue', e.target.value)}
              placeholder="0.00"
            />
          </div>
        )}

        {/* Action: Mover Deal */}
        {node.type === 'action_move_deal' && (
          <div className="space-y-3">
            <StyledSelect
              label="Pipeline"
              value={node.data.config?.pipelineId}
              onChange={(v: string) => onUpdate({ config: { ...node.data.config, pipelineId: v, stageId: undefined } })}
              options={pipelines.map(p => ({ value: p.id, label: p.name }))}
              placeholder={loadingPipelines ? 'Carregando...' : 'Selecionar pipeline...'}
              disabled={loadingPipelines}
            />
            {stages.length > 0 && (
              <StyledSelect
                label="Mover para estágio"
                value={node.data.config?.stageId}
                onChange={(v: string) => updateConfig('stageId', v)}
                options={stages.map(s => ({ value: s.id, label: s.name }))}
                placeholder="Selecionar estágio..."
              />
            )}
          </div>
        )}

        {/* Action: Atribuir Deal */}
        {node.type === 'action_assign_deal' && (
          <div className="space-y-3">
            <StyledSelect
              label="Tipo de atribuição"
              value={node.data.config?.assignmentType}
              onChange={(v: string) => updateConfig('assignmentType', v)}
              options={[
                { value: 'specific', label: 'Usuário específico' },
                { value: 'round_robin', label: 'Rodízio (Round Robin)' },
              ]}
              placeholder="Selecionar tipo..."
            />
            {node.data.config?.assignmentType === 'specific' && (
              <Input
                label="Email do responsável"
                type="email"
                value={node.data.config?.assigneeEmail || ''}
                onChange={(e) => updateConfig('assigneeEmail', e.target.value)}
                placeholder="usuario@email.com"
              />
            )}
          </div>
        )}

        {/* Action: Notificação Interna */}
        {node.type === 'action_notify' && (
          <div className="space-y-3">
            <Input
              label="Título"
              value={node.data.config?.title || ''}
              onChange={(e) => updateConfig('title', e.target.value)}
              placeholder="Nova conversão!"
            />
            <Textarea
              label="Mensagem"
              value={node.data.config?.message || ''}
              onChange={(e) => updateConfig('message', e.target.value)}
              placeholder="{{contact.first_name}} converteu..."
              rows={3}
            />
            <StyledSelect
              label="Notificar"
              value={node.data.config?.notifyTarget}
              onChange={(v: string) => updateConfig('notifyTarget', v)}
              options={[
                { value: 'all', label: 'Todos os usuários' },
                { value: 'owner', label: 'Responsável do deal' },
                { value: 'specific', label: 'Usuário específico' },
              ]}
            />
          </div>
        )}

        {/* Action: Chamar Webhook */}
        {node.type === 'action_webhook' && (
          <div className="space-y-3">
            <Input
              label="URL"
              value={node.data.config?.webhookUrl || ''}
              onChange={(e) => updateConfig('webhookUrl', e.target.value)}
              placeholder="https://api.exemplo.com/webhook"
            />
            <StyledSelect
              label="Método"
              value={node.data.config?.method}
              onChange={(v: string) => updateConfig('method', v)}
              options={[
                { value: 'POST', label: 'POST' },
                { value: 'GET', label: 'GET' },
                { value: 'PUT', label: 'PUT' },
                { value: 'PATCH', label: 'PATCH' },
              ]}
            />
            <Textarea
              label="Headers (JSON)"
              value={node.data.config?.headers || ''}
              onChange={(e) => updateConfig('headers', e.target.value)}
              placeholder='{"Authorization": "Bearer token"}'
              rows={2}
            />
            <Textarea
              label="Body (JSON)"
              value={node.data.config?.webhookBody || ''}
              onChange={(e) => updateConfig('webhookBody', e.target.value)}
              placeholder='{"email": "{{contact.email}}"}'
              rows={4}
            />
          </div>
        )}

        {/* ==================== LOGIC ==================== */}

        {/* Logic: Aguardar */}
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

        {/* Logic: Condição */}
        {node.type === 'logic_condition' && (
          <div className="space-y-3">
            <StyledSelect
              label="Campo"
              value={node.data.config?.conditionField}
              onChange={(v: string) => updateConfig('conditionField', v)}
              options={CONDITION_FIELDS}
              placeholder="Selecionar campo..."
            />
            <StyledSelect
              label="Operador"
              value={node.data.config?.conditionOperator}
              onChange={(v: string) => updateConfig('conditionOperator', v)}
              options={CONDITION_OPERATORS}
              placeholder="Selecionar operador..."
            />
            {!['is_empty', 'is_not_empty'].includes(node.data.config?.conditionOperator || '') && (
              <Input
                label="Valor"
                value={node.data.config?.conditionValue || ''}
                onChange={(e) => updateConfig('conditionValue', e.target.value)}
                placeholder="Valor para comparar..."
              />
            )}
            <p className="text-xs text-[#555555]">
              ✅ Verdadeiro → Caminho verde<br />
              ❌ Falso → Caminho vermelho
            </p>
          </div>
        )}

        {/* Logic: Teste A/B */}
        {node.type === 'logic_split' && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-white mb-2 block">
                Divisão: {node.data.config?.splitPercentage || 50}% / {100 - (node.data.config?.splitPercentage || 50)}%
              </label>
              <input
                type="range"
                min="10"
                max="90"
                step="5"
                value={node.data.config?.splitPercentage || 50}
                onChange={(e) => updateConfig('splitPercentage', parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-[#555555] mt-1">
                <span className="text-emerald-400">Caminho A: {node.data.config?.splitPercentage || 50}%</span>
                <span className="text-red-400">Caminho B: {100 - (node.data.config?.splitPercentage || 50)}%</span>
              </div>
            </div>
            <Input
              label="Nome do teste"
              value={node.data.config?.testName || ''}
              onChange={(e) => updateConfig('testName', e.target.value)}
              placeholder="Ex: Teste email vs whatsapp"
            />
          </div>
        )}

        {/* Logic: Filtrar */}
        {node.type === 'logic_filter' && (
          <div className="space-y-3">
            <StyledSelect
              label="Campo"
              value={node.data.config?.filterField}
              onChange={(v: string) => updateConfig('filterField', v)}
              options={CONDITION_FIELDS}
              placeholder="Selecionar campo..."
            />
            <StyledSelect
              label="Operador"
              value={node.data.config?.filterOperator}
              onChange={(v: string) => updateConfig('filterOperator', v)}
              options={CONDITION_OPERATORS}
              placeholder="Selecionar operador..."
            />
            {!['is_empty', 'is_not_empty'].includes(node.data.config?.filterOperator || '') && (
              <Input
                label="Valor"
                value={node.data.config?.filterValue || ''}
                onChange={(e) => updateConfig('filterValue', e.target.value)}
                placeholder="Valor para filtrar..."
              />
            )}
            <p className="text-xs text-[#555555]">
              Apenas contatos que passarem no filtro continuam no fluxo.
            </p>
          </div>
        )}
      </div>

      {/* Botão de excluir */}
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
  onSave: () => Promise<string | undefined>;
  onActivate: () => Promise<void>;
  onTest: () => Promise<void>;
  onBack: () => void;
  organizationId?: string;
}

export function AutomationCanvas({
  automationId,
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
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  
  const [connectingFrom, setConnectingFrom] = useState<{ nodeId: string; handle: string } | null>(null);
  const [tempConnection, setTempConnection] = useState<{ fromNode: string; fromHandle: string; toX: number; toY: number } | null>(null);
  
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [orgId, setOrgId] = useState<string | undefined>(propOrgId);
  const [isDraggingFromPalette, setIsDraggingFromPalette] = useState(false);
  
  // Tab ativa (canvas ou execuções)
  const [activeTab, setActiveTab] = useState<'canvas' | 'executions'>('canvas');
  
  // Estados de teste
  const [showTestModal, setShowTestModal] = useState(false);
  const [showTestResults, setShowTestResults] = useState(false);
  const [testExecution, setTestExecution] = useState<TestExecutionState>({
    isRunning: false,
    nodeStatuses: {},
    results: [],
    contact: null,
    totalDuration: 0,
    success: false,
  });
  
  // Bloquear zoom do browser dentro do canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const preventBrowserZoom = (e: WheelEvent) => {
      // Bloqueia zoom do browser (Ctrl+Scroll ou pinch)
      e.preventDefault();
    };

    // passive: false é necessário para preventDefault funcionar
    canvas.addEventListener('wheel', preventBrowserZoom, { passive: false });
    
    return () => {
      canvas.removeEventListener('wheel', preventBrowserZoom);
    };
  }, []);

  // Controle de Espaço para Pan
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Espaço pressionado - ativar modo pan
      if (e.code === 'Space' && !isSpacePressed) {
        // Só previne se o canvas estiver focado ou se não estiver em input
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          setIsSpacePressed(true);
        }
      }
      
      // ESC para cancelar operações
      if (e.key === 'Escape') {
        setConnectingFrom(null);
        setTempConnection(null);
        setIsDraggingNode(false);
        setSelectedNodeId(null);
        setIsSpacePressed(false);
        setIsPanning(false);
      }
      
      // Delete para excluir nó selecionado
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          onNodesChange(nodes.filter((n) => n.id !== selectedNodeId));
          onEdgesChange(edges.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
          setSelectedNodeId(null);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isSpacePressed, selectedNodeId, nodes, edges, onNodesChange, onEdgesChange]);
  
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
    // Espaço + Clique = Iniciar pan
    if (isSpacePressed && e.button === 0) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }
    
    // Clique no canvas vazio = deselecionar
    if (e.target === canvasRef.current && e.button === 0) {
      setSelectedNodeId(null);
    }
  }, [isSpacePressed, pan]);

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
    
    // Pan com Espaço + Arrastar
    if (isPanning && isSpacePressed && !isDraggingNode) {
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
  }, [isDraggingNode, selectedNodeId, dragStart, zoom, isPanning, isSpacePressed, panStart, nodes, onNodesChange, connectingFrom, pan]);

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
    e.stopPropagation();
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(Math.max(zoom * delta, 0.25), 2);
    
    // Zoom centrado no cursor para melhor UX
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Calcula o ponto do canvas sob o cursor antes do zoom
      const pointX = (mouseX - pan.x) / zoom;
      const pointY = (mouseY - pan.y) / zoom;
      
      // Calcula novo pan para manter o ponto sob o cursor
      const newPanX = mouseX - pointX * newZoom;
      const newPanY = mouseY - pointY * newZoom;
      
      setPan({ x: newPanX, y: newPanY });
    }
    
    setZoom(newZoom);
  }, [zoom, pan]);

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

  // Abre o modal de teste
  const handleTestClick = () => {
    setShowTestModal(true);
  };

  // Executa o teste real
  const executeTest = async (contactId: string | null, useSampleData: boolean) => {
    if (!orgId) return;
    
    setTesting(true);
    setShowTestModal(false);
    
    // Resetar estados de execução
    const initialStatuses: Record<string, NodeExecutionStatus> = {};
    nodes.forEach((n: AutomationNode) => {
      initialStatuses[n.id] = { status: 'pending' };
    });
    
    setTestExecution({
      isRunning: true,
      nodeStatuses: initialStatuses,
      results: [],
      contact: null,
      totalDuration: 0,
      success: false,
    });

    try {
      // Primeiro, salva a automação e obtém o ID
      const savedId = await onSave();
      const testAutomationId = savedId || automationId;
      
      // Verifica se tem ID válido
      if (!testAutomationId || testAutomationId === 'new') {
        throw new Error('Erro ao salvar automação. Tente salvar manualmente primeiro.');
      }

      // Marca todos os nós como "em espera" e o primeiro como "running"
      const triggerNode = nodes.find((n: AutomationNode) => n.type?.startsWith('trigger_'));
      if (triggerNode) {
        setTestExecution(prev => ({
          ...prev,
          nodeStatuses: {
            ...prev.nodeStatuses,
            [triggerNode.id]: { status: 'running' }
          }
        }));
      }

      // Chama API de teste
      const response = await fetch(`/api/automations/${testAutomationId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          useSampleData,
          organizationId: orgId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao executar teste');
      }

      // Atualiza status de cada nó com animação sequencial
      const steps = result.steps || [];
      
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        
        // Marca o nó atual como running
        setTestExecution(prev => ({
          ...prev,
          nodeStatuses: {
            ...prev.nodeStatuses,
            [step.nodeId]: { status: 'running' }
          }
        }));

        // Pequeno delay para efeito visual
        await new Promise(resolve => setTimeout(resolve, 300));

        // Marca com o status final
        setTestExecution(prev => ({
          ...prev,
          nodeStatuses: {
            ...prev.nodeStatuses,
            [step.nodeId]: {
              status: step.status,
              output: step.output,
              error: step.error,
              duration: step.duration,
            }
          }
        }));
      }

      // Resultado final
      setTestExecution(prev => ({
        ...prev,
        isRunning: false,
        results: steps,
        contact: result.contact,
        totalDuration: result.totalDuration,
        success: result.success,
      }));

      // Mostra painel de resultados
      setShowTestResults(true);

    } catch (error: any) {
      console.error('Erro no teste:', error);
      
      // Marca todos como erro
      setTestExecution(prev => ({
        ...prev,
        isRunning: false,
        success: false,
        results: [{
          nodeId: 'error',
          status: 'error',
          error: error.message,
          duration: 0,
        }],
      }));
      
      setShowTestResults(true);
    } finally {
      setTesting(false);
    }
  };

  // Limpa estados de execução
  const clearTestExecution = () => {
    setShowTestResults(false);
    setTestExecution({
      isRunning: false,
      nodeStatuses: {},
      results: [],
      contact: null,
      totalDuration: 0,
      success: false,
    });
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

          <Button variant="secondary" size="sm" onClick={handleTestClick} disabled={testing || nodes.length === 0}>
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

      {/* Tabs - Canvas vs Execuções */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-[#222222] bg-[#0f0f0f] flex-shrink-0">
        <button
          onClick={() => setActiveTab('canvas')}
          className={cn(
            'flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
            activeTab === 'canvas'
              ? 'bg-primary-500 text-white'
              : 'text-[#666666] hover:text-white hover:bg-[#1a1a1a]'
          )}
        >
          <Zap className="w-4 h-4" />
          Canvas
        </button>
        <button
          onClick={() => setActiveTab('executions')}
          className={cn(
            'flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
            activeTab === 'executions'
              ? 'bg-primary-500 text-white'
              : 'text-[#666666] hover:text-white hover:bg-[#1a1a1a]'
          )}
        >
          <History className="w-4 h-4" />
          Execuções
        </button>
      </div>

      {/* Executions Tab */}
      {activeTab === 'executions' && automationId && automationId !== 'new' && orgId && (
        <div className="flex-1 overflow-hidden">
          <ExecutionHistory 
            organizationId={orgId} 
            automationId={automationId}
          />
        </div>
      )}
      
      {activeTab === 'executions' && (!automationId || automationId === 'new') && (
        <div className="flex-1 flex items-center justify-center bg-[#0a0a0a]">
          <div className="text-center">
            <History className="w-12 h-12 text-[#333333] mx-auto mb-3" />
            <p className="text-[#666666]">Salve a automação primeiro para ver as execuções</p>
          </div>
        </div>
      )}

      {/* Canvas Tab - Main Content */}
      {activeTab === 'canvas' && (
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
          style={{ 
            cursor: isPanning 
              ? 'grabbing' 
              : isSpacePressed 
                ? 'grab' 
                : connectingFrom 
                  ? 'crosshair' 
                  : 'default' 
          }}
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
                executionStatus={testExecution.nodeStatuses[node.id]}
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

          {/* Indicador de modo pan */}
          {isSpacePressed && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
              <div className="bg-[#111111] border border-cyan-500/50 rounded-lg px-4 py-2 shadow-lg">
                <p className="text-sm text-white">
                  ✋ Modo <span className="text-cyan-400 font-semibold">mover tela</span> — arraste para navegar
                </p>
              </div>
            </div>
          )}

          {/* Indicador de zoom */}
          <div className="absolute bottom-4 right-4 z-20 pointer-events-none">
            <div className="bg-[#111111]/80 border border-[#333333] rounded-lg px-3 py-1.5 text-xs text-[#666666]">
              {Math.round(zoom * 100)}%
            </div>
          </div>

          {/* Atalhos de teclado - mostra apenas quando não há ação em andamento */}
          {!connectingFrom && !isSpacePressed && nodes.length > 0 && (
            <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
              <div className="flex gap-2 text-[10px] text-[#444444]">
                <span className="bg-[#111111]/60 border border-[#222222] rounded px-1.5 py-0.5">Scroll = Zoom</span>
                <span className="bg-[#111111]/60 border border-[#222222] rounded px-1.5 py-0.5">Espaço + Arrastar = Mover</span>
                <span className="bg-[#111111]/60 border border-[#222222] rounded px-1.5 py-0.5">ESC = Cancelar</span>
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
      )}

      {/* Modal de Teste */}
      <TestModal
        isOpen={showTestModal}
        onClose={() => setShowTestModal(false)}
        onTest={executeTest}
        organizationId={orgId || ''}
        isLoading={testing}
      />

      {/* Painel de Resultados */}
      <AnimatePresence>
        {showTestResults && (
          <TestResultPanel
            isOpen={showTestResults}
            onClose={clearTestExecution}
            results={testExecution.results}
            contact={testExecution.contact}
            totalDuration={testExecution.totalDuration}
            success={testExecution.success}
          />
        )}
      </AnimatePresence>
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
