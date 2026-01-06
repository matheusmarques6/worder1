/**
 * API: /api/meta/insights
 * 
 * GET - Retorna métricas agregadas (KPIs) para o dashboard
 * 
 * Query params:
 * - store_id: UUID (obrigatório)
 * - account_ids: string (opcional) - IDs separados por vírgula
 * - date_from: YYYY-MM-DD
 * - date_to: YYYY-MM-DD
 * - compare: boolean - Se true, inclui período anterior para comparação
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { 
  MetaApiClient, 
  MetaApiClientError,
  extractPurchaseMetrics,
  MetaAccount 
} from '@/lib/meta-api';

interface KPIValue {
  value: number;
  previous?: number;
  change_percent?: number;
}

interface DailyMetric {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  // Parse query params
  const storeId = request.nextUrl.searchParams.get('store_id');
  const accountIdsParam = request.nextUrl.searchParams.get('account_ids');
  const compareParam = request.nextUrl.searchParams.get('compare');
  const shouldCompare = compareParam === 'true';
  
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const dateFrom = request.nextUrl.searchParams.get('date_from') || sevenDaysAgo.toISOString().split('T')[0];
  const dateTo = request.nextUrl.searchParams.get('date_to') || today.toISOString().split('T')[0];

  if (!storeId) {
    return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
  }

  try {
    // Validar que a loja pertence à organização
    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('id')
      .eq('id', storeId)
      .eq('organization_id', organizationId)
      .single();

    if (storeError || !store) {
      return NextResponse.json(
        { error: 'Store not found or access denied' },
        { status: 403 }
      );
    }

    // Buscar contas ativas
    let accountsQuery = supabase
      .from('meta_accounts')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .eq('status', 'connected');

    if (accountIdsParam) {
      const accountIds = accountIdsParam.split(',').map(id => id.trim());
      accountsQuery = accountsQuery.in('id', accountIds);
    }

    const { data: accounts, error: accountsError } = await accountsQuery;

    if (accountsError || !accounts || accounts.length === 0) {
      return NextResponse.json({
        kpis: null,
        daily: [],
        by_account: [],
      });
    }

    // Calcular período anterior para comparação
    const fromDate = new Date(dateFrom);
    const toDate = new Date(dateTo);
    const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    
    const previousFrom = new Date(fromDate);
    previousFrom.setDate(previousFrom.getDate() - daysDiff - 1);
    const previousTo = new Date(fromDate);
    previousTo.setDate(previousTo.getDate() - 1);

    // Agregar métricas de todas as contas
    const currentMetrics = {
      spend: 0,
      impressions: 0,
      clicks: 0,
      reach: 0,
      purchases: 0,
      revenue: 0,
    };

    const previousMetrics = {
      spend: 0,
      impressions: 0,
      clicks: 0,
      reach: 0,
      purchases: 0,
      revenue: 0,
    };

    const dailyData: Map<string, DailyMetric> = new Map();
    const accountBreakdowns: any[] = [];

    for (const account of accounts as MetaAccount[]) {
      try {
        const client = new MetaApiClient(account.access_token);
        
        // Buscar insights do período atual com breakdown diário
        const currentInsights = await client.get(`/act_${account.ad_account_id}/insights`, {
          fields: 'date_start,spend,impressions,reach,clicks,actions,action_values',
          time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
          time_increment: '1',
          level: 'account',
        });

        let accountSpend = 0;
        let accountPurchases = 0;
        let accountRevenue = 0;

        // Processar dados diários
        for (const insight of currentInsights.data || []) {
          const spend = parseFloat(insight.spend || '0');
          const impressions = parseInt(insight.impressions || '0');
          const clicks = parseInt(insight.clicks || '0');
          const reach = parseInt(insight.reach || '0');
          const purchaseData = extractPurchaseMetrics(insight);

          currentMetrics.spend += spend;
          currentMetrics.impressions += impressions;
          currentMetrics.clicks += clicks;
          currentMetrics.reach += reach;
          currentMetrics.purchases += purchaseData.purchases;
          currentMetrics.revenue += purchaseData.purchaseValue;

          accountSpend += spend;
          accountPurchases += purchaseData.purchases;
          accountRevenue += purchaseData.purchaseValue;

          // Agregar por dia
          const date = insight.date_start;
          const existing = dailyData.get(date) || {
            date,
            spend: 0,
            impressions: 0,
            clicks: 0,
            purchases: 0,
            revenue: 0,
          };

          dailyData.set(date, {
            date,
            spend: existing.spend + spend,
            impressions: existing.impressions + impressions,
            clicks: existing.clicks + clicks,
            purchases: existing.purchases + purchaseData.purchases,
            revenue: existing.revenue + purchaseData.purchaseValue,
          });
        }

        // Buscar insights do período anterior para comparação
        if (shouldCompare) {
          try {
            const previousInsights = await client.get(`/act_${account.ad_account_id}/insights`, {
              fields: 'spend,impressions,reach,clicks,actions,action_values',
              time_range: JSON.stringify({ 
                since: previousFrom.toISOString().split('T')[0], 
                until: previousTo.toISOString().split('T')[0] 
              }),
              level: 'account',
            });

            for (const insight of previousInsights.data || []) {
              const spend = parseFloat(insight.spend || '0');
              const impressions = parseInt(insight.impressions || '0');
              const clicks = parseInt(insight.clicks || '0');
              const reach = parseInt(insight.reach || '0');
              const purchaseData = extractPurchaseMetrics(insight);

              previousMetrics.spend += spend;
              previousMetrics.impressions += impressions;
              previousMetrics.clicks += clicks;
              previousMetrics.reach += reach;
              previousMetrics.purchases += purchaseData.purchases;
              previousMetrics.revenue += purchaseData.purchaseValue;
            }
          } catch (prevError) {
            console.warn('Failed to fetch previous period insights:', prevError);
          }
        }

        // Adicionar breakdown da conta
        accountBreakdowns.push({
          account_id: account.id,
          account_name: account.ad_account_name,
          ad_account_id: account.ad_account_id,
          spend: accountSpend,
          purchases: accountPurchases,
          revenue: accountRevenue,
          roas: accountSpend > 0 ? accountRevenue / accountSpend : 0,
        });

      } catch (accountError) {
        console.error(`Error fetching insights for account ${account.ad_account_id}:`, accountError);
        
        if (accountError instanceof MetaApiClientError && accountError.needsReconnect) {
          await supabase
            .from('meta_accounts')
            .update({ status: 'expired' })
            .eq('id', account.id);
        }

        accountBreakdowns.push({
          account_id: account.id,
          account_name: account.ad_account_name,
          ad_account_id: account.ad_account_id,
          error: 'Failed to fetch data',
          needs_reconnect: accountError instanceof MetaApiClientError && accountError.needsReconnect,
        });
      }
    }

    // Calcular share de cada conta
    const totalSpend = currentMetrics.spend;
    accountBreakdowns.forEach(breakdown => {
      if (!breakdown.error) {
        breakdown.share_spend = totalSpend > 0 ? (breakdown.spend / totalSpend) * 100 : 0;
      }
    });

    // Calcular métricas derivadas
    const calculateDerivedMetrics = (metrics: typeof currentMetrics) => ({
      ctr: metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0,
      cpc: metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0,
      cpm: metrics.impressions > 0 ? (metrics.spend / metrics.impressions) * 1000 : 0,
      roas: metrics.spend > 0 ? metrics.revenue / metrics.spend : 0,
      cpa: metrics.purchases > 0 ? metrics.spend / metrics.purchases : 0,
    });

    const currentDerived = calculateDerivedMetrics(currentMetrics);
    const previousDerived = shouldCompare ? calculateDerivedMetrics(previousMetrics) : null;

    // Calcular variação percentual
    const calcChange = (current: number, previous: number): number | undefined => {
      if (!shouldCompare || previous === 0) return undefined;
      return ((current - previous) / previous) * 100;
    };

    // Montar KPIs
    const kpis: Record<string, KPIValue> = {
      spend: {
        value: currentMetrics.spend,
        previous: shouldCompare ? previousMetrics.spend : undefined,
        change_percent: calcChange(currentMetrics.spend, previousMetrics.spend),
      },
      impressions: {
        value: currentMetrics.impressions,
        previous: shouldCompare ? previousMetrics.impressions : undefined,
        change_percent: calcChange(currentMetrics.impressions, previousMetrics.impressions),
      },
      clicks: {
        value: currentMetrics.clicks,
        previous: shouldCompare ? previousMetrics.clicks : undefined,
        change_percent: calcChange(currentMetrics.clicks, previousMetrics.clicks),
      },
      ctr: {
        value: currentDerived.ctr,
        previous: previousDerived?.ctr,
        change_percent: calcChange(currentDerived.ctr, previousDerived?.ctr || 0),
      },
      cpc: {
        value: currentDerived.cpc,
        previous: previousDerived?.cpc,
        change_percent: calcChange(currentDerived.cpc, previousDerived?.cpc || 0),
      },
      purchases: {
        value: currentMetrics.purchases,
        previous: shouldCompare ? previousMetrics.purchases : undefined,
        change_percent: calcChange(currentMetrics.purchases, previousMetrics.purchases),
      },
      revenue: {
        value: currentMetrics.revenue,
        previous: shouldCompare ? previousMetrics.revenue : undefined,
        change_percent: calcChange(currentMetrics.revenue, previousMetrics.revenue),
      },
      roas: {
        value: currentDerived.roas,
        previous: previousDerived?.roas,
        change_percent: calcChange(currentDerived.roas, previousDerived?.roas || 0),
      },
      cpa: {
        value: currentDerived.cpa,
        previous: previousDerived?.cpa,
        change_percent: calcChange(currentDerived.cpa, previousDerived?.cpa || 0),
      },
    };

    // Converter dailyData para array ordenado
    const daily = Array.from(dailyData.values()).sort((a, b) => 
      a.date.localeCompare(b.date)
    );

    return NextResponse.json({
      kpis,
      daily,
      by_account: accountBreakdowns,
    });

  } catch (error: any) {
    console.error('Error fetching meta insights:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch insights' },
      { status: 500 }
    );
  }
}
