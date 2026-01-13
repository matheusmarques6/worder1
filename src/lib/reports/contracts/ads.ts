/**
 * Contrato de dados para Relatório de Ads (Meta, Google, TikTok)
 */

import { AdsPlatform } from '../constants'

export interface AdsReportData {
  platform: AdsPlatform
  platformLabel: string // "Meta Ads", "Google Ads", "TikTok Ads"
  period: string
  generatedAt: string
  accountName?: string
  accountId?: string
  
  // KPIs de performance
  kpis: {
    spend: number
    spendChange: number
    impressions: number
    impressionsChange: number
    clicks: number
    clicksChange: number
    conversions: number
    conversionsChange: number
    revenue: number
    revenueChange: number
    
    // Métricas calculadas
    ctr: number           // Click-through rate
    ctrChange: number
    cpc: number           // Cost per click
    cpcChange: number
    cpm: number           // Cost per mille
    cpmChange: number
    cpa: number           // Cost per acquisition
    cpaChange: number
    roas: number          // Return on ad spend
    roasChange: number
  }
  
  // Campanhas
  campaigns: Array<{
    id: string
    name: string
    status: 'active' | 'paused' | 'completed' | 'draft'
    objective?: string
    spend: number
    impressions: number
    clicks: number
    conversions: number
    revenue: number
    ctr: number
    cpc: number
    cpm: number
    cpa: number
    roas: number
  }>
  
  // Ad Sets / Conjuntos de anúncios (opcional)
  adSets?: Array<{
    id: string
    name: string
    campaignName: string
    status: string
    spend: number
    impressions: number
    clicks: number
    conversions: number
    ctr: number
    cpc: number
  }>
  
  // Timeline (opcional)
  timeline?: Array<{
    date: string
    spend: number
    impressions: number
    clicks: number
    conversions: number
    revenue: number
  }>
  
  // Breakdown por dispositivo (opcional)
  byDevice?: Array<{
    device: string
    spend: number
    impressions: number
    clicks: number
    conversions: number
  }>
  
  // Breakdown por idade/gênero (opcional, Meta/TikTok)
  byDemographic?: Array<{
    age?: string
    gender?: string
    spend: number
    impressions: number
    clicks: number
  }>
}

/**
 * Labels das plataformas
 */
export const PLATFORM_LABELS: Record<AdsPlatform, string> = {
  meta: 'Meta Ads',
  google: 'Google Ads',
  tiktok: 'TikTok Ads',
}

/**
 * Cores das plataformas
 */
export const PLATFORM_COLORS: Record<AdsPlatform, string> = {
  meta: '#1877f2',    // Azul Facebook
  google: '#4285f4',  // Azul Google
  tiktok: '#000000',  // Preto TikTok
}

/**
 * Valores padrão para quando não há dados
 */
export const DEFAULT_ADS_REPORT: AdsReportData = {
  platform: 'meta',
  platformLabel: 'Meta Ads',
  period: '',
  generatedAt: '',
  kpis: {
    spend: 0,
    spendChange: 0,
    impressions: 0,
    impressionsChange: 0,
    clicks: 0,
    clicksChange: 0,
    conversions: 0,
    conversionsChange: 0,
    revenue: 0,
    revenueChange: 0,
    ctr: 0,
    ctrChange: 0,
    cpc: 0,
    cpcChange: 0,
    cpm: 0,
    cpmChange: 0,
    cpa: 0,
    cpaChange: 0,
    roas: 0,
    roasChange: 0,
  },
  campaigns: [],
}
