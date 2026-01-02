// =============================================
// API: Shopify Webhook Receiver
// src/app/api/integrations/shopify/webhook/route.ts
// 
// IMPORTANTE: Este endpoint precisa responder em < 5 segundos
// Por isso, ele apenas valida e enfileira o webhook para processamento
// O processamento real acontece no worker: /api/workers/shopify-webhook
// =============================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import crypto from 'crypto';
import { enqueueShopifyWebhook, isQStashConfigured } from '@/lib/queue';

// =============================================
// Verificação HMAC do Shopify (timing-safe)
// =============================================
function verifyShopifyWebhook(rawBody: string, hmacHeader: string, secret: string): boolean {
  if (!secret || !hmacHeader) return true; // Dev mode
  
  try {
    const hash = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');
    
    // Timing-safe comparison
    if (hash.length !== hmacHeader.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(hmacHeader)
    );
  } catch {
    return false;
  }
}

// =============================================
// POST - Receber e Enfileirar Webhook
// =============================================
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // 1. Capturar headers do Shopify
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256') || '';
    const topic = request.headers.get('x-shopify-topic');
    const shopDomain = request.headers.get('x-shopify-shop-domain');
    const eventId = request.headers.get('x-shopify-event-id');
    const apiVersion = request.headers.get('x-shopify-api-version');

    // 2. Validar headers obrigatórios
    if (!topic || !shopDomain) {
      return NextResponse.json(
        { error: 'Missing required headers' },
        { status: 400 }
      );
    }

    // 3. Ler body como texto (necessário para validação HMAC)
    const rawBody = await request.text();
    let payload: any;
    
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    console.log(`📦 Shopify webhook received: ${topic} from ${shopDomain} (event: ${eventId || 'unknown'})`);

    // 4. Buscar configuração da loja
    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('id, organization_id, api_secret, is_active, is_configured, sync_orders, sync_customers, sync_checkouts')
      .eq('shop_domain', shopDomain)
      .maybeSingle();

    if (storeError) {
      console.error('Database error:', storeError);
      // Retornar 200 para não causar retries desnecessários
      return NextResponse.json({ received: true, error: 'Database error' });
    }

    if (!store) {
      console.log(`No store found for ${shopDomain}`);
      return NextResponse.json({ received: true, skipped: true, reason: 'store_not_found' });
    }

    if (!store.is_active) {
      console.log(`Store ${shopDomain} is not active`);
      return NextResponse.json({ received: true, skipped: true, reason: 'store_inactive' });
    }

    // 5. Verificar HMAC (segurança)
    if (store.api_secret && hmacHeader) {
      const isValid = verifyShopifyWebhook(rawBody, hmacHeader, store.api_secret);
      if (!isValid) {
        console.error(`Invalid HMAC signature for ${shopDomain}`);
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }
    }

    // 6. Verificar se evento está habilitado
    const eventEnabled = checkEventEnabled(topic, store);
    if (!eventEnabled) {
      console.log(`Event ${topic} is disabled for ${shopDomain}`);
      return NextResponse.json({ received: true, skipped: true, reason: 'event_disabled' });
    }

    // 7. Verificar idempotência (evitar duplicatas)
    if (eventId) {
      const { data: existingEvent } = await supabase
        .from('shopify_webhook_events')
        .select('id')
        .eq('event_id', eventId)
        .maybeSingle();

      if (existingEvent) {
        console.log(`Duplicate event ignored: ${eventId}`);
        return NextResponse.json({ received: true, skipped: true, reason: 'duplicate' });
      }

      // Registrar evento (para idempotência)
      await supabase
        .from('shopify_webhook_events')
        .insert({
          event_id: eventId,
          store_id: store.id,
          topic: topic,
          status: 'queued',
        });
    }

    // 8. Enfileirar para processamento assíncrono
    const job = {
      eventId: eventId || `manual-${Date.now()}`,
      topic,
      shopDomain,
      payload,
      storeId: store.id,
      organizationId: store.organization_id,
    };

    // Tentar enfileirar no QStash
    if (isQStashConfigured()) {
      const messageId = await enqueueShopifyWebhook(job);
      
      if (messageId) {
        const duration = Date.now() - startTime;
        console.log(`✅ Webhook ${topic} queued in ${duration}ms (messageId: ${messageId})`);
        
        return NextResponse.json({
          received: true,
          queued: true,
          messageId,
          duration,
        });
      }
    }

    // 9. Fallback: processar de forma síncrona se QStash não está configurado
    console.log(`⚠️ QStash not available, processing synchronously`);
    
    // Importar e processar diretamente
    const { processShopifyWebhook } = await import('@/lib/services/shopify');
    const result = await processShopifyWebhook(job);
    
    const duration = Date.now() - startTime;
    console.log(`✅ Webhook ${topic} processed in ${duration}ms (sync mode)`);
    
    return NextResponse.json({
      received: true,
      processed: true,
      result: result.action,
      duration,
    });

  } catch (error: any) {
    console.error('Webhook error:', error);
    
    // Sempre retornar 200 para evitar retries infinitos do Shopify
    // O erro é logado para investigação
    return NextResponse.json({
      received: true,
      error: error.message,
    });
  }
}

// =============================================
// Helper: Verificar se evento está habilitado
// =============================================
function checkEventEnabled(topic: string, store: any): boolean {
  // Eventos de app sempre habilitados
  if (topic === 'app/uninstalled') return true;
  
  // Verificar configuração de sync
  if (topic.startsWith('customers/')) {
    return store.sync_customers ?? true;
  }
  
  if (topic.startsWith('orders/')) {
    return store.sync_orders ?? true;
  }
  
  if (topic.startsWith('checkouts/')) {
    return store.sync_checkouts ?? true;
  }
  
  // Outros eventos: permitir por padrão
  return true;
}
