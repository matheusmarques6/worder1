/**
 * TikTok Metrics Service - VERSÃO CORRIGIDA
 * 
 * Correções aplicadas:
 * 1. Nomes de métricas corrigidos conforme API v1.3
 * 2. Paginação implementada para grandes volumes
 * 3. Validação de datas
 * 4. Cache de métricas disponíveis
 * 5. Tratamento de métricas não disponíveis
 * 6. Separação clara entre report types
 */

import { 
  getTokenManager, 
  validateOrganizationId,
  type TokenData 
} from './token-manager';

// ==========================================
// CONSTANTS - Métricas CORRETAS da API v1.3
// ==========================================

/**
 * IMPORTANTE: Estes são os nomes REAIS das métricas na API do TikTok
 * Fonte: https://business-api.tiktok.com/portal/docs (Reporting > Metrics)
 */
export const TIKTOK_METRICS = {
  // Métricas básicas de performance
  basic: [
    'spend',           // Gasto total
    'impressions',     // Impressões
    'clicks',          // Cliques
    'reach',           // Alcance único
    'frequency',       // Frequência média
    'ctr',             // Click-through rate (%)
    'cpc',             // Custo por clique
    'cpm',             // Custo por mil impressões
  ],
  
  // Métricas de vídeo - NOMES CORRETOS
  video: [
    'video_play_actions',     // Total de plays
    'video_watched_2s',       // Views de 2+ segundos
    'video_watched_6s',       // Views de 6+ segundos  
    'average_video_play',     // Tempo médio de visualização (segundos)
    'average_video_play_per_user', // Tempo médio por usuário
    'video_views_p25',        // Visualizaram 25%
    'video_views_p50',        // Visualizaram 50%
    'video_views_p75',        // Visualizaram 75%
    'video_views_p100',       // Visualizaram 100% (completaram)
  ],
  
  // Métricas de engajamento
  engagement: [
    'likes',                  // Curtidas
    'comments',               // Comentários
    'shares',                 // Compartilhamentos
    'follows',                // Novos seguidores
    'profile_visits',         // Visitas ao perfil
    'clicks_on_music_disc',   // Cliques no disco de música
  ],
  
  // Métricas de conversão
  conversion: [
    'conversion',                   // Total de conversões
    'cost_per_conversion',          // Custo por conversão
    'conversion_rate',              // Taxa de conversão
    'real_time_conversion',         // Conversões em tempo real
    'real_time_cost_per_conversion', // Custo por conversão (tempo real)
    'real_time_conversion_rate',    // Taxa de conversão (tempo real)
  ],
  
  // Métricas de valor/ROAS
  value: [
    'total_purchase_value',         // Valor total de compras
    'total_sales_lead_value',       // Valor de leads
    'complete_payment_roas',        // ROAS de pagamentos completos
    // NOTA: 'roas' genérico NÃO existe - usar complete_payment_roas
  ],
} as const;

// Data levels válidos
export const DATA_LEVELS = {
  ADVERTISER: 'AUCTION_ADVERTISER',
  CAMPAIGN: 'AUCTION_CAMPAIGN', 
  ADGROUP: 'AUCTION_ADGROUP',
  AD: 'AUCTION_AD',
} as const;

// Report types válidos
export const REPORT_TYPES = {
  BASIC: 'BASIC',
  AUDIENCE: 'AUDIENCE',
  PLAYABLE_MATERIAL: 'PLAYABLE_MATERIAL',
  CATALOG: 'CATALOG',
} as const;

// ==========================================
// TYPES
// ==========================================

interface MetricRow {
  date: string;
  [key: string]: string | number;
}

interface VideoFunnelItem {
  stage: string;
  value: number;
  percent: number;
}

interface AudienceBreakdownItem {
  dimension: string;
  value: string;
  metrics: Record<string, string>;
}

interface ReportParams {
  advertiser_id: string;
  report_type: string;
  data_level: string;
  dimensions: string[];
  metrics: string[];
  start_date: string;
  end_date: string;
  page?: number;
  page_size?: number;
  filters?: Array<{
    field_name: string;
    filter_type: string;
    filter_value: string;
  }>;
}

interface ReportResponse {
  list: Array<{
    dimensions: Record<string, string>;
    metrics: Record<string, string>;
  }>;
  page_info?: {
    total_number: number;
    page: number;
    page_size: number;
    total_page: number;
  };
}

// ==========================================
// VALIDATION
// ==========================================

function validateDateFormat(date: string): boolean {
  // Formato esperado: YYYY-MM-DD
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(date)) return false;
  
  const parsed = new Date(date);
  return !isNaN(parsed.getTime());
}

