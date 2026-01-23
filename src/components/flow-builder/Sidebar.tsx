'use client';

import { useState, useEffect, DragEvent } from 'react';
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
  Phone,
  Bell,
  Edit,
  GitBranch,
  Percent,
  Filter,
  Send,
  UserMinus,
  Target,
  Globe,
  GripVertical,
  Sparkles,
  X,
  Bot,
  MessageCircle,
  Shuffle,
  Code,
  Timer,
  CalendarClock,
  CalendarDays,
  LogOut,
  Settings,
  type LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFlowStore, FlowNode } from '@/stores/flowStore';
import { CredentialSelector } from './panels/CredentialSelector';

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
  { type: 'trigger_abandon', label: 'Carrinho abandonado criado', description: 'Dispara quando cliente abandona carrinho', icon: ShoppingBag, category: 'trigger', color: '#10b981' },
  { type: 'trigger_order', label: 'Pedido criado', description: 'Dispara quando um novo pedido é criado', icon: ShoppingCart, category: 'trigger', color: '#10b981' },
  { type: 'trigger_order_paid', label: 'Pedido pago', description: 'Dispara quando um pedido é pago', icon: CreditCard, category: 'trigger', color: '#10b981' },
  { type: 'trigger_signup', label: 'Novo cadastro', description: 'Dispara quando um novo contato é criado', icon: UserPlus, category: 'trigger', color: '#10b981' },
  { type: 'trigger_tag', label: 'Tag adicionada', description: 'Dispara quando uma tag é adicionada', icon: Tag, category: 'trigger', color: '#10b981' },
  { type: 'trigger_deal_created', label: 'Deal criado', description: 'Dispara quando um novo deal é criado', icon: Briefcase, category: 'trigger', color: '#10b981' },
  { type: 'trigger_deal_stage', label: 'Deal mudou estágio', description: 'Dispara quando deal muda de estágio', icon: ArrowRight, category: 'trigger', color: '#10b981' },
  { type: 'trigger_deal_won', label: 'Deal ganho', description: 'Dispara quando deal é marcado como ganho', icon: Trophy, category: 'trigger', color: '#10b981' },
  { type: 'trigger_deal_lost', label: 'Deal perdido', description: 'Dispara quando deal é marcado como perdido', icon: XCircle, category: 'trigger', color: '#10b981' },
  { type: 'trigger_whatsapp', label: 'Mensagem recebida', description: 'Dispara quando uma mensagem é recebida', icon: MessageSquare, category: 'trigger', color: '#10b981' },
  { type: 'trigger_webhook', label: 'Webhook', description: 'Dispara quando um webhook é recebido', icon: Webhook, category: 'trigger', color: '#10b981' },
  { type: 'trigger_date', label: 'Data especial', description: 'Dispara em data especial do contato', icon: Calendar, category: 'trigger', color: '#10b981' },
  { type: 'trigger_segment', label: 'Entrou no segmento', description: 'Dispara quando contato entra em um segmento', icon: Users, category: 'trigger', color: '#10b981' },
];

