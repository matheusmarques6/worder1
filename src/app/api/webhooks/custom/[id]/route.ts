import { NextRequest, NextResponse } from 'next/server';
import { EventBus, EventType } from '@/lib/events';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createHmac, timingSafeEqual } from 'crypto';

function getSupabase() {
  return getSupabaseAdmin();
}

interface Params {
  params: { id: string };
}

// ============================================
// RATE LIMITING (in-memory, basic)
// ============================================
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests por minuto por webhook

function checkRateLimit(webhookId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const key = webhookId;
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - record.count };
}

// ============================================
// HMAC VERIFICATION
// ============================================
function verifyHmacSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  
  try {
    // Suporta formatos: "sha256=xxx" ou apenas "xxx"
    const actualSignature = signature.startsWith('sha256=') 
      ? signature.slice(7) 
      : signature;
    
    const expectedSignature = createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');
    
    // Comparação segura contra timing attacks
    const sigBuffer = Buffer.from(actualSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    
    if (sigBuffer.length !== expectedBuffer.length) return false;
    
    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

// ============================================
// TOKEN VERIFICATION (alternativa ao HMAC)
// ============================================
function verifyBearerToken(
  authHeader: string | null,
  expectedToken: string
): boolean {
  if (!authHeader || !expectedToken) return false;
  
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : authHeader;
  
  // Comparação segura
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
// PAYLOAD VALIDATION
// ============================================
interface WebhookPayload {
  email?: string;
  phone?: string;
  contact_id?: string;
  data?: Record<string, unknown>;
  timestamp?: number;
  [key: string]: unknown;
}

function validatePayload(body: unknown): { valid: boolean; data?: WebhookPayload; error?: string } {
  // Verificar se é objeto
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Payload must be a JSON object' };
  }

  const payload = body as Record<string, unknown>;

  // Verificar tamanho máximo (previne DoS)
  const payloadStr = JSON.stringify(payload);
  if (payloadStr.length > 100000) { // 100KB max
    return { valid: false, error: 'Payload too large (max 100KB)' };
  }

  // Validar campos específicos se presentes
  if (payload.email && typeof payload.email !== 'string') {
    return { valid: false, error: 'email must be a string' };
  }

  if (payload.phone && typeof payload.phone !== 'string') {
    return { valid: false, error: 'phone must be a string' };
  }

  if (payload.contact_id && typeof payload.contact_id !== 'string') {
    return { valid: false, error: 'contact_id must be a string' };
  }

  // Verificar timestamp (previne replay attacks - opcional)
  if (payload.timestamp) {
    const now = Date.now();
    const timestamp = Number(payload.timestamp);
    const fiveMinutes = 5 * 60 * 1000;
    
    if (isNaN(timestamp) || Math.abs(now - timestamp) > fiveMinutes) {
      return { valid: false, error: 'Invalid or expired timestamp' };
    }
  }

  return { valid: true, data: payload as WebhookPayload };
}

// ============================================
// LOGGING
// ============================================
function logWebhookAttempt(
  webhookId: string,
  request: NextRequest,
  success: boolean,
  error?: string
) {
  const ip = request.headers.get('x-forwarded-for') || 
             request.headers.get('x-real-ip') || 
             'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  const logData = {
    timestamp: new Date().toISOString(),
    webhook_id: webhookId,
    ip,
    user_agent: userAgent,
    success,
    error,
  };

  if (success) {
    console.log('[Custom Webhook] Request:', JSON.stringify(logData));
  } else {
    console.warn('[Custom Webhook] Failed:', JSON.stringify(logData));
  }
}

// ============================================
// POST - Receber webhook
// ============================================
export async function POST(request: NextRequest, { params }: Params) {
  const webhookId = params.id;

  try {
    // 1. Rate Limiting
    const rateLimit = checkRateLimit(webhookId);
    if (!rateLimit.allowed) {
      logWebhookAttempt(webhookId, request, false, 'Rate limit exceeded');
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { 
          status: 429,
          headers: {
            'Retry-After': '60',
            'X-RateLimit-Remaining': '0',
          }
        }
      );
    }

    const supabase = getSupabase();

    // 2. Buscar configuração do webhook
    const { data: webhook, error } = await supabase
      .from('automation_webhooks')
      .select(`
        *,
        automation:automations(
          id,
          organization_id,
          status
        )
      `)
      .eq('webhook_path', webhookId)
      .eq('is_active', true)
      .single();

    if (error || !webhook) {
      logWebhookAttempt(webhookId, request, false, 'Webhook not found');
      return NextResponse.json(
        { error: 'Webhook not found or inactive' },
        { status: 404 }
      );
    }

    if (webhook.automation?.status !== 'active') {
      logWebhookAttempt(webhookId, request, false, 'Automation not active');
      return NextResponse.json(
        { error: 'Automation is not active' },
        { status: 400 }
      );
    }

    // 3. Verificar autenticação (HMAC ou Bearer Token)
    const rawBody = await request.text();
    const signature = request.headers.get('x-webhook-signature') || 
                     request.headers.get('x-signature');
    const authHeader = request.headers.get('authorization');

    // webhook.secret é o campo que armazena o token/segredo
    const webhookSecret = webhook.secret || webhook.auth_token;

    if (webhookSecret) {
      // Tentar HMAC primeiro
      const hmacValid = verifyHmacSignature(rawBody, signature, webhookSecret);
      
      // Se HMAC falhou, tentar Bearer Token
      const tokenValid = !hmacValid && verifyBearerToken(authHeader, webhookSecret);

      if (!hmacValid && !tokenValid) {
        logWebhookAttempt(webhookId, request, false, 'Authentication failed');
        return NextResponse.json(
          { error: 'Invalid signature or token' },
          { status: 401 }
        );
      }
    } else {
      // Se não tem secret configurado, logar warning (inseguro)
      console.warn(`[Custom Webhook] WARNING: Webhook ${webhookId} has no authentication configured!`);
    }

    // 4. Parsear e validar payload
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      logWebhookAttempt(webhookId, request, false, 'Invalid JSON');
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const validation = validatePayload(body);
    if (!validation.valid) {
      logWebhookAttempt(webhookId, request, false, validation.error);
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const payload = validation.data!;

    // 5. Emitir evento
    await EventBus.emit(EventType.WEBHOOK_RECEIVED, {
      organization_id: webhook.automation.organization_id,
      email: payload.email,
      phone: payload.phone,
      contact_id: payload.contact_id,
      data: {
        webhook_id: webhookId,
        automation_id: webhook.automation.id,
        payload: payload,
      },
      source: 'custom_webhook',
    });

    // 6. Logar sucesso
    logWebhookAttempt(webhookId, request, true);

    return NextResponse.json(
      {
        success: true,
        message: 'Webhook processed',
        automation_id: webhook.automation.id,
      },
      {
        headers: {
          'X-RateLimit-Remaining': String(rateLimit.remaining),
        }
      }
    );

  } catch (error: any) {
    logWebhookAttempt(webhookId, request, false, error.message);
    console.error('[Custom Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

// ============================================
// GET - Verificar status do webhook
// ============================================
export async function GET(request: NextRequest, { params }: Params) {
  const supabase = getSupabase();
  const { data: webhook } = await supabase
    .from('automation_webhooks')
    .select('is_active, created_at')
    .eq('webhook_path', params.id)
    .single();

  if (!webhook) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Não expor informações sensíveis
  return NextResponse.json({
    status: 'ok',
    webhook_id: params.id,
    is_active: webhook.is_active,
    // Não retornar: secret, auth_token, automation details
  });
}
