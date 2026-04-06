'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  ShoppingCart, CreditCard, ShoppingBag, UserPlus, Tag, Briefcase,
  ArrowRight, Trophy, XCircle, Calendar, Users, Webhook, MessageSquare,
  Clock, Mail, Phone, Bell, Edit, GitBranch, Zap, Send, UserMinus,
  Eye, PlusCircle, Package, Truck, Smartphone, UserCog, List,
  Shuffle, MessageCircle, FileText, MoreVertical,
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
  Mail, Phone, Bell, Edit, Send, UserMinus, GitBranch, Clock, Zap,
  Eye, PlusCircle, Package, Truck, Smartphone, UserCog, List,
  Shuffle, MessageCircle, FileText,
};

// ============================================
// CATEGORY CONFIG (Klaviyo-inspired)
// ============================================

const categoryConfig: Record<string, { label: string; iconColor: string; iconBg: string; dotColor: string }> = {
  trigger: { label: 'DISPARADOR', iconColor: 'text-emerald-600', iconBg: 'bg-emerald-50', dotColor: 'bg-emerald-500' },
  action:  { label: 'ACAO',       iconColor: 'text-blue-600',    iconBg: 'bg-blue-50',    dotColor: 'bg-blue-500' },
  condition:{ label: 'CONDICAO',  iconColor: 'text-amber-600',   iconBg: 'bg-amber-50',   dotColor: 'bg-amber-500' },
  control: { label: 'CONTROLE',   iconColor: 'text-violet-600',  iconBg: 'bg-violet-50',  dotColor: 'bg-violet-500' },
  transform:{ label: 'DADOS',     iconColor: 'text-slate-600',   iconBg: 'bg-slate-50',   dotColor: 'bg-slate-500' },
};

// Specific labels for node types
const nodeTypeLabels: Record<string, string> = {
  action_email: 'EMAIL',
  action_whatsapp: 'WHATSAPP',
  action_sms: 'SMS',
  action_webhook: 'WEBHOOK',
  action_notify: 'NOTIFICACAO',
  control_delay: 'DELAY',
  condition_field: 'CONDICAO',
  logic_split: 'TESTE A/B',
  action_tag: 'TAG',
  action_remove_tag: 'TAG',
  action_update: 'CONTATO',
  action_add_to_list: 'LISTA',
  action_remove_from_list: 'LISTA',
  action_move_deal: 'DEAL',
};

// ============================================
// HELPER: Get summary text for node
// ============================================

function getNodeSummary(nodeType: string, config: Record<string, any>): string | null {
  switch (nodeType) {
    case 'action_email':
      return config?.subject || null;
    case 'action_whatsapp':
      return config?.message ? (config.message.length > 60 ? config.message.slice(0, 60) + '...' : config.message) : null;
    case 'action_sms':
      return config?.message ? (config.message.length > 60 ? config.message.slice(0, 60) + '...' : config.message) : null;
    case 'control_delay':
    case 'control_delay_until': {
      const val = config?.value || config?.time || 1;
      const unit = config?.unit || 'hours';
      const labels: Record<string, string> = { minutes: 'min', hours: 'hora(s)', days: 'dia(s)', weeks: 'semana(s)' };
      return `Aguardar ${val} ${labels[unit] || unit}`;
    }
    case 'condition_field': {
      const field = config?.field || '';
      const op = config?.operator || '';
      const val = config?.value || '';
      if (!field) return null;
      return `${field} ${op} ${val}`.trim();
    }
    case 'logic_split': {
      const pct = config?.percentageA || config?.percentA || 50;
      return `A: ${pct}% / B: ${100 - pct}%`;
    }
    case 'action_tag':
    case 'action_remove_tag':
      return config?.tagName || null;
    default:
      return null;
  }
}

// ============================================
// BASE NODE COMPONENT (Klaviyo/Omnisend style)
// ============================================

// Fallback icon by nodeType when icon field is missing
const nodeTypeIconFallback: Record<string, LucideIcon> = {
  trigger_abandon: ShoppingCart, trigger_checkout_abandoned: CreditCard,
  trigger_order: Package, trigger_order_paid: CreditCard,
  trigger_fulfilled_order: Truck, trigger_cancelled_order: XCircle,
  trigger_viewed_product: Eye, trigger_added_to_cart: PlusCircle,
  trigger_signup: UserPlus, trigger_form_submitted: FileText,
  trigger_segment: Users, trigger_tag: Tag, trigger_date: Calendar,
  trigger_custom_event: Zap, trigger_webhook: Webhook,
  trigger_deal_created: Briefcase, trigger_deal_stage: ArrowRight,
  trigger_deal_won: Trophy, trigger_deal_lost: XCircle,
  trigger_whatsapp: MessageSquare,
  action_email: Mail, action_whatsapp: MessageCircle, action_sms: Smartphone,
  action_webhook: Send, action_notify: Bell,
  action_tag: Tag, action_remove_tag: UserMinus, action_update: UserCog,
  action_add_to_list: List, action_remove_from_list: List,
  action_move_deal: ArrowRight,
  control_delay: Clock, condition_field: GitBranch, logic_split: Shuffle,
};

