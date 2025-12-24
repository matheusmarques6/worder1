// =============================================
// API: Shopify Webhook Worker
// src/app/api/workers/shopify-webhook/route.ts
// Processa webhooks do Shopify vindos da fila QStash
// =============================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 segundos para processamento

import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/lib/queue';
import { processShopifyWebhook } from '@/lib/services/shopify';
import type { ShopifyWebhookJob } from '@/lib/services/shopify';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // 1. Verificar assinatura do QStash
    const { isValid, body } = await verifyQStashSignature(request);
    
    if (!isValid) {
      console.error('[Worker] Invalid QStash signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }
    
    // 2. Validar payload
    if (!body || body.type !== 'shopify_webhook' || !body.data) {
      console.error('[Worker] Invalid payload structure');
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400 }
      );
    }
    
    const job = body.data as ShopifyWebhookJob;
    
    console.log(`[Worker] Processing Shopify webhook: ${job.topic} (event: ${job.eventId})`);
    
    // 3. Processar webhook
    const result = await processShopifyWebhook(job);
    
    const duration = Date.now() - startTime;
    console.log(`[Worker] Completed in ${duration}ms:`, result);
    
    // 4. Retornar resultado
    return NextResponse.json({
      success: result.success,
      action: result.action,
      duration,
      ...(result.contactId && { contactId: result.contactId }),
      ...(result.dealId && { dealId: result.dealId }),
      ...(result.orderId && { orderId: result.orderId }),
      ...(result.error && { error: result.error }),
    });
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[Worker] Error after ${duration}ms:`, error);
    
    return NextResponse.json(
      { 
        error: error.message || 'Internal server error',
        duration,
      },
      { status: 500 }
    );
  }
}
