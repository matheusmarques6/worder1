/**
 * KPIGrid - Grid de KPIs principais
 */

'use client';

import { KPIs } from '@/types/facebook';
import { KPICard } from './KPICard';
import { 
  formatCurrency, 
  formatNumber, 
  formatPercent, 
  formatROAS 
} from '@/utils/ads-formatting';
import { 
  DollarSign, 
  Eye, 
  MousePointer, 
  ShoppingCart, 
  TrendingUp,
  Target,
  Percent,
  Banknote
} from 'lucide-react';

interface KPIGridProps {
  kpis: KPIs | null;
  loading?: boolean;
}

export function KPIGrid({ kpis, loading }: KPIGridProps) {
  if (!kpis && !loading) {
    return (
      <div className="bg-gray-50 rounded-xl p-8 text-center">
        <p className="text-gray-500">Nenhum dado disponível para o período selecionado</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
      <KPICard
        label="Investimento"
        value={formatCurrency(kpis?.spend.value)}
        comparison={kpis?.spend}
        icon={<DollarSign className="w-4 h-4" />}
        loading={loading}
      />
      
      <KPICard
        label="Receita"
        value={formatCurrency(kpis?.revenue.value)}
        comparison={kpis?.revenue}
        icon={<Banknote className="w-4 h-4" />}
        loading={loading}
      />
      
      <KPICard
        label="ROAS"
        value={formatROAS(kpis?.roas.value)}
        comparison={kpis?.roas}
        icon={<TrendingUp className="w-4 h-4" />}
        loading={loading}
      />
      
      <KPICard
        label="Compras"
        value={formatNumber(kpis?.purchases.value)}
        comparison={kpis?.purchases}
        icon={<ShoppingCart className="w-4 h-4" />}
        loading={loading}
      />
      
      <KPICard
        label="CPA"
        value={formatCurrency(kpis?.cpa.value)}
        comparison={kpis?.cpa}
        icon={<Target className="w-4 h-4" />}
        loading={loading}
        invertColors // Menor CPA é melhor
      />
      
      <KPICard
        label="Impressões"
        value={formatNumber(kpis?.impressions.value)}
        comparison={kpis?.impressions}
        icon={<Eye className="w-4 h-4" />}
        loading={loading}
      />
      
      <KPICard
        label="Cliques"
        value={formatNumber(kpis?.clicks.value)}
        comparison={kpis?.clicks}
        icon={<MousePointer className="w-4 h-4" />}
        loading={loading}
      />
      
      <KPICard
        label="CTR"
        value={formatPercent(kpis?.ctr.value)}
        comparison={kpis?.ctr}
        icon={<Percent className="w-4 h-4" />}
        loading={loading}
      />
      
      <KPICard
        label="CPC"
        value={formatCurrency(kpis?.cpc.value)}
        comparison={kpis?.cpc}
        icon={<MousePointer className="w-4 h-4" />}
        loading={loading}
        invertColors // Menor CPC é melhor
      />
    </div>
  );
}

export default KPIGrid;
