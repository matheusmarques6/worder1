// =============================================
// Shopify Services - Index
// src/lib/services/shopify/index.ts
// =============================================

// Types
export * from './types';

// API Client (NEW)
export {
  ShopifyAPIClient,
  createShopifyClient,
  type ShopifyStore,
  type FetchResult,
  type FetchOptions,
} from './api-client';

// Full Sync (NEW)
export {
  runFullSync,
  runIncrementalSync,
  type SyncOptions,
  type SyncResult,
} from './full-sync';

// Analytics (NEW)
export * from './analytics';

// Contact Sync
export { 
  syncContactFromShopify,
  updateContactOrderStats,
  addAbandonedCartTag,
} from './contact-sync';

// Deal Sync
export {
  createOrUpdateDealForContact,
  moveDealToStage,
  markDealAsWon,
  createAbandonedCartDeal,
} from './deal-sync';

// Activity Tracker
export {
  trackActivity,
  trackPurchase,
  enrichContactFromOrder,
} from './activity-tracker';

// Webhook Processor
export { processShopifyWebhook } from './webhook-processor';

// Sync Config Integration (NEW)
export {
  getSyncConfig,
  getActiveTransitionRules,
  applyTransitionRules,
  createDealFromSyncConfig,
  logAutomation,
} from './sync-config-integration';

// Jobs
export { 
  detectAbandonedCarts,
  cleanupOldWebhookEvents,
} from './jobs/abandoned-cart';

export {
  runReconciliation,
  checkWebhookHealth,
} from './jobs/reconciliation';
