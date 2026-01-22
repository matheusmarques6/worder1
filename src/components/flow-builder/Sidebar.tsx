'use client';

import { useState, DragEvent, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  Search,
  Zap,
  ShoppingCart,
  Users,
  MessageSquare,
  Calendar,
  Send,
  Mail,
  Phone,
  Tag,
  Briefcase,
  Bell,
  Globe,
  GitBranch,
  Target,
  Filter,
  Clock,
  Percent,
  GripVertical,
  Sparkles,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NODE_SECTIONS, getNodeColor, NodeTypeDefinition, triggerTypes, actionTypes, conditionTypes, controlTypes } from './nodes/nodeTypes';
import { useFlowStore, FlowNode } from '@/stores/flowStore';

// ============================================
// SUBCATEGORIAS ORGANIZADAS
// ============================================

interface SubCategory {
  id: string;
  label: string;
  icon: any;
  nodes: NodeTypeDefinition[];
}

interface CategoryConfig {
  id: string;
  label: string;
  icon: any;
  color: string;
  colorClass: string;
  bgClass: string;
  subcategories: SubCategory[];
}

// Organização dos gatilhos em subcategorias
const TRIGGER_SUBCATEGORIES: SubCategory[] = [
  {
    id: 'ecommerce',
    label: 'E-commerce',
    icon: ShoppingCart,
    nodes: triggerTypes.filter(t =>
      ['trigger_order', 'trigger_order_paid', 'trigger_abandon'].includes(t.type)
    ),
  },
  {
    id: 'crm',
    label: 'CRM & Contatos',
    icon: Users,
    nodes: triggerTypes.filter(t =>
      ['trigger_signup', 'trigger_tag', 'trigger_deal_created', 'trigger_deal_stage', 'trigger_deal_won', 'trigger_deal_lost', 'trigger_segment'].includes(t.type)
    ),
  },
  {
    id: 'communication',
    label: 'Comunicação',
    icon: MessageSquare,
    nodes: triggerTypes.filter(t =>
      ['trigger_whatsapp', 'trigger_webhook'].includes(t.type)
    ),
  },
  {
    id: 'time',
    label: 'Tempo & Agenda',
    icon: Calendar,
    nodes: triggerTypes.filter(t =>
      ['trigger_date'].includes(t.type)
    ),
  },
];

// Organização das ações em subcategorias
const ACTION_SUBCATEGORIES: SubCategory[] = [
  {
    id: 'messaging',
    label: 'Mensagens',
    icon: Send,
    nodes: actionTypes.filter(t =>
      ['action_whatsapp', 'action_email', 'action_sms'].includes(t.type)
    ),
  },
  {
    id: 'crm_actions',
    label: 'CRM',
    icon: Tag,
    nodes: actionTypes.filter(t =>
      ['action_tag', 'action_remove_tag', 'action_update'].includes(t.type)
    ),
  },
  {
    id: 'deals',
    label: 'Negócios',
    icon: Briefcase,
    nodes: actionTypes.filter(t =>
      ['action_create_deal', 'action_move_deal'].includes(t.type)
    ),
  },
  {
    id: 'system',
    label: 'Sistema',
    icon: Globe,
    nodes: actionTypes.filter(t =>
      ['action_notify', 'action_webhook'].includes(t.type)
    ),
  },
];

// Organização das condições em subcategorias
const CONDITION_SUBCATEGORIES: SubCategory[] = [
  {
    id: 'contact_cond',
    label: 'Contato',
    icon: Users,
    nodes: conditionTypes.filter(t =>
      ['condition_has_tag', 'condition_field'].includes(t.type)
    ),
  },
  {
    id: 'values',
    label: 'Valores',
    icon: Target,
    nodes: conditionTypes.filter(t =>
      ['condition_deal_value', 'condition_order_value'].includes(t.type)
    ),
  },
  {
    id: 'logic',
    label: 'Lógica',
    icon: GitBranch,
    nodes: conditionTypes.filter(t =>
      ['logic_split', 'logic_filter'].includes(t.type)
    ),
  },
];

// Organização dos controles
const CONTROL_SUBCATEGORIES: SubCategory[] = [
  {
    id: 'timing',
    label: 'Tempo',
    icon: Clock,
    nodes: controlTypes,
  },
];

// Configuração completa das categorias
const CATEGORIES: CategoryConfig[] = [
  {
    id: 'triggers',
    label: 'Gatilhos',
    icon: Zap,
    color: '#10b981',
    colorClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    subcategories: TRIGGER_SUBCATEGORIES,
  },
  {
    id: 'actions',
    label: 'Ações',
    icon: Send,
    color: '#3b82f6',
    colorClass: 'text-blue-400',
    bgClass: 'bg-blue-500/10',
    subcategories: ACTION_SUBCATEGORIES,
  },
  {
    id: 'conditions',
    label: 'Condições',
    icon: GitBranch,
    color: '#f59e0b',
    colorClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    subcategories: CONDITION_SUBCATEGORIES,
  },
  {
    id: 'control',
    label: 'Controle',
    icon: Clock,
    color: '#a855f7',
    colorClass: 'text-purple-400',
    bgClass: 'bg-purple-500/10',
    subcategories: CONTROL_SUBCATEGORIES,
  },
];

