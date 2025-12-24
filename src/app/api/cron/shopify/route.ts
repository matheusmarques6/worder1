// =============================================
// API: Shopify Cron Jobs
// src/app/api/cron/shopify/route.ts
// 
// Jobs agendados para integração Shopify:
// - abandoned: Detectar carrinhos abandonados (cada 30 min)
// - reconcile: Reconciliar dados (cada 1 hora)
// - health: Verificar webhooks (cada 6 horas)
// - cleanup: Limpar eventos antigos (diário)
// =============================================

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutos

import { NextRequest, NextResponse } from 'next/server';
import { 
  detectAbandonedCarts, 
  cleanupOldWebhookEvents 
} from '@/lib/services/shopify/jobs/abandoned-cart';
import { 
  runReconciliation,
  checkWebhookHealth 
} from '@/lib/services/shopify/jobs/reconciliation';

// Vercel Cron secret para segurança
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Verificar autorização
    const authHeader = request.headers.get('authorization');
    const cronSecret = request.nextUrl.searchParams.get('secret');
    
    // Aceitar via header ou query param
    const isAuthorized = 
      (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) ||
      (CRON_SECRET && cronSecret === CRON_SECRET) ||
      !CRON_SECRET; // Dev mode: sem secret configurado
    
    if (!isAuthorized) {
      console.error('[Cron] Unauthorized request');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Identificar qual job executar
    const job = request.nextUrl.searchParams.get('job');
    
    if (!job) {
      return NextResponse.json(
        { error: 'Missing job parameter. Use: abandoned, reconcile, health, or cleanup' },
        { status: 400 }
      );
    }
    
    console.log(`[Cron] Starting job: ${job}`);
    
    let result: any;
    
    switch (job) {
      case 'abandoned':
        // Detectar carrinhos abandonados (recomendado: cada 30 min)
        result = await detectAbandonedCarts();
        break;
        
      case 'reconcile':
        // Reconciliar dados com Shopify (recomendado: cada 1 hora)
        result = await runReconciliation();
        break;
        
      case 'health':
        // Verificar saúde dos webhooks (recomendado: cada 6 horas)
        await checkWebhookHealth();
        result = { status: 'completed' };
        break;
        
      case 'cleanup':
        // Limpar eventos antigos (recomendado: diário)
        const deleted = await cleanupOldWebhookEvents();
        result = { eventsDeleted: deleted };
        break;
        
      case 'all':
        // Executar todos os jobs (para teste)
        const abandonedResult = await detectAbandonedCarts();
        const reconcileResult = await runReconciliation();
        await checkWebhookHealth();
        const cleanupResult = await cleanupOldWebhookEvents();
        result = {
          abandoned: abandonedResult,
          reconcile: reconcileResult,
          cleanup: { eventsDeleted: cleanupResult },
        };
        break;
        
      default:
        return NextResponse.json(
          { error: `Unknown job: ${job}. Use: abandoned, reconcile, health, cleanup, or all` },
          { status: 400 }
        );
    }
    
    const duration = Date.now() - startTime;
    console.log(`[Cron] Job ${job} completed in ${duration}ms`);
    
    return NextResponse.json({
      success: true,
      job,
      result,
      duration,
    });
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[Cron] Job failed after ${duration}ms:`, error);
    
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        duration,
      },
      { status: 500 }
    );
  }
}

// Também aceitar POST para flexibilidade
export async function POST(request: NextRequest) {
  return GET(request);
}
