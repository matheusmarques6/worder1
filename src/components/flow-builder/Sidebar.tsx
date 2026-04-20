'use client';

import { useState, useEffect, DragEvent, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Search,
  Zap,
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
  Bell,
  GitBranch,
  UserMinus,
  Sparkles,
  X,
  MessageCircle,
  Shuffle,
  Eye,
  PlusCircle,
  FileText,
  Package,
  Truck,
  Smartphone,
  UserCog,
  List,
  Target,
  Globe,
  Bot,
  type LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFlowStore, FlowNode } from '@/stores/flowStore';

// ============================================
// TIPOS E INTERFACES
// ============================================

interface NodeItemConfig {
  type: string;
  label: string;
  description: string;
  icon: LucideIcon;
  category: 'trigger' | 'action' | 'condition' | 'control';
  color: string;
  isPremium?: boolean;
  hasAI?: boolean;
}

interface SectionConfig {
  id: string;
  label: string;
  items: NodeItemConfig[];
  defaultExpanded?: boolean;
}

// ============================================
// CONFIGURAÇÃO DA BIBLIOTECA DE NÓS
// ============================================

// Gatilho - Seleção única no topo
const TRIGGER_OPTIONS: NodeItemConfig[] = [
  // E-commerce
  { type: 'trigger_abandon', label: 'Carrinho Abandonado', description: 'Dispara quando cliente abandona carrinho', icon: ShoppingCart, category: 'trigger', color: '#10b981' },
  { type: 'trigger_checkout_abandoned', label: 'Checkout Abandonado', description: 'Checkout iniciado sem conclusão', icon: CreditCard, category: 'trigger', color: '#10b981' },
  { type: 'trigger_order', label: 'Pedido Realizado', description: 'Dispara quando um novo pedido é criado', icon: Package, category: 'trigger', color: '#10b981' },
  { type: 'trigger_order_paid', label: 'Pedido Pago', description: 'Dispara quando um pedido é pago', icon: CreditCard, category: 'trigger', color: '#10b981' },
  { type: 'trigger_fulfilled_order', label: 'Pedido Enviado', description: 'Dispara quando pedido é enviado', icon: Truck, category: 'trigger', color: '#10b981' },
  { type: 'trigger_cancelled_order', label: 'Pedido Cancelado', description: 'Dispara quando pedido é cancelado', icon: XCircle, category: 'trigger', color: '#10b981' },
  { type: 'trigger_viewed_product', label: 'Produto Visualizado', description: 'Dispara quando produto é visto', icon: Eye, category: 'trigger', color: '#10b981' },
  { type: 'trigger_added_to_cart', label: 'Produto Adicionado', description: 'Produto adicionado ao carrinho', icon: PlusCircle, category: 'trigger', color: '#10b981' },
  { type: 'trigger_back_in_stock', label: 'Produto Voltou ao Estoque', description: 'Dispara quando produto volta ao estoque', icon: ShoppingBag, category: 'trigger', color: '#10b981' },
  // Contato
  { type: 'trigger_signup', label: 'Contato Criado', description: 'Dispara quando contato é criado', icon: UserPlus, category: 'trigger', color: '#10b981' },
  { type: 'trigger_form_submitted', label: 'Formulário Enviado', description: 'Dispara quando formulário é enviado', icon: FileText, category: 'trigger', color: '#10b981' },
  { type: 'trigger_segment', label: 'Entrou no Segmento', description: 'Contato entrou em um segmento', icon: Users, category: 'trigger', color: '#10b981' },
  { type: 'trigger_tag', label: 'Tag Adicionada', description: 'Dispara quando tag é adicionada', icon: Tag, category: 'trigger', color: '#10b981' },
  { type: 'trigger_rfm_segment_change', label: 'Mudou Segmento RFM', description: 'Dispara quando contato muda de segmento RFM', icon: Users, category: 'trigger', color: '#10b981' },
  // Especiais
  { type: 'trigger_date', label: 'Data/Aniversário', description: 'Dispara em data especial', icon: Calendar, category: 'trigger', color: '#10b981' },
  { type: 'trigger_custom_event', label: 'Evento Customizado', description: 'Dispara em evento personalizado', icon: Zap, category: 'trigger', color: '#10b981' },
  { type: 'trigger_webhook', label: 'Webhook Recebido', description: 'Dispara quando webhook é recebido', icon: Webhook, category: 'trigger', color: '#10b981' },
  // CRM
  { type: 'trigger_deal_created', label: 'Deal Criado', description: 'Dispara quando deal é criado', icon: Briefcase, category: 'trigger', color: '#10b981' },
  { type: 'trigger_deal_stage', label: 'Deal Mudou Estágio', description: 'Deal muda de estágio', icon: ArrowRight, category: 'trigger', color: '#10b981' },
  { type: 'trigger_deal_won', label: 'Deal Ganho', description: 'Deal marcado como ganho', icon: Trophy, category: 'trigger', color: '#10b981' },
  { type: 'trigger_deal_lost', label: 'Deal Perdido', description: 'Deal marcado como perdido', icon: XCircle, category: 'trigger', color: '#10b981' },
  // WhatsApp
  { type: 'trigger_whatsapp', label: 'Mensagem Recebida', description: 'Mensagem WhatsApp recebida', icon: MessageSquare, category: 'trigger', color: '#10b981' },
  { type: 'trigger_whatsapp_keyword', label: 'Keyword Detectada', description: 'Dispara quando keyword é detectada na mensagem', icon: Target, category: 'trigger', color: '#10b981' },
  { type: 'trigger_whatsapp_first_message', label: 'Primeira Mensagem', description: 'Dispara na primeira mensagem de um contato novo', icon: MessageCircle, category: 'trigger', color: '#10b981' },
  { type: 'trigger_ctwa_ad', label: 'Click-to-WhatsApp Ad', description: 'Conversa originada de anúncio (72h)', icon: Globe, category: 'trigger', color: '#10b981' },
];

