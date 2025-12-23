// =============================================
// Tipos do Sistema de Health Check
// src/lib/services/integration-health/types.ts
// =============================================

export type IntegrationType = 'shopify' | 'whatsapp' | 'google_sheets' | 'hubspot';

export type ConnectionStatus = 
  | 'pending'
  | 'active' 
  | 'warning'
  | 'expired'
  | 'error'
  | 'reconnect_required'
  | 'disconnected';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface HealthCheckResult {
  success: boolean;
  status: ConnectionStatus;
  statusCode?: string;
  message?: string;
  responseTimeMs?: number;
  rawResponse?: Record<string, unknown>;
  shouldNotify: boolean;
  notificationPriority?: NotificationPriority;
}

export interface IntegrationCredentials {
  accessToken?: string;
  apiSecret?: string;
  shopDomain?: string;
  phoneNumberId?: string;
}

export interface IntegrationConfig {
  id: string;
  organizationId: string;
  type: IntegrationType;
  name: string;
  identifier: string;
  credentials: IntegrationCredentials;
  currentStatus: ConnectionStatus;
  consecutiveFailures: number;
  lastNotificationAt?: Date;
}

export interface NotificationPayload {
  organizationId: string;
  userId?: string;
  type: string;
  category: 'integration' | 'billing' | 'security' | 'system';
  priority: NotificationPriority;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  actionUrl?: string;
  actionLabel?: string;
  sendEmail?: boolean;
}

export interface CheckAllResult {
  total: number;
  checked: number;
  healthy: number;
  unhealthy: number;
  results: IntegrationCheckResult[];
}

export interface IntegrationCheckResult {
  type: string;
  id: string;
  name: string;
  status: ConnectionStatus;
  message?: string;
}

export interface NotificationRecord {
  id: string;
  organization_id: string;
  user_id?: string;
  type: string;
  category: string;
  priority: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  action_url?: string;
  action_label?: string;
  read: boolean;
  read_at?: string;
  created_at: string;
}
