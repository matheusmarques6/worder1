/**
 * API: Process Pending Events
 * Endpoint para processar eventos pendentes (chamado via cron ou QStash)
 * 
 * POST /api/workers/process-events
 * GET  /api/workers/process-events (Vercel Cron)
 */

import { NextRequest, NextResponse } from 'next/server';
import { EventProcessor } from '@/lib/automation/event-processor';
import { verifyQStashSignature } from '@/lib/queue';

// ============================================
// VERIFICAÇÃO DE AUTORIZAÇÃO
// ============================================

function isAuthorized(request: NextRequest): boolean {
  // Vercel Cron envia esse header
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (isVercelCron) return true;

  // Request interno
  const isInternal = request.headers.get('X-Internal-Request') === 'true';
  if (isInternal) return true;

  // CRON_SECRET no Authorization header
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  return false;
}

// ============================================
// GET - Vercel Cron handler
// ============================================

export async function GET(request: NextRequest) {
  // Verificar se é Vercel Cron ou requisição autorizada
  if (!isAuthorized(request)) {
    console.log('[ProcessEvents] Unauthorized GET request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[ProcessEvents] GET - Processing pending events (Vercel Cron)');

  try {
    const results = await EventProcessor.processPendingEvents(100);

    return NextResponse.json({
      success: true,
      processed: results.processed,
      errors: results.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[ProcessEvents] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

// ============================================
// POST - Process pending events (QStash/manual)
// ============================================

export async function POST(request: NextRequest) {
  // Verificar QStash signature
  const isQStash = request.headers.has('upstash-signature');
  
  if (isQStash) {
    const clonedRequest = request.clone();
    const { isValid } = await verifyQStashSignature(clonedRequest);
    if (!isValid) {
      console.log('[ProcessEvents] Invalid QStash signature');
      return NextResponse.json({ error: 'Invalid QStash signature' }, { status: 401 });
    }
  } else if (!isAuthorized(request)) {
    console.log('[ProcessEvents] Unauthorized POST request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { eventId, limit = 100 } = body;

    // Se eventId específico, processar apenas esse
    if (eventId) {
      console.log(`[ProcessEvents] Processing single event: ${eventId}`);
      const result = await EventProcessor.processEvent(eventId);
      
      return NextResponse.json({
        success: result.success,
        event: eventId,
        automationsTriggered: result.automationsTriggered,
        runIds: result.runIds,
        error: result.error,
      });
    }

    // Processar batch de eventos pendentes
    console.log(`[ProcessEvents] Processing pending events (limit: ${limit})`);
    const results = await EventProcessor.processPendingEvents(limit);

    return NextResponse.json({
      success: true,
      processed: results.processed,
      errors: results.errors,
      details: results.results.map(r => ({
        eventId: r.eventId,
        success: r.success,
        automationsTriggered: r.automationsTriggered,
      })),
    });

  } catch (error: any) {
    console.error('[ProcessEvents] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