// Seções da biblioteca — estilo Klaviyo (Messages / Data / Logic)
const LIBRARY_SECTIONS: SectionConfig[] = [
  {
    id: 'messages',
    label: 'Mensagens',
    defaultExpanded: true,
    items: [
      { type: 'action_email', label: 'E-mail', description: 'Envia email para o contato', icon: Mail, category: 'action', color: '#3b82f6' },
      { type: 'action_sms', label: 'SMS', description: 'Envia SMS para o contato', icon: Smartphone, category: 'action', color: '#a855f7' },
      { type: 'action_whatsapp', label: 'WhatsApp', description: 'Envia mensagem ou template via WhatsApp', icon: MessageCircle, category: 'action', color: '#25D366' },
      { type: 'action_whatsapp_ai', label: 'IA Responder', description: 'Agente IA responde automaticamente', icon: Bot, category: 'action', color: '#06b6d4', hasAI: true },
      { type: 'action_whatsapp_wait_reply', label: 'Aguardar Resposta', description: 'Aguarda resposta do contato com timeout', icon: Clock, category: 'action', color: '#0ea5e9' },
      { type: 'action_whatsapp_transfer', label: 'Transferir p/ Agente', description: 'Transfere para fila ou agente humano', icon: UserPlus, category: 'action', color: '#8b5cf6' },
    ],
  },
  {
    id: 'logic',
    label: 'Lógica',
    defaultExpanded: true,
    items: [
      { type: 'control_delay', label: 'Atraso / Delay', description: 'Aguarda tempo determinado', icon: Clock, category: 'control', color: '#f59e0b' },
      { type: 'condition_field', label: 'Divisão Condicional', description: 'Divide caminho por condição', icon: GitBranch, category: 'condition', color: '#eab308' },
      { type: 'condition_whatsapp_keyword', label: 'Condição WhatsApp', description: 'Verifica keyword na resposta', icon: GitBranch, category: 'condition', color: '#f59e0b' },
      { type: 'logic_split', label: 'Teste A/B', description: 'Divide contatos aleatoriamente', icon: Shuffle, category: 'condition', color: '#6366f1' },
    ],
  },
  {
    id: 'data',
    label: 'Dados',
    defaultExpanded: false,
    items: [
      { type: 'action_update', label: 'Atualizar Contato', description: 'Atualiza dados do contato', icon: UserCog, category: 'action', color: '#0891b2' },
      { type: 'action_tag', label: 'Adicionar Tag', description: 'Adiciona tag ao contato', icon: Tag, category: 'action', color: '#0d9488' },
      { type: 'action_remove_tag', label: 'Remover Tag', description: 'Remove tag do contato', icon: UserMinus, category: 'action', color: '#64748b' },
      { type: 'action_add_to_list', label: 'Adicionar à Lista', description: 'Adiciona contato a uma lista', icon: List, category: 'action', color: '#0d9488' },
      { type: 'action_remove_from_list', label: 'Remover da Lista', description: 'Remove contato de uma lista', icon: List, category: 'action', color: '#64748b' },
      { type: 'action_shopify_coupon', label: 'Gerar Cupom', description: 'Gera cupom de desconto Shopify', icon: Tag, category: 'action', color: '#f97316' },
      { type: 'action_back_in_stock_notify', label: 'Notificar Estoque', description: 'Notifica quando produto volta ao estoque', icon: ShoppingBag, category: 'action', color: '#84cc16' },
      { type: 'action_move_deal', label: 'Mover Deal', description: 'Move deal para outro estágio', icon: ArrowRight, category: 'action', color: '#64748b' },
      { type: 'action_notify', label: 'Alerta Interno', description: 'Envia notificação para equipe', icon: Bell, category: 'action', color: '#3b82f6' },
      { type: 'action_webhook', label: 'Webhook', description: 'Faz requisição HTTP externa', icon: Webhook, category: 'action', color: '#f97316' },
    ],
  },
];

