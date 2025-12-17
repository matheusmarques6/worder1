/**
 * TikTok Campaign Service - VERSÃO CORRIGIDA
 * 
 * Correções aplicadas:
 * 1. Validação rigorosa de inputs
 * 2. Limite de 100 IDs por requisição (conforme API)
 * 3. Tratamento correto de status
 * 4. Batch operations para grandes volumes
 * 5. Tipagem completa
 */

import { 
  getTokenManager, 
  validateOrganizationId,
  sanitizeString,
  type TokenData 
} from './token-manager';

// ==========================================
// CONSTANTS
// ==========================================

// Limite de IDs por requisição conforme documentação TikTok
const MAX_IDS_PER_REQUEST = 100;

// Objetivos de campanha válidos
export const CAMPAIGN_OBJECTIVES = {
  REACH: 'REACH',
  TRAFFIC: 'TRAFFIC',
  VIDEO_VIEWS: 'VIDEO_VIEWS',
  LEAD_GENERATION: 'LEAD_GENERATION',
  ENGAGEMENT: 'ENGAGEMENT',
  APP_PROMOTION: 'APP_PROMOTION',
  WEB_CONVERSIONS: 'WEB_CONVERSIONS',
  CATALOG_SALES: 'CATALOG_SALES',
  SHOP_PURCHASES: 'SHOP_PURCHASES',
} as const;

// Labels amigáveis para objetivos
export const OBJECTIVE_LABELS: Record<string, string> = {
  REACH: 'Alcance',
  TRAFFIC: 'Tráfego',
  VIDEO_VIEWS: 'Visualizações de Vídeo',
  LEAD_GENERATION: 'Geração de Leads',
  ENGAGEMENT: 'Engajamento',
  APP_PROMOTION: 'Promoção de App',
  WEB_CONVERSIONS: 'Conversões Web',
  CATALOG_SALES: 'Vendas de Catálogo',
  SHOP_PURCHASES: 'Compras na Loja',
};

// Status possíveis
export const CAMPAIGN_STATUS = {
  ENABLE: 'ENABLE',
  DISABLE: 'DISABLE',
  DELETE: 'DELETE',
} as const;

export type CampaignObjective = keyof typeof CAMPAIGN_OBJECTIVES;
export type EntityStatus = 'ENABLE' | 'DISABLE' | 'DELETE';

// ==========================================
// TYPES
// ==========================================

export interface Campaign {
  campaign_id: string;
  campaign_name: string;
  status: string;
  operation_status: string;
  objective_type: string;
  budget: number;
  budget_mode: string;
  create_time: string;
  modify_time: string;
}

export interface AdGroup {
  adgroup_id: string;
  adgroup_name: string;
  campaign_id: string;
  status: string;
  operation_status: string;
  budget: number;
  bid_type: string;
  bid_price?: number;
  optimization_goal: string;
  placement_type: string;
  age_groups?: string[];
  gender?: string;
  languages?: string[];
}

export interface Ad {
  ad_id: string;
  ad_name: string;
  adgroup_id: string;
  status: string;
  operation_status: string;
  ad_text?: string;
  call_to_action?: string;
  video_id?: string;
  image_ids?: string[];
}

export interface CreateCampaignData {
  name: string;
  objective: CampaignObjective;
  budget: number;
  budgetMode: 'BUDGET_MODE_DAY' | 'BUDGET_MODE_TOTAL';
}

export interface UpdateCampaignData {
  name?: string;
  budget?: number;
}

export interface CreateAdGroupData {
  campaignId: string;
  name: string;
  budget: number;
  budgetMode?: 'BUDGET_MODE_DAY' | 'BUDGET_MODE_TOTAL';
  bidType: 'BID_TYPE_NO_BID' | 'BID_TYPE_CUSTOM';
  bidPrice?: number;
  optimizationGoal: string;
  placementType: 'PLACEMENT_TYPE_AUTOMATIC' | 'PLACEMENT_TYPE_NORMAL';
  targeting: {
    ageGroups?: string[];
    gender?: 'GENDER_UNLIMITED' | 'GENDER_MALE' | 'GENDER_FEMALE';
    languages?: string[];
    locations?: string[];
    interests?: string[];
  };
  schedule?: {
    startTime?: string;
    endTime?: string;
  };
}

