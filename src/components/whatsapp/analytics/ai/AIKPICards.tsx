'use client';

import { motion } from 'framer-motion';
import {
  MessageSquare,
  Coins,
  DollarSign,
  Zap,
  CheckCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { formatTokens, formatCost, formatLatency } from '@/types/whatsapp-ai-analytics';

interface AIKPICardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ElementType;
  color: 'purple' | 'amber' | 'orange' | 'cyan' | 'emerald' | 'lime';
  delay?: number;
  inverseChange?: boolean;
}

const colorMap = {
  purple: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    gradient: 'from-purple-500 to-purple-600',
  },
  amber: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    gradient: 'from-amber-500 to-amber-600',
  },
  orange: {
    bg: 'bg-orange-500/20',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    gradient: 'from-orange-500 to-orange-600',
  },
  cyan: {
    bg: 'bg-cyan-500/20',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
    gradient: 'from-cyan-500 to-cyan-600',
  },
  emerald: {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    gradient: 'from-emerald-500 to-emerald-600',
  },
  lime: {
    bg: 'bg-lime-500/20',
    text: 'text-lime-400',
    border: 'border-lime-500/30',
    gradient: 'from-lime-500 to-lime-600',
  },
};

function AIKPICard({ title, value, change, icon: Icon, color, delay = 0, inverseChange = false }: AIKPICardProps) {
  const colors = colorMap[color];
  
  const getTrendColor = (val: number, inverse: boolean): string => {
    if (val === 0) return 'text-dark-400';
    const isPositive = inverse ? val < 0 : val > 0;
    return isPositive ? 'text-emerald-400' : 'text-red-400';
  };

  const trendIcon = change !== undefined 
    ? change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus
    : Minus;
  const TrendIcon = trendIcon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className={`relative bg-dark-800/60 rounded-xl border border-dark-700/50 p-5 hover:border-dark-600 transition-all group`}
    >
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-lg ${colors.bg}`}>
          <Icon className={`w-5 h-5 ${colors.text}`} />
        </div>
        {change !== undefined && change !== 0 && (
          <div className={`flex items-center gap-1 text-sm ${getTrendColor(change, inverseChange)}`}>
            <TrendIcon className="w-4 h-4" />
            <span>{Math.abs(change).toFixed(1)}%</span>
          </div>
        )}
      </div>
      
      <div className="mt-4">
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-sm text-dark-400 mt-1">{title}</p>
      </div>
      
      <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${colors.gradient} rounded-b-xl opacity-60 group-hover:opacity-100 transition-opacity`} />
    </motion.div>
  );
}

interface AIKPICardsProps {
  interactions: number;
  tokens: number;
  costUsd: number;
  avgLatencyMs: number;
  successRate: number;
  resolutionRate: number;
  interactionsChange?: number;
  tokensChange?: number;
  costChange?: number;
  latencyChange?: number;
  successRateChange?: number;
  resolutionRateChange?: number;
}

export function AIKPICards({
  interactions,
  tokens,
  costUsd,
  avgLatencyMs,
  successRate,
  resolutionRate,
  interactionsChange,
  tokensChange,
  costChange,
  latencyChange,
  successRateChange,
  resolutionRateChange,
}: AIKPICardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <AIKPICard
        title="Interações"
        value={formatNumber(interactions)}
        change={interactionsChange}
        icon={MessageSquare}
        color="purple"
        delay={0}
      />
      <AIKPICard
        title="Tokens"
        value={formatTokens(tokens)}
        change={tokensChange}
        icon={Coins}
        color="amber"
        delay={0.05}
      />
      <AIKPICard
        title="Custo"
        value={formatCost(costUsd)}
        change={costChange}
        icon={DollarSign}
        color="orange"
        delay={0.1}
        inverseChange
      />
      <AIKPICard
        title="Latência"
        value={formatLatency(avgLatencyMs)}
        change={latencyChange}
        icon={Zap}
        color="cyan"
        delay={0.15}
        inverseChange
      />
      <AIKPICard
        title="Sucesso"
        value={`${successRate.toFixed(1)}%`}
        change={successRateChange}
        icon={CheckCircle}
        color="emerald"
        delay={0.2}
      />
      <AIKPICard
        title="Resolução"
        value={`${resolutionRate.toFixed(1)}%`}
        change={resolutionRateChange}
        icon={RefreshCw}
        color="lime"
        delay={0.25}
      />
    </div>
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

export default AIKPICards;
