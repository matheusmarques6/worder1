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
  Link2,
  Mic,
  Paperclip,
  Image,
  FileText,
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
    color: 'text-gray-500',
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
          <span className="text-[10px] text-gray-700 font-medium">
            {executionTime}ms
          </span>
        )}
        {status === 'running' && (
          <span className="text-[10px] text-gray-700 font-medium">
            Executando...
          </span>
        )}
      </motion.div>

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
// WHATSAPP PREVIEW COMPONENT
// ============================================

const WhatsAppPreview = ({ config }: { config: Record<string, any> }) => {
  const message = config?.message || config?.text || config?.content || '';
  const hasAudio = config?.audioUrl || config?.hasAudio;
  const hasMedia = config?.mediaUrl || config?.imageUrl || config?.hasMedia;
  const hasAttachment = config?.attachmentUrl || config?.fileUrl || config?.hasAttachment;
  const templateName = config?.templateName || config?.template;

  const truncatedMessage = message.length > 80 ? message.substring(0, 80) + '...' : message;

  const highlightVariables = (text: string) => {
    return text.split(/(\{\{[^}]+\}\})/).map((part, i) => {
      if (part.match(/\{\{[^}]+\}\}/)) {
        return (
          <span key={i} className="bg-green-400/30 text-green-300 px-1 rounded text-[10px]">
            {part.replace(/\{\{|\}\}/g, '')}
          </span>
        );
      }
      return part;
    });
  };

  if (!message && !hasAudio && !hasMedia && !hasAttachment && !templateName) {
    return (
      <div className="mt-2 pt-2 border-t border-gray-200">
        <div className="text-[10px] text-gray-400 italic">
          Clique para configurar a mensagem
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t border-gray-200">
      {templateName && (
        <div className="text-[10px] text-gray-500 mb-1 flex items-center gap-1">
          <FileText className="w-3 h-3" />
          {templateName}
        </div>
      )}

      <div className="bg-[#005c4b] rounded-lg p-2 max-w-full relative">
        {message && (
          <p className="text-[11px] text-white/90 leading-relaxed break-words">
            {highlightVariables(truncatedMessage)}
          </p>
        )}

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {hasAudio && (
            <div className="flex items-center gap-1 text-[10px] text-gray-500">
              <Mic className="w-3 h-3" />
              <span>Áudio</span>
            </div>
          )}
          {hasMedia && (
            <div className="flex items-center gap-1 text-[10px] text-gray-500">
              <Image className="w-3 h-3" />
              <span>Imagem</span>
            </div>
          )}
          {hasAttachment && (
            <div className="flex items-center gap-1 text-[10px] text-gray-500">
              <Paperclip className="w-3 h-3" />
              <span>Anexo</span>
            </div>
          )}
        </div>

        {message && message.includes('http') && (
          <div className="flex items-center gap-1 mt-1 text-[10px] text-blue-300">
            <Link2 className="w-3 h-3" />
            <span>Contém link</span>
          </div>
        )}

        <div className="absolute -left-1.5 top-2 w-3 h-3 bg-[#005c4b] transform rotate-45" />
      </div>
    </div>
  );
};

// ============================================
// SMS PREVIEW COMPONENT
// ============================================

const SMSPreview = ({ config }: { config: Record<string, any> }) => {
  const message = config?.message || config?.text || config?.content || '';
  const truncatedMessage = message.length > 60 ? message.substring(0, 60) + '...' : message;

  const highlightVariables = (text: string) => {
    return text.split(/(\{\{[^}]+\}\})/).map((part, i) => {
      if (part.match(/\{\{[^}]+\}\}/)) {
        return (
          <span key={i} className="bg-purple-400/30 text-purple-300 px-1 rounded text-[10px]">
            {part.replace(/\{\{|\}\}/g, '')}
          </span>
        );
      }
      return part;
    });
  };

  if (!message) {
    return (
      <div className="mt-2 pt-2 border-t border-gray-200">
        <div className="text-[10px] text-gray-400 italic">
          Clique para configurar o SMS
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t border-gray-200">
      <div className="bg-purple-600/30 border border-purple-500/30 rounded-lg p-2 max-w-full relative">
        <div className="flex items-center gap-1 mb-1 text-[9px] text-purple-300 uppercase tracking-wider">
          <Phone className="w-3 h-3" />
          SMS
        </div>
        <p className="text-[11px] text-white/90 leading-relaxed break-words">
          {highlightVariables(truncatedMessage)}
        </p>
        <div className="text-right mt-1">
          <span className={cn(
            "text-[9px]",
            message.length > 160 ? "text-amber-400" : "text-gray-400"
          )}>
            {message.length}/160
          </span>
        </div>
      </div>
    </div>
  );
};

