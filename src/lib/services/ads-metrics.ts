/**
 * Ads Metrics Service
 * v2.1 - Correções:
 * - Usar conversion_value (não revenue)
 * - Buscar meta_campaigns separadamente (sem FK)
 * - ROAS total recalculado
 */

import { SupabaseClient } from '@supabase/supabase-js'

export type AdsPlatform = 'meta' | 'google' | 'tiktok'

interface AdsMetricsParams {
  supabase: SupabaseClient
  organizationId: string
  platform: AdsPlatform
  startDate: Date
  endDate: Date
}

interface AdsCampaign {
  id: string
  name: string
  status: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  revenue: number
  ctr: number
  cpc: number
  roas: number
}

interface AdsMetrics {
  platform: AdsPlatform
  kpis: {
    spend: number
    impressions: number
    clicks: number
    conversions: number
    revenue: number
    ctr: number
    cpc: number
    cpm: number
    roas: number
  }
  campaigns: AdsCampaign[]
}

/**
 * Busca métricas de Ads por plataforma
 */
export async function getAdsMetrics(
  params: AdsMetricsParams
): Promise<AdsMetrics | null> {
  const { supabase, organizationId, platform, startDate, endDate } = params

  switch (platform) {
    case 'meta':
      return getMetaMetrics(supabase, organizationId, startDate, endDate)
    case 'google':
      return getGoogleMetrics(supabase, organizationId, startDate, endDate)
    case 'tiktok':
      return getTikTokMetrics(supabase, organizationId, startDate, endDate)
    default:
      return null
  }
}

/**
 * Métricas do Meta Ads
 * Usa tabelas de cache: meta_insights e meta_campaigns
 */
