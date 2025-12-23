// =============================================
// Classe Base do Verificador de Saúde
// src/lib/services/integration-health/checkers/base.ts
// =============================================

import { 
  HealthCheckResult, 
  IntegrationConfig, 
  ConnectionStatus,
  NotificationPriority 
} from '../types';

export abstract class BaseHealthChecker {
  protected readonly config: IntegrationConfig;
  
  constructor(config: IntegrationConfig) {
    this.config = config;
  }
  
  abstract checkHealth(): Promise<HealthCheckResult>;
  
  protected shouldSendNotification(
    newStatus: ConnectionStatus,
    oldStatus: ConnectionStatus,
    consecutiveFailures: number,
    lastNotificationAt?: Date
  ): boolean {
    // Sempre notificar se passou de active para erro
    if (oldStatus === 'active' && this.isErrorStatus(newStatus)) {
      return true;
    }
    
    // Não notificar se status não mudou (exceto erros persistentes)
    if (newStatus === oldStatus && !this.isErrorStatus(newStatus)) {
      return false;
    }
    
    // Não spammar - mínimo 4 horas entre notificações
    if (lastNotificationAt) {
      const hoursSinceLastNotification = 
        (Date.now() - lastNotificationAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastNotification < 4) {
        return false;
      }
    }
    
    // Notificar após 3 falhas consecutivas
    if (consecutiveFailures >= 3) {
      return true;
    }
    
    // Notificar imediatamente se token expirou
    if (newStatus === 'expired') {
      return true;
    }
    
    return false;
  }
  
  protected getNotificationPriority(
    status: ConnectionStatus,
    consecutiveFailures: number
  ): NotificationPriority {
    if (status === 'expired') return 'high';
    if (status === 'error' && consecutiveFailures >= 5) return 'urgent';
    if (status === 'error') return 'high';
    if (status === 'reconnect_required') return 'high';
    if (status === 'warning') return 'normal';
    return 'low';
  }
  
  protected successResult(
    message = 'Conexão funcionando normalmente',
    extras: Partial<HealthCheckResult> = {}
  ): HealthCheckResult {
    return {
      success: true,
      status: 'active',
      message,
      shouldNotify: false,
      ...extras,
    };
  }
  
  protected errorResult(
    status: ConnectionStatus,
    statusCode: string,
    message: string,
    responseTimeMs?: number
  ): HealthCheckResult {
    const newConsecutiveFailures = this.config.consecutiveFailures + 1;
    const shouldNotify = this.shouldSendNotification(
      status,
      this.config.currentStatus,
      newConsecutiveFailures,
      this.config.lastNotificationAt
    );
    
    return {
      success: false,
      status,
      statusCode,
      message,
      responseTimeMs,
      shouldNotify,
      notificationPriority: this.getNotificationPriority(status, newConsecutiveFailures),
    };
  }
  
  private isErrorStatus(status: ConnectionStatus): boolean {
    return ['expired', 'error', 'reconnect_required'].includes(status);
  }
}
