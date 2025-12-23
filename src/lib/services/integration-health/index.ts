// =============================================
// Exportações do módulo Integration Health
// src/lib/services/integration-health/index.ts
// =============================================

export * from './types';
export { IntegrationHealthService } from './health-checker';
export { NotificationService } from './notifier';
export { BaseHealthChecker } from './checkers/base';
export { ShopifyHealthChecker } from './checkers/shopify';
export { WhatsAppHealthChecker } from './checkers/whatsapp';
