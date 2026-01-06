/**
 * AdSetsTable - Tabela de conjuntos de anúncios
 */

'use client';

import { MetaAdSet, ObjectType } from '@/types/facebook';
import { StatusBadge } from './StatusBadge';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatROAS,
  getROASColor,
  formatBudget,
} from '@/utils/ads-formatting';
import { ChevronRight, Users } from 'lucide-react';

interface AdSetsTableProps {
  adsets: MetaAdSet[];
  loading?: boolean;
  onSelectAdSet?: (adsetId: string) => void;
  onToggleStatus?: (objectId: string, objectType: ObjectType, newStatus: 'ACTIVE' | 'PAUSED') => Promise<any>;
}

export function AdSetsTable({ 
  adsets, 
  loading, 
  onSelectAdSet,
  onToggleStatus
}: AdSetsTableProps) {
  const handleToggle = async (adset: MetaAdSet, newStatus: 'ACTIVE' | 'PAUSED') => {
    if (onToggleStatus) {
      await onToggleStatus(adset.id, 'adset', newStatus);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="animate-pulse">
          <div className="h-12 bg-gray-50 border-b" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 border-b last:border-0 flex items-center px-4">
              <div className="h-4 bg-gray-200 rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (adsets.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-gray-500">Nenhum conjunto de anúncios encontrado</p>
      </div>
    );
  }

  const formatTargeting = (targeting?: MetaAdSet['targeting_summary']) => {
    if (!targeting) return null;
    
    const parts: string[] = [];
    if (targeting.age_min || targeting.age_max) {
      parts.push(`${targeting.age_min || 18}-${targeting.age_max || 65}+`);
    }
    if (targeting.geo_locations && targeting.geo_locations.length > 0) {
      parts.push(targeting.geo_locations.slice(0, 2).join(', '));
    }
    
    return parts.length > 0 ? parts.join(' • ') : null;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Conjunto de Anúncios
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Gasto
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Receita
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                ROAS
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Compras
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                CPA
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                CTR
              </th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {adsets.map((adset) => {
              const targetingText = formatTargeting(adset.targeting_summary);
              
              return (
                <tr 
                  key={adset.id}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => onSelectAdSet?.(adset.id)}
                >
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium text-gray-900 text-sm">
                        {adset.name}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                        {adset.optimization_goal && (
                          <span>{adset.optimization_goal.replace(/_/g, ' ')}</span>
                        )}
                        {targetingText && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {targetingText}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <StatusBadge 
                      status={adset.status}
                      showToggle={!!onToggleStatus}
                      onToggle={(newStatus) => handleToggle(adset, newStatus)}
                      size="sm"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-medium text-gray-900">
                      {formatCurrency(adset.metrics.spend)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-medium text-green-600">
                      {formatCurrency(adset.metrics.purchaseValue)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-semibold ${getROASColor(adset.metrics.roas)}`}>
                      {formatROAS(adset.metrics.roas)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm text-gray-900">
                      {formatNumber(adset.metrics.purchases)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm text-gray-900">
                      {formatCurrency(adset.metrics.costPerPurchase)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm text-gray-600">
                      {formatPercent(adset.metrics.ctr)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdSetsTable;