interface ListResponse<T> {
  list: T[];
  page_info?: {
    total_number: number;
    page: number;
    page_size: number;
    total_page: number;
  };
}

interface StatusUpdateResponse {
  campaign_ids?: string[];
  adgroup_ids?: string[];
  ad_ids?: string[];
}

// ==========================================
// VALIDATION
// ==========================================

function validateCampaignData(data: CreateCampaignData): void {
  if (!data.name || typeof data.name !== 'string') {
    throw new Error('Campaign name is required');
  }
  
  if (data.name.length < 1 || data.name.length > 512) {
    throw new Error('Campaign name must be between 1 and 512 characters');
  }

  if (!Object.values(CAMPAIGN_OBJECTIVES).includes(data.objective as any)) {
    throw new Error(`Invalid objective. Valid options: ${Object.keys(CAMPAIGN_OBJECTIVES).join(', ')}`);
  }

  if (typeof data.budget !== 'number' || data.budget < 1) {
    throw new Error('Budget must be a positive number');
  }

  // Budget mínimo do TikTok é geralmente $20/dia
  if (data.budgetMode === 'BUDGET_MODE_DAY' && data.budget < 20) {
    throw new Error('Daily budget must be at least 20');
  }

  if (!['BUDGET_MODE_DAY', 'BUDGET_MODE_TOTAL'].includes(data.budgetMode)) {
    throw new Error('Invalid budget mode');
  }
}

function validateIds(ids: string[], entityType: string): void {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error(`At least one ${entityType} ID is required`);
  }
  
  if (ids.length > MAX_IDS_PER_REQUEST) {
    throw new Error(`Maximum ${MAX_IDS_PER_REQUEST} ${entityType} IDs per request`);
  }

  for (const id of ids) {
    if (!id || typeof id !== 'string') {
      throw new Error(`Invalid ${entityType} ID: ${id}`);
    }
  }
}

// ==========================================
// MAIN SERVICE CLASS
// ==========================================

export class TikTokCampaignService {
  private tokenManager = getTokenManager();

  // ==========================================
  // CAMPAIGNS
  // ==========================================

  /**
   * Lista todas as campanhas com paginação automática
   */
  async listCampaigns(
    organizationId: string,
    options?: {
      status?: string[];
      limit?: number;
    }
  ): Promise<Campaign[]> {
    validateOrganizationId(organizationId);

    const token = await this.getToken(organizationId);
    const allCampaigns: Campaign[] = [];
    let currentPage = 1;
    const pageSize = 100;
    const limit = options?.limit || 1000;

    while (allCampaigns.length < limit) {
      const params: Record<string, any> = {
        advertiser_id: token.advertiser_id,
        page: currentPage,
        page_size: pageSize,
        fields: JSON.stringify([
          'campaign_id', 'campaign_name', 'status', 'operation_status',
          'objective_type', 'budget', 'budget_mode', 'create_time', 'modify_time'
        ]),
      };

      if (options?.status?.length) {
        params.filtering = JSON.stringify({
          status: options.status,
        });
      }

      const response = await this.tokenManager.makeApiCallWithRetry<ListResponse<Campaign>>(
        token.access_token,
        '/campaign/get/',
        'GET',
        params,
        { advertiserId: token.advertiser_id, accountId: token.account_id }
      );

      if (response.list?.length) {
        allCampaigns.push(...response.list);
      }

      const pageInfo = response.page_info;
      if (!pageInfo || currentPage >= pageInfo.total_page || !response.list?.length) {
        break;
      }

      currentPage++;
    }

    return allCampaigns.slice(0, limit);
  }

