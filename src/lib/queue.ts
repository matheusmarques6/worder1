/**
 * Queue - Sistema de Filas com Upstash QStash
 * 
 * Este módulo permite:
 * - Delays reais de minutos até dias
 * - Retry automático em caso de falha
 * - Execução assíncrona fora do request principal
 * - Escalabilidade automática
 */

// ============================================
// TIPOS
// ============================================

export interface QueueJob {
  type: 'automation_run' | 'automation_step' | 'send_email' | 'send_whatsapp' | 'webhook_call';
  data: Record<string, any>;
}

export interface EnqueueOptions {
  delay?: number; // segundos
  retries?: number;
  notBefore?: Date;
}

// ============================================
// CLIENTE QSTASH
// ============================================

interface QStashResponse {
  messageId: string;
}

class QStashClient {
  private token: string;
  private baseUrl = 'https://qstash.upstash.io/v2';

  constructor(token: string) {
    this.token = token;
  }

  async publishJSON(options: {
    url: string;
    body: any;
    delay?: number;
    retries?: number;
    notBefore?: number;
  }): Promise<QStashResponse> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };

    if (options.delay) {
      headers['Upstash-Delay'] = `${options.delay}s`;
    }

    if (options.retries !== undefined) {
      headers['Upstash-Retries'] = String(options.retries);
    }

    if (options.notBefore) {
      headers['Upstash-Not-Before'] = String(options.notBefore);
    }

    const response = await fetch(`${this.baseUrl}/publish/${options.url}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(options.body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`QStash error: ${error}`);
    }

    const data = await response.json();
    return { messageId: data.messageId };
  }
}

// ============================================
// VERIFICADOR DE ASSINATURA
// ============================================

class QStashReceiver {
  private currentSigningKey: string;
  private nextSigningKey: string;

  constructor(keys: { currentSigningKey: string; nextSigningKey: string }) {
    this.currentSigningKey = keys.currentSigningKey;
    this.nextSigningKey = keys.nextSigningKey;
  }

  async verify(options: { signature: string; body: string }): Promise<boolean> {
    const { signature, body } = options;

    // Try current key first
    if (await this.verifyWithKey(signature, body, this.currentSigningKey)) {
      return true;
    }

    // Try next key (for key rotation)
    if (await this.verifyWithKey(signature, body, this.nextSigningKey)) {
      return true;
    }

    return false;
  }

  private async verifyWithKey(signature: string, body: string, key: string): Promise<boolean> {
    try {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(key);
      const bodyData = encoder.encode(body);

      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, bodyData);
      const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

      return signature === expectedSignature;
    } catch {
      return false;
    }
  }
}

// ============================================
// SINGLETONS
// ============================================

let qstashClient: QStashClient | null = null;
let qstashReceiver: QStashReceiver | null = null;

function getQStashClient(): QStashClient | null {
  if (!qstashClient) {
    const token = process.env.QSTASH_TOKEN;
    if (!token) {
      return null;
    }
    qstashClient = new QStashClient(token);
  }
  return qstashClient;
}

function getQStashReceiver(): QStashReceiver | null {
  if (!qstashReceiver) {
    const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
    const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
    
    if (!currentSigningKey || !nextSigningKey) {
      return null;
    }
    
    qstashReceiver = new QStashReceiver({
      currentSigningKey,
      nextSigningKey,
    });
  }
  return qstashReceiver;
}

// ============================================
// FUNÇÕES DE ENFILEIRAMENTO
// ============================================

/**
 * Verifica se QStash está configurado
 */
export function isQStashConfigured(): boolean {
  return !!process.env.QSTASH_TOKEN;
}

/**
 * Enfileira execução de automação
 */
export async function enqueueAutomationRun(
  runId: string,
  options?: EnqueueOptions
): Promise<string | null> {
  const client = getQStashClient();
  if (!client) {
    console.warn('[Queue] QStash not configured');
    return null;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (!baseUrl) {
    console.warn('[Queue] APP_URL not configured');
    return null;
  }

  const response = await client.publishJSON({
    url: `${baseUrl}/api/workers/automation`,
    body: {
      type: 'automation_run',
      data: { runId },
    },
    delay: options?.delay,
    retries: options?.retries ?? 3,
    notBefore: options?.notBefore ? Math.floor(options.notBefore.getTime() / 1000) : undefined,
  });

  console.log(`[Queue] Enqueued automation run ${runId}, messageId: ${response.messageId}`);
  return response.messageId;
}

/**
 * Enfileira execução de um step específico (para delays)
 */
export async function enqueueAutomationStep(
  runId: string,
  nodeId: string,
  context: Record<string, any>,
  delaySeconds: number
): Promise<string | null> {
  const client = getQStashClient();
  if (!client) {
    console.warn('[Queue] QStash not configured');
    return null;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (!baseUrl) {
    console.warn('[Queue] APP_URL not configured');
    return null;
  }

  const response = await client.publishJSON({
    url: `${baseUrl}/api/workers/automation-step`,
    body: {
      type: 'automation_step',
      data: { runId, nodeId, context },
    },
    delay: delaySeconds,
    retries: 3,
  });

  console.log(`[Queue] Scheduled step ${nodeId} for run ${runId} in ${delaySeconds}s`);
  return response.messageId;
}

/**
 * Enfileira envio de email
 */
export async function enqueueEmailSend(
  organizationId: string,
  contactId: string,
  templateId: string,
  variables: Record<string, any>
): Promise<string | null> {
  const client = getQStashClient();
  if (!client) return null;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (!baseUrl) return null;

  const response = await client.publishJSON({
    url: `${baseUrl}/api/workers/send-email`,
    body: {
      type: 'send_email',
      data: { organizationId, contactId, templateId, variables },
    },
    retries: 3,
  });

  return response.messageId;
}

/**
 * Enfileira envio de WhatsApp
 */
export async function enqueueWhatsAppSend(
  organizationId: string,
  contactId: string,
  templateId: string,
  variables: Record<string, any>
): Promise<string | null> {
  const client = getQStashClient();
  if (!client) return null;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (!baseUrl) return null;

  const response = await client.publishJSON({
    url: `${baseUrl}/api/workers/send-whatsapp`,
    body: {
      type: 'send_whatsapp',
      data: { organizationId, contactId, templateId, variables },
    },
    retries: 3,
  });

  return response.messageId;
}

/**
 * Verifica assinatura de request do QStash
 */
export async function verifyQStashSignature(
  request: Request
): Promise<{ isValid: boolean; body: any }> {
  const receiver = getQStashReceiver();
  
  console.log('[Queue] Verifying signature. Receiver configured:', !!receiver);
  console.log('[Queue] Has upstash-signature:', request.headers.has('upstash-signature'));
  
  // Se QStash não está configurado, aceita internal requests
  if (!receiver) {
    console.log('[Queue] No receiver configured');
    const isInternal = request.headers.get('X-Internal-Request') === 'true';
    if (isInternal) {
      const body = await request.text();
      return { isValid: true, body: JSON.parse(body) };
    }
    // Em produção sem receiver, aceitar se tem CRON_SECRET
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      const body = await request.text();
      return { isValid: true, body: JSON.parse(body) };
    }
    return { isValid: false, body: null };
  }

  try {
    const signature = request.headers.get('upstash-signature');
    const body = await request.text();
    
    console.log('[Queue] Body length:', body.length);
    
    if (!signature) {
      // Verificar se é request interno
      const isInternal = request.headers.get('X-Internal-Request') === 'true';
      if (isInternal) {
        return { isValid: true, body: JSON.parse(body) };
      }
      console.log('[Queue] No signature and not internal');
      return { isValid: false, body: null };
    }

    const isValid = await receiver.verify({
      signature,
      body,
    });

    console.log('[Queue] Signature validation result:', isValid);

    return {
      isValid,
      body: isValid ? JSON.parse(body) : null,
    };
  } catch (error) {
    console.error('[Queue] Signature verification error:', error);
    return { isValid: false, body: null };
  }
}

// ============================================
// UTILITÁRIOS
// ============================================

/**
 * Calcula delay em segundos a partir de configuração
 */
export function calculateDelaySeconds(
  value: number,
  unit: 'minutes' | 'hours' | 'days'
): number {
  switch (unit) {
    case 'minutes':
      return value * 60;
    case 'hours':
      return value * 60 * 60;
    case 'days':
      return value * 24 * 60 * 60;
    default:
      return value * 60; // default to minutes
  }
}

/**
 * Agenda execução para data/hora específica
 */
export async function scheduleAutomationRun(
  runId: string,
  scheduledFor: Date
): Promise<string | null> {
  const now = new Date();
  const delaySeconds = Math.max(0, Math.floor((scheduledFor.getTime() - now.getTime()) / 1000));
  
  return enqueueAutomationRun(runId, { delay: delaySeconds });
}

// ============================================
// SHOPIFY WEBHOOKS
// ============================================

export interface ShopifyWebhookJob {
  eventId: string;
  topic: string;
  shopDomain: string;
  payload: any;
  storeId: string;
  organizationId: string;
}

/**
 * Enfileira webhook do Shopify para processamento assíncrono
 * Isso permite responder rapidamente ao Shopify (< 5 segundos)
 */
export async function enqueueShopifyWebhook(
  job: ShopifyWebhookJob
): Promise<string | null> {
  const client = getQStashClient();
  if (!client) {
    console.warn('[Queue] QStash not configured for Shopify webhook');
    return null;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (!baseUrl) {
    console.warn('[Queue] APP_URL not configured');
    return null;
  }

  try {
    const response = await client.publishJSON({
      url: `${baseUrl}/api/workers/shopify-webhook`,
      body: {
        type: 'shopify_webhook',
        data: job,
      },
      retries: 3,
    });

    console.log(`[Queue] Shopify webhook ${job.topic} queued, messageId: ${response.messageId}`);
    return response.messageId;
  } catch (error) {
    console.error('[Queue] Failed to enqueue Shopify webhook:', error);
    return null;
  }
}

export default {
  isQStashConfigured,
  enqueueAutomationRun,
  enqueueAutomationStep,
  enqueueEmailSend,
  enqueueWhatsAppSend,
  enqueueShopifyWebhook,
  verifyQStashSignature,
  calculateDelaySeconds,
  scheduleAutomationRun,
};
