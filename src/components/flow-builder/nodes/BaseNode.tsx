'use client';

import { memo, ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Loader2, AlertTriangle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FlowNodeData, NodeStatus } from '@/stores/flowStore';
import { getNodeDefinition, getNodeColor } from './nodeTypes';

// ============================================
// STATUS ICON COMPONENT
// ============================================

const StatusIcon = ({ status }: { status?: NodeStatus }) => {
  switch (status) {
    case 'running':
      return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
    case 'success':
      return <CheckCircle2 className="w-4 h-4 text-green-400" />;
    case 'error':
      return <XCircle className="w-4 h-4 text-red-400" />;
    case 'warning':
      return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    case 'skipped':
      return <span className="text-xs text-slate-400">—</span>;
    default:
      return null;
  }
};

// ============================================
// STATUS VARIANTS FOR ANIMATION
// ============================================

const statusVariants = {
  idle: {
    borderColor: 'rgba(255, 255, 255, 0.12)',
    boxShadow: 'none',
  },
  running: {
    borderColor: '#3b82f6',
    boxShadow: '0 0 20px rgba(59, 130, 246, 0.4)',
  },
  success: {
    borderColor: '#22c55e',
    boxShadow: '0 0 20px rgba(34, 197, 94, 0.4)',
  },
  error: {
    borderColor: '#ef4444',
    boxShadow: '0 0 20px rgba(239, 68, 68, 0.4)',
  },
  warning: {
    borderColor: '#f59e0b',
    boxShadow: '0 0 20px rgba(245, 158, 11, 0.4)',
  },
  skipped: {
    borderColor: '#6b7280',
    boxShadow: 'none',
    opacity: 0.6,
  },
};

// ============================================
// BASE NODE PROPS
// ============================================

interface BaseNodeProps {
  id?: string;
  data: FlowNodeData;
  selected?: boolean;
  children?: ReactNode;
  showSourceHandle?: boolean;
  showTargetHandle?: boolean;
  sourceHandles?: Array<{ id: string; label?: string; color?: string; position?: 'top' | 'center' | 'bottom' }>;
}

// ============================================
// BASE NODE COMPONENT
// ============================================

