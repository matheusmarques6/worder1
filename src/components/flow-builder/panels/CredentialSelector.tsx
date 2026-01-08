'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDown, 
  Plus, 
  Check, 
  AlertCircle, 
  Loader2,
  Search,
  ExternalLink,
  Settings,
  X,
  MessageCircle,
  Mail,
  ShoppingCart,
  ShoppingBag,
  Globe,
  Key,
  BarChart,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// TYPES
// ============================================

interface Connection {
  id: string;
  type: string;
  typeName: string;
  name: string;
  identifier?: string;
  icon: string;
  color: string;
  isActive: boolean;
  createdAt: string;
}

interface CredentialSelectorProps {
  /** Tipo de conexão: whatsapp, email, shopify, http, etc */
  connectionType: string;
  /** ID da conexão selecionada */
  value?: string;
  /** Callback quando conexão é selecionada */
  onChange: (connectionId: string | undefined) => void;
  /** Label do campo */
  label?: string;
  /** Campo obrigatório */
  required?: boolean;
  /** Placeholder */
  placeholder?: string;
}

// Mapeamento de ícones
const ICON_MAP: Record<string, React.ComponentType<{ className?: string; color?: string }>> = {
  MessageCircle,
  Mail,
  ShoppingCart,
  ShoppingBag,
  Globe,
  Key,
  BarChart,
};

// ============================================
// CREDENTIAL SELECTOR COMPONENT
// ============================================

export function CredentialSelector({
  connectionType,
  value,
  onChange,
  label = 'Credencial para conectar',
  required = false,
  placeholder = 'Selecione uma credencial...',
}: CredentialSelectorProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Conexão selecionada
  const selectedConnection = connections.find(c => c.id === value);

  // Filtrar conexões pela busca
  const filteredConnections = connections.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.typeName.toLowerCase().includes(search.toLowerCase()) ||
    (c.identifier && c.identifier.toLowerCase().includes(search.toLowerCase()))
  );

  // ============================================
  // LOAD CONNECTIONS
  // ============================================

  useEffect(() => {
    loadConnections();
  }, [connectionType]);

  const loadConnections = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (connectionType) params.set('type', connectionType);

      const res = await fetch(`/api/automations/connections?${params}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      setConnections(data.connections || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // CLICK OUTSIDE
  // ============================================

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ============================================
  // RENDER ICON
  // ============================================

  const renderIcon = (iconName: string, color: string, size = 'w-5 h-5') => {
    const IconComponent = ICON_MAP[iconName] || Globe;
    return (
      <div 
        className="flex items-center justify-center rounded-md p-1.5"
        style={{ backgroundColor: `${color}20` }}
      >
        <IconComponent className={`${size}`} color={color} />
      </div>
    );
  };

  // ============================================
  // RENDER
  // ============================================

  if (isLoading) {
    return (
      <div className="space-y-2">
        <label className="block text-xs text-white/60">{label}</label>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[#1a1a1a] border border-white/10">
          <Loader2 className="w-4 h-4 text-white/40 animate-spin" />
          <span className="text-sm text-white/40">Carregando conexões...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 relative" ref={dropdownRef}>
      {/* Label */}
      <label className="block text-xs text-white/60">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>

      {/* Selector Button */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg',
            'bg-[#1a1a1a] border text-left',
            'hover:bg-[#222] transition-colors',
            isOpen ? 'border-blue-500/50' : 'border-white/10',
            error && 'border-red-500/50'
          )}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {selectedConnection ? (
              <>
                {renderIcon(selectedConnection.icon, selectedConnection.color)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{selectedConnection.name}</p>
                  <p className="text-[10px] text-white/40 truncate">{selectedConnection.typeName}</p>
                </div>
                {!selectedConnection.isActive && (
                  <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                )}
              </>
            ) : (
              <span className="text-sm text-white/40">{placeholder}</span>
            )}
          </div>
          <ChevronDown className={cn(
            'w-4 h-4 text-white/40 transition-transform flex-shrink-0',
            isOpen && 'rotate-180'
          )} />
        </button>

        {/* Edit button */}
        {selectedConnection && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              window.open('/settings/integrations', '_blank');
            }}
            className="absolute right-10 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10 transition-colors"
          >
            <Settings className="w-3.5 h-3.5 text-white/40 hover:text-white" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={cn(
              'absolute z-50 left-0 right-0 mt-1 rounded-lg',
              'bg-[#1a1a1a] border border-white/10',
              'shadow-xl shadow-black/50',
              'overflow-hidden'
            )}
            style={{ maxHeight: '300px' }}
          >
            {/* Search */}
            <div className="p-2 border-b border-white/10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  autoFocus
                  className={cn(
                    'w-full pl-9 pr-3 py-2 rounded-md',
                    'bg-[#0a0a0a] border border-white/10',
                    'text-sm text-white placeholder-white/30',
                    'focus:outline-none focus:border-blue-500/50'
                  )}
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10"
                  >
                    <X className="w-3 h-3 text-white/40" />
                  </button>
                )}
              </div>
            </div>

            {/* Connection List */}
            <div className="overflow-y-auto" style={{ maxHeight: '200px' }}>
              {filteredConnections.length === 0 ? (
                <div className="p-4 text-center text-sm text-white/40">
                  {search ? 'Nenhuma conexão encontrada' : 'Nenhuma conexão configurada'}
                </div>
              ) : (
                filteredConnections.map((connection) => (
                  <button
                    key={connection.id}
                    type="button"
                    onClick={() => {
                      onChange(connection.id);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5',
                      'hover:bg-white/5 transition-colors text-left',
                      value === connection.id && 'bg-blue-500/10'
                    )}
                  >
                    {renderIcon(connection.icon, connection.color, 'w-4 h-4')}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-white truncate">{connection.name}</p>
                        {!connection.isActive && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                            inativo
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-white/40 truncate">
                        {connection.typeName}
                        {connection.identifier && ` • ${connection.identifier}`}
                      </p>
                    </div>
                    {value === connection.id && (
                      <Check className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Create New */}
            <div className="border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  window.open('/settings/integrations', '_blank');
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-3',
                  'hover:bg-white/5 transition-colors text-left',
                  'text-blue-400'
                )}
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm">Criar nova credencial</span>
                <ExternalLink className="w-3 h-3 ml-auto text-white/30" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <AlertCircle className="w-3 h-3" />
          {error}
        </div>
      )}

      {/* No connections hint */}
      {!isLoading && connections.length === 0 && !error && (
        <p className="text-[11px] text-white/40">
          Nenhuma conexão configurada. 
          <a 
            href="/settings/integrations" 
            target="_blank" 
            className="text-blue-400 hover:underline ml-1"
          >
            Configurar integrações →
          </a>
        </p>
      )}
    </div>
  );
}

export default CredentialSelector;
