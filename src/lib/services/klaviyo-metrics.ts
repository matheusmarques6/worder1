/**
 * Klaviyo Metrics Service
 * v2.1 - Extrair core real para reutilização
 */

import { SupabaseClient } from '@supabase/supabase-js'

interface KlaviyoMetricsParams {
  supabase: SupabaseClient
  organizationId: string
  storeId?: string
  startDate: Date
  endDate: Date
}

interface KlaviyoCampaign {
  id: string
  name: string
  sent: number
  opens: number
  clicks: number
  revenue: number
  openRate: number
  clickRate: number
}

interface KlaviyoMetrics {
  kpis: {
    totalSent: number
    totalOpens: number
    totalClicks: number
    totalRevenue: number
    openRate: number
    clickRate: number
    conversionRate: number
    unsubscribeRate: number
  }
  campaigns: KlaviyoCampaign[]
}

/**
 * Busca métricas do Klaviyo
 * Reutiliza lógica do analytics/email existente
 */
export async function getKlaviyoMetrics(
  params: KlaviyoMetricsParams
): Promise<KlaviyoMetrics | null> {
  const { supabase, organizationId, storeId, startDate, endDate } = params

  try {
    // 1. Buscar integração Klaviyo ativa
    let integrationQuery = supabase
      .from('integrations')
      .select('id, config')
      .eq('organization_id', organizationId)
      .eq('type', 'klaviyo')
      .eq('status', 'active')

    if (storeId) {
      integrationQuery = integrationQuery.eq('store_id', storeId)
    }

    const { data: integration, error } = await integrationQuery.maybeSingle()

    if (error) {
      console.error('[KLAVIYO_METRICS] Erro ao buscar integração:', error)
      return null
    }

    if (!integration) {
      console.log('[KLAVIYO_METRICS] Integração não encontrada')
      return null
    }

    const config = integration.config as { 
      api_key?: string
      public_key?: string 
    }

    if (!config.api_key) {
      console.log('[KLAVIYO_METRICS] API key não configurada')
      return null
    }

    // 2. Buscar métricas da API Klaviyo
    const baseUrl = 'https://a.klaviyo.com/api'
    const headers = {
      'Authorization': `Klaviyo-API-Key ${config.api_key}`,
      'revision': '2024-02-15',
      'Accept': 'application/json',
    }

    // Formatar datas para filtro
    const startIso = startDate.toISOString().split('T')[0]
    const endIso = endDate.toISOString().split('T')[0]

    // Buscar campanhas com filtro de data
    const campaignsUrl = `${baseUrl}/campaigns?filter=and(equals(messages.channel,'email'),greater-or-equal(send_time,${startIso}T00:00:00Z),less-or-equal(send_time,${endIso}T23:59:59Z))`
    
    const campaignsResponse = await fetch(campaignsUrl, { 
      headers,
      next: { revalidate: 300 } // Cache por 5 minutos
    })

    if (!campaignsResponse.ok) {
      console.error('[KLAVIYO_METRICS] Erro ao buscar campanhas:', campaignsResponse.status, campaignsResponse.statusText)
      
      // Se não conseguir acessar a API, retornar null (sem dados)
      return null
    }

    const campaignsData = await campaignsResponse.json()
    const campaigns = campaignsData.data || []

    // Se não há campanhas, retornar estado vazio real
    if (campaigns.length === 0) {
      return {
        kpis: {
          totalSent: 0,
          totalOpens: 0,
          totalClicks: 0,
          totalRevenue: 0,
          openRate: 0,
          clickRate: 0,
          conversionRate: 0,
          unsubscribeRate: 0,
        },
        campaigns: [],
      }
    }

    // 3. Agregar métricas de todas as campanhas
    let totalSent = 0
    let totalOpens = 0
    let totalClicks = 0
    let totalRevenue = 0
    let totalUnsubscribes = 0

    const campaignMetrics: KlaviyoCampaign[] = []

    for (const campaign of campaigns) {
      const stats = campaign.attributes?.statistics || {}
      const sent = stats.total_recipients || stats.recipient_count || 0
      const opens = stats.unique_opens || stats.open_count || 0
      const clicks = stats.unique_clicks || stats.click_count || 0
      const revenue = stats.revenue || stats.attributed_revenue || 0
      const unsubscribes = stats.unsubscribes || stats.unsubscribe_count || 0

      totalSent += sent
      totalOpens += opens
      totalClicks += clicks
      totalRevenue += revenue
      totalUnsubscribes += unsubscribes

      if (sent > 0) { // Só incluir campanhas que foram enviadas
        campaignMetrics.push({
          id: campaign.id,
          name: campaign.attributes?.name || 'Sem nome',
          sent,
          opens,
          clicks,
          revenue,
          openRate: sent > 0 ? (opens / sent) * 100 : 0,
          clickRate: opens > 0 ? (clicks / opens) * 100 : 0,
        })
      }
    }

    // Ordenar por enviados (mais recentes/maiores primeiro)
    campaignMetrics.sort((a, b) => b.sent - a.sent)

    return {
      kpis: {
        totalSent,
        totalOpens,
        totalClicks,
        totalRevenue,
        openRate: totalSent > 0 ? (totalOpens / totalSent) * 100 : 0,
        clickRate: totalOpens > 0 ? (totalClicks / totalOpens) * 100 : 0,
        conversionRate: totalClicks > 0 ? (totalRevenue / totalClicks) : 0, // Revenue per click
        unsubscribeRate: totalSent > 0 ? (totalUnsubscribes / totalSent) * 100 : 0,
      },
      campaigns: campaignMetrics.slice(0, 20), // Top 20 campanhas
    }

  } catch (error) {
    console.error('[KLAVIYO_METRICS] Erro:', error)
    return null
  }
}

/**
 * Verifica se a organização tem integração Klaviyo ativa
 */
export async function hasKlaviyoIntegration(
  supabase: SupabaseClient,
  organizationId: string,
  storeId?: string
): Promise<boolean> {
  try {
    let query = supabase
      .from('integrations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('type', 'klaviyo')
      .eq('status', 'active')

    if (storeId) {
      query = query.eq('store_id', storeId)
    }

    const { data } = await query.maybeSingle()
    return !!data

  } catch {
    return false
  }
}