export const BaseNode = memo(function BaseNode({
  data,
  selected,
  showSourceHandle = true,
  showTargetHandle = true,
  sourceHandles,
  children,
}: BaseNodeProps) {
  const definition = getNodeDefinition(data.nodeType);
  const colors = getNodeColor(definition?.color || 'slate');
  const Icon = definition?.icon || Zap;
  const status = data.status || 'idle';
  const isTrigger = data.category === 'trigger';
  const isCondition = data.category === 'condition';

  return (
    <motion.div
      className={cn(
        'fb-node min-w-[220px] max-w-[280px]',
        'rounded-xl border-2 overflow-hidden',
        'bg-[#1a1a1a] backdrop-blur-sm',
        'transition-colors duration-200',
        // Category border color
        isTrigger && 'border-blue-500/50',
        data.category === 'action' && 'border-purple-500/50',
        isCondition && 'border-amber-500/50',
        data.category === 'control' && 'border-green-500/50',
        // Selection
        selected && 'ring-2 ring-white/30',
        // Status
        status === 'running' && 'fb-node-running',
        status === 'error' && 'fb-node-error',
        status === 'success' && 'fb-node-success',
        status === 'skipped' && 'opacity-60'
      )}
      initial={false}
      animate={statusVariants[status]}
      transition={{ duration: 0.3 }}
      whileHover={{ 
        y: -2,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
      }}
    >
      {/* Target Handle (entrada - esquerda) */}
      {showTargetHandle && !isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className={cn(
            '!w-3 !h-3 !bg-slate-500 !border-2 !border-[#1a1a1a]',
            '!-left-1.5',
            'transition-all duration-150',
            'hover:!scale-125 hover:!bg-blue-400'
          )}
        />
      )}

      {/* Trigger Badge */}
      {isTrigger && (
        <div className={cn(
          'px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider',
          'text-white flex items-center gap-1.5',
          colors.solid
        )}>
          <Zap className="w-3 h-3" />
          Gatilho
        </div>
      )}

      {/* Header */}
      <div className={cn(
        'flex items-center gap-3 p-3',
        !isTrigger && 'border-b border-white/10',
        isTrigger && 'bg-[#0f0f0f]'
      )}>
        {/* Icon */}
        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center',
          colors.bg
        )}>
          <Icon className={cn('w-5 h-5', colors.text)} />
        </div>

        {/* Label & Description */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-white/90 truncate">
            {data.label || definition?.label}
          </h3>
          {data.description && (
            <p className="text-[11px] text-white/50 truncate mt-0.5">
              {data.description}
            </p>
          )}
        </div>

        {/* Status Icon */}
        <AnimatePresence>
          {status !== 'idle' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center',
                status === 'running' && 'bg-blue-500/20',
                status === 'success' && 'bg-green-500/20',
                status === 'error' && 'bg-red-500/20',
                status === 'warning' && 'bg-amber-500/20'
              )}
            >
              <StatusIcon status={status} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Body (custom content) */}
      {children && (
        <div className="p-3 pt-0">
          {children}
        </div>
      )}

      {/* Config Preview */}
      {data.config && Object.keys(data.config).length > 0 && !children && (
        <div className="px-3 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {data.config.tagName && (
              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-[10px] rounded-full">
                #{data.config.tagName}
              </span>
            )}
            {data.config.delay && (
              <span className="px-2 py-0.5 bg-slate-500/20 text-slate-300 text-[10px] rounded-full">
                ⏱ {data.config.delay.value} {data.config.delay.unit}
              </span>
            )}
            {data.config.value !== undefined && data.config.unit && (
              <span className="px-2 py-0.5 bg-slate-500/20 text-slate-300 text-[10px] rounded-full">
                ⏱ {data.config.value} {data.config.unit}
              </span>
            )}
            {data.config.subject && (
              <span className="px-2 py-0.5 bg-violet-500/20 text-violet-300 text-[10px] rounded-full truncate max-w-[150px]">
                📧 {data.config.subject}
              </span>
            )}
            {data.config.templateId && (
              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-[10px] rounded-full">
                📄 Template
              </span>
            )}
          </div>
        </div>
      )}

      {/* Footer with status message & execution time */}
      <AnimatePresence>
        {(data.statusMessage || data.executionTime) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-3 pb-2 border-t border-white/5"
          >
            <div className="flex items-center justify-between text-[10px] pt-2">
              {data.statusMessage && (
                <span className={cn(
                  'truncate',
                  status === 'error' ? 'text-red-400' : 'text-white/40'
                )}>
                  {data.statusMessage}
                </span>
              )}
              {data.executionTime !== undefined && (
                <span className="text-white/30 ml-2">
                  {data.executionTime}ms
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Source Handles */}
      {showSourceHandle && !isCondition && (
        <Handle
          type="source"
          position={Position.Right}
          className={cn(
            '!w-3 !h-3 !border-2 !border-[#1a1a1a]',
            '!-right-1.5',
            'transition-all duration-150',
            'hover:!scale-125',
            isTrigger && '!bg-blue-500',
            data.category === 'action' && '!bg-purple-500',
            data.category === 'control' && '!bg-green-500'
          )}
        />
      )}

      {/* Multiple Source Handles (for conditions) */}
      {sourceHandles && sourceHandles.map((handle, index) => {
        const total = sourceHandles.length;
        const offset = total === 2 ? (index === 0 ? '33%' : '67%') : '50%';
        
        return (
          <Handle
            key={handle.id}
            type="source"
            position={Position.Right}
            id={handle.id}
            style={{ top: offset }}
            className={cn(
              '!w-3 !h-3 !border-2 !border-[#1a1a1a]',
              '!-right-1.5',
              'transition-all duration-150',
              'hover:!scale-125',
              handle.color === 'green' && '!bg-green-500',
              handle.color === 'red' && '!bg-red-500',
              !handle.color && '!bg-amber-500'
            )}
          />
        );
      })}
    </motion.div>
  );
});

export default BaseNode;
