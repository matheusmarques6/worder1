// =============================================
// Shopify Services - Index
// src/lib/services/shopify/index.ts
// =============================================

// Types
export * from './types';

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

// Jobs
export { 
  detectAbandonedCarts,
  cleanupOldWebhookEvents,
} from './jobs/abandoned-cart';

export {
  runReconciliation,
  checkWebhookHealth,
} from './jobs/reconciliation';
