'use client';

import { motion } from 'framer-motion';
import { Bot, Zap, Check, ExternalLink } from 'lucide-react';
import { formatTokens, formatCost, formatLatency, PROVIDER_COLORS, PROVIDER_NAMES } from '@/types/whatsapp-ai-analytics';
import type { AIAgentWithMetrics, AIProvider } from '@/types/whatsapp-ai-analytics';

interface AIAgentCardProps {
  agent: AIAgentWithMetrics;
  onClick?: () => void;
  delay?: number;
}

export function AIAgentCard({ agent, onClick, delay = 0 }: AIAgentCardProps) {
  const providerColor = PROVIDER_COLORS[agent.provider as AIProvider] || '#6b7280';
  const providerName = PROVIDER_NAMES[agent.provider as AIProvider] || agent.provider;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      onClick={onClick}
      className={`
        relative bg-dark-800/60 rounded-xl border border-dark-700/50 p-5 
        hover:border-dark-600 transition-all cursor-pointer group
        ${!agent.is_active ? 'opacity-60' : ''}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${providerColor}20` }}
          >
            <Bot className="w-5 h-5" style={{ color: providerColor }} />
          </div>
          <div>
            <h3 className="text-white font-medium">{agent.name}</h3>
            <p className="text-xs text-dark-400">
              {providerName} • {agent.model}
            </p>
          </div>
        </div>
        
        {/* Status indicator */}
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
          agent.is_active 
            ? 'bg-emerald-500/20 text-emerald-400' 
            : 'bg-dark-600 text-dark-400'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${
            agent.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-dark-400'
          }`} />
          {agent.is_active ? 'Ativo' : 'Inativo'}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <StatItem 
          label="Interações" 
          value={formatNumber(agent.total_interactions)} 
        />
        <StatItem 
          label="Tokens" 
          value={formatTokens(agent.total_tokens_used)} 
        />
        <StatItem 
          label="Custo" 
          value={formatCost(agent.total_cost_usd)} 
        />
        <StatItem 
          label="Latência" 
          value={agent.avg_response_time_ms ? formatLatency(agent.avg_response_time_ms) : '-'} 
        />
      </div>

      {/* Progress bars */}
      <div className="space-y-3">
        {agent.success_rate !== undefined && (
          <ProgressBar 
            label="Taxa de Sucesso" 
            value={agent.success_rate} 
            color="emerald"
          />
        )}
        {agent.resolution_rate !== undefined && (
          <ProgressBar 
            label="Taxa de Resolução" 
            value={agent.resolution_rate} 
            color="lime"
          />
        )}
      </div>

      {/* Last activity */}
      {agent.last_interaction_at && (
        <div className="mt-4 pt-3 border-t border-dark-700/50">
          <p className="text-xs text-dark-400">
            Última interação: {formatTimeAgo(agent.last_interaction_at)}
          </p>
        </div>
      )}

      {/* Hover indicator */}
      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <ExternalLink className="w-4 h-4 text-dark-400" />
      </div>
    </motion.div>
  );
}

interface StatItemProps {
  label: string;
  value: string;
}

function StatItem({ label, value }: StatItemProps) {
  return (
    <div className="text-center">
      <p className="text-sm font-medium text-white">{value}</p>
      <p className="text-xs text-dark-400 mt-0.5">{label}</p>
    </div>
  );
}

interface ProgressBarProps {
  label: string;
  value: number;
  color: 'emerald' | 'lime' | 'cyan' | 'purple';
}

function ProgressBar({ label, value, color }: ProgressBarProps) {
  const colorClasses = {
    emerald: 'bg-emerald-500',
    lime: 'bg-lime-500',
    cyan: 'bg-cyan-500',
    purple: 'bg-purple-500',
  };

  const textColorClasses = {
    emerald: 'text-emerald-400',
    lime: 'text-lime-400',
    cyan: 'text-cyan-400',
    purple: 'text-purple-400',
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-dark-400">{label}</span>
        <span className={`text-xs font-medium ${textColorClasses[color]}`}>
          {value.toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(value, 100)}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={`h-full ${colorClasses[color]} rounded-full`}
        />
      </div>
    </div>
  );
}

interface AIAgentsGridProps {
  agents: AIAgentWithMetrics[];
  onAgentClick?: (agentId: string) => void;
}

export function AIAgentsGrid({ agents, onAgentClick }: AIAgentsGridProps) {
  if (agents.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-dark-800/50 rounded-xl border border-dark-700/50 p-8 text-center"
      >
        <Bot className="w-12 h-12 text-dark-600 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-white mb-1">Nenhum agente configurado</h3>
        <p className="text-dark-400 text-sm">
          Configure um agente de IA para começar a ver métricas aqui.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="bg-dark-800/50 rounded-xl border border-dark-700/50 p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Seus Agentes</h3>
        <span className="text-sm text-dark-400">
          {agents.filter(a => a.is_active).length} de {agents.length} ativos
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent, index) => (
          <AIAgentCard
            key={agent.id}
            agent={agent}
            onClick={() => onAgentClick?.(agent.id)}
            delay={index * 0.05}
          />
        ))}
      </div>
    </motion.div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'agora';
  if (diffMins < 60) return `${diffMins}min atrás`;
  if (diffHours < 24) return `${diffHours}h atrás`;
  if (diffDays < 7) return `${diffDays}d atrás`;
  return date.toLocaleDateString('pt-BR');
}

export default AIAgentCard;