// ============================================
// EMAIL PREVIEW COMPONENT
// ============================================

const EmailPreview = ({ config }: { config: Record<string, any> }) => {
  const subject = config?.subject || '';
  const body = config?.body || config?.content || '';

  if (!subject && !body) {
    return (
      <div className="mt-2 pt-2 border-t border-gray-200">
        <div className="text-[10px] text-gray-400 italic">
          Clique para configurar o email
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t border-gray-200">
      <div className="bg-blue-600/20 border border-blue-500/30 rounded-lg p-2">
        {subject && (
          <div className="flex items-center gap-1 mb-1">
            <Mail className="w-3 h-3 text-blue-400" />
            <span className="text-[10px] text-gray-700 font-medium truncate">{subject}</span>
          </div>
        )}
        {body && (
          <p className="text-[10px] text-gray-500 line-clamp-2">
            {body.length > 80 ? body.substring(0, 80) + '...' : body}
          </p>
        )}
      </div>
    </div>
  );
};

// ============================================
// DELAY PREVIEW COMPONENT
// ============================================

const DelayPreview = ({ config }: { config: Record<string, any> }) => {
  const time = config?.value || config?.time || config?.delay || config?.duration || 1;
  const unit = config?.unit || config?.timeUnit || 'minutes';

  const getTimeText = () => {
    const unitLabels: Record<string, { singular: string; plural: string }> = {
      minutes: { singular: 'minuto', plural: 'minutos' },
      hours: { singular: 'hora', plural: 'horas' },
      days: { singular: 'dia', plural: 'dias' },
      weeks: { singular: 'semana', plural: 'semanas' },
    };

    const label = unitLabels[unit] || { singular: unit, plural: unit };
    return `${time} ${time === 1 ? label.singular : label.plural}`;
  };

  return (
    <div className="mt-2 pt-2 border-t border-gray-200">
      <div className="bg-purple-600/30 border border-purple-500/40 rounded-lg px-3 py-2 flex items-center justify-center gap-2">
        <Clock className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium text-purple-300">
          {getTimeText()}
        </span>
      </div>
    </div>
  );
};

// ============================================
// TAG PREVIEW COMPONENT
// ============================================

const TagPreview = ({ config, isRemove }: { config: Record<string, any>; isRemove?: boolean }) => {
  const tagName = config?.tag || config?.tagName || config?.tagId || '';

  if (!tagName) {
    return (
      <div className="mt-2 pt-2 border-t border-gray-200">
        <div className="text-[10px] text-gray-400 italic">
          Clique para selecionar tag
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t border-gray-200">
      <div className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs",
        isRemove
          ? "bg-red-500/20 border border-red-500/30 text-red-300"
          : "bg-blue-500/20 border border-blue-500/30 text-blue-300"
      )}>
        <Tag className="w-3 h-3" />
        <span>{tagName}</span>
        {isRemove && <XCircle className="w-3 h-3" />}
      </div>
    </div>
  );
};

// ============================================
// CONDITION PREVIEW COMPONENT
// ============================================

const ConditionPreview = ({ config, nodeType }: { config: Record<string, any>; nodeType: string }) => {
  const field = config?.field || config?.fieldName || '';
  const operator = config?.operator || '=';
  const value = config?.value || '';

  if (nodeType === 'logic_split') {
    const percentA = config?.percentA || config?.splitPercent || 50;
    return (
      <div className="mt-2 pt-2 border-t border-gray-200">
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-green-500/20 rounded px-2 py-1 text-center">
            <span className="text-[10px] text-green-400 font-medium">{percentA}% A</span>
          </div>
          <div className="flex-1 bg-amber-500/20 rounded px-2 py-1 text-center">
            <span className="text-[10px] text-amber-400 font-medium">{100 - percentA}% B</span>
          </div>
        </div>
      </div>
    );
  }

  if (!field) {
    return (
      <div className="mt-2 pt-2 border-t border-gray-200">
        <div className="text-[10px] text-gray-400 italic">
          Clique para configurar condição
        </div>
      </div>
    );
  }

  const operatorLabels: Record<string, string> = {
    '=': '=',
    '!=': '≠',
    '>': '>',
    '<': '<',
    '>=': '≥',
    '<=': '≤',
    'contains': 'contém',
    'not_contains': 'não contém',
    'starts_with': 'começa com',
    'ends_with': 'termina com',
  };

  return (
    <div className="mt-2 pt-2 border-t border-gray-200">
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1.5 text-center">
        <span className="text-[10px] text-gray-700">
          {field} <span className="text-amber-400 font-medium">{operatorLabels[operator] || operator}</span> {value}
        </span>
      </div>
    </div>
  );
};

