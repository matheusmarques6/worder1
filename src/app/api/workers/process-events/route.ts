/**
 * API: Process Pending Events
 * Endpoint para processar eventos pendentes (chamado via cron ou QStash)
 * 
 * POST /api/workers/process-events
 * GET  /api/workers/process-events (health check)
 */

import { NextRequest, NextResponse } from 'next/server';
import { EventProcessor } from '@/lib/automation/event-processor';
import { verifyQStashSignature } from '@/lib/queue';

// ============================================
// POST - Process pending events
// ============================================

export async function POST(request: NextRequest) {
  // Verificar autorização
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isQStash = request.headers.has('upstash-signature');
  const isInternal = request.headers.get('X-Internal-Request') === 'true';

  // Aceitar se:
  // 1. Tem CRON_SECRET correto
  // 2. É request do QStash (verificar assinatura)
  // 3. É request interno
  if (!isInternal && !isQStash) {
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (isQStash) {
    const { isValid } = await verifyQStashSignature(request);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid QStash signature' }, { status: 401 });
    }
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

// ============================================
// GET - Health check
// ============================================

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    endpoint: 'process-events',
    timestamp: new Date().toISOString(),
  });
}