  /**
   * Busca uma campanha específica por ID
   */
  async getCampaign(organizationId: string, campaignId: string): Promise<Campaign | null> {
    validateOrganizationId(organizationId);
    
    if (!campaignId) {
      throw new Error('Campaign ID is required');
    }

    const token = await this.getToken(organizationId);

    const response = await this.tokenManager.makeApiCallWithRetry<ListResponse<Campaign>>(
      token.access_token,
      '/campaign/get/',
      'GET',
      {
        advertiser_id: token.advertiser_id,
        filtering: JSON.stringify({ campaign_ids: [campaignId] }),
        fields: JSON.stringify([
          'campaign_id', 'campaign_name', 'status', 'operation_status',
          'objective_type', 'budget', 'budget_mode', 'create_time', 'modify_time'
        ]),
      },
      { advertiserId: token.advertiser_id, accountId: token.account_id }
    );

    return response.list?.[0] || null;
  }

  /**
   * Cria uma nova campanha
   */
  async createCampaign(organizationId: string, data: CreateCampaignData): Promise<{ campaign_id: string }> {
    validateOrganizationId(organizationId);
    validateCampaignData(data);

    const token = await this.getToken(organizationId);

    const response = await this.tokenManager.makeApiCallWithRetry<{ campaign_id: string }>(
      token.access_token,
      '/campaign/create/',
      'POST',
      {
        advertiser_id: token.advertiser_id,
        campaign_name: sanitizeString(data.name, 512),
        objective_type: data.objective,
        budget: data.budget,
        budget_mode: data.budgetMode,
      },
      { advertiserId: token.advertiser_id, accountId: token.account_id }
    );

    return response;
  }

  /**
   * Atualiza uma campanha existente
   */
  async updateCampaign(
    organizationId: string,
    campaignId: string,
    updates: UpdateCampaignData
  ): Promise<{ campaign_id: string }> {
    validateOrganizationId(organizationId);

    if (!campaignId) {
      throw new Error('Campaign ID is required');
    }

    if (!updates.name && !updates.budget) {
      throw new Error('At least one field to update is required');
    }

    const token = await this.getToken(organizationId);

    const body: Record<string, any> = {
      advertiser_id: token.advertiser_id,
      campaign_id: campaignId,
    };

    if (updates.name) {
      body.campaign_name = sanitizeString(updates.name, 512);
    }
    if (updates.budget !== undefined) {
      if (updates.budget < 1) {
        throw new Error('Budget must be positive');
      }
      body.budget = updates.budget;
    }

    const response = await this.tokenManager.makeApiCallWithRetry<{ campaign_id: string }>(
      token.access_token,
      '/campaign/update/',
      'POST',
      body,
      { advertiserId: token.advertiser_id, accountId: token.account_id }
    );

    return response;
  }

  /**
   * Atualiza status de campanhas (pausar/ativar/deletar)
   * Automaticamente divide em batches de 100 se necessário
   */
  async updateCampaignStatus(
    organizationId: string,
    campaignIds: string[],
    status: EntityStatus
  ): Promise<StatusUpdateResponse> {
    validateOrganizationId(organizationId);
    validateIds(campaignIds, 'campaign');

    if (!Object.values(CAMPAIGN_STATUS).includes(status)) {
      throw new Error(`Invalid status. Valid options: ${Object.values(CAMPAIGN_STATUS).join(', ')}`);
    }

    const token = await this.getToken(organizationId);

    // Se mais de 100 IDs, divide em batches
    if (campaignIds.length > MAX_IDS_PER_REQUEST) {
      const results: string[] = [];
      
      for (let i = 0; i < campaignIds.length; i += MAX_IDS_PER_REQUEST) {
        const batch = campaignIds.slice(i, i + MAX_IDS_PER_REQUEST);
        const batchResponse = await this.tokenManager.makeApiCallWithRetry<StatusUpdateResponse>(
          token.access_token,
          '/campaign/status/update/',
          'POST',
          {
            advertiser_id: token.advertiser_id,
            campaign_ids: batch,
            opt_status: status,
          },
          { advertiserId: token.advertiser_id, accountId: token.account_id }
        );
        
        if (batchResponse.campaign_ids) {
          results.push(...batchResponse.campaign_ids);
        }
      }
      
      return { campaign_ids: results };
    }

    return this.tokenManager.makeApiCallWithRetry<StatusUpdateResponse>(
      token.access_token,
      '/campaign/status/update/',
      'POST',
      {
        advertiser_id: token.advertiser_id,
        campaign_ids: campaignIds,
        opt_status: status,
      },
      { advertiserId: token.advertiser_id, accountId: token.account_id }
    );
  }

