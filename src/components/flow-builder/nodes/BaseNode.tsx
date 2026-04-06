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
  Eye,
  PlusCircle,
  Package,
  Truck,
  Smartphone,
  UserCog,
  List,
  Shuffle,
  MessageCircle,
  type LucideIcon,
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
  // Added for all sidebar node types
  Eye, PlusCircle, Package, Truck, Smartphone, UserCog, List,
  Shuffle, MessageCircle, FileText,
};

// ============================================
// CATEGORY CONFIG
// ============================================

const categoryConfig = {
  trigger: {
    leftBorder: 'border-l-emerald-500',
    icon: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
  },
  action: {
    leftBorder: 'border-l-blue-500',
    icon: 'text-blue-600',
    iconBg: 'bg-blue-50',
  },
  condition: {
    leftBorder: 'border-l-amber-500',
    icon: 'text-amber-600',
    iconBg: 'bg-amber-50',
  },
  control: {
    leftBorder: 'border-l-purple-500',
    icon: 'text-purple-600',
    iconBg: 'bg-purple-50',
  },
  transform: {
    leftBorder: 'border-l-pink-500',
    icon: 'text-pink-600',
    iconBg: 'bg-pink-50',
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

const PulseRing = ({ status }: { status?: string; category: string }) => {
  const cfg = statusConfig[status as keyof typeof statusConfig];
  if (!cfg?.pulse) return null;

  return (
    <motion.div
      className={cn(
        'absolute inset-0 rounded-lg',
        'ring-2 ring-blue-400/50',
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
          <span key={i} className="bg-green-100 text-green-700 px-1 rounded text-[10px]">
            {part.replace(/\{\{|\}\}/g, '')}
          </span>
        );
      }
      return part;
    });
  };

  if (!message && !hasAudio && !hasMedia && !hasAttachment && !templateName) {
    return (
      <div className="mt-2 pt-2 border-t border-gray-100">
        <div className="text-[10px] text-gray-400 italic">
          Clique para configurar a mensagem
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      {templateName && (
        <div className="text-[10px] text-gray-500 mb-1 flex items-center gap-1">
          <FileText className="w-3 h-3" />
          {templateName}
        </div>
      )}

      <div className="bg-green-50 border border-green-200 rounded-lg p-2 max-w-full">
        {message && (
          <p className="text-[11px] text-gray-700 leading-relaxed break-words">
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
          <div className="flex items-center gap-1 mt-1 text-[10px] text-blue-600">
            <Link2 className="w-3 h-3" />
            <span>Contém link</span>
          </div>
        )}
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
          <span key={i} className="bg-purple-100 text-purple-700 px-1 rounded text-[10px]">
            {part.replace(/\{\{|\}\}/g, '')}
          </span>
        );
      }
      return part;
    });
  };

  if (!message) {
    return (
      <div className="mt-2 pt-2 border-t border-gray-100">
        <div className="text-[10px] text-gray-400 italic">
          Clique para configurar o SMS
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 max-w-full">
        <div className="flex items-center gap-1 mb-1 text-[9px] text-purple-600 uppercase tracking-wider">
          <Phone className="w-3 h-3" />
          SMS
        </div>
        <p className="text-[11px] text-gray-700 leading-relaxed break-words">
          {highlightVariables(truncatedMessage)}
        </p>
        <div className="text-right mt-1">
          <span className={cn(
            "text-[9px]",
            message.length > 160 ? "text-amber-600" : "text-gray-400"
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
    <div className="mt-2 pt-2 border-t border-gray-100">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
        {subject && (
          <div className="flex items-center gap-1 mb-1">
            <Mail className="w-3 h-3 text-blue-600" />
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
    <div className="mt-2 pt-2 border-t border-gray-100">
      <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 flex items-center justify-center gap-2">
        <Clock className="w-4 h-4 text-purple-600" />
        <span className="text-sm font-medium text-purple-700">
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
          ? "bg-red-50 border border-red-200 text-red-700"
          : "bg-blue-50 border border-blue-200 text-blue-700"
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
          <div className="flex-1 bg-blue-50 border border-blue-200 rounded px-2 py-1 text-center">
            <span className="text-[10px] text-blue-700 font-medium">{percentA}% A</span>
          </div>
          <div className="flex-1 bg-orange-50 border border-orange-200 rounded px-2 py-1 text-center">
            <span className="text-[10px] text-orange-700 font-medium">{100 - percentA}% B</span>
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
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 text-center">
        <span className="text-[10px] text-gray-700">
          {field} <span className="text-amber-700 font-medium">{operatorLabels[operator] || operator}</span> {value}
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
  const catConfig = categoryConfig[category as keyof typeof categoryConfig] || categoryConfig.action;
  const statusCfg = statusConfig[status as keyof typeof statusConfig] || statusConfig.idle;
  const IconComponent = icon ? iconMap[icon] : Zap;
  const selectNode = useFlowStore((s) => s.selectNode);
  const showAnalytics = useFlowStore((s) => s.showAnalytics);
  const analyticsData = useFlowStore((s) => s.analyticsData);

  const isExecuting = status === 'running';
  const hasResult = status === 'success' || status === 'error' || status === 'skipped';
  const nodeMetrics = showAnalytics ? analyticsData[id] : null;
  const isActionNode = category === 'action';

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
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{
        scale: 1,
        opacity: disabled ? 0.5 : 1,
      }}
      className={cn(
        'relative w-[240px]',
        'rounded-lg bg-white border border-gray-200 border-l-4 shadow-sm',
        catConfig.leftBorder,
        selected && 'ring-2 ring-blue-500 ring-offset-2 shadow-md',
        isExecuting && 'shadow-md ring-2 ring-blue-400',
        hasResult && status === 'success' && 'ring-2 ring-green-400',
        hasResult && status === 'error' && 'ring-2 ring-red-400',
        'transition-shadow duration-200',
        'hover:shadow-md cursor-pointer'
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
            hasResult && status === 'success' ? '!border-green-500' : '!border-gray-300',
            'hover:!bg-gray-50'
          )}
        />
      )}

      <div className="p-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'p-2 rounded-lg',
              catConfig.iconBg,
              isExecuting && 'text-blue-600 bg-blue-50',
              !isExecuting && catConfig.icon,
              hasResult && status === 'success' && 'text-green-600 bg-green-50',
              hasResult && status === 'error' && 'text-red-600 bg-red-50',
            )}
          >
            {IconComponent && <IconComponent className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-gray-900 truncate">{label}</h3>
            {description && (
              <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{description}</p>
            )}
          </div>
        </div>

        {renderPreview()}

        {/* Analytics overlay */}
        {nodeMetrics && isActionNode && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">Enviados</span>
                <span className="text-[10px] font-medium text-gray-700">{nodeMetrics.sent}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">Abertos</span>
                <span className="text-[10px] font-medium text-gray-700">
                  {nodeMetrics.opened} {nodeMetrics.sent > 0 && <span className="text-gray-400">({Math.round(nodeMetrics.opened / nodeMetrics.sent * 100)}%)</span>}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">Clicados</span>
                <span className="text-[10px] font-medium text-gray-700">
                  {nodeMetrics.clicked} {nodeMetrics.sent > 0 && <span className="text-gray-400">({Math.round(nodeMetrics.clicked / nodeMetrics.sent * 100)}%)</span>}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">Revenue</span>
                <span className="text-[10px] font-medium text-emerald-600">
                  {nodeMetrics.revenue > 0 ? `R$${nodeMetrics.revenue.toFixed(0)}` : '-'}
                </span>
              </div>
            </div>
          </div>
        )}

        {hasResult && executionTime !== undefined && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-2 pt-2 border-t border-gray-100"
          >
            <div className="flex items-center justify-between">
              <span className={cn(
                'text-xs font-medium',
                status === 'success' && 'text-green-600',
                status === 'error' && 'text-red-600',
                status === 'skipped' && 'text-gray-500',
              )}>
                {status === 'success' && 'Sucesso'}
                {status === 'error' && 'Erro'}
                {status === 'skipped' && 'Pulado'}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
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
            className="!w-3 !h-3 !border-2 !border-green-500 !bg-green-100 hover:!bg-green-200 !-bottom-1.5 !left-1/3"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="!w-3 !h-3 !border-2 !border-red-500 !bg-red-100 hover:!bg-red-200 !-bottom-1.5 !left-2/3"
          />
          <div className="absolute -bottom-6 left-1/3 -translate-x-1/2 text-[10px] text-green-600 font-medium">Sim</div>
          <div className="absolute -bottom-6 left-2/3 -translate-x-1/2 text-[10px] text-red-600 font-medium">Não</div>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className={cn(
            '!w-3 !h-3 !border-2 !bg-white !-bottom-1.5',
            hasResult && status === 'success' ? '!border-green-500' : '!border-gray-300',
            'hover:!bg-gray-50'
          )}
        />
      )}
    </motion.div>
  );
}

export const BaseNode = memo(BaseNodeComponent);
export default BaseNode;
