/**
 * WEBHOOK SECURITY UTILITIES
 * 
 * Modelo seguro para webhooks externos (Shopify, Klaviyo, Custom, etc.)
 * 
 * IMPORTANTE: Webhooks externos NÃO podem usar getAuthClient() porque:
 * 1. Não há usuário autenticado (não há sessão/cookie)
 * 2. RLS não funciona sem auth.uid()
 * 3. A autenticação é via HMAC/Token, não via JWT
 * 
 * Por isso, webhooks DEVEM usar SERVICE_ROLE com validações próprias.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

// ============================================
// TIPOS
// ============================================

export interface WebhookSecurityConfig {
  /** Nome do webhook para logs */
  name: string;
  /** Secret para HMAC (ou token para Bearer) */
  secret: string;
  /** Header onde vem a assinatura HMAC */
  signatureHeader?: string;
  /** Prefixo da assinatura (ex: "sha256=") */
  signaturePrefix?: string;
  /** Se aceita Bearer Token como alternativa ao HMAC */
  allowBearerToken?: boolean;
  /** Rate limit: máximo de requests por minuto */
  rateLimit?: number;
  /** Se valida timestamp para prevenir replay attacks */
  validateTimestamp?: boolean;
  /** Janela de tempo válida em ms (default: 5 min) */
  timestampWindow?: number;
}

export interface WebhookValidationResult {
  valid: boolean;
  error?: string;
  statusCode?: number;
}

// ============================================
// RATE LIMITING
// ============================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string, 
  maxRequests: number = 30,
  windowMs: number = 60000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: maxRequests - record.count };
}

// ============================================
// HMAC VERIFICATION
// ============================================

/**
 * Verifica assinatura HMAC de forma segura (timing-safe)
 * 
 * NOTA: Usa createHmac (não createHash!) para incluir o secret na verificação
 */