function BaseNodeComponent({ id, data, selected }: BaseNodeProps) {
  const { category, label, icon, disabled, nodeType, config: nodeConfig, status } = data;
  const cat = categoryConfig[category] || categoryConfig.action;
  const IconComponent = icon ? (iconMap[icon] || nodeTypeIconFallback[nodeType] || Zap) : (nodeTypeIconFallback[nodeType] || Zap);
  const selectNode = useFlowStore((s) => s.selectNode);
  const showAnalytics = useFlowStore((s) => s.showAnalytics);
  const analyticsData = useFlowStore((s) => s.analyticsData);

  const nodeMetrics = showAnalytics ? analyticsData[id] : null;
  const summary = getNodeSummary(nodeType, nodeConfig || {});
  const typeLabel = nodeTypeLabels[nodeType] || cat.label;

  return (
    <div
      className={cn(
        'relative group',
        disabled && 'opacity-50',
      )}
      onClick={() => selectNode(id)}
    >
      {/* Target handle */}
      {category !== 'trigger' && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-2.5 !h-2.5 !border-2 !border-gray-300 !bg-white !-top-[5px] hover:!border-blue-400 !transition-colors"
        />
      )}

      {/* Card */}
      <div
        className={cn(
          'w-[260px] bg-white rounded-lg border overflow-hidden',
          'transition-all duration-150',
          selected
            ? 'border-blue-400 shadow-[0_0_0_2px_rgba(59,130,246,0.15)]'
            : 'border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300',
        )}
      >
        {/* Main content - Klaviyo style: icon + title + description */}
        <div className="px-3 py-3 flex items-start gap-2.5">
          <div className={cn('p-2 rounded-lg shrink-0', cat.iconBg)}>
            <IconComponent className={cn('w-4.5 h-4.5', cat.iconColor)} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-[13px] font-semibold text-gray-900 leading-tight">
              {label}
            </p>
            {summary && (
              <p className="text-[11px] text-gray-500 mt-1 leading-snug line-clamp-2">
                {summary}
              </p>
            )}
            {!summary && data.description && (
              <p className="text-[11px] text-gray-400 mt-0.5 leading-snug line-clamp-1">
                {data.description}
              </p>
            )}
          </div>
          <button className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-100 transition-opacity shrink-0 mt-0.5">
            <MoreVertical className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>

        {/* Metrics row (Omnisend style) */}
        {nodeMetrics && (category === 'action') && (
          <div className="px-3.5 pb-2.5 pt-1 border-t border-gray-100">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-[9px] text-gray-400 uppercase tracking-wider">Abertura</p>
                <p className="text-xs font-semibold text-gray-900">
                  {nodeMetrics.sent > 0 ? `${Math.round(nodeMetrics.opened / nodeMetrics.sent * 100)}%` : '0%'}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-gray-400 uppercase tracking-wider">Cliques</p>
                <p className="text-xs font-semibold text-gray-900">
                  {nodeMetrics.sent > 0 ? `${Math.round(nodeMetrics.clicked / nodeMetrics.sent * 100)}%` : '0%'}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-gray-400 uppercase tracking-wider">Receita</p>
                <p className="text-xs font-semibold text-emerald-600">
                  {nodeMetrics.revenue > 0 ? `R$ ${(nodeMetrics.revenue / 1000).toFixed(1)}k` : 'R$ 0'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Condition paths labels */}
        {category === 'condition' && (
          <div className="flex border-t border-gray-100">
            <div className="flex-1 py-1.5 text-center border-r border-gray-100">
              <span className="text-[10px] font-medium text-green-600">Sim</span>
            </div>
            <div className="flex-1 py-1.5 text-center">
              <span className="text-[10px] font-medium text-red-500">Nao</span>
            </div>
          </div>
        )}
      </div>

      {/* Source handle(s) */}
      {category === 'condition' ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className="!w-2.5 !h-2.5 !border-2 !border-green-400 !bg-white !-bottom-[5px] !left-[30%] hover:!border-green-600 !transition-colors"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="!w-2.5 !h-2.5 !border-2 !border-red-400 !bg-white !-bottom-[5px] !left-[70%] hover:!border-red-600 !transition-colors"
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-2.5 !h-2.5 !border-2 !border-gray-300 !bg-white !-bottom-[5px] hover:!border-blue-400 !transition-colors"
        />
      )}
    </div>
  );
}

export const BaseNode = memo(BaseNodeComponent);
export default BaseNode;
