/**
 * TikTok Services - Index
 * Exporta todos os serviços relacionados à integração com TikTok Ads
 */

// Token Manager
export { 
  tokenManager,
  getTokenManager,
  TikTokTokenManager,
  validateOrganizationId,
  isValidUUID,
  sanitizeString,
  encryptToken,
  decryptToken,
  createTikTokError,
  isTokenError,
  TIKTOK_ERROR_CODES,
  type TokenData,
  type TikTokApiError,
} from './token-manager';

// Metrics Service
export {
  metricsService,
  getMetricsService,
  TikTokMetricsService,
  TIKTOK_METRICS,
  DATA_LEVELS,
  REPORT_TYPES,
} from './metrics-service';

// Campaign Service
export {
  campaignService,
  getCampaignService,
  TikTokCampaignService,
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_STATUS,
  OBJECTIVE_LABELS,
  type Campaign,
  type AdGroup,
  type Ad,
  type CreateCampaignData,
  type UpdateCampaignData,
  type CreateAdGroupData,
  type CampaignObjective,
  type EntityStatus,
} from './campaign-service';
