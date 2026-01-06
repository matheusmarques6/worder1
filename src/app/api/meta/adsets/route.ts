/**
 * API: /api/meta/adsets
 * 
 * GET - Busca ad sets de uma campanha com métricas em tempo real
 * 
 * Query params:
 * - store_id: UUID (obrigatório)
 * - campaign_id: string (obrigatório) - ID da campanha no Meta
 * - date_from: YYYY-MM-DD
 * - date_to: YYYY-MM-DD
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { 
  MetaApiClient, 
  MetaApiClientError,
  extractPurchaseMetrics, 
  formatBudget 
} from '@/lib/meta-api';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  // Parse query params
  const storeId = request.nextUrl.searchParams.get('store_id');
  const campaignId = request.nextUrl.searchParams.get('campaign_id');
  
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const dateFrom = request.nextUrl.searchParams.get('date_from') || sevenDaysAgo.toISOString().split('T')[0];
  const dateTo = request.nextUrl.searchParams.get('date_to') || today.toISOString().split('T')[0];

  if (!storeId) {
    return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
  }

  if (!campaignId) {
    return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 });
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

    // Buscar todas as contas ativas da loja para encontrar a que tem esta campanha
    const { data: accounts, error: accountsError } = await supabase
      .from('meta_accounts')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .eq('status', 'connected');

    if (accountsError || !accounts || accounts.length === 0) {
      return NextResponse.json(
        { error: 'No active Meta accounts found' },
        { status: 404 }
      );
    }

    // Tentar buscar ad sets em cada conta até encontrar
    let adsets: any[] = [];
    let campaignInfo: any = null;
    let usedAccount: any = null;

    for (const account of accounts) {
      try {
        const client = new MetaApiClient(account.access_token);
        
        // Tentar buscar a campanha para validar que existe nesta conta
        try {
          const campaignData = await client.get(`/${campaignId}`, {
            fields: 'id,name,status,objective'
          });
          campaignInfo = campaignData;
          usedAccount = account;
        } catch {
          // Campanha não existe nesta conta, tentar próxima
          continue;
        }

        // Buscar ad sets da campanha
        const adSetsData = await client.getAdSets(campaignId);
        
        // Buscar insights para cada ad set
        for (const adset of adSetsData) {
          try {
            const insights = await client.getInsights(adset.id, dateFrom, dateTo);
            const insight = insights[0] || {};
            
            const baseMetrics = {
              spend: parseFloat(insight.spend || '0'),
              impressions: parseInt(insight.impressions || '0'),
              clicks: parseInt(insight.clicks || '0'),
              ctr: parseFloat(insight.ctr || '0'),
              cpc: parseFloat(insight.cpc || '0'),
              cpm: parseFloat(insight.cpm || '0'),
            };

            const purchaseMetrics = extractPurchaseMetrics(insight);

            // Extrair resumo do targeting
            const targetingSummary = adset.targeting ? {
              age_min: adset.targeting.age_min,
              age_max: adset.targeting.age_max,
              genders: adset.targeting.genders,
              geo_locations: adset.targeting.geo_locations?.countries || 
                            adset.targeting.geo_locations?.regions?.map((r: any) => r.name) ||
                            [],
            } : null;

            adsets.push({
              id: adset.id,
              name: adset.name,
              status: adset.status,
              campaign_id: campaignId,
              daily_budget: formatBudget(adset.daily_budget),
              lifetime_budget: formatBudget(adset.lifetime_budget),
              optimization_goal: adset.optimization_goal,
              targeting_summary: targetingSummary,
              metrics: {
                ...baseMetrics,
                ...purchaseMetrics,
              },
            });

          } catch (insightError) {
            console.warn(`Failed to fetch insights for adset ${adset.id}:`, insightError);
            adsets.push({
              id: adset.id,
              name: adset.name,
              status: adset.status,
              campaign_id: campaignId,
              daily_budget: formatBudget(adset.daily_budget),
              lifetime_budget: formatBudget(adset.lifetime_budget),
              optimization_goal: adset.optimization_goal,
              metrics: {
                spend: 0,
                impressions: 0,
                clicks: 0,
                ctr: 0,
                cpc: 0,
                cpm: 0,
                purchases: 0,
                purchaseValue: 0,
                costPerPurchase: 0,
                roas: 0,
              },
            });
          }
        }

        // Encontrou a campanha, não precisa continuar
        break;

      } catch (accountError) {
        console.warn(`Error with account ${account.ad_account_id}:`, accountError);
        
        if (accountError instanceof MetaApiClientError && accountError.needsReconnect) {
          await supabase
            .from('meta_accounts')
            .update({ status: 'expired' })
            .eq('id', account.id);
        }
        continue;
      }
    }

    if (!campaignInfo) {
      return NextResponse.json(
        { error: 'Campaign not found in any connected account' },
        { status: 404 }
      );
    }

    // Calcular totais
    const totals = adsets.reduce((acc, adset) => ({
      spend: acc.spend + (adset.metrics?.spend || 0),
      purchases: acc.purchases + (adset.metrics?.purchases || 0),
      revenue: acc.revenue + (adset.metrics?.purchaseValue || 0),
    }), { spend: 0, purchases: 0, revenue: 0 });

    totals.roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;

    // Ordenar por gasto
    adsets.sort((a, b) => (b.metrics?.spend || 0) - (a.metrics?.spend || 0));

    return NextResponse.json({
      adsets,
      totals,
      campaign: {
        id: campaignInfo.id,
        name: campaignInfo.name,
        status: campaignInfo.status,
        objective: campaignInfo.objective,
      },
      meta: {
        date_from: dateFrom,
        date_to: dateTo,
        adsets_count: adsets.length,
      }
    });

  } catch (error: any) {
    console.error('Error fetching meta adsets:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch ad sets' },
      { status: 500 }
    );
  }
}