// ============================================
// SIDEBAR COMPONENT
// ============================================

export function Sidebar() {
  const [selectedCategory, setSelectedCategory] = useState<string>('triggers');
  const [expandedSubcategories, setExpandedSubcategories] = useState<string[]>(['ecommerce', 'messaging']);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const addNode = useFlowStore((state) => state.addNode);

  // Categoria atual selecionada
  const currentCategory = useMemo(() =>
    CATEGORIES.find(c => c.id === selectedCategory) || CATEGORIES[0],
    [selectedCategory]
  );

  // Filtrar nós por busca
  const filteredSubcategories = useMemo(() => {
    if (!searchQuery) return currentCategory.subcategories;

    return currentCategory.subcategories
      .map(sub => ({
        ...sub,
        nodes: sub.nodes.filter(
          node =>
            node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            node.description.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      }))
      .filter(sub => sub.nodes.length > 0);
  }, [currentCategory, searchQuery]);

  // Toggle subcategoria
  const toggleSubcategory = (id: string) => {
    setExpandedSubcategories(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  // Handle drag start
  const handleDragStart = (e: DragEvent, node: NodeTypeDefinition) => {
    const dragData = {
      nodeType: node.type,
      label: node.label,
      description: node.description,
      category: node.category,
      icon: node.icon?.name || 'Zap',
      color: node.color,
      defaultConfig: node.defaultConfig || {},
    };
    e.dataTransfer.setData('application/reactflow', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'move';
  };

  // Handle click to add
  const handleAddNode = (nodeDef: NodeTypeDefinition) => {
    const newNode: FlowNode = {
      id: `node-${Date.now()}`,
      type: nodeDef.type,
      position: { x: 250 + Math.random() * 100, y: 100 + Math.random() * 100 },
      data: {
        label: nodeDef.label,
        description: nodeDef.description,
        category: nodeDef.category,
        nodeType: nodeDef.type,
        config: nodeDef.defaultConfig || {},
      },
    };
    addNode(newNode);
  };

  return (
    <div className="fb-sidebar w-80 bg-[#0a0a0a] border-r border-white/10 flex flex-col h-full">
      {/* Header com Dropdown de Categoria */}
      <div className="p-4 border-b border-white/10 space-y-3">
        {/* Título */}
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-white">Construtor de Fluxo</span>
        </div>

        {/* Dropdown de Categoria Principal */}
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className={cn(
              'w-full flex items-center justify-between px-4 py-3 rounded-xl',
              'bg-[#111111] border border-white/10',
              'hover:border-white/20 transition-all duration-200',
              isDropdownOpen && 'border-white/30 ring-2 ring-white/5'
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn('p-2 rounded-lg', currentCategory.bgClass)}>
                <currentCategory.icon className={cn('w-4 h-4', currentCategory.colorClass)} />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-white">{currentCategory.label}</p>
                <p className="text-[10px] text-white/40">
                  {currentCategory.subcategories.reduce((acc, sub) => acc + sub.nodes.length, 0)} disponíveis
                </p>
              </div>
            </div>
            <ChevronDown
              className={cn(
                'w-4 h-4 text-white/40 transition-transform duration-200',
                isDropdownOpen && 'rotate-180'
              )}
            />
          </button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {isDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  'absolute top-full left-0 right-0 mt-2 z-50',
                  'bg-[#111111] border border-white/10 rounded-xl',
                  'shadow-xl shadow-black/50 overflow-hidden'
                )}
              >
                {CATEGORIES.map((category, index) => (
                  <button
                    key={category.id}
                    onClick={() => {
                      setSelectedCategory(category.id);
                      setIsDropdownOpen(false);
                      setSearchQuery('');
                      // Expandir primeira subcategoria
                      if (category.subcategories.length > 0) {
                        setExpandedSubcategories([category.subcategories[0].id]);
                      }
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3',
                      'hover:bg-white/5 transition-colors',
                      selectedCategory === category.id && 'bg-white/10',
                      index !== CATEGORIES.length - 1 && 'border-b border-white/5'
                    )}
                  >
                    <div className={cn('p-2 rounded-lg', category.bgClass)}>
                      <category.icon className={cn('w-4 h-4', category.colorClass)} />
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-sm font-medium text-white">{category.label}</p>
                      <p className="text-[10px] text-white/40">
                        {category.subcategories.reduce((acc, sub) => acc + sub.nodes.length, 0)} opções
                      </p>
                    </div>
                    {selectedCategory === category.id && (
                      <div className={cn('w-2 h-2 rounded-full', category.bgClass.replace('/10', ''))} />
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Barra de Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            placeholder={`Buscar em ${currentCategory.label.toLowerCase()}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              'w-full pl-10 pr-10 py-2.5 rounded-xl',
              'bg-[#111111] border border-white/10',
              'text-sm text-white placeholder-white/30',
              'focus:outline-none focus:border-white/20 focus:ring-2 focus:ring-white/5',
              'transition-all duration-200'
            )}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded"
            >
              <X className="w-3 h-3 text-white/40" />
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo das Subcategorias */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredSubcategories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="w-8 h-8 text-white/20 mb-3" />
            <p className="text-sm text-white/40">Nenhum resultado para</p>
            <p className="text-sm text-white/60 font-medium">"{searchQuery}"</p>
          </div>
        ) : (
          filteredSubcategories.map((subcategory) => (
            <SubcategorySection
              key={subcategory.id}
              subcategory={subcategory}
              isExpanded={expandedSubcategories.includes(subcategory.id)}
              onToggle={() => toggleSubcategory(subcategory.id)}
              onDragStart={handleDragStart}
              onAddNode={handleAddNode}
              categoryColor={currentCategory.colorClass}
              categoryBg={currentCategory.bgClass}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/10 bg-[#0a0a0a]">
        <div className="flex items-center gap-2 text-[11px] text-white/30">
          <GripVertical className="w-3 h-3" />
          <span>Arraste ou clique para adicionar ao fluxo</span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SUBCATEGORY SECTION COMPONENT
// ============================================

interface SubcategorySectionProps {
  subcategory: SubCategory;
  isExpanded: boolean;
  onToggle: () => void;
  onDragStart: (e: DragEvent, node: NodeTypeDefinition) => void;
  onAddNode: (node: NodeTypeDefinition) => void;
  categoryColor: string;
  categoryBg: string;
}

function SubcategorySection({
  subcategory,
  isExpanded,
  onToggle,
  onDragStart,
  onAddNode,
  categoryColor,
  categoryBg,
}: SubcategorySectionProps) {
  const Icon = subcategory.icon;

  return (
    <div className="rounded-xl overflow-hidden bg-[#111111] border border-white/5">
      {/* Header da Subcategoria */}
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2.5',
          'hover:bg-white/5 transition-all duration-150'
        )}
      >
        <div className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 text-white/50" />
          <span className="text-sm font-medium text-white/80">{subcategory.label}</span>
          <span className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded-md">
            {subcategory.nodes.length}
          </span>
        </div>
        <ChevronRight
          className={cn(
            'w-4 h-4 text-white/30 transition-transform duration-200',
            isExpanded && 'rotate-90'
          )}
        />
      </button>

      {/* Conteúdo */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-2 space-y-1.5">
              {subcategory.nodes.map((node) => (
                <NodeItem
                  key={node.type}
                  node={node}
                  onDragStart={onDragStart}
                  onClick={() => onAddNode(node)}
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
// NODE ITEM COMPONENT
// ============================================

interface NodeItemProps {
  node: NodeTypeDefinition;
  onDragStart: (e: DragEvent, node: NodeTypeDefinition) => void;
  onClick: () => void;
}

function NodeItem({ node, onDragStart, onClick }: NodeItemProps) {
  const colors = getNodeColor(node.color);
  const Icon = node.icon;
  const isTrigger = node.category === 'trigger';

  return (
    <motion.button
      draggable
      onDragStart={(e) => onDragStart(e as unknown as DragEvent, node)}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 p-2.5 rounded-lg',
        'bg-[#0a0a0a] border border-white/5',
        'cursor-grab active:cursor-grabbing',
        'hover:border-white/15 hover:bg-[#0f0f0f]',
        'transition-all duration-150 group text-left',
        'relative overflow-hidden'
      )}
      whileHover={{ scale: 1.01, x: 2 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Barra indicadora de trigger */}
      {isTrigger && (
        <div className={cn('absolute left-0 top-0 bottom-0 w-1 rounded-l', colors.solid)} />
      )}

      {/* Ícone */}
      <div className={cn(
        'p-2 rounded-lg shrink-0 transition-all duration-200',
        colors.bg,
        'group-hover:scale-110'
      )}>
        <Icon className={cn('w-4 h-4', colors.text)} />
      </div>

      {/* Texto */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/80 group-hover:text-white transition-colors truncate font-medium">
          {node.label}
        </p>
        <p className="text-[10px] text-white/30 truncate leading-tight mt-0.5">
          {node.description}
        </p>
      </div>

      {/* Indicador de arrastar */}
      <GripVertical className="w-3 h-3 text-white/10 group-hover:text-white/30 transition-colors shrink-0" />
    </motion.button>
  );
}

export default Sidebar;
