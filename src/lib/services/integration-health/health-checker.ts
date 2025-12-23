// =============================================
// Serviço Principal de Health Check
// src/lib/services/integration-health/health-checker.ts
// =============================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ShopifyHealthChecker } from './checkers/shopify';
import { NotificationService } from './notifier';
import { 
  IntegrationType, 
  IntegrationConfig, 
  HealthCheckResult,
  CheckAllResult,
  IntegrationCheckResult
} from './types';

interface IntegrationRecord {
  type: string;
  id: string;
  name: string;
}

interface ShopifyStoreRecord {
  id: string;
  organization_id: string;
  shop_name: string | null;
  shop_domain: string;
  access_token: string;
  api_secret?: string;
  status?: string;
  connection_status?: string;
  consecutive_failures?: number;
  last_notification_at?: string;
}

interface WhatsAppConfigRecord {
  id: string;
  organization_id: string;
  business_name: string | null;
  phone_number: string;
  access_token: string;
  phone_number_id: string;
  connection_status?: string;
  consecutive_failures?: number;
  last_notification_at?: string;
}

export class IntegrationHealthService {
  private readonly supabase: SupabaseClient;
  private readonly notifier: NotificationService;
  
  constructor(supabaseClient?: SupabaseClient) {
    this.supabase = supabaseClient ?? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    this.notifier = new NotificationService(this.supabase);
  }
  
  async checkIntegration(
    type: IntegrationType, 
    integrationId: string
  ): Promise<HealthCheckResult> {
    console.log(`🔍 Verificando ${type}:${integrationId}...`);
    
    const config = await this.getIntegrationConfig(type, integrationId);
    if (!config) {
      throw new Error(`Integração não encontrada: ${type}:${integrationId}`);
    }
    
    const checker = this.createChecker(type, config);
    const result = await checker.checkHealth();
    
    console.log(`   Status: ${result.status} (${result.statusCode ?? 'N/A'}) - ${result.message}`);
    
    await this.updateIntegrationStatus(type, integrationId, result, config);
    await this.logHealthCheck(config, result);
    
    if (result.shouldNotify) {
      console.log(`   📧 Enviando notificação...`);
      await this.notifier.sendIntegrationAlert(config, result);
    }
    
    return result;
  }
  
  async checkAllIntegrations(): Promise<CheckAllResult> {
    console.log('🔄 Iniciando verificação de todas as integrações...');
    
    const integrations = await this.getAllActiveIntegrations();
    console.log(`   Encontradas ${integrations.length} integrações ativas`);
    
    const { results, healthy, unhealthy } = await this.processIntegrations(integrations);
    
    console.log(`✅ Verificação concluída: ${healthy} saudáveis, ${unhealthy} com problemas`);
    
    return {
      total: integrations.length,
      checked: results.length,
      healthy,
      unhealthy,
      results,
    };
  }
  
  async checkOrganizationIntegrations(organizationId: string): Promise<CheckAllResult> {
    console.log(`🔄 Verificando integrações da org ${organizationId}...`);
    
    const integrations = await this.getOrganizationIntegrations(organizationId);
    const { results, healthy, unhealthy } = await this.processIntegrations(integrations);
    
    return {
      total: integrations.length,
      checked: results.length,
      healthy,
      unhealthy,
      results,
    };
  }
  
  private async processIntegrations(
    integrations: IntegrationRecord[]
  ): Promise<{ results: IntegrationCheckResult[]; healthy: number; unhealthy: number }> {
    const results: IntegrationCheckResult[] = [];
    let healthy = 0;
    let unhealthy = 0;
    
    for (const integration of integrations) {
      try {
        const result = await this.checkIntegration(
          integration.type as IntegrationType,
          integration.id
        );
        
        results.push({
          type: integration.type,
          id: integration.id,
          name: integration.name,
          status: result.status,
          message: result.message,
        });
        
        if (result.success) {
          healthy++;
        } else {
          unhealthy++;
        }
        
        await this.delay(500);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error(`   ❌ Erro ao verificar ${integration.type}:${integration.id}:`, errorMessage);
        unhealthy++;
        results.push({
          type: integration.type,
          id: integration.id,
          name: integration.name,
          status: 'error',
          message: errorMessage,
        });
      }
    }
    
    return { results, healthy, unhealthy };
  }
  
  private async getIntegrationConfig(
    type: IntegrationType,
    id: string
  ): Promise<IntegrationConfig | null> {
    switch (type) {
      case 'shopify':
        return this.getShopifyConfig(id);
      case 'whatsapp':
        return this.getWhatsAppConfig(id);
      default:
        return null;
    }
  }
  
