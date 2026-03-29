'use client';

import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { PROVIDER_COLORS, PROVIDER_NAMES, formatTokens, formatCost } from '@/types/whatsapp-ai-analytics';
import type { ProviderBreakdown, AIProvider, QualityMetrics } from '@/types/whatsapp-ai-analytics';

interface AIProviderBreakdownProps {
  data: ProviderBreakdown;
}

export function AIProviderBreakdown({ data }: AIProviderBreakdownProps) {
  const chartData = Object.entries(data).map(([provider, metrics]) => ({
    name: PROVIDER_NAMES[provider as AIProvider] || provider,
    value: metrics.interactions,
    percent: metrics.percent,
    tokens: metrics.tokens,
    cost: metrics.cost_usd,
    color: PROVIDER_COLORS[provider as AIProvider] || '#6b7280',
  }));

  const totalInteractions = Object.values(data).reduce((sum, m) => sum + m.interactions, 0);

  if (chartData.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.35 }}
        className="bg-gray-50 rounded-xl border border-gray-200 p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Por Provedor</h3>
        <p className="text-gray-500 text-center py-8">Nenhum dado disponível</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      className="bg-gray-50 rounded-xl border border-gray-200 p-6"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Por Provedor</h3>

      <div className="flex items-center gap-6">
        {/* Mini chart */}
        <div className="w-24 h-24 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={25}
                outerRadius={40}
                dataKey="value"
                strokeWidth={0}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<ProviderTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-3">
          {chartData.map((item, index) => (
            <div key={item.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm text-gray-600">{item.name}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-700 font-medium">
                  {item.percent.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-sm font-medium text-gray-900">{totalInteractions.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Tokens</p>
          <p className="text-sm font-medium text-gray-900">
            {formatTokens(Object.values(data).reduce((sum, m) => sum + m.tokens, 0))}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Custo</p>
          <p className="text-sm font-medium text-gray-900">
            {formatCost(Object.values(data).reduce((sum, m) => sum + m.cost_usd, 0))}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function ProviderTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  
  const data = payload[0].payload;
  
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-xl">
      <p className="text-gray-900 font-medium mb-1">{data.name}</p>
      <p className="text-sm text-gray-600">Interações: {data.value.toLocaleString()}</p>
      <p className="text-sm text-gray-600">Tokens: {formatTokens(data.tokens)}</p>
      <p className="text-sm text-gray-600">Custo: {formatCost(data.cost)}</p>
    </div>
  );
}

interface AIQualityMetricsProps {
  metrics: QualityMetrics;
}

export function AIQualityMetrics({ metrics }: AIQualityMetricsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.4 }}
      className="bg-gray-50 rounded-xl border border-gray-200 p-6"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Qualidade do Atendimento</h3>

      <div className="space-y-4">
        <QualityBar 
          label="Taxa de Resolução" 
          value={metrics.resolution_rate} 
          color="emerald"
          description="Conversas resolvidas pela IA"
        />
        <QualityBar 
          label="Taxa de Transferência" 
          value={metrics.transfer_rate} 
          color="amber"
          description="Passadas para humano"
        />
        <QualityBar 
          label="Taxa de Abandono" 
          value={metrics.abandonment_rate} 
          color="red"
          description="Usuário não respondeu"
        />
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Msgs/conversa</span>
          <span className="text-lg font-semibold text-gray-900">
            {metrics.avg_messages_per_conversation.toFixed(1)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

interface QualityBarProps {
  label: string;
  value: number;
  color: 'emerald' | 'amber' | 'red';
  description: string;
}

function QualityBar({ label, value, color, description }: QualityBarProps) {
  const colorClasses = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  };

  const textColorClasses = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <span className="text-sm text-gray-600">{label}</span>
          <span className="text-xs text-gray-400 ml-2">({description})</span>
        </div>
        <span className={`text-sm font-medium ${textColorClasses[color]}`}>
          {value.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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

export default AIProviderBreakdown;
