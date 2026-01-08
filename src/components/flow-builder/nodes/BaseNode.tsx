'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingCart,
  CreditCard,
  ShoppingBag,
  UserPlus,
  Tag,
  Briefcase,
  ArrowRight,
  Trophy,
  XCircle,
  Calendar,
  Users,
  Webhook,
  MessageSquare,
  Clock,
  Mail,
  Phone,
  Bell,
  Edit,
  Trash,
  GitBranch,
  Percent,
  Filter,
  Zap,
  Send,
  UserMinus,
  Target,
  Globe,
  AlertCircle,
  CheckCircle,
  Loader2,
  SkipForward,
  LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFlowStore } from '@/stores/flowStore';

// ============================================
// TYPES
// ============================================

export interface FlowNodeData {
  label: string;
  description?: string;
  category: 'trigger' | 'action' | 'condition' | 'control' | 'transform';
  nodeType: string;
  config: Record<string, any>;
  icon?: string;
  color?: string;
  credentialId?: string;
  disabled?: boolean;
  notes?: string;
  status?: 'idle' | 'running' | 'success' | 'error' | 'warning' | 'skipped';
  statusMessage?: string;
  executionTime?: number;
  executionOutput?: any;
}

// Simple props interface - React Flow will pass these
export interface BaseNodeProps {
  id: string;
  data: FlowNodeData;
  selected?: boolean;
}

// ============================================
// ICON MAP
// ============================================

const iconMap: Record<string, LucideIcon> = {
  ShoppingCart, CreditCard, ShoppingBag, UserPlus, Tag, Briefcase,
  ArrowRight, Trophy, XCircle, Calendar, Users, Webhook, MessageSquare,
  Mail, Phone, Bell, Edit, Trash, Send, UserMinus, Target, Globe,
  GitBranch, Percent, Filter, Clock, Zap,
};

// ============================================
// CATEGORY CONFIG
// ============================================

const categoryConfig = {
  trigger: {
    gradient: 'from-emerald-500/20 to-emerald-600/10',
    border: 'border-emerald-500/30',
    glow: 'shadow-emerald-500/20',
    icon: 'text-emerald-400',
    ring: 'ring-emerald-500/50',
  },
  action: {
    gradient: 'from-blue-500/20 to-blue-600/10',
    border: 'border-blue-500/30',
    glow: 'shadow-blue-500/20',
    icon: 'text-blue-400',
    ring: 'ring-blue-500/50',
  },
  condition: {
    gradient: 'from-amber-500/20 to-amber-600/10',
    border: 'border-amber-500/30',
    glow: 'shadow-amber-500/20',
    icon: 'text-amber-400',
    ring: 'ring-amber-500/50',
  },
  control: {
    gradient: 'from-purple-500/20 to-purple-600/10',
    border: 'border-purple-500/30',
    glow: 'shadow-purple-500/20',
    icon: 'text-purple-400',
    ring: 'ring-purple-500/50',
  },
  transform: {
    gradient: 'from-pink-500/20 to-pink-600/10',
    border: 'border-pink-500/30',
    glow: 'shadow-pink-500/20',
    icon: 'text-pink-400',
    ring: 'ring-pink-500/50',
  },
};

// ============================================
// STATUS CONFIG
// ============================================

const statusConfig = {
  idle: { 
    icon: null, 
    color: '', 
    bgColor: '',
    borderColor: '',
    animate: false,
    pulse: false,
  },
  running: { 
    icon: Loader2, 
    color: 'text-blue-400', 
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/50',
    animate: true,
    pulse: true,
  },
  success: { 
    icon: CheckCircle, 
    color: 'text-green-400', 
    bgColor: 'bg-green-500/20',
    borderColor: 'border-green-500/50',
    animate: false,
    pulse: false,
  },
  error: { 
    icon: XCircle, 
    color: 'text-red-400', 
    bgColor: 'bg-red-500/20',
    borderColor: 'border-red-500/50',
    animate: false,
    pulse: false,
  },
  warning: { 
    icon: AlertCircle, 
    color: 'text-amber-400', 
    bgColor: 'bg-amber-500/20',
    borderColor: 'border-amber-500/50',
    animate: false,
    pulse: false,
  },
  skipped: { 
    icon: SkipForward, 
    color: 'text-slate-400', 
    bgColor: 'bg-slate-500/20',
    borderColor: 'border-slate-500/50',
    animate: false,
    pulse: false,
  },
};

// ============================================
// EXECUTION STATUS OVERLAY
// ============================================