  private async getShopifyConfig(id: string): Promise<IntegrationConfig | null> {
    const { data, error } = await this.supabase
      .from('shopify_stores')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) return null;
    
    const record = data as ShopifyStoreRecord;
    return {
      id: record.id,
      organizationId: record.organization_id,
      type: 'shopify',
      name: record.shop_name ?? 'Loja Shopify',
      identifier: record.shop_domain,
      credentials: {
        accessToken: record.access_token,
        apiSecret: record.api_secret,
        shopDomain: record.shop_domain,
      },
      currentStatus: (record.connection_status as IntegrationConfig['currentStatus']) ?? 'active',
      consecutiveFailures: record.consecutive_failures ?? 0,
      lastNotificationAt: record.last_notification_at 
        ? new Date(record.last_notification_at) 
        : undefined,
    };
  }
  
  private async getWhatsAppConfig(id: string): Promise<IntegrationConfig | null> {
    const { data, error } = await this.supabase
      .from('whatsapp_configs')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) return null;
    
    const record = data as WhatsAppConfigRecord;
    return {
      id: record.id,
      organizationId: record.organization_id,
      type: 'whatsapp',
      name: record.business_name ?? 'WhatsApp',
      identifier: record.phone_number,
      credentials: {
        accessToken: record.access_token,
        phoneNumberId: record.phone_number_id,
      },
      currentStatus: (record.connection_status as IntegrationConfig['currentStatus']) ?? 'active',
      consecutiveFailures: record.consecutive_failures ?? 0,
      lastNotificationAt: record.last_notification_at 
        ? new Date(record.last_notification_at) 
        : undefined,
    };
  }
  
  private createChecker(type: IntegrationType, config: IntegrationConfig) {
    switch (type) {
      case 'shopify':
        return new ShopifyHealthChecker(config);
      default:
        throw new Error(`Checker não implementado para: ${type}`);
    }
  }
  
  private async updateIntegrationStatus(
    type: IntegrationType,
    id: string,
    result: HealthCheckResult,
    config: IntegrationConfig
  ): Promise<void> {
    const tableName = type === 'shopify' ? 'shopify_stores' : 'whatsapp_configs';
    
    const updateData: Record<string, unknown> = {
      connection_status: result.status,
      status_message: result.message,
      status_code: result.statusCode,
      health_checked_at: new Date().toISOString(),
      consecutive_failures: result.success ? 0 : config.consecutiveFailures + 1,
    };
    
    if (result.shouldNotify) {
      updateData.last_notification_at = new Date().toISOString();
    }
    
    const { error } = await this.supabase
      .from(tableName)
      .update(updateData)
      .eq('id', id);
    
    if (error) {
      console.error('Erro ao atualizar status:', error);
    }
  }
  
  private async logHealthCheck(
    config: IntegrationConfig,
    result: HealthCheckResult
  ): Promise<void> {
    const logStatus = result.success 
      ? 'success' 
      : result.status === 'warning' 
        ? 'warning' 
        : 'error';
    
    const { error } = await this.supabase
      .from('integration_health_logs')
      .insert({
        organization_id: config.organizationId,
        integration_type: config.type,
        integration_id: config.id,
        status: logStatus,
        status_code: result.statusCode,
        response_time_ms: result.responseTimeMs,
        message: result.message,
      });
    
    if (error) {
      console.error('Erro ao registrar log:', error);
    }
  }
  
  private async getAllActiveIntegrations(): Promise<IntegrationRecord[]> {
    const integrations: IntegrationRecord[] = [];
    
    const { data: shopifyStores } = await this.supabase
      .from('shopify_stores')
      .select('id, shop_name, status')
      .or('status.eq.active,status.is.null');
    
    if (shopifyStores) {
      for (const store of shopifyStores) {
        integrations.push({ 
          type: 'shopify', 
          id: store.id, 
          name: store.shop_name ?? 'Loja Shopify'
        });
      }
    }
    
    return integrations;
  }
  
  private async getOrganizationIntegrations(
    organizationId: string
  ): Promise<IntegrationRecord[]> {
    const integrations: IntegrationRecord[] = [];
    
    const { data: shopifyStores } = await this.supabase
      .from('shopify_stores')
      .select('id, shop_name')
      .eq('organization_id', organizationId)
      .or('status.eq.active,status.is.null');
    
    if (shopifyStores) {
      for (const store of shopifyStores) {
        integrations.push({ 
          type: 'shopify', 
          id: store.id, 
          name: store.shop_name ?? 'Loja Shopify'
        });
      }
    }
    
    return integrations;
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