  // ==========================================
  // AD GROUPS
  // ==========================================

  /**
   * Lista ad groups (opcionalmente filtrado por campanha)
   */
  async listAdGroups(
    organizationId: string,
    campaignId?: string,
    options?: { limit?: number }
  ): Promise<AdGroup[]> {
    validateOrganizationId(organizationId);

    const token = await this.getToken(organizationId);
    const allAdGroups: AdGroup[] = [];
    let currentPage = 1;
    const pageSize = 100;
    const limit = options?.limit || 1000;

    while (allAdGroups.length < limit) {
      const params: Record<string, any> = {
        advertiser_id: token.advertiser_id,
        page: currentPage,
        page_size: pageSize,
        fields: JSON.stringify([
          'adgroup_id', 'adgroup_name', 'campaign_id', 'status', 'operation_status',
          'budget', 'bid_type', 'bid_price', 'optimization_goal',
          'placement_type', 'age_groups', 'gender', 'languages'
        ]),
      };

      if (campaignId) {
        params.filtering = JSON.stringify({ campaign_ids: [campaignId] });
      }

      const response = await this.tokenManager.makeApiCallWithRetry<ListResponse<AdGroup>>(
        token.access_token,
        '/adgroup/get/',
        'GET',
        params,
        { advertiserId: token.advertiser_id, accountId: token.account_id }
      );

      if (response.list?.length) {
        allAdGroups.push(...response.list);
      }

      const pageInfo = response.page_info;
      if (!pageInfo || currentPage >= pageInfo.total_page || !response.list?.length) {
        break;
      }

      currentPage++;
    }

    return allAdGroups.slice(0, limit);
  }

  /**
   * Cria um novo ad group
   */
  async createAdGroup(organizationId: string, data: CreateAdGroupData): Promise<{ adgroup_id: string }> {
    validateOrganizationId(organizationId);

    if (!data.campaignId) {
      throw new Error('Campaign ID is required');
    }
    if (!data.name || data.name.length < 1 || data.name.length > 512) {
      throw new Error('Ad group name must be between 1 and 512 characters');
    }
    if (typeof data.budget !== 'number' || data.budget < 20) {
      throw new Error('Budget must be at least 20');
    }

    const token = await this.getToken(organizationId);

    const body: Record<string, any> = {
      advertiser_id: token.advertiser_id,
      campaign_id: data.campaignId,
      adgroup_name: sanitizeString(data.name, 512),
      budget: data.budget,
      budget_mode: data.budgetMode || 'BUDGET_MODE_DAY',
      bid_type: data.bidType,
      optimization_goal: data.optimizationGoal,
      placement_type: data.placementType,
      pacing: 'PACING_MODE_SMOOTH',
      billing_event: 'CPC', // ou OCPM dependendo do objetivo
    };

    // Bid price
    if (data.bidPrice && data.bidType === 'BID_TYPE_CUSTOM') {
      body.bid_price = data.bidPrice;
    }

    // Targeting
    if (data.targeting.ageGroups?.length) {
      body.age_groups = data.targeting.ageGroups;
    }
    if (data.targeting.gender) {
      body.gender = data.targeting.gender;
    }
    if (data.targeting.languages?.length) {
      body.languages = data.targeting.languages;
    }
    if (data.targeting.locations?.length) {
      body.location_ids = data.targeting.locations;
    }

    // Schedule
    if (data.schedule?.startTime) {
      body.schedule_start_time = data.schedule.startTime;
    }
    if (data.schedule?.endTime) {
      body.schedule_end_time = data.schedule.endTime;
    }

    return this.tokenManager.makeApiCallWithRetry<{ adgroup_id: string }>(
      token.access_token,
      '/adgroup/create/',
      'POST',
      body,
      { advertiserId: token.advertiser_id, accountId: token.account_id }
    );
  }

