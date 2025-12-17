'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronUp,
  ChevronDown,
  BarChart3,
  MoreHorizontal,
  ExternalLink,
} from 'lucide-react';
import { formatNumber, formatPercent, STATUS_CONFIG } from '@/types/whatsapp-analytics';
import type { CampaignWithMetrics, CampaignStatus } from '@/types/whatsapp-analytics';

interface CampaignTableProps {
  campaigns: CampaignWithMetrics[];
  onViewDetails?: (campaignId: string) => void;
}

type SortField = 'title' | 'sent' | 'delivered' | 'read' | 'delivery_rate' | 'read_rate' | 'created_at';
type SortOrder = 'asc' | 'desc';

export function CampaignTable({ campaigns, onViewDetails }: CampaignTableProps) {
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const sortedCampaigns = [...campaigns].sort((a, b) => {
    let aVal: any = a[sortField];
    let bVal: any = b[sortField];

    if (sortField === 'created_at') {
      aVal = new Date(aVal).getTime();
      bVal = new Date(bVal).getTime();
    }

    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : -1;
    }
    return aVal < bVal ? 1 : -1;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.4 }}
      className="bg-dark-800/50 rounded-xl border border-dark-700/50 overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-dark-700/50">
        <h3 className="text-lg font-semibold text-white">Campanhas</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-dark-900/50">
              <SortableHeader
                label="Campanha"
                field="title"
                currentField={sortField}
                currentOrder={sortOrder}
                onSort={handleSort}
              />
              <th className="px-4 py-3 text-left text-xs font-medium text-dark-400 uppercase">
                Status
              </th>
              <SortableHeader
                label="Enviadas"
                field="sent"
                currentField={sortField}
                currentOrder={sortOrder}
                onSort={handleSort}
                align="right"
              />
              <SortableHeader
                label="Entregues"
                field="delivered"
                currentField={sortField}
                currentOrder={sortOrder}
                onSort={handleSort}
                align="right"
              />
              <SortableHeader
                label="Lidas"
                field="read"
                currentField={sortField}
                currentOrder={sortOrder}
                onSort={handleSort}
                align="right"
              />
              <SortableHeader
                label="Taxa Entrega"
                field="delivery_rate"
                currentField={sortField}
                currentOrder={sortOrder}
                onSort={handleSort}
                align="right"
              />
              <SortableHeader
                label="Taxa Leitura"
                field="read_rate"
                currentField={sortField}
                currentOrder={sortOrder}
                onSort={handleSort}
                align="right"
              />
              <th className="px-4 py-3 text-center text-xs font-medium text-dark-400 uppercase">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-700/50">
            {sortedCampaigns.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-dark-400">
                  Nenhuma campanha encontrada no período selecionado
                </td>
              </tr>
            ) : (
              sortedCampaigns.map((campaign) => (
                <CampaignRow
                  key={campaign.id}
                  campaign={campaign}
                  onViewDetails={onViewDetails}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

interface SortableHeaderProps {
  label: string;
  field: SortField;
  currentField: SortField;
  currentOrder: SortOrder;
  onSort: (field: SortField) => void;
  align?: 'left' | 'right';
}

function SortableHeader({ label, field, currentField, currentOrder, onSort, align = 'left' }: SortableHeaderProps) {
  const isActive = currentField === field;

  return (
    <th
      className={`px-4 py-3 text-xs font-medium text-dark-400 uppercase cursor-pointer hover:text-dark-300 transition-colors ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
      onClick={() => onSort(field)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        <span>{label}</span>
        <div className="flex flex-col">
          <ChevronUp
            className={`w-3 h-3 -mb-1 ${
              isActive && currentOrder === 'asc' ? 'text-primary-400' : 'text-dark-600'
            }`}
          />
          <ChevronDown
            className={`w-3 h-3 ${
              isActive && currentOrder === 'desc' ? 'text-primary-400' : 'text-dark-600'
            }`}
          />
        </div>
      </div>
    </th>
  );
}

interface CampaignRowProps {
  campaign: CampaignWithMetrics;
  onViewDetails?: (campaignId: string) => void;
}

function CampaignRow({ campaign, onViewDetails }: CampaignRowProps) {
  const statusConfig = STATUS_CONFIG[campaign.status as CampaignStatus] || STATUS_CONFIG.PENDING;

  return (
    <tr className="hover:bg-dark-700/20 transition-colors">
      <td className="px-4 py-4">
        <div>
          <p className="text-sm font-medium text-white truncate max-w-[200px]">
            {campaign.title}
          </p>
          <p className="text-xs text-dark-400 mt-0.5">
            {campaign.template_name}
          </p>
        </div>
      </td>
      <td className="px-4 py-4">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
          {statusConfig.label}
        </span>
      </td>
      <td className="px-4 py-4 text-right">
        <span className="text-sm text-white">{formatNumber(campaign.sent)}</span>
      </td>
      <td className="px-4 py-4 text-right">
        <span className="text-sm text-emerald-400">{formatNumber(campaign.delivered)}</span>
      </td>
      <td className="px-4 py-4 text-right">
        <span className="text-sm text-cyan-400">{formatNumber(campaign.read)}</span>
      </td>
      <td className="px-4 py-4 text-right">
        <RateBadge value={campaign.delivery_rate} type="delivery" />
      </td>
      <td className="px-4 py-4 text-right">
        <RateBadge value={campaign.read_rate} type="read" />
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => onViewDetails?.(campaign.id)}
            className="p-2 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
            title="Ver detalhes"
          >
            <BarChart3 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

interface RateBadgeProps {
  value: number;
  type: 'delivery' | 'read';
}

function RateBadge({ value, type }: RateBadgeProps) {
  let colorClass = 'text-dark-400';
  
  if (type === 'delivery') {
    if (value >= 95) colorClass = 'text-emerald-400';
    else if (value >= 85) colorClass = 'text-yellow-400';
    else colorClass = 'text-red-400';
  } else {
    if (value >= 70) colorClass = 'text-emerald-400';
    else if (value >= 50) colorClass = 'text-yellow-400';
    else colorClass = 'text-orange-400';
  }

  return (
    <span className={`text-sm font-medium ${colorClass}`}>
      {formatPercent(value)}
    </span>
  );
}

export default CampaignTable;