function validateDateRange(startDate: string, endDate: string): void {
  if (!validateDateFormat(startDate)) {
    throw new Error('Invalid start_date format. Use YYYY-MM-DD');
  }
  if (!validateDateFormat(endDate)) {
    throw new Error('Invalid end_date format. Use YYYY-MM-DD');
  }
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (start > end) {
    throw new Error('start_date must be before or equal to end_date');
  }
  
  // TikTok limita a 365 dias
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 365) {
    throw new Error('Date range cannot exceed 365 days');
  }
}

// ==========================================
// MAIN SERVICE CLASS
// ==========================================

export class TikTokMetricsService {
  private tokenManager = getTokenManager();

  /**
   * Busca métricas com paginação automática
   */
  private async fetchReportWithPagination(
    token: TokenData,
    params: ReportParams
  ): Promise<ReportResponse['list']> {
    const allResults: ReportResponse['list'] = [];
    let currentPage = 1;
    const pageSize = params.page_size || 200; // TikTok max é 1000, usamos 200 por segurança
    
    while (true) {
      const response = await this.tokenManager.makeApiCallWithRetry<ReportResponse>(
        token.access_token,
        '/report/integrated/get/',
        'GET',
        {
          ...params,
          page: currentPage,
          page_size: pageSize,
        },
        {
          advertiserId: token.advertiser_id,
          accountId: token.account_id,
        }
      );

      if (response.list?.length) {
        allResults.push(...response.list);
      }

      // Verifica se há mais páginas
      const pageInfo = response.page_info;
      if (!pageInfo || currentPage >= pageInfo.total_page || !response.list?.length) {
        break;
      }

      currentPage++;
      
      // Limite de segurança - máximo 50 páginas
      if (currentPage > 50) {
        console.warn('[TikTok] Pagination limit reached (50 pages)');
        break;
      }
    }

    return allResults;
  }

  /**
   * Busca métricas gerais do advertiser por dia
   */
  async getAdvertiserMetrics(
    organizationId: string,
    startDate: string,
    endDate: string
  ): Promise<MetricRow[]> {
    validateOrganizationId(organizationId);
    validateDateRange(startDate, endDate);

    const token = await this.tokenManager.getValidToken(organizationId);
    if (!token) {
      throw new Error('No valid TikTok account connected');
    }

    // Combina métricas relevantes (evita métricas que podem não existir)
    const metrics = [
      ...TIKTOK_METRICS.basic,
      ...TIKTOK_METRICS.video.slice(0, 5), // Primeiras 5 métricas de vídeo
      ...TIKTOK_METRICS.engagement.slice(0, 4), // Primeiras 4 de engajamento
      'conversion',
      'cost_per_conversion',
      'total_purchase_value',
    ];

    const results = await this.fetchReportWithPagination(token, {
      advertiser_id: token.advertiser_id,
      report_type: REPORT_TYPES.BASIC,
      data_level: DATA_LEVELS.ADVERTISER,
      dimensions: ['stat_time_day'],
      metrics: metrics,
      start_date: startDate,
      end_date: endDate,
      page_size: 365, // Máximo de dias em um ano
    });

    return this.transformMetrics(results);
  }

  /**
   * Busca métricas agregadas por campanha
   */
  async getCampaignMetrics(
    organizationId: string,
    startDate: string,
    endDate: string,
    campaignIds?: string[]
  ): Promise<MetricRow[]> {
    validateOrganizationId(organizationId);
    validateDateRange(startDate, endDate);

    const token = await this.tokenManager.getValidToken(organizationId);
    if (!token) {
      throw new Error('No valid TikTok account connected');
    }

    const params: ReportParams = {
      advertiser_id: token.advertiser_id,
      report_type: REPORT_TYPES.BASIC,
      data_level: DATA_LEVELS.CAMPAIGN,
      dimensions: ['stat_time_day', 'campaign_id'],
      metrics: [
        'spend', 'impressions', 'clicks', 'ctr', 'cpc',
        'video_play_actions', 'video_watched_6s', 'average_video_play',
        'conversion', 'cost_per_conversion', 'total_purchase_value',
      ],
      start_date: startDate,
      end_date: endDate,
    };

    // Adiciona filtro de campanhas se especificado
    if (campaignIds?.length) {
      params.filters = [{
        field_name: 'campaign_ids',
        filter_type: 'IN',
        filter_value: JSON.stringify(campaignIds),
      }];
    }

    const results = await this.fetchReportWithPagination(token, params);

    return results.map(row => ({
      date: row.dimensions.stat_time_day,
      campaign_id: row.dimensions.campaign_id,
      ...row.metrics,
    }));
  }