  /**
   * Atualiza status de ad groups
   */
  async updateAdGroupStatus(
    organizationId: string,
    adGroupIds: string[],
    status: EntityStatus
  ): Promise<StatusUpdateResponse> {
    validateOrganizationId(organizationId);
    validateIds(adGroupIds, 'ad group');

    const token = await this.getToken(organizationId);

    // Divide em batches se necessário
    if (adGroupIds.length > MAX_IDS_PER_REQUEST) {
      const results: string[] = [];
      
      for (let i = 0; i < adGroupIds.length; i += MAX_IDS_PER_REQUEST) {
        const batch = adGroupIds.slice(i, i + MAX_IDS_PER_REQUEST);
        const batchResponse = await this.tokenManager.makeApiCallWithRetry<StatusUpdateResponse>(
          token.access_token,
          '/adgroup/status/update/',
          'POST',
          {
            advertiser_id: token.advertiser_id,
            adgroup_ids: batch,
            opt_status: status,
          },
          { advertiserId: token.advertiser_id, accountId: token.account_id }
        );
        
        if (batchResponse.adgroup_ids) {
          results.push(...batchResponse.adgroup_ids);
        }
      }
      
      return { adgroup_ids: results };
    }

    return this.tokenManager.makeApiCallWithRetry<StatusUpdateResponse>(
      token.access_token,
      '/adgroup/status/update/',
      'POST',
      {
        advertiser_id: token.advertiser_id,
        adgroup_ids: adGroupIds,
        opt_status: status,
      },
      { advertiserId: token.advertiser_id, accountId: token.account_id }
    );
  }

  // ==========================================
  // ADS
  // ==========================================

  /**
   * Lista ads (opcionalmente filtrado por ad group)
   */
  async listAds(
    organizationId: string,
    adGroupId?: string,
    options?: { limit?: number }
  ): Promise<Ad[]> {
    validateOrganizationId(organizationId);

    const token = await this.getToken(organizationId);
    const allAds: Ad[] = [];
    let currentPage = 1;
    const pageSize = 100;
    const limit = options?.limit || 1000;

    while (allAds.length < limit) {
      const params: Record<string, any> = {
        advertiser_id: token.advertiser_id,
        page: currentPage,
        page_size: pageSize,
        fields: JSON.stringify([
          'ad_id', 'ad_name', 'adgroup_id', 'status', 'operation_status',
          'ad_text', 'call_to_action', 'video_id', 'image_ids'
        ]),
      };

      if (adGroupId) {
        params.filtering = JSON.stringify({ adgroup_ids: [adGroupId] });
      }

      const response = await this.tokenManager.makeApiCallWithRetry<ListResponse<Ad>>(
        token.access_token,
        '/ad/get/',
        'GET',
        params,
        { advertiserId: token.advertiser_id, accountId: token.account_id }
      );

      if (response.list?.length) {
        allAds.push(...response.list);
      }

      const pageInfo = response.page_info;
      if (!pageInfo || currentPage >= pageInfo.total_page || !response.list?.length) {
        break;
      }

      currentPage++;
    }

    return allAds.slice(0, limit);
  }

