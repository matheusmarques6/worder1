'use client';

import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { motion } from 'framer-motion';
import { AI_COLORS, formatTokens, formatCost, formatLatency } from '@/types/whatsapp-ai-analytics';
import type { AIChartDataPoint } from '@/types/whatsapp-ai-analytics';

interface AIPerformanceChartProps {
  data: AIChartDataPoint[];
  height?: number;
}

export function AIPerformanceChart({ data, height = 300 }: AIPerformanceChartProps) {
  const chartData = useMemo(() => {
    return data.map(d => ({
      ...d,
      displayDate: formatDate(d.date),
    }));
  }, [data]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="bg-dark-800/50 rounded-xl border border-dark-700/50 p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Interações e Sucesso</h3>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-purple-500" />
            <span className="text-dark-400">Interações</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-dark-400">Taxa Sucesso</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="interactionsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={AI_COLORS.interactions} stopOpacity={0.4} />
              <stop offset="95%" stopColor={AI_COLORS.interactions} stopOpacity={0} />
            </linearGradient>
          </defs>
          
          <CartesianGrid strokeDasharray="3 3" stroke={AI_COLORS.grid} vertical={false} />
          
          <XAxis
            dataKey="displayDate"
            stroke={AI_COLORS.axis}
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          
          <YAxis
            yAxisId="left"
            stroke={AI_COLORS.axis}
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => formatNumber(value)}
          />
          
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke={AI_COLORS.axis}
            fontSize={12}
            tickLine={false}
            axisLine={false}
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
          />
          
          <Tooltip content={<PerformanceTooltip />} />
          
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="interactions"
            fill="url(#interactionsGradient)"
            stroke={AI_COLORS.interactions}
            strokeWidth={2}
          />
          
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="success_rate"
            stroke={AI_COLORS.success}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: AI_COLORS.success }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

interface AITokensChartProps {
  data: AIChartDataPoint[];
  height?: number;
}

export function AITokensChart({ data, height = 300 }: AITokensChartProps) {
  const chartData = useMemo(() => {
    return data.map(d => ({
      ...d,
      displayDate: formatDate(d.date),
    }));
  }, [data]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25 }}
      className="bg-dark-800/50 rounded-xl border border-dark-700/50 p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Tokens e Custo</h3>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-amber-400" />
            <span className="text-dark-400">Input</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-amber-600" />
            <span className="text-dark-400">Output</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="text-dark-400">Custo</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={AI_COLORS.grid} vertical={false} />
          
          <XAxis
            dataKey="displayDate"
            stroke={AI_COLORS.axis}
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          
          <YAxis
            yAxisId="left"
            stroke={AI_COLORS.axis}
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => formatTokens(value)}
          />
          
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke={AI_COLORS.axis}
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `$${value.toFixed(2)}`}
          />
          
          <Tooltip content={<TokensTooltip />} />
          
          <Bar
            yAxisId="left"
            dataKey="input_tokens"
            stackId="tokens"
            fill="#fbbf24"
            radius={[0, 0, 0, 0]}
            maxBarSize={30}
          />
          
          <Bar
            yAxisId="left"
            dataKey="output_tokens"
            stackId="tokens"
            fill="#d97706"
            radius={[4, 4, 0, 0]}
            maxBarSize={30}
          />
          
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cost_usd"
            stroke={AI_COLORS.cost}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: AI_COLORS.cost }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

interface AILatencyChartProps {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
}

export function AILatencyChart({ p50, p95, p99, avg }: AILatencyChartProps) {
  const maxLatency = Math.max(p99, 5000); // Mínimo de 5s para escala

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="bg-dark-800/50 rounded-xl border border-dark-700/50 p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Latência (P50 / P95 / P99)</h3>
        <span className="text-sm text-dark-400">Média: {formatLatency(avg)}</span>
      </div>

      <div className="space-y-4">
        <LatencyBar label="P50" value={p50} max={maxLatency} color="emerald" />
        <LatencyBar label="P95" value={p95} max={maxLatency} color="amber" />
        <LatencyBar label="P99" value={p99} max={maxLatency} color="orange" />
      </div>
    </motion.div>
  );
}

interface LatencyBarProps {
  label: string;
  value: number;
  max: number;
  color: 'emerald' | 'amber' | 'orange';
}

function LatencyBar({ label, value, max, color }: LatencyBarProps) {
  const percent = max > 0 ? (value / max) * 100 : 0;
  
  const colorClasses = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    orange: 'bg-orange-500',
  };

  const textColorClasses = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    orange: 'text-orange-400',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-dark-300">{label}</span>
        <span className={`text-sm font-medium ${textColorClasses[color]}`}>
          {formatLatency(value)}
        </span>
      </div>
      <div className="h-3 bg-dark-700 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(percent, 100)}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`h-full ${colorClasses[color]} rounded-full`}
        />
      </div>
    </div>
  );
}

function PerformanceTooltip({ active, payload, label }: any) {
  if (!active || !payload) return null;

  return (
    <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 shadow-xl">
      <p className="text-dark-300 text-sm mb-2">{label}</p>
      <div className="space-y-1.5">
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm text-dark-300">
                {entry.dataKey === 'interactions' ? 'Interações' : 
                 entry.dataKey === 'success_rate' ? 'Taxa Sucesso' : entry.dataKey}
              </span>
            </div>
            <span className="text-sm font-medium text-white">
              {entry.dataKey === 'success_rate' 
                ? `${entry.value.toFixed(1)}%` 
                : formatNumber(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TokensTooltip({ active, payload, label }: any) {
  if (!active || !payload) return null;

  return (
    <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 shadow-xl">
      <p className="text-dark-300 text-sm mb-2">{label}</p>
      <div className="space-y-1.5">
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm text-dark-300">
                {entry.dataKey === 'input_tokens' ? 'Input' : 
                 entry.dataKey === 'output_tokens' ? 'Output' : 
                 entry.dataKey === 'cost_usd' ? 'Custo' : entry.dataKey}
              </span>
            </div>
            <span className="text-sm font-medium text-white">
              {entry.dataKey === 'cost_usd' 
                ? formatCost(entry.value)
                : formatTokens(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

export default AIPerformanceChart;
