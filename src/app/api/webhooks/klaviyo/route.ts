import { NextRequest, NextResponse } from 'next/server';
import { EventBus, EventType } from '@/lib/events';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createHmac, timingSafeEqual } from 'crypto';

// ============================================
// CONFIGURAÇÃO
// ============================================

function getSupabase() {
  return getSupabaseAdmin();
}

// ============================================
// RATE LIMITING
// ============================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 100; // 100 req/min
const RATE_LIMIT_WINDOW = 60000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(key);
  
  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  record.count++;
  return true;
}

// ============================================
// HMAC VERIFICATION
// ============================================

function verifyKlaviyoSignature(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  
  try {
    const expectedSignature = createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex');
    
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    
    if (sigBuffer.length !== expectedBuffer.length) return false;
    
    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

// ============================================
// BUSCAR ORGANIZAÇÃO
// ============================================

async function getOrganizationByKlaviyoAccount(accountId: string): Promise<{
  organizationId: string | null;
  webhookSecret: string | null;
}> {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('klaviyo_accounts')
      .select('organization_id, webhook_secret')
      .eq('account_id', accountId)
      .single();
    
    return {
      organizationId: data?.organization_id || null,
      webhookSecret: data?.webhook_secret || null,
    };
  } catch {
    return { organizationId: null, webhookSecret: null };
  }
}

// ============================================
// LOGGING
// ============================================

function logWebhookAttempt(
  request: NextRequest,
  success: boolean,
  error?: string,
  extra?: Record<string, unknown>
) {
  const ip = request.headers.get('x-forwarded-for') || 
             request.headers.get('x-real-ip') || 
             'unknown';
  
  const logData = {
    timestamp: new Date().toISOString(),
    webhook: 'klaviyo',
    ip,
    success,
    error,
    ...extra,
  };

  if (success) {
    console.log('[Klaviyo Webhook]', JSON.stringify(logData));
  } else {
    console.warn('[Klaviyo Webhook] FAILED:', JSON.stringify(logData));
  }
}

// ============================================
// HANDLER PRINCIPAL
// ============================================

export async function POST(request: NextRequest) {
  try {
    // 1. Rate Limiting
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(`klaviyo:${ip}`)) {
      logWebhookAttempt(request, false, 'Rate limit exceeded');
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    // 2. Ler body
    const rawBody = await request.text();
    let body: any;
    
    try {
      body = JSON.parse(rawBody);
    } catch {
      logWebhookAttempt(request, false, 'Invalid JSON');
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // 3. Extrair dados
    const { topic, data, account_id } = body;

    if (!account_id) {
      logWebhookAttempt(request, false, 'Missing account_id');
      return NextResponse.json({ error: 'Missing account_id' }, { status: 400 });
    }

    // 4. Buscar organização e secret
    const { organizationId, webhookSecret } = await getOrganizationByKlaviyoAccount(account_id);
    
    if (!organizationId) {
      logWebhookAttempt(request, false, 'Unknown account', { account_id });
      // Retorna 200 para não causar retries do Klaviyo
      return NextResponse.json({ success: true });
    }

    // 5. Verificar HMAC (se configurado)
    const signature = request.headers.get('x-klaviyo-signature') ||
                     request.headers.get('x-signature');
    
    if (webhookSecret) {
      if (!verifyKlaviyoSignature(rawBody, signature, webhookSecret)) {
        logWebhookAttempt(request, false, 'Invalid signature', { account_id });
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else {
      // Warning se não tem secret configurado
      console.warn(`[Klaviyo Webhook] WARNING: Account ${account_id} has no webhook_secret configured!`);
    }

    // 6. Processar eventos
    const supabase = getSupabase();

    switch (topic) {
      case 'email.opened':
        const contactOpened = await EventBus.getContactByEmail(organizationId, data.email);
        await EventBus.emit(EventType.EMAIL_OPENED, {
          organization_id: organizationId,
          contact_id: contactOpened?.id,
          email: data.email,
          data: {
            campaign_id: data.campaign_id,
            flow_id: data.flow_id,
            message_id: data.message_id,
            subject: data.subject,
            opened_at: data.timestamp,
          },
          source: 'klaviyo',
        });
        break;
        
      case 'email.clicked':
        const contactClicked = await EventBus.getContactByEmail(organizationId, data.email);
        await EventBus.emit(EventType.EMAIL_CLICKED, {
          organization_id: organizationId,
          contact_id: contactClicked?.id,
          email: data.email,
          data: {
            campaign_id: data.campaign_id,
            flow_id: data.flow_id,
            url: data.url,
            clicked_at: data.timestamp,
          },
          source: 'klaviyo',
        });
        break;
        
      case 'email.bounced':
        const contactBounced = await EventBus.getContactByEmail(organizationId, data.email);
        await EventBus.emit(EventType.EMAIL_BOUNCED, {
          organization_id: organizationId,
          contact_id: contactBounced?.id,
          email: data.email,
          data: { 
            bounce_type: data.bounce_type, 
            reason: data.reason 
          },
          source: 'klaviyo',
        });
        break;
        
      case 'profile.created':
        const contact = await EventBus.upsertContact(organizationId, {
          email: data.email,
          first_name: data.first_name,
          last_name: data.last_name,
          phone: data.phone_number,
          klaviyo_profile_id: data.id,
          source: 'klaviyo',
        });

        await EventBus.emit(EventType.CONTACT_CREATED, {
          organization_id: organizationId,
          contact_id: contact?.id,
          email: data.email,
          phone: data.phone_number,
          data: {
            klaviyo_profile_id: data.id,
            source: 'klaviyo',
          },
          source: 'klaviyo',
        });
        break;
        
      case 'profile.subscribed':
        const contactSubscribed = await EventBus.getContactByEmail(organizationId, data.email);
        if (contactSubscribed) {
          await supabase
            .from('contacts')
            .update({ is_subscribed_email: true })
            .eq('id', contactSubscribed.id)
            .eq('organization_id', organizationId); // Filtro explícito
        }
        break;
        
      case 'profile.unsubscribed':
        const contactUnsubscribed = await EventBus.getContactByEmail(organizationId, data.email);
        if (contactUnsubscribed) {
          await supabase
            .from('contacts')
            .update({ is_subscribed_email: false })
            .eq('id', contactUnsubscribed.id)
            .eq('organization_id', organizationId); // Filtro explícito
        }
        break;
        
      default:
        console.log(`[Klaviyo Webhook] Unhandled topic: ${topic}`);
    }

    logWebhookAttempt(request, true, undefined, { topic, account_id });
    return NextResponse.json({ success: true });

  } catch (error: any) {
    logWebhookAttempt(request, false, error.message);
    console.error('[Klaviyo Webhook] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    service: 'klaviyo-webhook' 
  });
}
