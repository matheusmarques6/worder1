'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Play,
  User,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Mail,
  Phone,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

interface Contact {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  tags?: string[];
}

interface TestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTest: (contactId: string | null, useSampleData: boolean) => Promise<void>;
  organizationId: string;
  isLoading: boolean;
}

export function TestModal({
  isOpen,
  onClose,
  onTest,
  organizationId,
  isLoading,
}: TestModalProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [useSampleData, setUseSampleData] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Buscar contatos
  useEffect(() => {
    if (!isOpen || !organizationId) return;

    async function fetchContacts() {
      setLoadingContacts(true);
      try {
        const res = await fetch(
          `/api/contacts?organizationId=${organizationId}&pageSize=20&search=${searchQuery}`
        );
        if (res.ok) {
          const data = await res.json();
          setContacts(data.contacts || []);
        }
      } catch (e) {
        console.error('Erro ao buscar contatos:', e);
      } finally {
        setLoadingContacts(false);
      }
    }

    const debounce = setTimeout(fetchContacts, 300);
    return () => clearTimeout(debounce);
  }, [isOpen, organizationId, searchQuery]);

  // Reset quando fechar
  useEffect(() => {
    if (!isOpen) {
      setSelectedContact(null);
      setUseSampleData(false);
      setSearchQuery('');
    }
  }, [isOpen]);

  const handleTest = async () => {
    await onTest(useSampleData ? null : selectedContact?.id || null, useSampleData);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', duration: 0.3 }}
          className="relative w-full max-w-lg bg-[#111111] rounded-2xl border border-[#222222] shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[#222222]">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-500/20 rounded-xl">
                <Play className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Testar Automação</h2>
                <p className="text-sm text-dark-400">Selecione um contato para simular</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-dark-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-dark-400" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Opção de dados de exemplo */}
            <div
              onClick={() => {
                setUseSampleData(true);
                setSelectedContact(null);
              }}
              className={cn(
                'p-4 rounded-xl border-2 cursor-pointer transition-all',
                useSampleData
                  ? 'border-primary-500 bg-primary-500/10'
                  : 'border-[#222222] hover:border-[#333333] bg-[#0a0a0a]'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'p-2.5 rounded-xl',
                  useSampleData ? 'bg-primary-500/20' : 'bg-dark-700'
                )}>
                  <Sparkles className={cn(
                    'w-5 h-5',
                    useSampleData ? 'text-primary-400' : 'text-dark-400'
                  )} />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-white">Usar dados de exemplo</p>
                  <p className="text-sm text-dark-400">
                    João Silva • cliente.teste@exemplo.com
                  </p>
                </div>
                {useSampleData && (
                  <CheckCircle2 className="w-5 h-5 text-primary-400" />
                )}
              </div>
            </div>

            <div className="relative flex items-center">
              <div className="flex-1 h-px bg-[#222222]" />
              <span className="px-3 text-xs text-dark-500">ou selecione um contato real</span>
              <div className="flex-1 h-px bg-[#222222]" />
            </div>

            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por email ou nome..."
                className="w-full pl-10 pr-4 py-2.5 bg-[#0a0a0a] border border-[#222222] rounded-xl text-white text-sm focus:outline-none focus:border-primary-500/50"
              />
            </div>

            {/* Lista de contatos */}
            <div className="max-h-[240px] overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-dark-700">
              {loadingContacts ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
                </div>
              ) : contacts.length === 0 ? (
                <div className="text-center py-8">
                  <User className="w-10 h-10 text-dark-600 mx-auto mb-2" />
                  <p className="text-dark-400 text-sm">Nenhum contato encontrado</p>
                </div>
              ) : (
                contacts.map((contact) => (
                  <div
                    key={contact.id}
                    onClick={() => {
                      setSelectedContact(contact);
                      setUseSampleData(false);
                    }}
                    className={cn(
                      'p-3 rounded-xl border-2 cursor-pointer transition-all',
                      selectedContact?.id === contact.id && !useSampleData
                        ? 'border-primary-500 bg-primary-500/10'
                        : 'border-[#222222] hover:border-[#333333] bg-[#0a0a0a]'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-semibold text-sm">
                        {(contact.first_name?.[0] || contact.email[0]).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white truncate">
                          {contact.first_name} {contact.last_name}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-dark-400">
                          <span className="flex items-center gap-1 truncate">
                            <Mail className="w-3 h-3" />
                            {contact.email}
                          </span>
                          {contact.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {contact.phone}
                            </span>
                          )}
                        </div>
                      </div>
                      {selectedContact?.id === contact.id && !useSampleData && (
                        <CheckCircle2 className="w-5 h-5 text-primary-400 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[#222222] flex items-center justify-between">
            <p className="text-xs text-dark-500">
              {useSampleData 
                ? '✨ Usando dados de exemplo' 
                : selectedContact 
                  ? `📧 ${selectedContact.email}`
                  : '⚠️ Selecione um contato'}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleTest}
                disabled={!useSampleData && !selectedContact || isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Executando...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Executar Teste
                  </>
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================
// Componente de resultado do teste
// ============================================

interface NodeExecutionResult {
  nodeId: string;
  status: 'success' | 'error' | 'skipped';
  output?: any;
  error?: string;
  duration: number;
}

interface TestResultPanelProps {
  isOpen: boolean;
  onClose: () => void;
  results: NodeExecutionResult[];
  contact: any;
  totalDuration: number;
  success: boolean;
}

export function TestResultPanel({
  isOpen,
  onClose,
  results,
  contact,
  totalDuration,
  success,
}: TestResultPanelProps) {
  const [expandedNode, setExpandedNode] = useState<string | null>(null);

  if (!isOpen) return null;

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const skippedCount = results.filter(r => r.status === 'skipped').length;

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed right-0 top-0 bottom-0 w-[400px] bg-[#111111] border-l border-[#222222] z-40 flex flex-col shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#222222]">
        <div className="flex items-center gap-3">
          <div className={cn(
            'p-2 rounded-xl',
            success ? 'bg-green-500/20' : 'bg-red-500/20'
          )}>
            {success ? (
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-white">
              {success ? 'Teste concluído!' : 'Teste com erros'}
            </h3>
            <p className="text-xs text-dark-400">
              {totalDuration}ms • {contact?.email || 'Dados de exemplo'}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-dark-800 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-dark-400" />
        </button>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 p-4 border-b border-[#222222]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-sm text-white">{successCount} sucesso</span>
        </div>
        {errorCount > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-sm text-white">{errorCount} erro</span>
          </div>
        )}
        {skippedCount > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-dark-500" />
            <span className="text-sm text-white">{skippedCount} pulado</span>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {results.map((result, index) => (
          <div
            key={result.nodeId}
            className={cn(
              'rounded-xl border overflow-hidden transition-all',
              result.status === 'success' && 'border-green-500/30 bg-green-500/5',
              result.status === 'error' && 'border-red-500/30 bg-red-500/5',
              result.status === 'skipped' && 'border-dark-700 bg-dark-800/50',
            )}
          >
            <div
              className="flex items-center gap-3 p-3 cursor-pointer"
              onClick={() => setExpandedNode(expandedNode === result.nodeId ? null : result.nodeId)}
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-dark-700 text-xs text-dark-300">
                {index + 1}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {result.output?.action || result.nodeId}
                </p>
                <p className="text-xs text-dark-400">
                  {result.duration}ms
                  {result.output?.simulated && ' • Simulado'}
                </p>
              </div>
              
              {result.status === 'success' && (
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
              )}
              {result.status === 'error' && (
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              )}
              {result.status === 'skipped' && (
                <span className="text-xs text-dark-500">Pulado</span>
              )}
            </div>

            {/* Expanded content */}
            <AnimatePresence>
              {expandedNode === result.nodeId && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-dark-700"
                >
                  <div className="p-3 bg-dark-900/50">
                    <p className="text-xs font-medium text-dark-400 mb-2">OUTPUT</p>
                    <pre className="text-xs text-dark-300 bg-dark-950 rounded-lg p-2 overflow-x-auto max-h-[200px]">
                      {JSON.stringify(result.output || result.error, null, 2)}
                    </pre>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[#222222]">
        <Button variant="secondary" size="sm" onClick={onClose} className="w-full">
          Fechar
        </Button>
      </div>
    </motion.div>
  );
}
