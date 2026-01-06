/**
 * API: /api/meta/campaigns
 * 
 * GET - Busca campanhas com métricas em tempo real da Graph API
 * 
 * Query params:
 * - store_id: UUID (obrigatório)
 * - account_ids: string (opcional) - IDs separados por vírgula
 * - date_from: YYYY-MM-DD (default: 7 dias atrás)
 * - date_to: YYYY-MM-DD (default: hoje)
 * - status: all | active | paused (default: all)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { 
  MetaApiClient, 
  MetaApiClientError,
  extractPurchaseMetrics, 
  formatBudget,
  MetaAccount 
} from '@/lib/meta-api';

// GET - Buscar campanhas com métricas
export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  // Parse query params
  const storeId = request.nextUrl.searchParams.get('store_id');
  const accountIdsParam = request.nextUrl.searchParams.get('account_ids');
  const statusFilter = request.nextUrl.searchParams.get('status') || 'all';
  
  // Default date range: últimos 7 dias
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const dateFrom = request.nextUrl.searchParams.get('date_from') || sevenDaysAgo.toISOString().split('T')[0];
  const dateTo = request.nextUrl.searchParams.get('date_to') || today.toISOString().split('T')[0];

  if (!storeId) {
    return NextResponse.json(
      { error: 'store_id is required' },
      { status: 400 }
    );
  }

  try {
    // Validar que a loja pertence à organização
    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('id, name')
      .eq('id', storeId)
      .eq('organization_id', organizationId)
      .single();

    if (storeError || !store) {
      return NextResponse.json(
        { error: 'Store not found or access denied' },
        { status: 403 }
      );
    }

    // Buscar contas ativas da loja
    let accountsQuery = supabase
      .from('meta_accounts')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .eq('status', 'connected');

    // Se account_ids foi especificado, filtrar
    if (accountIdsParam) {
      const accountIds = accountIdsParam.split(',').map(id => id.trim());
      accountsQuery = accountsQuery.in('id', accountIds);
    }

    const { data: accounts, error: accountsError } = await accountsQuery;

    if (accountsError) {
      throw accountsError;
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        campaigns: [],
        totals: null,
        by_account: [],
        meta: {
          date_from: dateFrom,
          date_to: dateTo,
          accounts_count: 0,
          campaigns_count: 0,
        }
      });
    }

    // Buscar campanhas e insights de cada conta
    const allCampaigns: any[] = [];
    const accountBreakdowns: any[] = [];
    const totals = {
      spend: 0,
      impressions: 0,
      clicks: 0,
      reach: 0,
      purchases: 0,
      purchase_value: 0,
    };

    for (const account of accounts as MetaAccount[]) {
      try {
        const client = new MetaApiClient(account.access_token);
        
        // Buscar campanhas
        const campaigns = await client.getCampaigns(account.ad_account_id);
        
        // Filtrar por status se necessário
        const filteredCampaigns = campaigns.filter(campaign => {
          if (statusFilter === 'all') return true;
          if (statusFilter === 'active') return campaign.status === 'ACTIVE';
          if (statusFilter === 'paused') return campaign.status === 'PAUSED';
          return true;
        });

        // Buscar insights para cada campanha
        let accountSpend = 0;
        let accountPurchases = 0;
        let accountPurchaseValue = 0;

        for (const campaign of filteredCampaigns) {
          try {
            const insights = await client.getInsights(campaign.id, dateFrom, dateTo);
            const insight = insights[0] || {};
            
            const baseMetrics = {
              spend: parseFloat(insight.spend || '0'),
              impressions: parseInt(insight.impressions || '0'),
              clicks: parseInt(insight.clicks || '0'),
              reach: parseInt(insight.reach || '0'),
              ctr: parseFloat(insight.ctr || '0'),
              cpc: parseFloat(insight.cpc || '0'),
              cpm: parseFloat(insight.cpm || '0'),
              frequency: parseFloat(insight.frequency || '0'),
            };

            const purchaseMetrics = extractPurchaseMetrics(insight);

            allCampaigns.push({
              id: campaign.id,
              name: campaign.name,
              status: campaign.status,
              objective: campaign.objective,
              daily_budget: formatBudget(campaign.daily_budget),
              lifetime_budget: formatBudget(campaign.lifetime_budget),
              created_time: campaign.created_time,
              metrics: {
                ...baseMetrics,
                ...purchaseMetrics,
              },
              account_id: account.id,
              account_name: account.ad_account_name,
              ad_account_id: account.ad_account_id,
            });

            // Acumular totais
            totals.spend += baseMetrics.spend;
            totals.impressions += baseMetrics.impressions;
            totals.clicks += baseMetrics.clicks;
            totals.reach += baseMetrics.reach;
            totals.purchases += purchaseMetrics.purchases;
            totals.purchase_value += purchaseMetrics.purchaseValue;

            // Acumular por conta
            accountSpend += baseMetrics.spend;
            accountPurchases += purchaseMetrics.purchases;
            accountPurchaseValue += purchaseMetrics.purchaseValue;

          } catch (insightError) {
            // Se falhar ao buscar insights de uma campanha, incluir sem métricas
            console.warn(`Failed to fetch insights for campaign ${campaign.id}:`, insightError);
            allCampaigns.push({
              id: campaign.id,
              name: campaign.name,
              status: campaign.status,
              objective: campaign.objective,
              daily_budget: formatBudget(campaign.daily_budget),
              lifetime_budget: formatBudget(campaign.lifetime_budget),
              created_time: campaign.created_time,
              metrics: {
                spend: 0,
                impressions: 0,
                clicks: 0,
                reach: 0,
                ctr: 0,
                cpc: 0,
                cpm: 0,
                frequency: 0,
                purchases: 0,
                purchaseValue: 0,
                costPerPurchase: 0,
                roas: 0,
              },
              account_id: account.id,
              account_name: account.ad_account_name,
              ad_account_id: account.ad_account_id,
            });
          }
        }

        // Adicionar breakdown da conta
        accountBreakdowns.push({
          account_id: account.id,
          account_name: account.ad_account_name,
          ad_account_id: account.ad_account_id,
          spend: accountSpend,
          purchases: accountPurchases,
          revenue: accountPurchaseValue,
          roas: accountSpend > 0 ? accountPurchaseValue / accountSpend : 0,
          campaigns_count: filteredCampaigns.length,
        });

      } catch (accountError) {
        // Se falhar com uma conta (ex: token expirado), marcar erro
        console.error(`Failed to fetch campaigns for account ${account.ad_account_id}:`, accountError);
        
        if (accountError instanceof MetaApiClientError && accountError.needsReconnect) {
          // Marcar conta como expirada
          await supabase
            .from('meta_accounts')
            .update({ status: 'expired' })
            .eq('id', account.id);
        }

        accountBreakdowns.push({
          account_id: account.id,
          account_name: account.ad_account_name,
          ad_account_id: account.ad_account_id,
          error: accountError instanceof MetaApiClientError 
            ? accountError.message 
            : 'Failed to fetch data',
          needs_reconnect: accountError instanceof MetaApiClientError && accountError.needsReconnect,
        });
      }
    }

    // Calcular share de cada conta
    const totalSpend = totals.spend;
    accountBreakdowns.forEach(breakdown => {
      if (!breakdown.error) {
        breakdown.share_spend = totalSpend > 0 ? (breakdown.spend / totalSpend) * 100 : 0;
      }
    });

    // Ordenar campanhas por gasto (maior primeiro)
    allCampaigns.sort((a, b) => (b.metrics?.spend || 0) - (a.metrics?.spend || 0));

    // Calcular métricas agregadas
    const calculatedTotals = {
      ...totals,
      roas: totals.spend > 0 ? totals.purchase_value / totals.spend : 0,
      cpa: totals.purchases > 0 ? totals.spend / totals.purchases : 0,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
      cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
    };

    return NextResponse.json({
      campaigns: allCampaigns,
      totals: calculatedTotals,
      by_account: accountBreakdowns,
      meta: {
        date_from: dateFrom,
        date_to: dateTo,
        accounts_count: accounts.length,
        campaigns_count: allCampaigns.length,
      }
    });

  } catch (error: any) {
    console.error('Error fetching meta campaigns:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch campaigns' },
      { status: 500 }
    );
  }
}
