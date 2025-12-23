// =============================================
// Serviço de Notificações
// src/lib/services/integration-health/notifier.ts
// =============================================

import { SupabaseClient } from '@supabase/supabase-js';
import { 
  IntegrationConfig, 
  HealthCheckResult, 
  NotificationPayload,
  NotificationRecord,
  IntegrationType
} from './types';

const INTEGRATION_LABELS: Record<IntegrationType, string> = {
  shopify: 'Shopify',
  whatsapp: 'WhatsApp',
  google_sheets: 'Google Sheets',
  hubspot: 'HubSpot',
};

export class NotificationService {
  constructor(private readonly supabase: SupabaseClient) {}
  
  async sendIntegrationAlert(
    config: IntegrationConfig,
    result: HealthCheckResult
  ): Promise<void> {
    try {
      const notification = this.buildNotification(config, result);
      await this.createNotification(notification);
      console.log(`📧 Notificação criada: ${notification.title}`);
    } catch (error) {
      console.error('Erro ao enviar notificação:', error);
    }
  }
  
  private buildNotification(
    config: IntegrationConfig,
    result: HealthCheckResult
  ): NotificationPayload {
    const integrationLabel = INTEGRATION_LABELS[config.type] || config.type;
    
    const messages: Record<string, { title: string; message: string }> = {
      expired: {
        title: `⚠️ ${integrationLabel}: Token Expirado`,
        message: `A conexão com "${config.name}" expirou. Você precisa gerar um novo token para continuar sincronizando dados.`,
      },
      error: {
        title: `❌ ${integrationLabel}: Erro de Conexão`,
        message: `Não foi possível conectar com "${config.name}". ${result.message ?? ''}`,
      },
      warning: {
        title: `⚠️ ${integrationLabel}: Atenção Necessária`,
        message: `"${config.name}": ${result.message ?? ''}`,
      },
      reconnect_required: {
        title: `🔄 ${integrationLabel}: Reconexão Necessária`,
        message: `"${config.name}" precisa ser reconectado. ${result.message ?? ''}`,
      },
      active: {
        title: `✅ ${integrationLabel}: Conexão Restaurada`,
        message: `A conexão com "${config.name}" foi restaurada e está funcionando normalmente.`,
      },
    };
    
    const { title, message } = messages[result.status] ?? {
      title: `${integrationLabel}: Status Alterado`,
      message: result.message ?? 'Verifique sua integração.',
    };
    
    return {
      organizationId: config.organizationId,
      type: `${config.type}_${result.status}`,
      category: 'integration',
      priority: result.notificationPriority ?? 'normal',
      title,
      message,
      data: {
        integration_type: config.type,
        integration_id: config.id,
        integration_name: config.name,
        identifier: config.identifier,
        status: result.status,
        status_code: result.statusCode,
        checked_at: new Date().toISOString(),
      },
      actionUrl: `/integrations/${config.type}`,
      actionLabel: result.status === 'active' ? 'Ver Detalhes' : 'Reconectar',
    };
  }
  
  private async createNotification(payload: NotificationPayload): Promise<void> {
    const { error } = await this.supabase.from('notifications').insert({
      organization_id: payload.organizationId,
      user_id: payload.userId ?? null,
      type: payload.type,
      category: payload.category,
      priority: payload.priority,
      title: payload.title,
      message: payload.message,
      data: payload.data,
      action_url: payload.actionUrl,
      action_label: payload.actionLabel,
      read: false,
    });
    
    if (error) {
      console.error('Erro ao criar notificação:', error);
      throw error;
    }
  }
  
  async getUnreadCount(organizationId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('read', false);
    
    if (error) {
      console.error('Erro ao contar notificações:', error);
      return 0;
    }
    
    return count ?? 0;
  }
  
  async listNotifications(
    organizationId: string,
    options: { limit?: number; unreadOnly?: boolean } = {}
  ): Promise<NotificationRecord[]> {
    const { limit = 20, unreadOnly = false } = options;
    
    let query = this.supabase
      .from('notifications')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (unreadOnly) {
      query = query.eq('read', false);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Erro ao listar notificações:', error);
      return [];
    }
    
    return (data ?? []) as NotificationRecord[];
  }
  
  async markAsRead(notificationIds: string[]): Promise<void> {
    if (notificationIds.length === 0) return;
    
    const { error } = await this.supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .in('id', notificationIds);
    
    if (error) {
      console.error('Erro ao marcar como lida:', error);
    }
  }
  
  async markAllAsRead(organizationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('read', false);
    
    if (error) {
      console.error('Erro ao marcar todas como lidas:', error);
    }
  }
}