const ExecutionOverlay = ({ status, executionTime, statusMessage }: { 
  status?: string; 
  executionTime?: number;
  statusMessage?: string;
}) => {
  if (!status || status === 'idle') return null;

  const cfg = statusConfig[status as keyof typeof statusConfig] || statusConfig.idle;
  const Icon = cfg.icon;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className={cn(
          'absolute -top-2 -right-2 z-10',
          'flex items-center gap-1 px-2 py-1 rounded-full',
          'border shadow-lg backdrop-blur-sm',
          cfg.bgColor,
          cfg.borderColor
        )}
      >
        {Icon && (
          <Icon className={cn('w-3.5 h-3.5', cfg.color, cfg.animate && 'animate-spin')} />
        )}
        {executionTime !== undefined && status !== 'running' && (
          <span className="text-[10px] text-white/70 font-medium">
            {executionTime}ms
          </span>
        )}
        {status === 'running' && (
          <span className="text-[10px] text-white/70 font-medium">
            Executando...
          </span>
        )}
      </motion.div>

      {/* Status message tooltip */}
      {statusMessage && status === 'error' && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -bottom-8 left-1/2 -translate-x-1/2 z-10 
                     px-2 py-1 rounded bg-red-500/90 text-white text-[10px]
                     whitespace-nowrap max-w-[200px] truncate"
        >
          {statusMessage}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ============================================
// PULSE ANIMATION RING
// ============================================

const PulseRing = ({ status, category }: { status?: string; category: string }) => {
  const cfg = statusConfig[status as keyof typeof statusConfig];
  if (!cfg?.pulse) return null;

  return (
    <motion.div
      className={cn(
        'absolute inset-0 rounded-xl',
        'ring-2',
        status === 'running' ? 'ring-blue-500/50' : categoryConfig[category as keyof typeof categoryConfig]?.ring
      )}
      animate={{
        scale: [1, 1.05, 1],
        opacity: [0.5, 0.8, 0.5],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
};

// ============================================
// BASE NODE COMPONENT
// ============================================

function BaseNodeComponent(props: BaseNodeProps) {
  const { id, data, selected } = props;
  const { category, label, description, icon, status, executionTime, statusMessage, disabled } = data;
  const config = categoryConfig[category] || categoryConfig.action;
  const statusCfg = statusConfig[status as keyof typeof statusConfig] || statusConfig.idle;
  const IconComponent = icon ? iconMap[icon] : Zap;
  const selectNode = useFlowStore((s) => s.selectNode);

  const isExecuting = status === 'running';
  const hasResult = status === 'success' || status === 'error' || status === 'skipped';

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ 
        scale: 1, 
        opacity: disabled ? 0.5 : 1,
      }}
      className={cn(
        'relative min-w-[200px] max-w-[280px]',
        'rounded-xl border backdrop-blur-sm',
        'bg-gradient-to-br',
        config.gradient,
        // Status-based border
        hasResult ? statusCfg.borderColor : config.border,
        // Selection state
        selected && `ring-2 ring-white/30 ${config.glow} shadow-lg`,
        // Execution glow
        isExecuting && 'shadow-xl shadow-blue-500/30',
        hasResult && status === 'success' && 'shadow-lg shadow-green-500/20',
        hasResult && status === 'error' && 'shadow-lg shadow-red-500/20',
        'transition-all duration-300',
        'hover:shadow-lg cursor-pointer'
      )}
      onClick={() => selectNode(id)}
    >
      {/* Pulse animation for running state */}
      <PulseRing status={status} category={category} />

      {/* Status overlay badge */}
      <ExecutionOverlay 
        status={status} 
        executionTime={executionTime}
        statusMessage={statusMessage}
      />

      {/* Input Handle */}
      {category !== 'trigger' && (
        <Handle
          type="target"
          position={Position.Top}
          className={cn(
            '!w-3 !h-3 !border-2 !bg-[#1a1a1a] !-top-1.5',
            hasResult && status === 'success' ? '!border-green-500/50' : '!border-white/20',
            'hover:!bg-white/20'
          )}
        />
      )}

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <motion.div 
            className={cn(
              'p-2 rounded-lg bg-white/5 border border-white/10',
              isExecuting ? 'text-blue-400' : config.icon,
              hasResult && status === 'success' && 'text-green-400 border-green-500/30',
              hasResult && status === 'error' && 'text-red-400 border-red-500/30',
            )}
            animate={isExecuting ? { 
              scale: [1, 1.1, 1],
            } : {}}
            transition={{ 
              duration: 0.5, 
              repeat: isExecuting ? Infinity : 0,
            }}
          >
            {IconComponent && <IconComponent className="w-5 h-5" />}
          </motion.div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-white truncate">{label}</h3>
            {description && (
              <p className="text-xs text-white/50 mt-0.5 line-clamp-2">{description}</p>
            )}
          </div>
        </div>

        {/* Execution result preview */}
        {hasResult && executionTime !== undefined && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 pt-3 border-t border-white/10"
          >
            <div className="flex items-center justify-between">
              <span className={cn(
                'text-xs font-medium',
                status === 'success' && 'text-green-400',
                status === 'error' && 'text-red-400',
                status === 'skipped' && 'text-slate-400',
              )}>
                {status === 'success' && '✓ Sucesso'}
                {status === 'error' && '✗ Erro'}
                {status === 'skipped' && '→ Pulado'}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">
                {executionTime}ms
              </span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Output Handle(s) */}
      {category === 'condition' ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className="!w-3 !h-3 !border-2 !border-green-500/50 !bg-green-500/30 hover:!bg-green-500/50 !-bottom-1.5 !left-1/3"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="!w-3 !h-3 !border-2 !border-red-500/50 !bg-red-500/30 hover:!bg-red-500/50 !-bottom-1.5 !left-2/3"
          />
          <div className="absolute -bottom-6 left-1/3 -translate-x-1/2 text-[10px] text-green-400">Sim</div>
          <div className="absolute -bottom-6 left-2/3 -translate-x-1/2 text-[10px] text-red-400">Não</div>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className={cn(
            '!w-3 !h-3 !border-2 !bg-[#1a1a1a] !-bottom-1.5',
            hasResult && status === 'success' ? '!border-green-500/50' : '!border-white/20',
            'hover:!bg-white/20'
          )}
        />
      )}
    </motion.div>
  );
}

export const BaseNode = memo(BaseNodeComponent);
export default BaseNode;