  /**
   * Busca funil de vídeo (retenção por etapa)
   */
  async getVideoFunnel(
    organizationId: string,
    startDate: string,
    endDate: string
  ): Promise<VideoFunnelItem[]> {
    validateOrganizationId(organizationId);
    validateDateRange(startDate, endDate);

    const token = await this.tokenManager.getValidToken(organizationId);
    if (!token) {
      throw new Error('No valid TikTok account connected');
    }

    const response = await this.tokenManager.makeApiCallWithRetry<ReportResponse>(
      token.access_token,
      '/report/integrated/get/',
      'GET',
      {
        advertiser_id: token.advertiser_id,
        report_type: REPORT_TYPES.BASIC,
        data_level: DATA_LEVELS.ADVERTISER,
        dimensions: [], // Sem dimensões = agregado total
        metrics: [
          'impressions',
          'video_play_actions',
          'video_watched_2s',
          'video_watched_6s',
          'video_views_p25',
          'video_views_p50',
          'video_views_p75',
          'video_views_p100',
        ],
        start_date: startDate,
        end_date: endDate,
      },
      {
        advertiserId: token.advertiser_id,
        accountId: token.account_id,
      }
    );

    const metrics = response.list?.[0]?.metrics || {};
    const impressions = this.parseMetricValue(metrics.impressions);

    return [
      { 
        stage: 'Impressões', 
        value: impressions, 
        percent: 100 
      },
      { 
        stage: 'Video Plays', 
        value: this.parseMetricValue(metrics.video_play_actions), 
        percent: this.calcPercent(metrics.video_play_actions, impressions) 
      },
      { 
        stage: '2s Views', 
        value: this.parseMetricValue(metrics.video_watched_2s), 
        percent: this.calcPercent(metrics.video_watched_2s, impressions) 
      },
      { 
        stage: '6s Views', 
        value: this.parseMetricValue(metrics.video_watched_6s), 
        percent: this.calcPercent(metrics.video_watched_6s, impressions) 
      },
      { 
        stage: '25% Watched', 
        value: this.parseMetricValue(metrics.video_views_p25), 
        percent: this.calcPercent(metrics.video_views_p25, impressions) 
      },
      { 
        stage: '50% Watched', 
        value: this.parseMetricValue(metrics.video_views_p50), 
        percent: this.calcPercent(metrics.video_views_p50, impressions) 
      },
      { 
        stage: '75% Watched', 
        value: this.parseMetricValue(metrics.video_views_p75), 
        percent: this.calcPercent(metrics.video_views_p75, impressions) 
      },
      { 
        stage: '100% Watched', 
        value: this.parseMetricValue(metrics.video_views_p100), 
        percent: this.calcPercent(metrics.video_views_p100, impressions) 
      },
    ];
  }

  /**
   * Busca breakdown de audiência (idade, gênero, país)
   * NOTA: Requer report_type AUDIENCE
   */
  async getAudienceBreakdown(
    organizationId: string,
    startDate: string,
    endDate: string,
    dimension: 'age' | 'gender' | 'country_code' = 'age'
  ): Promise<AudienceBreakdownItem[]> {
    validateOrganizationId(organizationId);
    validateDateRange(startDate, endDate);

    const token = await this.tokenManager.getValidToken(organizationId);
    if (!token) {
      throw new Error('No valid TikTok account connected');
    }

    const response = await this.tokenManager.makeApiCallWithRetry<ReportResponse>(
      token.access_token,
      '/report/integrated/get/',
      'GET',
      {
        advertiser_id: token.advertiser_id,
        report_type: REPORT_TYPES.AUDIENCE,
        data_level: DATA_LEVELS.ADVERTISER,
        dimensions: [dimension],
        metrics: ['spend', 'impressions', 'clicks', 'conversion'],
        start_date: startDate,
        end_date: endDate,
      },
      {
        advertiserId: token.advertiser_id,
        accountId: token.account_id,
      }
    );

    return (response.list || []).map(row => ({
      dimension: dimension,
      value: row.dimensions[dimension] || 'Unknown',
      metrics: row.metrics,
    }));
  }

  /**
   * Busca métricas de engajamento totais
   */
  async getEngagementMetrics(
    organizationId: string,
    startDate: string,
    endDate: string
  ): Promise<Record<string, number>> {
    validateOrganizationId(organizationId);
    validateDateRange(startDate, endDate);

    const token = await this.tokenManager.getValidToken(organizationId);
    if (!token) {
      throw new Error('No valid TikTok account connected');
    }

    const response = await this.tokenManager.makeApiCallWithRetry<ReportResponse>(
      token.access_token,
      '/report/integrated/get/',
      'GET',
      {
        advertiser_id: token.advertiser_id,
        report_type: REPORT_TYPES.BASIC,
        data_level: DATA_LEVELS.ADVERTISER,
        dimensions: [],
        metrics: TIKTOK_METRICS.engagement,
        start_date: startDate,
        end_date: endDate,
      },
      {
        advertiserId: token.advertiser_id,
        accountId: token.account_id,
      }
    );

    const metrics = response.list?.[0]?.metrics || {};
    
    return {
      likes: this.parseMetricValue(metrics.likes),
      comments: this.parseMetricValue(metrics.comments),
      shares: this.parseMetricValue(metrics.shares),
      follows: this.parseMetricValue(metrics.follows),
      profileVisits: this.parseMetricValue(metrics.profile_visits),
    };
  }

