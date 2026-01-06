/**
 * API: /api/meta/ads
 * 
 * GET - Busca anúncios de um ad set com métricas em tempo real
 * 
 * Query params:
 * - store_id: UUID (obrigatório)
 * - adset_id: string (obrigatório) - ID do ad set no Meta
 * - date_from: YYYY-MM-DD
 * - date_to: YYYY-MM-DD
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { 
  MetaApiClient, 
  MetaApiClientError,
  extractPurchaseMetrics 
} from '@/lib/meta-api';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  // Parse query params
  const storeId = request.nextUrl.searchParams.get('store_id');
  const adsetId = request.nextUrl.searchParams.get('adset_id');
  
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const dateFrom = request.nextUrl.searchParams.get('date_from') || sevenDaysAgo.toISOString().split('T')[0];
  const dateTo = request.nextUrl.searchParams.get('date_to') || today.toISOString().split('T')[0];

  if (!storeId) {
    return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
  }

  if (!adsetId) {
    return NextResponse.json({ error: 'adset_id is required' }, { status: 400 });
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

    // Buscar todas as contas ativas da loja
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

    // Tentar buscar ads em cada conta até encontrar
    let ads: any[] = [];
    let adsetInfo: any = null;

    for (const account of accounts) {
      try {
        const client = new MetaApiClient(account.access_token);
        
        // Tentar buscar o ad set para validar que existe nesta conta
        try {
          const adsetData = await client.get(`/${adsetId}`, {
            fields: 'id,name,status,campaign_id'
          });
          adsetInfo = adsetData;
        } catch {
          // Ad set não existe nesta conta, tentar próxima
          continue;
        }

        // Buscar anúncios do ad set
        const adsData = await client.getAds(adsetId);
        
        // Buscar insights para cada anúncio
        for (const ad of adsData) {
          try {
            const insights = await client.getInsights(ad.id, dateFrom, dateTo);
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

            ads.push({
              id: ad.id,
              name: ad.name,
              status: ad.status,
              adset_id: adsetId,
              creative: ad.creative ? {
                id: ad.creative.id,
                thumbnail_url: ad.creative.thumbnail_url || null,
                title: ad.creative.title || null,
                body: ad.creative.body || null,
              } : null,
              metrics: {
                ...baseMetrics,
                ...purchaseMetrics,
              },
            });

          } catch (insightError) {
            console.warn(`Failed to fetch insights for ad ${ad.id}:`, insightError);
            ads.push({
              id: ad.id,
              name: ad.name,
              status: ad.status,
              adset_id: adsetId,
              creative: ad.creative ? {
                id: ad.creative.id,
                thumbnail_url: ad.creative.thumbnail_url || null,
                title: ad.creative.title || null,
                body: ad.creative.body || null,
              } : null,
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

        // Encontrou o ad set, não precisa continuar
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

    if (!adsetInfo) {
      return NextResponse.json(
        { error: 'Ad set not found in any connected account' },
        { status: 404 }
      );
    }

    // Calcular totais
    const totals = ads.reduce((acc, ad) => ({
      spend: acc.spend + (ad.metrics?.spend || 0),
      purchases: acc.purchases + (ad.metrics?.purchases || 0),
      revenue: acc.revenue + (ad.metrics?.purchaseValue || 0),
    }), { spend: 0, purchases: 0, revenue: 0 });

    totals.roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;

    // Ordenar por gasto
    ads.sort((a, b) => (b.metrics?.spend || 0) - (a.metrics?.spend || 0));

    return NextResponse.json({
      ads,
      totals,
      adset: {
        id: adsetInfo.id,
        name: adsetInfo.name,
        status: adsetInfo.status,
        campaign_id: adsetInfo.campaign_id,
      },
      meta: {
        date_from: dateFrom,
        date_to: dateTo,
        ads_count: ads.length,
      }
    });

  } catch (error: any) {
    console.error('Error fetching meta ads:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch ads' },
      { status: 500 }
    );
  }
}