// ============================================
// BASE NODE COMPONENT
// ============================================

function BaseNodeComponent(props: BaseNodeProps) {
  const { id, data, selected } = props;
  const { category, label, description, icon, status, executionTime, statusMessage, disabled, nodeType, config: nodeConfig } = data;
  const catConfig = categoryConfig[category] || categoryConfig.action;
  const statusCfg = statusConfig[status as keyof typeof statusConfig] || statusConfig.idle;
  const IconComponent = icon ? iconMap[icon] : Zap;
  const selectNode = useFlowStore((s) => s.selectNode);

  const isExecuting = status === 'running';
  const hasResult = status === 'success' || status === 'error' || status === 'skipped';

  const renderPreview = () => {
    const cfg = nodeConfig || {};

    switch (nodeType) {
      case 'action_whatsapp':
        return <WhatsAppPreview config={cfg} />;
      case 'action_sms':
        return <SMSPreview config={cfg} />;
      case 'action_email':
        return <EmailPreview config={cfg} />;
      case 'control_delay':
      case 'control_delay_until':
      case 'logic_delay':
      case 'control_delay_condition':
      case 'control_delay_date':
      case 'control_delay_weekday':
        return <DelayPreview config={cfg} />;
      case 'action_tag':
        return <TagPreview config={cfg} />;
      case 'action_remove_tag':
        return <TagPreview config={cfg} isRemove />;
      case 'condition_field':
      case 'condition_has_tag':
      case 'logic_split':
      case 'logic_filter':
        return <ConditionPreview config={cfg} nodeType={nodeType} />;
      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{
        scale: 1,
        opacity: disabled ? 0.5 : 1,
      }}
      className={cn(
        'relative min-w-[280px] max-w-[360px]',
        'rounded-xl border backdrop-blur-sm',
        'bg-gradient-to-br',
        catConfig.gradient,
        hasResult ? statusCfg.borderColor : catConfig.border,
        selected && `ring-2 ring-gray-400/50 ${catConfig.glow} shadow-lg`,
        isExecuting && 'shadow-xl shadow-blue-500/30',
        hasResult && status === 'success' && 'shadow-lg shadow-green-500/20',
        hasResult && status === 'error' && 'shadow-lg shadow-red-500/20',
        'transition-all duration-300',
        'hover:shadow-lg cursor-pointer'
      )}
      onClick={() => selectNode(id)}
    >
      <PulseRing status={status} category={category} />

      <ExecutionOverlay
        status={status}
        executionTime={executionTime}
        statusMessage={statusMessage}
      />

      {category !== 'trigger' && (
        <Handle
          type="target"
          position={Position.Top}
          className={cn(
            '!w-3 !h-3 !border-2 !bg-white !-top-1.5',
            hasResult && status === 'success' ? '!border-green-500/50' : '!border-gray-300',
            'hover:!bg-gray-100'
          )}
        />
      )}

      <div className="p-3">
        <div className="flex items-start gap-3">
          <motion.div
            className={cn(
              'p-2 rounded-lg bg-gray-50 border border-gray-200',
              isExecuting ? 'text-blue-400' : catConfig.icon,
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
            <h3 className="text-sm font-medium text-gray-900 truncate">{label}</h3>
            {description && (
              <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{description}</p>
            )}
          </div>
        </div>

        {renderPreview()}

        {hasResult && executionTime !== undefined && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-2 pt-2 border-t border-gray-200"
          >
            <div className="flex items-center justify-between">
              <span className={cn(
                'text-xs font-medium',
                status === 'success' && 'text-green-400',
                status === 'error' && 'text-red-400',
                status === 'skipped' && 'text-gray-500',
              )}>
                {status === 'success' && '✓ Sucesso'}
                {status === 'error' && '✗ Erro'}
                {status === 'skipped' && '→ Pulado'}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-400">
                {executionTime}ms
              </span>
            </div>
          </motion.div>
        )}
      </div>

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
            '!w-3 !h-3 !border-2 !bg-white !-bottom-1.5',
            hasResult && status === 'success' ? '!border-green-500/50' : '!border-gray-300',
            'hover:!bg-gray-100'
          )}
        />
      )}
    </motion.div>
  );
}

export const BaseNode = memo(BaseNodeComponent);
export default BaseNode;