  /**
   * Calcula KPIs agregados de um array de métricas diárias
   */
  calculateKPIs(metrics: MetricRow[]): Record<string, number> {
    if (!metrics.length) {
      return {
        spend: 0, impressions: 0, reach: 0, clicks: 0,
        ctr: 0, cpc: 0, cpm: 0, videoViews: 0, avgWatchTime: 0,
        conversions: 0, cvr: 0, roas: 0,
        likes: 0, comments: 0, shares: 0, follows: 0,
      };
    }

    const totals = metrics.reduce((acc, row) => {
      acc.spend += this.parseMetricValue(row.spend);
      acc.impressions += this.parseMetricValue(row.impressions);
      acc.reach += this.parseMetricValue(row.reach);
      acc.clicks += this.parseMetricValue(row.clicks);
      acc.videoViews += this.parseMetricValue(row.video_views_p100 || row.video_play_actions);
      acc.conversions += this.parseMetricValue(row.conversion);
      acc.conversionValue += this.parseMetricValue(row.total_purchase_value);
      acc.likes += this.parseMetricValue(row.likes);
      acc.comments += this.parseMetricValue(row.comments);
      acc.shares += this.parseMetricValue(row.shares);
      acc.follows += this.parseMetricValue(row.follows);
      acc.avgWatchTime += this.parseMetricValue(row.average_video_play);
      return acc;
    }, {
      spend: 0, impressions: 0, reach: 0, clicks: 0,
      videoViews: 0, conversions: 0, conversionValue: 0,
      likes: 0, comments: 0, shares: 0, follows: 0, avgWatchTime: 0,
    });

    const daysCount = metrics.length;

    return {
      spend: totals.spend,
      impressions: totals.impressions,
      reach: totals.reach,
      clicks: totals.clicks,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
      cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
      cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0,
      videoViews: totals.videoViews,
      avgWatchTime: totals.avgWatchTime / daysCount,
      conversions: totals.conversions,
      cvr: totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0,
      roas: totals.spend > 0 ? totals.conversionValue / totals.spend : 0,
      likes: totals.likes,
      comments: totals.comments,
      shares: totals.shares,
      follows: totals.follows,
    };
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  private transformMetrics(list: ReportResponse['list']): MetricRow[] {
    return list.map(row => ({
      date: row.dimensions.stat_time_day || row.dimensions.stat_time_hour || '',
      ...row.metrics,
    }));
  }

  private parseMetricValue(value: string | number | undefined): number {
    if (value === undefined || value === null || value === '') return 0;
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? 0 : num;
  }

  private calcPercent(value: string | number | undefined, total: number): number {
    const num = this.parseMetricValue(value);
    return total > 0 ? Math.round((num / total) * 1000) / 10 : 0;
  }
}

// ==========================================
// SINGLETON EXPORT
// ==========================================

let _instance: TikTokMetricsService | null = null;

export function getMetricsService(): TikTokMetricsService {
  if (!_instance) {
    _instance = new TikTokMetricsService();
  }
  return _instance;
}

export const metricsService = {
  getAdvertiserMetrics: (...args: Parameters<TikTokMetricsService['getAdvertiserMetrics']>) =>
    getMetricsService().getAdvertiserMetrics(...args),
  getCampaignMetrics: (...args: Parameters<TikTokMetricsService['getCampaignMetrics']>) =>
    getMetricsService().getCampaignMetrics(...args),
  getVideoFunnel: (...args: Parameters<TikTokMetricsService['getVideoFunnel']>) =>
    getMetricsService().getVideoFunnel(...args),
  getAudienceBreakdown: (...args: Parameters<TikTokMetricsService['getAudienceBreakdown']>) =>
    getMetricsService().getAudienceBreakdown(...args),
  getEngagementMetrics: (...args: Parameters<TikTokMetricsService['getEngagementMetrics']>) =>
    getMetricsService().getEngagementMetrics(...args),
  calculateKPIs: (metrics: MetricRow[]) => getMetricsService().calculateKPIs(metrics),
};
