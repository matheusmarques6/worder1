// =============================================
// Verificador de Saúde do Shopify
// src/lib/services/integration-health/checkers/shopify.ts
// =============================================

import { BaseHealthChecker } from './base';
import { HealthCheckResult } from '../types';

interface ShopifyShopResponse {
  shop?: {
    name?: string;
  };
}

export class ShopifyHealthChecker extends BaseHealthChecker {
  private static readonly TIMEOUT_MS = 15000;
  private static readonly API_VERSION = '2024-10';
  
  async checkHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const { accessToken, shopDomain } = this.config.credentials;
      
      if (!accessToken || !shopDomain) {
        return this.errorResult(
          'error',
          'MISSING_CREDENTIALS',
          'Credenciais não configuradas. Configure o Access Token e domínio da loja.',
          Date.now() - startTime
        );
      }
      
      const domain = this.normalizeDomain(shopDomain);
      const response = await this.makeRequest(domain, accessToken);
      const responseTimeMs = Date.now() - startTime;
      
      if (response.ok) {
        return this.handleSuccessResponse(response, responseTimeMs);
      }
      
      return this.handleErrorResponse(response, responseTimeMs, domain);
      
    } catch (error) {
      return this.handleException(error, Date.now() - startTime);
    }
  }
  
  private normalizeDomain(shopDomain: string): string {
    return shopDomain.includes('.myshopify.com') 
      ? shopDomain 
      : `${shopDomain}.myshopify.com`;
  }
  
  private async makeRequest(domain: string, accessToken: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ShopifyHealthChecker.TIMEOUT_MS);
    
    try {
      return await fetch(
        `https://${domain}/admin/api/${ShopifyHealthChecker.API_VERSION}/shop.json`,
        {
          method: 'GET',
          headers: {
            'X-Shopify-Access-Token': accessToken,
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
    const data: ShopifyShopResponse = await response.json();
    
    // Verificar rate limit
    const rateLimitHeader = response.headers.get('X-Shopify-Shop-Api-Call-Limit');
    if (rateLimitHeader) {
      const [current, max] = rateLimitHeader.split('/').map(Number);
      const usageRatio = current / max;
      
      if (usageRatio > 0.9) {
        return {
          success: true,
          status: 'warning',
          statusCode: '200',
          message: `Rate limit alto: ${rateLimitHeader}. Considere reduzir a frequência de requisições.`,
          responseTimeMs,
          shouldNotify: this.config.currentStatus !== 'warning',
          notificationPriority: 'normal',
        };
      }
    }
    
    return {
      success: true,
      status: 'active',
      statusCode: '200',
      message: 'Conexão funcionando normalmente',
      responseTimeMs,
      rawResponse: { shop_name: data.shop?.name },
      shouldNotify: this.config.currentStatus !== 'active',
      notificationPriority: 'low',
    };
  }
  
  private async handleErrorResponse(
    response: Response, 
    responseTimeMs: number,
    domain: string
  ): Promise<HealthCheckResult> {
    const errorBody = await response.text().catch(() => '');
    
    const errorHandlers: Record<number, () => HealthCheckResult> = {
      401: () => this.errorResult(
        'expired',
        '401',
        'Token de acesso expirado ou inválido. Gere um novo token no painel do Shopify.',
        responseTimeMs
      ),
      402: () => this.errorResult(
        'error',
        '402',
        'Loja Shopify está congelada ou com pagamento pendente.',
        responseTimeMs
      ),
      403: () => this.errorResult(
        'error',
        '403',
        'Acesso negado. O app pode ter sido desinstalado ou as permissões foram revogadas.',
        responseTimeMs
      ),
      404: () => this.errorResult(
        'error',
        '404',
        `Loja não encontrada: ${domain}. Verifique se o domínio está correto.`,
        responseTimeMs
      ),
      423: () => this.errorResult(
        'error',
        '423',
        'Loja Shopify está bloqueada.',
        responseTimeMs
      ),
      429: () => ({
        success: false,
        status: 'warning' as const,
        statusCode: '429',
        message: 'Rate limit excedido temporariamente. Tente novamente em alguns minutos.',
        responseTimeMs,
        shouldNotify: this.config.consecutiveFailures >= 5,
        notificationPriority: 'normal' as const,
      }),
    };
    
    const handler = errorHandlers[response.status];
    if (handler) {
      return handler();
    }
    
    // Erros de servidor (5xx) - temporários
    if (response.status >= 500 && response.status < 600) {
      return {
        success: false,
        status: 'warning',
        statusCode: response.status.toString(),
        message: 'Shopify temporariamente indisponível. Isso geralmente se resolve sozinho.',
        responseTimeMs,
        shouldNotify: this.config.consecutiveFailures >= 5,
        notificationPriority: 'normal',
      };
    }
    
    return this.errorResult(
      'error',
      response.status.toString(),
      `Erro inesperado (${response.status}): ${errorBody.substring(0, 200)}`,
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
          message: `Tempo limite excedido ao conectar com Shopify (${ShopifyHealthChecker.TIMEOUT_MS / 1000}s). Pode ser instabilidade temporária.`,
          responseTimeMs,
          shouldNotify: this.config.consecutiveFailures >= 3,
          notificationPriority: 'normal',
        };
      }
      
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        return this.errorResult(
          'error',
          'NETWORK_ERROR',
          'Erro de rede ao conectar com Shopify. Verifique sua conexão.',
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