async function getMetaMetrics(
  supabase: SupabaseClient,
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<AdsMetrics | null> {
  try {
    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    // 1. Buscar insights (SEM nested select - não funciona sem FK)
    const { data: insights, error: insightsError } = await supabase
      .from('meta_insights')
      .select(`
        date,
        campaign_id,
        spend,
        impressions,
        clicks,
        conversions,
        conversion_value,
        roas
      `)
      .eq('organization_id', organizationId)
      .gte('date', startDateStr)
      .lte('date', endDateStr)

    if (insightsError) {
      console.error('[META_METRICS] Erro ao buscar insights:', insightsError)
      return null
    }

    if (!insights || insights.length === 0) {
      // Retornar estado vazio real
      return {
        platform: 'meta',
        kpis: {
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          revenue: 0,
          ctr: 0,
          cpc: 0,
          cpm: 0,
          roas: 0,
        },
        campaigns: [],
      }
    }

    // 2. Buscar campaigns SEPARADAMENTE (sem FK entre as tabelas)
    const campaignIds = [...new Set(
      insights
        .map(i => i.campaign_id)
        .filter((id): id is string => Boolean(id))
    )]

    let campaignMap = new Map<string, { name: string; status: string }>()

    if (campaignIds.length > 0) {
      const { data: campaigns } = await supabase
        .from('meta_campaigns')
        .select('campaign_id, name, status')
        .eq('organization_id', organizationId)
        .in('campaign_id', campaignIds)

      // 3. Criar Map para lookup rápido
      for (const c of campaigns || []) {
        campaignMap.set(c.campaign_id, { 
          name: c.name || 'Campanha sem nome', 
          status: c.status || 'unknown' 
        })
      }
    }

    // 4. Agregar totais
    const totals = insights.reduce((acc, row) => ({
      spend: acc.spend + (Number(row.spend) || 0),
      impressions: acc.impressions + (Number(row.impressions) || 0),
      clicks: acc.clicks + (Number(row.clicks) || 0),
      conversions: acc.conversions + (Number(row.conversions) || 0),
      // CORREÇÃO: usar conversion_value, não revenue
      revenue: acc.revenue + (Number(row.conversion_value) || 0),
    }), { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 })

    // 5. Calcular métricas derivadas TOTAIS
    const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
    const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0
    const cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0
    // ROAS total deve ser recalculado (não usar média dos roas individuais)
    const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0

    // 6. Agregar por campanha (manualmente, sem FK)
    const campaignAggregates = new Map<string, {
      spend: number
      impressions: number
      clicks: number
      conversions: number
      revenue: number
    }>()

    for (const row of insights) {
      const cid = row.campaign_id
      if (!cid) continue

      const existing = campaignAggregates.get(cid) || {
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
      }

      existing.spend += Number(row.spend) || 0
      existing.impressions += Number(row.impressions) || 0
      existing.clicks += Number(row.clicks) || 0
      existing.conversions += Number(row.conversions) || 0
      existing.revenue += Number(row.conversion_value) || 0

      campaignAggregates.set(cid, existing)
    }

    // 7. Montar array de campanhas com métricas
    const campaignResults: AdsCampaign[] = []

    for (const [campaignId, agg] of campaignAggregates) {
      const info = campaignMap.get(campaignId) || { 
        name: `Campanha ${campaignId.slice(0, 8)}...`, 
        status: 'unknown' 
      }

      campaignResults.push({
        id: campaignId,
        name: info.name,
        status: info.status,
        spend: agg.spend,
        impressions: agg.impressions,
        clicks: agg.clicks,
        conversions: agg.conversions,
        revenue: agg.revenue,
        ctr: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0,
        cpc: agg.clicks > 0 ? agg.spend / agg.clicks : 0,
        roas: agg.spend > 0 ? agg.revenue / agg.spend : 0,
      })
    }

    // Ordenar por spend desc
    campaignResults.sort((a, b) => b.spend - a.spend)

    return {
      platform: 'meta',
      kpis: {
        spend: totals.spend,
        impressions: totals.impressions,
        clicks: totals.clicks,
        conversions: totals.conversions,
        revenue: totals.revenue,
        ctr,
        cpc,
        cpm,
        roas,
      },
      campaigns: campaignResults.slice(0, 20), // Top 20
    }

  } catch (error) {
    console.error('[META_METRICS] Erro:', error)
    return null
  }
}

/**
 * Métricas do Google Ads
 * TODO: Implementar usando google_ads_insights
 */
async function getGoogleMetrics(
  supabase: SupabaseClient,
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<AdsMetrics | null> {
  try {
    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    // Buscar insights do Google Ads
    const { data: insights, error } = await supabase
      .from('google_ads_insights')
      .select(`
        date,
        campaign_id,
        cost,
        impressions,
        clicks,
        conversions,
        conversions_value
      `)
      .eq('organization_id', organizationId)
      .gte('date', startDateStr)
      .lte('date', endDateStr)

    if (error || !insights || insights.length === 0) {
      return {
        platform: 'google',
        kpis: {
          spend: 0, impressions: 0, clicks: 0, conversions: 0,
          revenue: 0, ctr: 0, cpc: 0, cpm: 0, roas: 0,
        },
        campaigns: [],
      }
    }

    // Buscar campanhas
    const campaignIds = [...new Set(insights.map(i => i.campaign_id).filter(Boolean))]
    let campaignMap = new Map<string, { name: string; status: string }>()

    if (campaignIds.length > 0) {
      const { data: campaigns } = await supabase
        .from('google_ads_campaigns')
        .select('campaign_id, name, status')
        .eq('organization_id', organizationId)
        .in('campaign_id', campaignIds)

      for (const c of campaigns || []) {
        campaignMap.set(c.campaign_id, { name: c.name, status: c.status })
      }
    }

    // Agregar
    const totals = insights.reduce((acc, row) => ({
      spend: acc.spend + (Number(row.cost) || 0),
      impressions: acc.impressions + (Number(row.impressions) || 0),
      clicks: acc.clicks + (Number(row.clicks) || 0),
      conversions: acc.conversions + (Number(row.conversions) || 0),
      revenue: acc.revenue + (Number(row.conversions_value) || 0),
    }), { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 })

    const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
    const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0
    const cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0
    const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0

    // Agregar por campanha
    const campaignAggregates = new Map<string, any>()
    for (const row of insights) {
      if (!row.campaign_id) continue
      const existing = campaignAggregates.get(row.campaign_id) || {
        spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0,
      }
      existing.spend += Number(row.cost) || 0
      existing.impressions += Number(row.impressions) || 0
      existing.clicks += Number(row.clicks) || 0
      existing.conversions += Number(row.conversions) || 0
      existing.revenue += Number(row.conversions_value) || 0
      campaignAggregates.set(row.campaign_id, existing)
    }

    const campaignResults: AdsCampaign[] = []
    for (const [campaignId, agg] of campaignAggregates) {
      const info = campaignMap.get(campaignId) || { name: 'Campanha', status: 'unknown' }
      campaignResults.push({
        id: campaignId,
        name: info.name,
        status: info.status,
        ...agg,
        ctr: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0,
        cpc: agg.clicks > 0 ? agg.spend / agg.clicks : 0,
        roas: agg.spend > 0 ? agg.revenue / agg.spend : 0,
      })
    }
    campaignResults.sort((a, b) => b.spend - a.spend)

    return {
      platform: 'google',
      kpis: { ...totals, ctr, cpc, cpm, roas },
      campaigns: campaignResults.slice(0, 20),
    }

  } catch (error) {
    console.error('[GOOGLE_METRICS] Erro:', error)
    return null
  }
}

/**
 * Métricas do TikTok Ads
 * TODO: Implementar usando tiktok_insights
 */
async function getTikTokMetrics(
  supabase: SupabaseClient,
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<AdsMetrics | null> {
  try {
    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    // Buscar insights do TikTok
    const { data: insights, error } = await supabase
      .from('tiktok_insights')
      .select(`
        date,
        campaign_id,
        spend,
        impressions,
        clicks,
        conversions,
        conversion_value
      `)
      .eq('organization_id', organizationId)
      .gte('date', startDateStr)
      .lte('date', endDateStr)

    if (error || !insights || insights.length === 0) {
      return {
        platform: 'tiktok',
        kpis: {
          spend: 0, impressions: 0, clicks: 0, conversions: 0,
          revenue: 0, ctr: 0, cpc: 0, cpm: 0, roas: 0,
        },
        campaigns: [],
      }
    }

    // Buscar campanhas
    const campaignIds = [...new Set(insights.map(i => i.campaign_id).filter(Boolean))]
    let campaignMap = new Map<string, { name: string; status: string }>()

    if (campaignIds.length > 0) {
      const { data: campaigns } = await supabase
        .from('tiktok_campaigns')
        .select('campaign_id, name, status')
        .eq('organization_id', organizationId)
        .in('campaign_id', campaignIds)

      for (const c of campaigns || []) {
        campaignMap.set(c.campaign_id, { name: c.name, status: c.status })
      }
    }

    // Agregar
    const totals = insights.reduce((acc, row) => ({
      spend: acc.spend + (Number(row.spend) || 0),
      impressions: acc.impressions + (Number(row.impressions) || 0),
      clicks: acc.clicks + (Number(row.clicks) || 0),
      conversions: acc.conversions + (Number(row.conversions) || 0),
      revenue: acc.revenue + (Number(row.conversion_value) || 0),
    }), { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 })

    const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
    const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0
    const cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0
    const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0

    // Agregar por campanha
    const campaignAggregates = new Map<string, any>()
    for (const row of insights) {
      if (!row.campaign_id) continue
      const existing = campaignAggregates.get(row.campaign_id) || {
        spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0,
      }
      existing.spend += Number(row.spend) || 0
      existing.impressions += Number(row.impressions) || 0
      existing.clicks += Number(row.clicks) || 0
      existing.conversions += Number(row.conversions) || 0
      existing.revenue += Number(row.conversion_value) || 0
      campaignAggregates.set(row.campaign_id, existing)
    }

    const campaignResults: AdsCampaign[] = []
    for (const [campaignId, agg] of campaignAggregates) {
      const info = campaignMap.get(campaignId) || { name: 'Campanha', status: 'unknown' }
      campaignResults.push({
        id: campaignId,
        name: info.name,
        status: info.status,
        ...agg,
        ctr: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0,
        cpc: agg.clicks > 0 ? agg.spend / agg.clicks : 0,
        roas: agg.spend > 0 ? agg.revenue / agg.spend : 0,
      })
    }
    campaignResults.sort((a, b) => b.spend - a.spend)

    return {
      platform: 'tiktok',
      kpis: { ...totals, ctr, cpc, cpm, roas },
      campaigns: campaignResults.slice(0, 20),
    }

  } catch (error) {
    console.error('[TIKTOK_METRICS] Erro:', error)
    return null
  }
}

/**
 * Verifica se a organização tem integração de Ads ativa
 */
export async function hasAdsIntegration(
  supabase: SupabaseClient,
  organizationId: string,
  platform: AdsPlatform
): Promise<boolean> {
  try {
    const tableMap: Record<AdsPlatform, string> = {
      meta: 'meta_accounts',
      google: 'google_ads_accounts',
      tiktok: 'tiktok_accounts',
    }

    const { data } = await supabase
      .from(tableMap[platform])
      .select('id')
      .eq('organization_id', organizationId)
      .limit(1)
      .maybeSingle()

    return !!data

  } catch {
    return false
  }
}
