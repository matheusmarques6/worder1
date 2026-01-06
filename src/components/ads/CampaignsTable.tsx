/**
 * CampaignsTable - Tabela de campanhas com métricas
 */

'use client';

import { MetaCampaign, ObjectType } from '@/types/facebook';
import { StatusBadge } from './StatusBadge';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatROAS,
  getROASColor,
  getObjectiveLabel,
  formatBudget,
} from '@/utils/ads-formatting';
import { ChevronRight, ExternalLink } from 'lucide-react';

interface CampaignsTableProps {
  campaigns: MetaCampaign[];
  loading?: boolean;
  onSelectCampaign?: (campaignId: string) => void;
  onToggleStatus?: (objectId: string, objectType: ObjectType, newStatus: 'ACTIVE' | 'PAUSED') => Promise<any>;
  showAccountColumn?: boolean;
}

export function CampaignsTable({ 
  campaigns, 
  loading, 
  onSelectCampaign,
  onToggleStatus,
  showAccountColumn = true
}: CampaignsTableProps) {
  const handleToggle = async (campaign: MetaCampaign, newStatus: 'ACTIVE' | 'PAUSED') => {
    if (onToggleStatus) {
      await onToggleStatus(campaign.id, 'campaign', newStatus);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="animate-pulse">
          <div className="h-12 bg-gray-50 border-b" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 border-b last:border-0 flex items-center px-4">
              <div className="h-4 bg-gray-200 rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-gray-500">Nenhuma campanha encontrada</p>
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
                Campanha
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              {showAccountColumn && (
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Conta
                </th>
              )}
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
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {campaigns.map((campaign) => (
              <tr 
                key={campaign.id}
                className="hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => onSelectCampaign?.(campaign.id)}
              >
                <td className="px-4 py-3">
                  <div>
                    <div className="font-medium text-gray-900 text-sm">
                      {campaign.name}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {getObjectiveLabel(campaign.objective)}
                      {campaign.daily_budget || campaign.lifetime_budget ? (
                        <span className="ml-2">
                          • {formatBudget(campaign.daily_budget, campaign.lifetime_budget)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <StatusBadge 
                    status={campaign.status}
                    showToggle={!!onToggleStatus}
                    onToggle={(newStatus) => handleToggle(campaign, newStatus)}
                    size="sm"
                  />
                </td>
                {showAccountColumn && (
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-600">{campaign.account_name}</span>
                  </td>
                )}
                <td className="px-4 py-3 text-right">
                  <span className="text-sm font-medium text-gray-900">
                    {formatCurrency(campaign.metrics.spend)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm font-medium text-green-600">
                    {formatCurrency(campaign.metrics.purchaseValue)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`text-sm font-semibold ${getROASColor(campaign.metrics.roas)}`}>
                    {formatROAS(campaign.metrics.roas)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm text-gray-900">
                    {formatNumber(campaign.metrics.purchases)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm text-gray-900">
                    {formatCurrency(campaign.metrics.costPerPurchase)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm text-gray-600">
                    {formatNumber(campaign.metrics.impressions)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm text-gray-600">
                    {formatNumber(campaign.metrics.clicks)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm text-gray-600">
                    {formatPercent(campaign.metrics.ctr)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CampaignsTable;
