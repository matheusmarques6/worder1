/**
 * KPICard - Card individual de métrica
 */

'use client';

import { MetricWithComparison } from '@/types/facebook';
import { formatChange } from '@/utils/ads-formatting';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string;
  comparison?: MetricWithComparison;
  icon?: React.ReactNode;
  loading?: boolean;
  invertColors?: boolean; // Para métricas onde menor é melhor (CPA, CPC)
}

export function KPICard({ 
  label, 
  value, 
  comparison, 
  icon, 
  loading,
  invertColors = false 
}: KPICardProps) {
  const change = comparison?.change_percent !== undefined 
    ? formatChange(comparison.change_percent) 
    : null;
  
  // Inverter cores se necessário (ex: CPA menor é melhor)
  const isGood = change ? (invertColors ? change.isNegative : change.isPositive) : false;
  const isBad = change ? (invertColors ? change.isPositive : change.isNegative) : false;

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-20 mb-2" />
        <div className="h-8 bg-gray-200 rounded w-28" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-gray-500">{label}</span>
        {icon && <span className="text-gray-400">{icon}</span>}
      </div>
      
      <div className="flex items-end gap-2">
        <span className="text-2xl font-semibold text-gray-900">{value}</span>
        
        {change && (
          <div className={`flex items-center text-sm ${
            isGood ? 'text-green-600' : isBad ? 'text-red-600' : 'text-gray-500'
          }`}>
            {isGood ? (
              <TrendingUp className="w-4 h-4 mr-0.5" />
            ) : isBad ? (
              <TrendingDown className="w-4 h-4 mr-0.5" />
            ) : (
              <Minus className="w-4 h-4 mr-0.5" />
            )}
            <span>{change.text}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default KPICard;