// Seções da biblioteca
const LIBRARY_SECTIONS: SectionConfig[] = [
  {
    id: 'acoes',
    label: 'Ação',
    defaultExpanded: true,
    items: [
      { type: 'action_whatsapp', label: 'Enviar WhatsApp', description: 'Envia mensagem via WhatsApp', icon: MessageCircle, category: 'action', color: '#25D366' },
      { type: 'action_email', label: 'Enviar E-mail', description: 'Envia email para o contato', icon: Mail, category: 'action', color: '#3b82f6' },
      { type: 'action_sms', label: 'Enviar SMS', description: 'Envia SMS para o contato', icon: Phone, category: 'action', color: '#8b5cf6' },
      { type: 'action_webhook', label: 'Enviar Webhook', description: 'Faz requisição HTTP externa', icon: Webhook, category: 'action', color: '#f59e0b', isPremium: true },
    ],
  },
  {
    id: 'logico',
    label: 'Lógico',
    defaultExpanded: true,
    items: [
      { type: 'condition_field', label: 'Condição', description: 'Verifica condição e divide caminho', icon: GitBranch, category: 'condition', color: '#f59e0b' },
      { type: 'logic_filter', label: 'Condição múltipla', description: 'Múltiplas condições combinadas', icon: Filter, category: 'condition', color: '#f59e0b' },
      { type: 'logic_split', label: 'Randomizador', description: 'Divide contatos aleatoriamente (A/B)', icon: Shuffle, category: 'condition', color: '#f59e0b' },
      { type: 'action_javascript', label: 'Executar JavaScript', description: 'Executa código personalizado', icon: Code, category: 'action', color: '#f59e0b', isPremium: true },
      { type: 'action_chatgpt', label: 'ChatGPT', description: 'Processa com inteligência artificial', icon: Bot, category: 'action', color: '#10b981', isPremium: true, hasAI: true },
    ],
  },
  {
    id: 'tempo',
    label: 'Tempo',
    defaultExpanded: false,
    items: [
      { type: 'control_delay', label: 'Aguardar', description: 'Aguarda tempo determinado', icon: Timer, category: 'control', color: '#a855f7' },
      { type: 'control_delay_condition', label: 'Aguardar condição', description: 'Aguarda até condição ser verdadeira', icon: Clock, category: 'control', color: '#a855f7' },
      { type: 'control_delay_date', label: 'Aguardar data e hora', description: 'Aguarda até data/hora específica', icon: CalendarClock, category: 'control', color: '#a855f7' },
      { type: 'control_delay_weekday', label: 'Aguardar dia da semana', description: 'Aguarda até dia específico da semana', icon: CalendarDays, category: 'control', color: '#a855f7' },
    ],
  },
  {
    id: 'crm',
    label: 'CRM',
    defaultExpanded: false,
    items: [
      { type: 'action_tag', label: 'Adicionar Tag', description: 'Adiciona tag ao contato', icon: Tag, category: 'action', color: '#3b82f6' },
      { type: 'action_remove_tag', label: 'Remover Tag', description: 'Remove tag do contato', icon: UserMinus, category: 'action', color: '#3b82f6' },
      { type: 'action_update', label: 'Atualizar Contato', description: 'Atualiza dados do contato', icon: Edit, category: 'action', color: '#3b82f6' },
      { type: 'action_create_deal', label: 'Criar Deal', description: 'Cria um novo deal no CRM', icon: Briefcase, category: 'action', color: '#3b82f6' },
      { type: 'action_move_deal', label: 'Mover Deal', description: 'Move deal para outro estágio', icon: ArrowRight, category: 'action', color: '#3b82f6' },
    ],
  },
  {
    id: 'finalizar',
    label: 'Finalizar',
    defaultExpanded: false,
    items: [
      { type: 'control_exit', label: 'Sair do Fluxo', description: 'Encerra a automação para o contato', icon: LogOut, category: 'control', color: '#ef4444' },
      { type: 'action_notify', label: 'Notificar Equipe', description: 'Envia notificação para equipe', icon: Bell, category: 'action', color: '#3b82f6' },
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
  const [expandedSections, setExpandedSections] = useState<string[]>(
    LIBRARY_SECTIONS.filter(s => s.defaultExpanded).map(s => s.id)
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const addNode = useFlowStore((state) => state.addNode);
  const nodes = useFlowStore((state) => state.nodes);
  const automationConfig = useFlowStore((state) => state.automationConfig);
  const setAutomationConfig = useFlowStore((state) => state.setAutomationConfig);

  // Trigger selecionado
  const currentTrigger = TRIGGER_OPTIONS.find(t => t.type === selectedTrigger) || TRIGGER_OPTIONS[0];

  // Adicionar trigger ao canvas quando selecionado
  useEffect(() => {
    // Verificar se já existe um trigger no canvas
    const existingTrigger = nodes.find(n => n.data.category === 'trigger');

    if (!existingTrigger && currentTrigger) {
      // Adicionar o trigger automaticamente
      const triggerNode: FlowNode = {
        id: `trigger-${Date.now()}`,
        type: currentTrigger.type,
        position: { x: 100, y: 150 },
        data: {
          label: currentTrigger.label,
          description: currentTrigger.description,
          category: 'trigger',
          nodeType: currentTrigger.type,
          config: {},
        },
      };
      addNode(triggerNode);
      onTriggerSelect?.(currentTrigger);
    }
  }, []);

  // Quando trocar o trigger, atualizar no canvas
  const handleTriggerChange = (triggerType: string) => {
    setSelectedTrigger(triggerType);
    setIsTriggerDropdownOpen(false);

    const newTrigger = TRIGGER_OPTIONS.find(t => t.type === triggerType);
    if (!newTrigger) return;

    // Remover trigger existente e adicionar novo
    const existingTrigger = nodes.find(n => n.data.category === 'trigger');

    if (existingTrigger) {
      // Atualizar o trigger existente
      useFlowStore.getState().updateNode(existingTrigger.id, {
        label: newTrigger.label,
        description: newTrigger.description,
        nodeType: newTrigger.type,
        config: {},
      });
    } else {
      // Criar novo trigger
      const triggerNode: FlowNode = {
        id: `trigger-${Date.now()}`,
        type: newTrigger.type,
        position: { x: 100, y: 150 },
        data: {
          label: newTrigger.label,
          description: newTrigger.description,
          category: 'trigger',
          nodeType: newTrigger.type,
          config: {},
        },
      };
      addNode(triggerNode);
    }

    onTriggerSelect?.(newTrigger);
  };

  // Toggle seção
  const toggleSection = (id: string) => {
    setExpandedSections(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
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
      icon: node.icon?.name || 'Zap',
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
      position: { x: 300 + Math.random() * 100, y: 200 + Math.random() * 100 },
      data: {
        label: nodeDef.label,
        description: nodeDef.description,
        category: nodeDef.category,
        nodeType: nodeDef.type,
        config: {},
      },
    };
    addNode(newNode);
  };

  return (
    <div className="fb-sidebar w-72 bg-[#0f0f0f] border-r border-white/10 flex flex-col h-full">
      {/* Header - Seletor de Gatilho */}
      <div className="p-3 border-b border-white/10">
        <label className="text-[10px] font-medium text-white/40 uppercase tracking-wider mb-2 block">
          Gatilho
        </label>

        {/* Dropdown de Gatilho */}
        <div className="relative">
          <button
            onClick={() => setIsTriggerDropdownOpen(!isTriggerDropdownOpen)}
            className={cn(
              'w-full flex items-center justify-between px-3 py-2 rounded-lg',
              'bg-[#1a1a1a] border border-white/10',
              'hover:border-white/20 transition-all duration-200',
              'text-left',
              isTriggerDropdownOpen && 'border-emerald-500/50 ring-1 ring-emerald-500/20'
            )}
          >
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-emerald-500/20">
                <currentTrigger.icon className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <span className="text-xs text-white/80 font-medium truncate">
                {currentTrigger.label}
              </span>
            </div>
            <ChevronDown
              className={cn(
                'w-3.5 h-3.5 text-white/40 transition-transform duration-200 shrink-0 ml-2',
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
                    'bg-[#1a1a1a] border border-white/10 rounded-lg',
                    'shadow-xl shadow-black/50 max-h-56 overflow-y-auto'
                  )}
                >
                  {TRIGGER_OPTIONS.map((trigger) => (
                    <button
                      key={trigger.type}
                      onClick={() => handleTriggerChange(trigger.type)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-left',
                        'hover:bg-white/5 transition-colors',
                        selectedTrigger === trigger.type && 'bg-emerald-500/10'
                      )}
                    >
                      <trigger.icon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className={cn(
                        'text-xs truncate',
                        selectedTrigger === trigger.type ? 'text-emerald-400 font-medium' : 'text-white/70'
                      )}>
                        {trigger.label}
                      </span>
                      {selectedTrigger === trigger.type && (
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 ml-auto" />
                      )}
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Opções condicionais do gatilho */}
        {selectedTrigger === 'trigger_abandon' && (
          <div className="mt-2 space-y-1.5">
            <ToggleOption label="Remover se houver carrinho novo" />
            <ToggleOption label="Remover se houver pedido novo" />
            <ToggleOption label="Remover se houver pedido pago" />
          </div>
        )}
      </div>

      {/* Configurações Globais da Automação */}
      <div className="border-b border-white/10">
        <button
          onClick={() => setShowConfig(!showConfig)}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2',
            'hover:bg-white/5 transition-colors'
          )}
        >
          <div className="flex items-center gap-2">
            <Settings className="w-3.5 h-3.5 text-white/40" />
            <span className="text-[10px] font-medium text-white/50 uppercase tracking-wider">
              Configurações da Automação
            </span>
          </div>
          <ChevronDown
            className={cn(
              'w-3.5 h-3.5 text-white/30 transition-transform duration-200',
              showConfig && 'rotate-180'
            )}
          />
        </button>

        <AnimatePresence>
          {showConfig && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 space-y-3">
                {/* WhatsApp Padrão */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-white/50 flex items-center gap-1">
                    <MessageCircle className="w-3 h-3 text-green-400" />
                    WhatsApp Padrão
                  </label>
                  <CredentialSelector
                    connectionType="whatsapp"
                    value={automationConfig?.whatsappCredentialId}
                    onChange={(id) => setAutomationConfig({ whatsappCredentialId: id })}
                    label=""
                    placeholder="Selecione..."
                  />
                </div>

                {/* Email Padrão */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-white/50 flex items-center gap-1">
                    <Mail className="w-3 h-3 text-blue-400" />
                    Email Padrão
                  </label>
                  <CredentialSelector
                    connectionType="email"
                    value={automationConfig?.emailCredentialId}
                    onChange={(id) => setAutomationConfig({ emailCredentialId: id })}
                    label=""
                    placeholder="Selecione..."
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Busca */}
      <div className="px-3 py-2 border-b border-white/10">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            type="text"
            placeholder="Buscar blocos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              'w-full pl-8 pr-8 py-1.5 rounded-md',
              'bg-[#1a1a1a] border border-white/10',
              'text-xs text-white placeholder-white/30',
              'focus:outline-none focus:border-white/20',
              'transition-all duration-200'
            )}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-white/10 rounded"
            >
              <X className="w-3 h-3 text-white/40" />
            </button>
          )}
        </div>
      </div>

      {/* Biblioteca de Blocos */}
      <div className="flex-1 overflow-y-auto">
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
// TOGGLE OPTION COMPONENT
// ============================================

function ToggleOption({ label }: { label: string }) {
  const [enabled, setEnabled] = useState(false);

  return (
    <button
      onClick={() => setEnabled(!enabled)}
      className="w-full flex items-center gap-2 text-left py-0.5"
    >
      <div className={cn(
        'w-7 h-4 rounded-full transition-colors relative shrink-0',
        enabled ? 'bg-emerald-500' : 'bg-white/10'
      )}>
        <div className={cn(
          'absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform',
          enabled ? 'translate-x-3.5' : 'translate-x-0.5'
        )} />
      </div>
      <span className="text-[10px] text-white/50 flex-1 leading-tight">{label}</span>
      <HelpCircle className="w-3 h-3 text-white/20 shrink-0" />
    </button>
  );
}

// Ícone de ajuda simples
function HelpCircle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <path d="M12 17h.01"/>
    </svg>
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
    <div className="border-b border-white/5">
      {/* Header da Seção */}
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2',
          'hover:bg-white/5 transition-colors'
        )}
      >
        <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">
          {section.label}
        </span>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-white/30 transition-transform duration-200',
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
            <div className="px-3 pb-2 grid grid-cols-2 gap-1.5">
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
    <motion.button
      draggable
      onDragStart={(e) => onDragStart(e as unknown as DragEvent, node)}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 p-2 rounded-md',
        'bg-[#1a1a1a] border border-white/5',
        'hover:border-white/15 hover:bg-[#222]',
        'cursor-grab active:cursor-grabbing',
        'transition-all duration-150 text-left relative',
        'group'
      )}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Ícone */}
      <div
        className="p-1 rounded shrink-0"
        style={{ backgroundColor: `${node.color}20` }}
      >
        <Icon
          className="w-3 h-3"
          style={{ color: node.color }}
        />
      </div>

      {/* Label */}
      <span className="text-[10px] text-white/60 font-medium leading-tight line-clamp-2 group-hover:text-white/80">
        {node.label}
      </span>

      {/* Badge Premium */}
      {node.isPremium && (
        <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-amber-400 rounded-full flex items-center justify-center">
          <Sparkles className="w-2 h-2 text-white" />
        </div>
      )}

      {/* Badge IA */}
      {node.hasAI && !node.isPremium && (
        <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full flex items-center justify-center">
          <span className="text-[6px] text-white font-bold">IA</span>
        </div>
      )}
    </motion.button>
  );
}

export default Sidebar;
