'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronRight,
  RefreshCw,
  Filter,
  Calendar,
  User,
  Zap,
  AlertCircle,
  PlayCircle,
  Search,
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ExecutionDetail } from './ExecutionDetail';

// =====================================================
// TYPES
// =====================================================

interface AutomationRun {
  id: string;
  automation_id: string;
  automation_name: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  trigger_type: string;
  contact: {
    id: string;
    email: string;
    name: string;
  } | null;
  deal: {
    id: string;
    title: string;
    value: number;
  } | null;
  total_steps: number;
  completed_steps: number;
  failed_steps: number;
  duration_ms: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

interface ExecutionHistoryProps {
  organizationId: string;
  automationId?: string; // Opcional: filtrar por automação específica
  autoRefresh?: boolean;
  refreshInterval?: number; // ms
}

// =====================================================
// TRIGGER LABELS
// =====================================================

const TRIGGER_LABELS: Record<string, string> = {
  order: 'Pedido Realizado',
  abandon: 'Carrinho Abandonado',
  signup: 'Novo Cadastro',
  tag: 'Tag Adicionada',
  deal_created: 'Deal Criado',
  deal_stage: 'Deal Mudou Estágio',
  deal_won: 'Deal Ganho',
  deal_lost: 'Deal Perdido',
  date: 'Data Especial',
  segment: 'Entrou em Segmento',
  webhook: 'Webhook',
};

// =====================================================
// MAIN COMPONENT
// =====================================================

export function ExecutionHistory({
  organizationId,
  automationId,
  autoRefresh = true,
  refreshInterval = 10000, // 10 segundos
}: ExecutionHistoryProps) {
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Paginação
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  
  // Filtros
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('today'); // today, week, month, all
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal de detalhes
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // Buscar execuções
  const fetchRuns = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams({
        organizationId,
        page: String(page),
        pageSize: '20',
      });

      if (automationId) {
        params.set('automationId', automationId);
      }

      if (statusFilter) {
        params.set('status', statusFilter);
      }

      // Aplicar filtro de data
      if (dateFilter !== 'all') {
        const now = new Date();
        let startDate: Date;

        switch (dateFilter) {
          case 'today':
            startDate = new Date(now.setHours(0, 0, 0, 0));
            break;
          case 'week':
            startDate = new Date(now.setDate(now.getDate() - 7));
            break;
          case 'month':
            startDate = new Date(now.setMonth(now.getMonth() - 1));
            break;
          default:
            startDate = new Date(0);
        }
        params.set('startDate', startDate.toISOString());
      }

      const response = await fetch(`/api/automations/runs?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao buscar execuções');
      }

      setRuns(data.runs || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotal(data.pagination?.total || 0);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId, automationId, page, statusFilter, dateFilter]);

  // Carregar inicialmente e quando filtros mudam
  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchRuns(true);
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchRuns]);

  // Formatar duração
  const formatDuration = (ms: number | null) => {
    if (ms === null) return '--';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  };

  // Formatar data/hora
  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    const time = date.toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    if (isToday) {
      return time;
    }

    return `${date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit' 
    })} ${time}`;
  };

  // Status icon/badge
  const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case 'completed':
        return (
          <div className="flex items-center gap-1.5 text-green-400">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-xs">Sucesso</span>
          </div>
        );
      case 'failed':
        return (
          <div className="flex items-center gap-1.5 text-red-400">
            <XCircle className="w-4 h-4" />
            <span className="text-xs">Erro</span>
          </div>
        );
      case 'running':
        return (
          <div className="flex items-center gap-1.5 text-amber-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Executando</span>
          </div>
        );
      case 'cancelled':
        return (
          <div className="flex items-center gap-1.5 text-gray-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-xs">Cancelado</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header com filtros */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#222222] bg-[#111111]">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">Execuções</h2>
          <Badge variant="secondary">{total}</Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Filtro de Status */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 bg-[#1a1a1a] border border-[#333333] rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
          >
            <option value="">Todos os status</option>
            <option value="completed">✅ Sucesso</option>
            <option value="failed">❌ Erro</option>
            <option value="running">⏳ Executando</option>
          </select>

          {/* Filtro de Data */}
          <select
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 bg-[#1a1a1a] border border-[#333333] rounded-lg text-sm text-white focus:outline-none focus:border-primary-500"
          >
            <option value="today">Hoje</option>
            <option value="week">Últimos 7 dias</option>
            <option value="month">Último mês</option>
            <option value="all">Tudo</option>
          </select>

          {/* Botão Refresh */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchRuns(true)}
            disabled={refreshing}
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Lista de execuções */}
      <div className="flex-1 overflow-y-auto">
        {loading && !refreshing ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-red-400">
            <AlertCircle className="w-8 h-8 mb-2" />
            <p className="text-sm">{error}</p>
            <Button variant="ghost" size="sm" onClick={() => fetchRuns()} className="mt-2">
              Tentar novamente
            </Button>
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-dark-400">
            <PlayCircle className="w-12 h-12 mb-3 text-dark-600" />
            <p className="text-lg font-medium text-white mb-1">Nenhuma execução</p>
            <p className="text-sm">As execuções das suas automações aparecerão aqui</p>
          </div>
        ) : (
          <div className="divide-y divide-[#1a1a1a]">
            {runs.map((run) => (
              <motion.div
                key={run.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={cn(
                  'flex items-center gap-4 px-4 py-3 hover:bg-[#0f0f0f] cursor-pointer transition-colors',
                  run.status === 'running' && 'bg-amber-500/5'
                )}
                onClick={() => setSelectedRunId(run.id)}
              >
                {/* Status */}
                <div className="w-24 flex-shrink-0">
                  <StatusBadge status={run.status} />
                </div>

                {/* Horário */}
                <div className="w-20 flex-shrink-0">
                  <span className="text-sm text-dark-400">
                    {formatDateTime(run.started_at)}
                  </span>
                </div>

                {/* Automação */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {run.automation_name}
                  </p>
                  <p className="text-xs text-dark-500 truncate">
                    {TRIGGER_LABELS[run.trigger_type] || run.trigger_type}
                  </p>
                </div>

                {/* Contato */}
                <div className="w-40 flex-shrink-0 hidden md:block">
                  {run.contact ? (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-[10px] text-white font-medium">
                        {(run.contact.name?.[0] || run.contact.email[0]).toUpperCase()}
                      </div>
                      <span className="text-sm text-dark-300 truncate">
                        {run.contact.name || run.contact.email}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-dark-600">—</span>
                  )}
                </div>

                {/* Steps */}
                <div className="w-20 flex-shrink-0 hidden lg:block">
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-green-400">{run.completed_steps}</span>
                    <span className="text-dark-600">/</span>
                    <span className="text-dark-400">{run.total_steps}</span>
                    {run.failed_steps > 0 && (
                      <span className="text-red-400 ml-1">({run.failed_steps} erro)</span>
                    )}
                  </div>
                </div>

                {/* Duração */}
                <div className="w-16 flex-shrink-0 text-right">
                  <span className="text-xs text-dark-400">
                    {formatDuration(run.duration_ms)}
                  </span>
                </div>

                {/* Seta */}
                <ChevronRight className="w-4 h-4 text-dark-600 flex-shrink-0" />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#222222] bg-[#111111]">
          <span className="text-sm text-dark-400">
            Página {page} de {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Anterior
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Próximo
            </Button>
          </div>
        </div>
      )}

      {/* Modal de detalhes */}
      <AnimatePresence>
        {selectedRunId && (
          <ExecutionDetail
            runId={selectedRunId}
            organizationId={organizationId}
            onClose={() => setSelectedRunId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default ExecutionHistory;
