'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { motion } from 'framer-motion';
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
  status?: 'idle' | 'running' | 'success' | 'error' | 'warning';
  statusMessage?: string;
  executionTime?: number;
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
  },
  action: {
    gradient: 'from-blue-500/20 to-blue-600/10',
    border: 'border-blue-500/30',
    glow: 'shadow-blue-500/20',
    icon: 'text-blue-400',
  },
  condition: {
    gradient: 'from-amber-500/20 to-amber-600/10',
    border: 'border-amber-500/30',
    glow: 'shadow-amber-500/20',
    icon: 'text-amber-400',
  },
  control: {
    gradient: 'from-purple-500/20 to-purple-600/10',
    border: 'border-purple-500/30',
    glow: 'shadow-purple-500/20',
    icon: 'text-purple-400',
  },
  transform: {
    gradient: 'from-pink-500/20 to-pink-600/10',
    border: 'border-pink-500/30',
    glow: 'shadow-pink-500/20',
    icon: 'text-pink-400',
  },
};

// ============================================
// STATUS INDICATOR
// ============================================

const StatusIndicator = ({ status }: { status?: string }) => {
  if (!status || status === 'idle') return null;

  const config: Record<string, { icon: LucideIcon; color: string; animate: boolean }> = {
    running: { icon: Loader2, color: 'text-blue-400', animate: true },
    success: { icon: CheckCircle, color: 'text-green-400', animate: false },
    error: { icon: AlertCircle, color: 'text-red-400', animate: false },
    warning: { icon: AlertCircle, color: 'text-amber-400', animate: false },
  };

  const cfg = config[status] || config.running;
  const Icon = cfg.icon;

  return (
    <div className={cn('absolute -top-1 -right-1', cfg.color)}>
      <Icon className={cn('w-4 h-4', cfg.animate && 'animate-spin')} />
    </div>
  );
};

// ============================================
// BASE NODE COMPONENT
// ============================================

function BaseNodeComponent(props: BaseNodeProps) {
  const { id, data, selected } = props;
  const { category, label, description, icon, status, executionTime, disabled } = data;
  const config = categoryConfig[category] || categoryConfig.action;
  const IconComponent = icon ? iconMap[icon] : Zap;
  const selectNode = useFlowStore((s) => s.selectNode);

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        'relative min-w-[200px] max-w-[280px]',
        'rounded-xl border backdrop-blur-sm',
        'bg-gradient-to-br',
        config.gradient,
        config.border,
        selected && `ring-2 ring-white/30 ${config.glow} shadow-lg`,
        disabled && 'opacity-50',
        'transition-all duration-200',
        'hover:shadow-lg cursor-pointer'
      )}
      onClick={() => selectNode(id)}
    >
      <StatusIndicator status={status} />

      {/* Input Handle */}
      {category !== 'trigger' && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !border-2 !border-white/20 !bg-[#1a1a1a] hover:!bg-white/20 !-top-1.5"
        />
      )}

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn('p-2 rounded-lg bg-white/5 border border-white/10', config.icon)}>
            {IconComponent && <IconComponent className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-white truncate">{label}</h3>
            {description && (
              <p className="text-xs text-white/50 mt-0.5 line-clamp-2">{description}</p>
            )}
          </div>
        </div>

        {executionTime !== undefined && (
          <div className="mt-2 flex justify-end">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">
              {executionTime}ms
            </span>
          </div>
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
          className="!w-3 !h-3 !border-2 !border-white/20 !bg-[#1a1a1a] hover:!bg-white/20 !-bottom-1.5"
        />
      )}
    </motion.div>
  );
}

export const BaseNode = memo(BaseNodeComponent);
export default BaseNode;
