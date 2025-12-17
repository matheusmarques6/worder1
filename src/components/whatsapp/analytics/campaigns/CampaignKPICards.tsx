'use client';

import { motion } from 'framer-motion';
import {
  Send,
  CheckCircle2,
  Eye,
  MessageCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { formatNumber, formatPercent, getTrendColor, getTrendIcon } from '@/types/whatsapp-analytics';

interface KPICardProps {
  title: string;
  value: number | string;
  change?: number;
  icon: React.ElementType;
  color: 'blue' | 'emerald' | 'cyan' | 'violet' | 'red';
  format?: 'number' | 'percent' | 'raw';
  delay?: number;
  inverseChange?: boolean;
}

const colorMap = {
  blue: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    gradient: 'from-blue-500 to-blue-600',
  },
  emerald: {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    gradient: 'from-emerald-500 to-emerald-600',
  },
  cyan: {
    bg: 'bg-cyan-500/20',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
    gradient: 'from-cyan-500 to-cyan-600',
  },
  violet: {
    bg: 'bg-violet-500/20',
    text: 'text-violet-400',
    border: 'border-violet-500/30',
    gradient: 'from-violet-500 to-violet-600',
  },
  red: {
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    border: 'border-red-500/30',
    gradient: 'from-red-500 to-red-600',
  },
};

function KPICard({ title, value, change, icon: Icon, color, format = 'number', delay = 0, inverseChange = false }: KPICardProps) {
  const colors = colorMap[color];
  
  const formattedValue = typeof value === 'number'
    ? format === 'percent'
      ? formatPercent(value)
      : format === 'number'
        ? formatNumber(value)
        : value.toString()
    : value;

  const trendIcon = change !== undefined ? getTrendIcon(change) : 'neutral';
  const TrendIcon = trendIcon === 'up' ? TrendingUp : trendIcon === 'down' ? TrendingDown : Minus;

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
        <p className="text-2xl font-bold text-white">{formattedValue}</p>
        <p className="text-sm text-dark-400 mt-1">{title}</p>
      </div>
      
      {/* Linha decorativa */}
      <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${colors.gradient} rounded-b-xl opacity-60 group-hover:opacity-100 transition-opacity`} />
    </motion.div>
  );
}

interface CampaignKPICardsProps {
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  sentChange?: number;
  deliveredChange?: number;
  readChange?: number;
  repliedChange?: number;
  failedChange?: number;
}

export function CampaignKPICards({
  sent,
  delivered,
  read,
  replied,
  failed,
  sentChange,
  deliveredChange,
  readChange,
  repliedChange,
  failedChange,
}: CampaignKPICardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <KPICard
        title="Enviadas"
        value={sent}
        change={sentChange}
        icon={Send}
        color="blue"
        delay={0}
      />
      <KPICard
        title="Entregues"
        value={delivered}
        change={deliveredChange}
        icon={CheckCircle2}
        color="emerald"
        delay={0.05}
      />
      <KPICard
        title="Lidas"
        value={read}
        change={readChange}
        icon={Eye}
        color="cyan"
        delay={0.1}
      />
      <KPICard
        title="Respondidas"
        value={replied}
        change={repliedChange}
        icon={MessageCircle}
        color="violet"
        delay={0.15}
      />
      <KPICard
        title="Falhas"
        value={failed}
        change={failedChange}
        icon={XCircle}
        color="red"
        delay={0.2}
        inverseChange
      />
    </div>
  );
}

interface RateCardsProps {
  deliveryRate: number;
  readRate: number;
  replyRate: number;
  failureRate: number;
  avgDeliveryTime: string;
  avgReadTime: string;
}

export function CampaignRateCards({
  deliveryRate,
  readRate,
  replyRate,
  failureRate,
  avgDeliveryTime,
  avgReadTime,
}: RateCardsProps) {
  return (
    <div className="bg-dark-800/50 rounded-xl border border-dark-700/50 p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Taxas Gerais</h3>
      
      <div className="space-y-4">
        <RateBar label="Taxa de Entrega" value={deliveryRate} color="emerald" />
        <RateBar label="Taxa de Leitura" value={readRate} color="cyan" />
        <RateBar label="Taxa de Resposta" value={replyRate} color="violet" />
        <RateBar label="Taxa de Falha" value={failureRate} color="red" inverse />
      </div>

      <div className="mt-6 pt-4 border-t border-dark-700/50">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-dark-400">Tempo Médio Entrega</p>
            <p className="text-lg font-semibold text-white mt-1">{avgDeliveryTime}</p>
          </div>
          <div>
            <p className="text-sm text-dark-400">Tempo Médio Leitura</p>
            <p className="text-lg font-semibold text-white mt-1">{avgReadTime}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface RateBarProps {
  label: string;
  value: number;
  color: 'emerald' | 'cyan' | 'violet' | 'red';
  inverse?: boolean;
}

function RateBar({ label, value, color, inverse }: RateBarProps) {
  const colorClasses = {
    emerald: 'bg-emerald-500',
    cyan: 'bg-cyan-500',
    violet: 'bg-violet-500',
    red: 'bg-red-500',
  };

  const textColorClasses = {
    emerald: 'text-emerald-400',
    cyan: 'text-cyan-400',
    violet: 'text-violet-400',
    red: 'text-red-400',
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm text-dark-300">{label}</span>
        <span className={`text-sm font-medium ${textColorClasses[color]}`}>
          {value.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(value, 100)}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`h-full ${colorClasses[color]} rounded-full`}
        />
      </div>
    </div>
  );
}

export default CampaignKPICards;
