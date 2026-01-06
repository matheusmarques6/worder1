/**
 * FacebookAdsManager - Componente principal de gerenciamento de Meta Ads
 */

'use client';

import { useState } from 'react';
import { useFacebookAds } from '@/hooks/useFacebookAds';
import { StatusFilter } from '@/types/facebook';
import { KPIGrid } from './KPIGrid';
import { CampaignsTable } from './CampaignsTable';
import { AdSetsTable } from './AdSetsTable';
import { AdsTable } from './AdsTable';
import { DateRangePicker } from './DateRangePicker';
import { AccountSelector } from './AccountSelector';
import { SpendChart } from './SpendChart';
import { 
  ArrowLeft, 
  RefreshCw, 
  AlertCircle,
  Filter,
  Facebook,
  Plus
} from 'lucide-react';

interface FacebookAdsManagerProps {
  storeId: string;
  storeName?: string;
}

export function FacebookAdsManager({ storeId, storeName }: FacebookAdsManagerProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  
  const {
    // Contas
    accounts,
    activeAccounts,
    hasAccounts,
    accountsLoading,
    accountsError,
    connectAccount,
    
    // Seleção
    selectedAccountIds,
    setSelectedAccountIds,
    dateRange,
    setDateRange,
    
    // KPIs
    kpis,
    daily,
    kpisLoading,
    kpisError,
    
    // Campanhas
    campaigns,
    campaignsLoading,
    campaignsError,
    
    // AdSets
    adsets,
    adsetsLoading,
    currentCampaign,
    
    // Ads
    ads,
    adsLoading,
    currentAdSet,
    
    // Navegação
    viewLevel,
    selectCampaign,
    selectAdSet,
    goBack,
    goToCampaigns,
    
    // Ações
    toggleStatus,
    statusLoading,
    
    // Sync
    sync,
    syncing,
    
    // Refresh
    refetchAll,
  } = useFacebookAds(storeId);

  // Se não tem contas conectadas
  if (!accountsLoading && !hasAccounts) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
          <Facebook className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Conecte sua conta Meta Ads
        </h2>
        <p className="text-gray-500 text-center max-w-md mb-6">
          Conecte suas contas de anúncios do Meta (Facebook/Instagram) para visualizar 
          métricas, gerenciar campanhas e acompanhar resultados em tempo real.
        </p>
        <button
          onClick={connectAccount}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          <Plus className="w-5 h-5" />
          Conectar conta Meta
        </button>
      </div>
    );
  }

  // Breadcrumb
  const renderBreadcrumb = () => {
    if (viewLevel === 'campaigns') return null;

    return (
      <div className="flex items-center gap-2 text-sm mb-4">
        <button
          onClick={goToCampaigns}
          className="text-blue-600 hover:underline"
        >
          Campanhas
        </button>
        
        {viewLevel === 'adsets' && currentCampaign && (
          <>
            <span className="text-gray-400">/</span>
            <span className="text-gray-600">{currentCampaign.name}</span>
          </>
        )}
        
        {viewLevel === 'ads' && currentAdSet && (
          <>
            <span className="text-gray-400">/</span>
            <button
              onClick={goBack}
              className="text-blue-600 hover:underline"
            >
              {currentCampaign?.name}
            </button>
            <span className="text-gray-400">/</span>
            <span className="text-gray-600">{currentAdSet.name}</span>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {viewLevel !== 'campaigns' && (
            <button
              onClick={goBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {viewLevel === 'campaigns' && 'Meta Ads'}
              {viewLevel === 'adsets' && currentCampaign?.name}
              {viewLevel === 'ads' && currentAdSet?.name}
            </h1>
            {storeName && viewLevel === 'campaigns' && (
              <p className="text-sm text-gray-500">{storeName}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <AccountSelector
            accounts={accounts}
            selectedIds={selectedAccountIds}
            onChange={setSelectedAccountIds}
            onConnect={connectAccount}
            onSync={sync}
            syncing={syncing}
            loading={accountsLoading}
          />
          
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
          />
          
          <button
            onClick={refetchAll}
            disabled={kpisLoading || campaignsLoading}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-5 h-5 text-gray-600 ${kpisLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      {renderBreadcrumb()}

      {/* Erro */}
      {(accountsError || kpisError || campaignsError) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Erro ao carregar dados</p>
            <p className="text-sm text-red-600 mt-1">
              {accountsError || kpisError || campaignsError}
            </p>
          </div>
        </div>
      )}

      {/* Conteúdo baseado no nível de visualização */}
      {viewLevel === 'campaigns' && (
        <>
          {/* KPIs */}
          <KPIGrid kpis={kpis} loading={kpisLoading} />

          {/* Gráfico */}
          <SpendChart data={daily} loading={kpisLoading} />

          {/* Filtro de status */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <div className="flex bg-gray-100 rounded-lg p-1">
              {(['all', 'active', 'paused'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`
                    px-3 py-1.5 text-sm rounded-md transition-colors
                    ${statusFilter === status 
                      ? 'bg-white shadow text-gray-900' 
                      : 'text-gray-600 hover:text-gray-900'
                    }
                  `}
                >
                  {status === 'all' && 'Todas'}
                  {status === 'active' && 'Ativas'}
                  {status === 'paused' && 'Pausadas'}
                </button>
              ))}
            </div>
            <span className="text-sm text-gray-500 ml-2">
              {campaigns.length} campanha{campaigns.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Tabela de campanhas */}
          <CampaignsTable
            campaigns={campaigns.filter(c => {
              if (statusFilter === 'all') return true;
              if (statusFilter === 'active') return c.status === 'ACTIVE';
              if (statusFilter === 'paused') return c.status === 'PAUSED';
              return true;
            })}
            loading={campaignsLoading}
            onSelectCampaign={selectCampaign}
            onToggleStatus={toggleStatus}
            showAccountColumn={selectedAccountIds.length > 1}
          />
        </>
      )}

      {viewLevel === 'adsets' && (
        <AdSetsTable
          adsets={adsets}
          loading={adsetsLoading}
          onSelectAdSet={selectAdSet}
          onToggleStatus={toggleStatus}
        />
      )}

      {viewLevel === 'ads' && (
        <AdsTable
          ads={ads}
          loading={adsLoading}
          onToggleStatus={toggleStatus}
        />
      )}
    </div>
  );
}

export default FacebookAdsManager;