export function verifyHmacSignature(
  payload: string,
  signature: string | null,
  secret: string,
  prefix: string = ''
): boolean {
  if (!signature || !secret) return false;
  
  try {
    // Remove prefixo se existir (ex: "sha256=")
    const actualSignature = prefix && signature.startsWith(prefix)
      ? signature.slice(prefix.length)
      : signature;
    
    // Gera HMAC esperado usando o SECRET (diferente de hash simples!)
    const expectedSignature = createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');
    
    // Comparação timing-safe para prevenir timing attacks
    const sigBuffer = Buffer.from(actualSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    
    if (sigBuffer.length !== expectedBuffer.length) return false;
    
    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

// ============================================
// BEARER TOKEN VERIFICATION
// ============================================

/**
 * Verifica Bearer Token de forma segura (timing-safe)
 */
export function verifyBearerToken(
  authHeader: string | null,
  expectedToken: string
): boolean {
  if (!authHeader || !expectedToken) return false;
  
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;
  
  try {
    const tokenBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expectedToken);
    
    if (tokenBuffer.length !== expectedBuffer.length) return false;
    
    return timingSafeEqual(tokenBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

// ============================================
// TIMESTAMP VALIDATION (Anti-Replay)
// ============================================

/**
 * Valida timestamp para prevenir replay attacks
 */
export function validateTimestamp(
  timestamp: number | string | undefined,
  windowMs: number = 5 * 60 * 1000 // 5 minutos
): boolean {
  if (!timestamp) return true; // Timestamp é opcional
  
  const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
  if (isNaN(ts)) return false;
  
  const now = Date.now();
  return Math.abs(now - ts) <= windowMs;
}

// ============================================
// LOGGING
// ============================================

export interface WebhookLogData {
  webhook: string;
  success: boolean;
  ip: string;
  userAgent: string;
  error?: string;
  organizationId?: string;
  duration?: number;
}

export function logWebhookAttempt(
  request: NextRequest,
  webhookName: string,
  success: boolean,
  error?: string,
  extra?: Record<string, unknown>
): void {
  const ip = request.headers.get('x-forwarded-for') ||
             request.headers.get('x-real-ip') ||
             'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  const logData: WebhookLogData & Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    webhook: webhookName,
    success,
    ip,
    userAgent,
    error,
    ...extra,
  };

  if (success) {
    console.log(`[Webhook:${webhookName}] ✅`, JSON.stringify(logData));
  } else {
    console.warn(`[Webhook:${webhookName}] ❌`, JSON.stringify(logData));
  }
}

// ============================================
// UNIFIED WEBHOOK VALIDATOR
// ============================================

/**
 * Validador unificado para webhooks
 * 
 * Uso:
 * ```
 * const validation = await validateWebhook(request, {
 *   name: 'shopify',
 *   secret: process.env.SHOPIFY_WEBHOOK_SECRET!,
 *   signatureHeader: 'x-shopify-hmac-sha256',
 *   signaturePrefix: '',
 *   rateLimit: 100,
 * });
 * 
 * if (!validation.valid) {
 *   return NextResponse.json({ error: validation.error }, { status: validation.statusCode });
 * }
 * ```
 */
export async function validateWebhook(
  request: NextRequest,
  config: WebhookSecurityConfig,
  rawBody?: string
): Promise<WebhookValidationResult & { rawBody: string }> {
  const startTime = Date.now();
  
  // 1. Rate Limiting
  if (config.rateLimit) {
    const key = `webhook:${config.name}`;
    const rateCheck = checkRateLimit(key, config.rateLimit);
    
    if (!rateCheck.allowed) {
      logWebhookAttempt(request, config.name, false, 'Rate limit exceeded');
      return {
        valid: false,
        error: 'Too many requests',
        statusCode: 429,
        rawBody: '',
      };
    }
  }
  
  // 2. Ler body (se não foi passado)
  const body = rawBody || await request.text();
  
  // 3. Verificar autenticação
  const signatureHeader = config.signatureHeader || 'x-webhook-signature';
  const signature = request.headers.get(signatureHeader) ||
                   request.headers.get('x-signature');
  const authHeader = request.headers.get('authorization');
  
  let authenticated = false;
  
  // Tentar HMAC
  if (signature && config.secret) {
    authenticated = verifyHmacSignature(
      body,
      signature,
      config.secret,
      config.signaturePrefix || ''
    );
  }
  
  // Tentar Bearer Token como fallback
  if (!authenticated && config.allowBearerToken && authHeader) {
    authenticated = verifyBearerToken(authHeader, config.secret);
  }
  
  if (!authenticated) {
    logWebhookAttempt(request, config.name, false, 'Authentication failed');
    return {
      valid: false,
      error: 'Invalid signature or token',
      statusCode: 401,
      rawBody: body,
    };
  }
  
  // 4. Validar timestamp (se habilitado)
  if (config.validateTimestamp) {
    try {
      const parsed = JSON.parse(body);
      const timestamp = parsed.timestamp || parsed.created_at || parsed.sent_at;
      
      if (timestamp && !validateTimestamp(timestamp, config.timestampWindow)) {
        logWebhookAttempt(request, config.name, false, 'Invalid timestamp');
        return {
          valid: false,
          error: 'Request expired',
          statusCode: 400,
          rawBody: body,
        };
      }
    } catch {
      // Ignora erro de parse aqui, será tratado depois
    }
  }
  
  const duration = Date.now() - startTime;
  logWebhookAttempt(request, config.name, true, undefined, { duration });
  
  return {
    valid: true,
    rawBody: body,
  };
}

// ============================================
// PAYLOAD VALIDATION
// ============================================

/**
 * Parseia JSON de forma segura com validação de tamanho
 */
export function parsePayload<T = Record<string, unknown>>(
  rawBody: string,
  maxSizeBytes: number = 100000 // 100KB default
): { success: true; data: T } | { success: false; error: string } {
  // Verificar tamanho
  if (rawBody.length > maxSizeBytes) {
    return { success: false, error: `Payload too large (max ${maxSizeBytes} bytes)` };
  }
  
  try {
    const parsed = JSON.parse(rawBody) as T;
    
    // Verificar se é objeto
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { success: false, error: 'Payload must be a JSON object' };
    }
    
    return { success: true, data: parsed };
  } catch (e) {
    return { success: false, error: 'Invalid JSON' };
  }
}

/**
 * Valida campos obrigatórios em um objeto
 */
export function validateRequiredFields(
  data: Record<string, unknown>,
  requiredFields: string[]
): { valid: true } | { valid: false; missing: string[] } {
  const missing = requiredFields.filter(field => {
    const value = data[field];
    return value === undefined || value === null || value === '';
  });
  
  if (missing.length > 0) {
    return { valid: false, missing };
  }
  
  return { valid: true };
}

// ============================================
// RESPONSE HELPERS
// ============================================

export function webhookError(message: string, status: number = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function webhookSuccess(data: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ success: true, ...data });
}

// ============================================
// EXEMPLO DE USO COMPLETO
// ============================================

/*
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { 
  validateWebhook, 
  parsePayload, 
  webhookError, 
  webhookSuccess 
} from '@/lib/webhook-security';

export async function POST(request: NextRequest) {
  // 1. Validar webhook (HMAC + rate limit)
  const validation = await validateWebhook(request, {
    name: 'shopify-orders',
    secret: process.env.SHOPIFY_WEBHOOK_SECRET!,
    signatureHeader: 'x-shopify-hmac-sha256',
    rateLimit: 100,
  });

  if (!validation.valid) {
    return webhookError(validation.error!, validation.statusCode);
  }

  // 2. Parsear payload
  const parsed = parsePayload<{
    id: number;
    email?: string;
    total_price: string;
  }>(validation.rawBody);
  
  if (!parsed.success) {
    return webhookError(parsed.error, 400);
  }

  // 3. Buscar store (para obter organization_id)
  const supabase = getSupabaseAdmin();
  const shopDomain = request.headers.get('x-shopify-shop-domain');
  
  const { data: store } = await supabase
    .from('shopify_stores')
    .select('id, organization_id')
    .eq('shop_domain', shopDomain)
    .single();

  if (!store) {
    return webhookError('Store not found', 404);
  }

  // 4. Inserir com organization_id explícito
  // (SERVICE_ROLE ignora RLS, então filtramos manualmente)
  const { error } = await supabase
    .from('shopify_orders')
    .upsert({
      shopify_id: parsed.data.id,
      store_id: store.id,
      organization_id: store.organization_id, // ← IMPORTANTE!
      email: parsed.data.email,
      total_price: parsed.data.total_price,
    });

  if (error) {
    console.error('[Shopify Webhook] DB Error:', error);
    return webhookError('Failed to process', 500);
  }

  return webhookSuccess({ order_id: parsed.data.id });
}
*/
