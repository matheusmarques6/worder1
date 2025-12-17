'use client';

import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { motion } from 'framer-motion';
import type { CampaignChartDataPoint } from '@/types/whatsapp-analytics';
import { CAMPAIGN_COLORS, formatNumber } from '@/types/whatsapp-analytics';

interface CampaignPerformanceChartProps {
  data: CampaignChartDataPoint[];
  height?: number;
}

export function CampaignPerformanceChart({ data, height = 350 }: CampaignPerformanceChartProps) {
  // Formatar datas para exibição
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
        <h3 className="text-lg font-semibold text-white">Performance por Período</h3>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-blue-500" />
            <span className="text-dark-400">Enviadas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-emerald-500" />
            <span className="text-dark-400">Entregues</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-cyan-500" />
            <span className="text-dark-400">Lidas</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="sentGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CAMPAIGN_COLORS.sent} stopOpacity={0.3} />
              <stop offset="95%" stopColor={CAMPAIGN_COLORS.sent} stopOpacity={0} />
            </linearGradient>
          </defs>
          
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke={CAMPAIGN_COLORS.grid} 
            vertical={false}
          />
          
          <XAxis
            dataKey="displayDate"
            stroke={CAMPAIGN_COLORS.axis}
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          
          <YAxis
            stroke={CAMPAIGN_COLORS.axis}
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => formatNumber(value)}
          />
          
          <Tooltip content={<CustomTooltip />} />
          
          <Bar
            dataKey="delivered"
            fill={CAMPAIGN_COLORS.delivered}
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
          
          <Bar
            dataKey="read"
            fill={CAMPAIGN_COLORS.read}
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
          
          <Line
            type="monotone"
            dataKey="sent"
            stroke={CAMPAIGN_COLORS.sent}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: CAMPAIGN_COLORS.sent }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
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
              <span className="text-sm text-dark-300 capitalize">
                {entry.dataKey === 'sent' ? 'Enviadas' : 
                 entry.dataKey === 'delivered' ? 'Entregues' : 
                 entry.dataKey === 'read' ? 'Lidas' : 
                 entry.dataKey === 'replied' ? 'Respondidas' :
                 entry.dataKey === 'failed' ? 'Falhas' : entry.dataKey}
              </span>
            </div>
            <span className="text-sm font-medium text-white">
              {formatNumber(entry.value)}
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

export default CampaignPerformanceChart;