// ============================================
// SIDEBAR COMPONENT
// ============================================

interface SidebarProps {
  onTriggerSelect?: (trigger: NodeItemConfig) => void;
}

export function Sidebar({ onTriggerSelect }: SidebarProps) {
  const [selectedTrigger, setSelectedTrigger] = useState<string>('trigger_abandon');
  const [isTriggerDropdownOpen, setIsTriggerDropdownOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>(() => {
    const validIds = LIBRARY_SECTIONS.map(s => s.id);
    const defaults = LIBRARY_SECTIONS.filter(s => s.defaultExpanded).map(s => s.id);
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('fb-sidebar-sections');
        if (saved) {
          const parsed = JSON.parse(saved) as string[];
          const intersected = parsed.filter(id => validIds.includes(id));
          // If none of the saved IDs are valid (old schema), fall back to defaults
          if (intersected.length === 0 && parsed.length > 0) return defaults;
          return intersected;
        }
      } catch {}
    }
    return defaults;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const triggerAddedRef = useRef(false);

  const addNode = useFlowStore((state) => state.addNode);
  const nodes = useFlowStore((state) => state.nodes);

  // Trigger selecionado
  const currentTrigger = TRIGGER_OPTIONS.find(t => t.type === selectedTrigger) || TRIGGER_OPTIONS[0];

  // Adicionar trigger ao canvas quando a sidebar monta
  useEffect(() => {
    // Prevenir múltiplas adições
    if (triggerAddedRef.current) return;

    // Aguardar um tick para garantir que o store está pronto
    const timer = setTimeout(() => {
      const currentNodes = useFlowStore.getState().nodes;
      const existingTrigger = currentNodes.find(n => n.data.category === 'trigger');

      if (!existingTrigger) {
        triggerAddedRef.current = true;
        const trigger = TRIGGER_OPTIONS[0]; // Carrinho abandonado como padrão

        const triggerNode: FlowNode = {
          id: `trigger-${Date.now()}`,
          type: trigger.type,
          position: { x: 400, y: 200 },
          data: {
            label: trigger.label,
            description: trigger.description,
            category: 'trigger',
            nodeType: trigger.type,
            icon: trigger.icon?.displayName || 'Zap',
            config: {},
          },
        };

        useFlowStore.getState().addNode(triggerNode);
        onTriggerSelect?.(trigger);
      } else {
        // Se já existe um trigger, sincronizar o estado local
        const triggerType = existingTrigger.data.nodeType || existingTrigger.type;
        if (triggerType && TRIGGER_OPTIONS.some(t => t.type === triggerType)) {
          setSelectedTrigger(triggerType);
        }
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [onTriggerSelect]);

  // Keep sidebar trigger in sync with canvas trigger node
  useEffect(() => {
    const triggerNode = nodes.find(n => n.data?.category === 'trigger');
    if (triggerNode) {
      const triggerType = triggerNode.data?.nodeType || triggerNode.type || '';
      if (triggerType && triggerType !== selectedTrigger && TRIGGER_OPTIONS.some(t => t.type === triggerType)) {
        setSelectedTrigger(triggerType);
      }
    }
  }, [nodes, selectedTrigger]);

  // Quando trocar o trigger, atualizar no canvas
  const handleTriggerChange = (triggerType: string) => {
    setSelectedTrigger(triggerType);
    setIsTriggerDropdownOpen(false);

    const newTrigger = TRIGGER_OPTIONS.find(t => t.type === triggerType);
    if (!newTrigger) return;

    const currentNodes = useFlowStore.getState().nodes;
    const existingTrigger = currentNodes.find(n => n.data.category === 'trigger');

    if (existingTrigger) {
      // Update both node.type AND node.data for full sync
      useFlowStore.getState().setNodes(
        currentNodes.map(n =>
          n.id === existingTrigger.id
            ? {
                ...n,
                type: newTrigger.type,
                data: {
                  ...n.data,
                  label: newTrigger.label,
                  description: newTrigger.description,
                  nodeType: newTrigger.type,
                  icon: newTrigger.icon?.displayName || 'Zap',
                  config: {},
                },
              }
            : n
        )
      );
    } else {
      const triggerNode: FlowNode = {
        id: `trigger-${Date.now()}`,
        type: newTrigger.type,
        position: { x: 400, y: 200 },
        data: {
          label: newTrigger.label,
          description: newTrigger.description,
          category: 'trigger',
          nodeType: newTrigger.type,
          icon: newTrigger.icon?.displayName || 'Zap',
          config: {},
        },
      };
      addNode(triggerNode);
    }

    onTriggerSelect?.(newTrigger);
  };

  // Toggle seção (persist to localStorage)
  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id];
      try { localStorage.setItem('fb-sidebar-sections', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Filtrar por busca
  const filteredSections = searchQuery
    ? LIBRARY_SECTIONS.map(section => ({
        ...section,
        items: section.items.filter(
          item =>
            item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.description.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      })).filter(section => section.items.length > 0)
    : LIBRARY_SECTIONS;

  // Handle drag start
  const handleDragStart = (e: DragEvent, node: NodeItemConfig) => {
    const dragData = {
      nodeType: node.type,
      label: node.label,
      description: node.description,
      category: node.category,
      icon: node.icon?.displayName || 'Zap',
      color: node.color,
      defaultConfig: {},
    };
    e.dataTransfer.setData('application/reactflow', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'move';
  };

  // Handle click to add
  const handleAddNode = (nodeDef: NodeItemConfig) => {
    const newNode: FlowNode = {
      id: `node-${Date.now()}`,
      type: nodeDef.type,
      position: { x: 500 + Math.random() * 100, y: 250 + Math.random() * 100 },
      data: {
        label: nodeDef.label,
        description: nodeDef.description,
        category: nodeDef.category,
        nodeType: nodeDef.type,
        icon: nodeDef.icon?.displayName || 'Zap',
        config: {},
      },
    };
    addNode(newNode);
  };

  return (
    <div className="w-[300px] bg-white border-r border-gray-200 flex flex-col h-full shrink-0 overflow-hidden">
      {/* Header - Seletor de Gatilho */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <label className="text-[11px] font-semibold text-gray-500 tracking-wider uppercase mb-2 block">
          Gatilho
        </label>

        {/* Dropdown de Gatilho */}
        <div className="relative">
          <button
            onClick={() => setIsTriggerDropdownOpen(!isTriggerDropdownOpen)}
            className={cn(
              'w-full flex items-center justify-between px-2.5 py-2 rounded-lg',
              'bg-white ring-1 ring-inset ring-gray-200',
              'hover:ring-gray-300 transition-all duration-150',
              'text-left shadow-sm',
              isTriggerDropdownOpen && 'ring-2 ring-zinc-900/10 border-zinc-900'
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 flex items-center justify-center rounded-md bg-emerald-50 shrink-0">
                <currentTrigger.icon className="w-3.5 h-3.5 text-emerald-600" strokeWidth={2.25} />
              </div>
              <span className="text-[13px] text-gray-900 font-medium truncate">
                {currentTrigger.label}
              </span>
            </div>
            <ChevronDown
              className={cn(
                'w-4 h-4 text-gray-400 transition-transform duration-200 shrink-0 ml-2',
                isTriggerDropdownOpen && 'rotate-180'
              )}
            />
          </button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {isTriggerDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsTriggerDropdownOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    'absolute top-full left-0 right-0 mt-1 z-50',
                    'bg-white border border-gray-300 rounded-lg',
                    'shadow-xl max-h-64 overflow-y-auto'
                  )}
                >
                  {TRIGGER_OPTIONS.map((trigger) => (
                    <button
                      key={trigger.type}
                      onClick={() => handleTriggerChange(trigger.type)}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 text-left',
                        'hover:bg-gray-50 transition-colors',
                        selectedTrigger === trigger.type && 'bg-blue-50'
                      )}
                    >
                      <trigger.icon className="w-4 h-4 text-gray-500 shrink-0" />
                      <span className={cn(
                        'text-[13px] truncate',
                        selectedTrigger === trigger.type ? 'text-blue-600 font-medium' : 'text-gray-700'
                      )}>
                        {trigger.label}
                      </span>
                      {selectedTrigger === trigger.type && (
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 ml-auto" />
                      )}
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Busca */}
      <div className="px-3 py-2.5 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar blocos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              'w-full pl-9 pr-9 py-2 rounded-lg',
              'bg-gray-50 ring-1 ring-inset ring-gray-200',
              'text-[13px] text-gray-900 placeholder-gray-400',
              'focus:outline-none focus:bg-white focus:ring-2 focus:ring-zinc-900/10 focus:ring-offset-0',
              'transition-all duration-150'
            )}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded"
            >
              <X className="w-3.5 h-3.5 text-gray-500" />
            </button>
          )}
        </div>
      </div>

      {/* Título da biblioteca — estilo Klaviyo */}
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-[15px] font-semibold text-gray-900 tracking-tight">
          Ações
        </h3>
      </div>

      {/* Biblioteca de Blocos */}
      <div className="flex-1 overflow-y-auto pb-4">
        {filteredSections.map((section) => (
          <SectionComponent
            key={section.id}
            section={section}
            isExpanded={expandedSections.includes(section.id)}
            onToggle={() => toggleSection(section.id)}
            onDragStart={handleDragStart}
            onAddNode={handleAddNode}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================
// SECTION COMPONENT
// ============================================

interface SectionComponentProps {
  section: SectionConfig;
  isExpanded: boolean;
  onToggle: () => void;
  onDragStart: (e: DragEvent, node: NodeItemConfig) => void;
  onAddNode: (node: NodeItemConfig) => void;
}

function SectionComponent({ section, isExpanded, onToggle, onDragStart, onAddNode }: SectionComponentProps) {
  return (
    <div className="mb-1">
      {/* Header da Seção — font padrão do sistema */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors group"
      >
        <span className="text-[14px] font-semibold text-gray-900">
          {section.label}
        </span>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-gray-500 transition-transform duration-200',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {/* Conteúdo da Seção */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-2 py-1 space-y-0.5">
              {section.items.map((item) => (
                <NodeButton
                  key={item.type}
                  node={item}
                  onDragStart={onDragStart}
                  onClick={() => onAddNode(item)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Drag handle customizado — 6 pontinhos (2x3) como no Klaviyo
function DragHandleDots({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 10 16"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <circle cx="2" cy="3" r="1.2" />
      <circle cx="8" cy="3" r="1.2" />
      <circle cx="2" cy="8" r="1.2" />
      <circle cx="8" cy="8" r="1.2" />
      <circle cx="2" cy="13" r="1.2" />
      <circle cx="8" cy="13" r="1.2" />
    </svg>
  );
}

// ============================================
// NODE BUTTON COMPONENT
// ============================================

interface NodeButtonProps {
  node: NodeItemConfig;
  onDragStart: (e: DragEvent, node: NodeItemConfig) => void;
  onClick: () => void;
}

function NodeButton({ node, onDragStart, onClick }: NodeButtonProps) {
  const Icon = node.icon;

  return (
    <button
      draggable
      onDragStart={(e) => onDragStart(e as unknown as DragEvent, node)}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg',
        'hover:bg-gray-50 hover:shadow-sm',
        'cursor-grab active:cursor-grabbing',
        'transition-all duration-150 text-left group',
        'border border-transparent hover:border-gray-200'
      )}
    >
      <div
        className="w-9 h-9 flex items-center justify-center rounded-lg shrink-0 transition-transform group-hover:scale-105"
        style={{ backgroundColor: `${node.color}1A` }}
      >
        <Icon className="w-[18px] h-[18px]" style={{ color: node.color }} strokeWidth={2.1} />
      </div>
      <span className="text-[14px] font-medium text-gray-800 flex-1 truncate" title={node.label}>
        {node.label}
      </span>
      {node.hasAI && (
        <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0" />
      )}
      <DragHandleDots className="w-2.5 h-4 text-gray-300 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
    </button>
  );
}

export default Sidebar;
