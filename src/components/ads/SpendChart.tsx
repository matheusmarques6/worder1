/**
 * SpendChart - Gráfico de gastos diários
 */

'use client';

import { DailyMetric } from '@/types/facebook';
import { formatCurrency, formatDateShort } from '@/utils/ads-formatting';

interface SpendChartProps {
  data: DailyMetric[];
  loading?: boolean;
}

export function SpendChart({ data, loading }: SpendChartProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="h-6 bg-gray-200 rounded w-32 mb-4 animate-pulse" />
        <div className="h-48 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Desempenho Diário</h3>
        <div className="h-48 flex items-center justify-center">
          <p className="text-gray-500 text-sm">Nenhum dado disponível</p>
        </div>
      </div>
    );
  }

  // Calcular valores máximos para escala
  const maxSpend = Math.max(...data.map(d => d.spend), 1);
  const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
  const maxValue = Math.max(maxSpend, maxRevenue);

  // Totais
  const totalSpend = data.reduce((sum, d) => sum + d.spend, 0);
  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-700">Desempenho Diário</h3>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-blue-500" />
            <span className="text-gray-600">Gasto</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-green-500" />
            <span className="text-gray-600">Receita</span>
          </div>
        </div>
      </div>

      {/* Gráfico de barras simples */}
      <div className="h-48 flex items-end gap-1">
        {data.map((day, idx) => {
          const spendHeight = (day.spend / maxValue) * 100;
          const revenueHeight = (day.revenue / maxValue) * 100;
          
          return (
            <div 
              key={day.date} 
              className="flex-1 flex flex-col items-center gap-1 group relative"
            >
              {/* Barras */}
              <div className="w-full flex gap-0.5 items-end h-40">
                <div 
                  className="flex-1 bg-blue-500 rounded-t transition-all hover:bg-blue-600"
                  style={{ height: `${Math.max(spendHeight, 2)}%` }}
                />
                <div 
                  className="flex-1 bg-green-500 rounded-t transition-all hover:bg-green-600"
                  style={{ height: `${Math.max(revenueHeight, 2)}%` }}
                />
              </div>
              
              {/* Data */}
              <span className="text-[10px] text-gray-500">
                {formatDateShort(day.date)}
              </span>

              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                <div className="font-medium mb-1">{formatDateShort(day.date)}</div>
                <div className="flex items-center gap-2">
                  <span className="text-blue-300">Gasto:</span>
                  <span>{formatCurrency(day.spend)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-300">Receita:</span>
                  <span>{formatCurrency(day.revenue)}</span>
                </div>
                <div className="flex items-center gap-2 border-t border-gray-700 mt-1 pt-1">
                  <span className="text-gray-300">Compras:</span>
                  <span>{day.purchases}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Resumo */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
        <div className="text-sm">
          <span className="text-gray-500">Total gasto:</span>
          <span className="ml-2 font-semibold text-gray-900">{formatCurrency(totalSpend)}</span>
        </div>
        <div className="text-sm">
          <span className="text-gray-500">Total receita:</span>
          <span className="ml-2 font-semibold text-green-600">{formatCurrency(totalRevenue)}</span>
        </div>
        <div className="text-sm">
          <span className="text-gray-500">ROAS período:</span>
          <span className="ml-2 font-semibold text-gray-900">
            {totalSpend > 0 ? `${(totalRevenue / totalSpend).toFixed(2)}x` : '-'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default SpendChart;
