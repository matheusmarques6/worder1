/**
 * AdsTable - Tabela de anúncios
 */

'use client';

import { MetaAd, ObjectType } from '@/types/facebook';
import { StatusBadge } from './StatusBadge';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatROAS,
  getROASColor,
} from '@/utils/ads-formatting';
import { Image as ImageIcon, ExternalLink } from 'lucide-react';

interface AdsTableProps {
  ads: MetaAd[];
  loading?: boolean;
  onToggleStatus?: (objectId: string, objectType: ObjectType, newStatus: 'ACTIVE' | 'PAUSED') => Promise<any>;
}

export function AdsTable({ 
  ads, 
  loading, 
  onToggleStatus
}: AdsTableProps) {
  const handleToggle = async (ad: MetaAd, newStatus: 'ACTIVE' | 'PAUSED') => {
    if (onToggleStatus) {
      await onToggleStatus(ad.id, 'ad', newStatus);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="animate-pulse">
          <div className="h-12 bg-gray-50 border-b" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 border-b last:border-0 flex items-center px-4">
              <div className="h-4 bg-gray-200 rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (ads.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-gray-500">Nenhum anúncio encontrado</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Anúncio
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
                Impressões
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Cliques
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                CTR
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ads.map((ad) => (
              <tr 
                key={ad.id}
                className="hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {/* Thumbnail */}
                    <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {ad.creative?.thumbnail_url ? (
                        <img 
                          src={ad.creative.thumbnail_url} 
                          alt={ad.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                    
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 text-sm truncate">
                        {ad.name}
                      </div>
                      {ad.creative?.title && (
                        <div className="text-xs text-gray-500 truncate mt-0.5">
                          {ad.creative.title}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge 
                    status={ad.status}
                    showToggle={!!onToggleStatus}
                    onToggle={(newStatus) => handleToggle(ad, newStatus)}
                    size="sm"
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm font-medium text-gray-900">
                    {formatCurrency(ad.metrics.spend)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm font-medium text-green-600">
                    {formatCurrency(ad.metrics.purchaseValue)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`text-sm font-semibold ${getROASColor(ad.metrics.roas)}`}>
                    {formatROAS(ad.metrics.roas)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm text-gray-900">
                    {formatNumber(ad.metrics.purchases)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm text-gray-900">
                    {formatCurrency(ad.metrics.costPerPurchase)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm text-gray-600">
                    {formatNumber(ad.metrics.impressions)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm text-gray-600">
                    {formatNumber(ad.metrics.clicks)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm text-gray-600">
                    {formatPercent(ad.metrics.ctr)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdsTable;