  /**
   * Atualiza status de ads
   */
  async updateAdStatus(
    organizationId: string,
    adIds: string[],
    status: EntityStatus
  ): Promise<StatusUpdateResponse> {
    validateOrganizationId(organizationId);
    validateIds(adIds, 'ad');

    const token = await this.getToken(organizationId);

    // Divide em batches se necessário
    if (adIds.length > MAX_IDS_PER_REQUEST) {
      const results: string[] = [];
      
      for (let i = 0; i < adIds.length; i += MAX_IDS_PER_REQUEST) {
        const batch = adIds.slice(i, i + MAX_IDS_PER_REQUEST);
        const batchResponse = await this.tokenManager.makeApiCallWithRetry<StatusUpdateResponse>(
          token.access_token,
          '/ad/status/update/',
          'POST',
          {
            advertiser_id: token.advertiser_id,
            ad_ids: batch,
            opt_status: status,
          },
          { advertiserId: token.advertiser_id, accountId: token.account_id }
        );
        
        if (batchResponse.ad_ids) {
          results.push(...batchResponse.ad_ids);
        }
      }
      
      return { ad_ids: results };
    }

    return this.tokenManager.makeApiCallWithRetry<StatusUpdateResponse>(
      token.access_token,
      '/ad/status/update/',
      'POST',
      {
        advertiser_id: token.advertiser_id,
        ad_ids: adIds,
        opt_status: status,
      },
      { advertiserId: token.advertiser_id, accountId: token.account_id }
    );
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private async getToken(organizationId: string): Promise<TokenData> {
    const token = await this.tokenManager.getValidToken(organizationId);
    if (!token) {
      throw new Error('No valid TikTok account connected');
    }
    return token;
  }

  /**
   * Converte status da API para formato legível
   */
  parseStatus(apiStatus: string): 'active' | 'paused' | 'deleted' | 'pending' | 'unknown' {
    const status = apiStatus?.toUpperCase() || '';
    
    if (status.includes('ENABLE') || status.includes('DELIVERY_OK') || status.includes('ACTIVE')) {
      return 'active';
    }
    if (status.includes('DISABLE') || status.includes('PAUSED')) {
      return 'paused';
    }
    if (status.includes('DELETE')) {
      return 'deleted';
    }
    if (status.includes('PENDING') || status.includes('REVIEW')) {
      return 'pending';
    }
    return 'unknown';
  }

  /**
   * Converte objetivo da API para texto legível
   */
  parseObjective(objective: string): string {
    return OBJECTIVE_LABELS[objective] || objective;
  }
}

// ==========================================
// SINGLETON EXPORT
// ==========================================

let _instance: TikTokCampaignService | null = null;

export function getCampaignService(): TikTokCampaignService {
  if (!_instance) {
    _instance = new TikTokCampaignService();
  }
  return _instance;
}

export const campaignService = {
  listCampaigns: (...args: Parameters<TikTokCampaignService['listCampaigns']>) =>
    getCampaignService().listCampaigns(...args),
  getCampaign: (...args: Parameters<TikTokCampaignService['getCampaign']>) =>
    getCampaignService().getCampaign(...args),
  createCampaign: (...args: Parameters<TikTokCampaignService['createCampaign']>) =>
    getCampaignService().createCampaign(...args),
  updateCampaign: (...args: Parameters<TikTokCampaignService['updateCampaign']>) =>
    getCampaignService().updateCampaign(...args),
  updateCampaignStatus: (...args: Parameters<TikTokCampaignService['updateCampaignStatus']>) =>
    getCampaignService().updateCampaignStatus(...args),
  listAdGroups: (...args: Parameters<TikTokCampaignService['listAdGroups']>) =>
    getCampaignService().listAdGroups(...args),
  createAdGroup: (...args: Parameters<TikTokCampaignService['createAdGroup']>) =>
    getCampaignService().createAdGroup(...args),
  updateAdGroupStatus: (...args: Parameters<TikTokCampaignService['updateAdGroupStatus']>) =>
    getCampaignService().updateAdGroupStatus(...args),
  listAds: (...args: Parameters<TikTokCampaignService['listAds']>) =>
    getCampaignService().listAds(...args),
  updateAdStatus: (...args: Parameters<TikTokCampaignService['updateAdStatus']>) =>
    getCampaignService().updateAdStatus(...args),
  parseStatus: (status: string) => getCampaignService().parseStatus(status),
  parseObjective: (objective: string) => getCampaignService().parseObjective(objective),
};
