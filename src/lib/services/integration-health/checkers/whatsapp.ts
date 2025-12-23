// =============================================
// Verificador de Saúde do WhatsApp Business API
// src/lib/services/integration-health/checkers/whatsapp.ts
// =============================================

import { BaseHealthChecker } from './base';
import { HealthCheckResult } from '../types';

interface WhatsAppPhoneResponse {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  platform_type?: string;
}

interface WhatsAppErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export class WhatsAppHealthChecker extends BaseHealthChecker {
  private static readonly TIMEOUT_MS = 15000;
  private static readonly API_VERSION = 'v18.0';
  private static readonly GRAPH_API_URL = 'https://graph.facebook.com';
  
  async checkHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const { accessToken, phoneNumberId } = this.config.credentials;
      
      if (!accessToken || !phoneNumberId) {
        return this.errorResult(
          'error',
          'MISSING_CREDENTIALS',
          'Credenciais não configuradas. Configure o Access Token e Phone Number ID.',
          Date.now() - startTime
        );
      }
      
      const response = await this.makeRequest(phoneNumberId, accessToken);
      const responseTimeMs = Date.now() - startTime;
      
      if (response.ok) {
        return this.handleSuccessResponse(response, responseTimeMs);
      }
      
      return this.handleErrorResponse(response, responseTimeMs);
      
    } catch (error) {
      return this.handleException(error, Date.now() - startTime);
    }
  }
  
  private async makeRequest(phoneNumberId: string, accessToken: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WhatsAppHealthChecker.TIMEOUT_MS);
    
    try {
      // Verifica o Phone Number ID específico para garantir que temos acesso
      return await fetch(
        `${WhatsAppHealthChecker.GRAPH_API_URL}/${WhatsAppHealthChecker.API_VERSION}/${phoneNumberId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  
  private async handleSuccessResponse(
    response: Response, 
    responseTimeMs: number
  ): Promise<HealthCheckResult> {
    const data: WhatsAppPhoneResponse = await response.json();
    
    // Verificar qualidade do número
    if (data.quality_rating === 'RED') {
      return {
        success: true,
        status: 'warning',
        statusCode: '200',
        message: 'Qualidade do número está baixa (RED). Isso pode afetar a entrega de mensagens.',
        responseTimeMs,
        rawResponse: {
          phone_number: data.display_phone_number,
          verified_name: data.verified_name,
          quality_rating: data.quality_rating,
        },
        shouldNotify: this.config.currentStatus !== 'warning',
        notificationPriority: 'high',
      };
    }
    
    if (data.quality_rating === 'YELLOW') {
      return {
        success: true,
        status: 'warning',
        statusCode: '200',
        message: 'Qualidade do número está média (YELLOW). Monitore a taxa de bloqueios.',
        responseTimeMs,
        rawResponse: {
          phone_number: data.display_phone_number,
          verified_name: data.verified_name,
          quality_rating: data.quality_rating,
        },
        shouldNotify: this.config.currentStatus === 'active',
        notificationPriority: 'normal',
      };
    }
    
    return {
      success: true,
      status: 'active',
      statusCode: '200',
      message: 'WhatsApp Business API funcionando normalmente',
      responseTimeMs,
      rawResponse: {
        phone_number: data.display_phone_number,
        verified_name: data.verified_name,
        quality_rating: data.quality_rating ?? 'GREEN',
      },
      shouldNotify: this.config.currentStatus !== 'active',
      notificationPriority: 'low',
    };
  }
  
  private async handleErrorResponse(
    response: Response, 
    responseTimeMs: number
  ): Promise<HealthCheckResult> {
    let errorData: WhatsAppErrorResponse = {};
    
    try {
      errorData = await response.json();
    } catch {
      // Ignora erro de parse
    }
    
    const errorCode = errorData.error?.code;
    const errorSubcode = errorData.error?.error_subcode;
    const errorMessage = errorData.error?.message ?? '';
    const errorType = errorData.error?.type ?? '';
    
    // Token expirado ou inválido
    if (errorCode === 190 || errorType === 'OAuthException') {
      // Subcode 463 = Token expirado
      // Subcode 460 = Senha alterada
      if (errorSubcode === 463) {
        return this.errorResult(
          'expired',
          '190',
          'Token de acesso expirado. Gere um novo token no Meta Business Suite.',
          responseTimeMs
        );
      }
      
      return this.errorResult(
        'expired',
        '190',
        'Token de acesso inválido ou expirado. Reconecte sua conta no Meta Business Suite.',
        responseTimeMs
      );
    }
    
    // Permissão negada
    if (errorCode === 10 || errorCode === 200) {
      return this.errorResult(
        'error',
        errorCode.toString(),
        'Permissões insuficientes. O app precisa das permissões whatsapp_business_messaging e whatsapp_business_management.',
        responseTimeMs
      );
    }
    
    // Phone Number ID não encontrado ou sem acesso
    if (errorCode === 100) {
      return this.errorResult(
        'error',
        '100',
        'Phone Number ID não encontrado ou sem acesso. Verifique se o número está vinculado à sua conta.',
        responseTimeMs
      );
    }
    
    // Rate limit
    if (errorCode === 4 || errorCode === 17 || errorCode === 613) {
      return {
        success: false,
        status: 'warning',
        statusCode: errorCode.toString(),
        message: 'Rate limit atingido. Aguarde alguns minutos antes de tentar novamente.',
        responseTimeMs,
        shouldNotify: this.config.consecutiveFailures >= 5,
        notificationPriority: 'normal',
      };
    }
    
    // Business account issue
    if (errorCode === 131031) {
      return this.errorResult(
        'error',
        '131031',
        'Conta Business não verificada ou com restrições. Verifique o status no Meta Business Suite.',
        responseTimeMs
      );
    }
    
    // Conta suspensa
    if (errorCode === 368) {
      return this.errorResult(
        'error',
        '368',
        'Conta temporariamente bloqueada por violação de políticas. Verifique o Meta Business Suite.',
        responseTimeMs
      );
    }
    
    // Erro de servidor Meta (temporário)
    if (response.status >= 500) {
      return {
        success: false,
        status: 'warning',
        statusCode: response.status.toString(),
        message: 'Meta API temporariamente indisponível. Isso geralmente se resolve sozinho.',
        responseTimeMs,
        shouldNotify: this.config.consecutiveFailures >= 5,
        notificationPriority: 'normal',
      };
    }
    
    // HTTP 401/403
    if (response.status === 401 || response.status === 403) {
      return this.errorResult(
        'expired',
        response.status.toString(),
        'Acesso negado. Token pode estar expirado ou sem permissões.',
        responseTimeMs
      );
    }
    
    return this.errorResult(
      'error',
      response.status.toString(),
      `Erro da API Meta: ${errorMessage.substring(0, 200) || 'Erro desconhecido'}`,
      responseTimeMs
    );
  }
  
  private handleException(error: unknown, responseTimeMs: number): HealthCheckResult {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          status: 'warning',
          statusCode: 'TIMEOUT',
          message: `Tempo limite excedido ao conectar com Meta API (${WhatsAppHealthChecker.TIMEOUT_MS / 1000}s). Pode ser instabilidade temporária.`,
          responseTimeMs,
          shouldNotify: this.config.consecutiveFailures >= 3,
          notificationPriority: 'normal',
        };
      }
      
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        return this.errorResult(
          'error',
          'NETWORK_ERROR',
          'Erro de rede ao conectar com Meta API. Verifique sua conexão.',
          responseTimeMs
        );
      }
      
      return this.errorResult(
        'error',
        'UNKNOWN',
        `Erro: ${error.message}`,
        responseTimeMs
      );
    }
    
    return this.errorResult(
      'error',
      'UNKNOWN',
      'Erro desconhecido',
      responseTimeMs
    );
  }
}
