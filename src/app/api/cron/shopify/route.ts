// =============================================
// API: Shopify Cron Jobs (CORRIGIDO)
// src/app/api/cron/shopify/route.ts
//
// CORREÇÃO D: Fail-closed em prod
// - Se CRON_SECRET não existe → 403 SEMPRE
// - Não há "modo dev aberto"
// =============================================

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// =============================================
// AUTH: Verificar Cron Secret (FAIL-CLOSED)
// =============================================

function verifyCronAuth(request: NextRequest): { valid: boolean; error?: string } {
  const cronSecret = process.env.CRON_SECRET;
  
  // ✅ CORREÇÃO D: Fail-closed - sem secret = SEMPRE bloqueado
  if (!cronSecret) {
    console.error('[Cron] CRON_SECRET not configured - blocking request (fail-closed)');
    return { 
      valid: false, 
      error: 'CRON_SECRET not configured. Set it in environment variables.' 
    };
  }
  
  // Verificar header Authorization
  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${cronSecret}`) {
    return { valid: true };
  }
  
  // Verificar query param (fallback para alguns cron services)
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get('secret');
  if (secretParam === cronSecret) {
    return { valid: true };
  }
  
  return { valid: false, error: 'Invalid or missing CRON_SECRET' };
}

// =============================================
// HELPERS
// =============================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

// =============================================
// JOB HANDLERS (importar dinamicamente para evitar erros de build)
// =============================================

async function runSyncJob(supabase: ReturnType<typeof createClient>) {
  const { data: stores } = await supabase
    .from('shopify_stores')
    .select('id, organization_id, shop_domain')
    .eq('is_active', true);

  if (!stores || stores.length === 0) {
    return { storesProcessed: 0, message: 'No active stores' };
  }

  // Import dinâmico para evitar erros de build circular
  const { runFullSync } = await import('@/lib/services/shopify/full-sync');
  
  const results = [];
  for (const store of stores) {
    try {
      // Buscar dados completos da store
      const { data: fullStore } = await supabase
        .from('shopify_stores')
        .select('*')
        .eq('id', store.id)
        .single();
      
      if (fullStore) {
        const result = await runFullSync(fullStore, {
          syncProducts: false,
          syncLocations: false,
          syncCustomers: true,
          syncOrders: true,
          syncCheckouts: true,
        });
        results.push({ store: store.shop_domain, ...result });
      }
    } catch (e: any) {
      results.push({ store: store.shop_domain, success: false, error: e.message });
    }
  }

  return { storesProcessed: stores.length, results };
}

async function runRFMJob(supabase: ReturnType<typeof createClient>) {
  const { data: stores } = await supabase
    .from('shopify_stores')
    .select('id, organization_id, shop_domain')
    .eq('is_active', true);

  if (!stores || stores.length === 0) {
    return { storesProcessed: 0, results: [] };
  }

  const { calculateRFMScores } = await import('@/lib/services/shopify/analytics/rfm');
  
  const results = [];
  for (const store of stores) {
    try {
      const result = await calculateRFMScores(store.id, store.organization_id);
      results.push({
        store: store.shop_domain,
        success: result.success,
        customersAnalyzed: result.customersAnalyzed,
        segments: result.segmentCounts,
      });
    } catch (e: any) {
      results.push({ store: store.shop_domain, success: false, error: e.message });
    }
  }

  return { storesProcessed: stores.length, results };
}

async function runCohortJob(supabase: ReturnType<typeof createClient>) {
  const { data: stores } = await supabase
    .from('shopify_stores')
    .select('id, organization_id, shop_domain')
    .eq('is_active', true);

  if (!stores || stores.length === 0) {
    return { storesProcessed: 0, results: [] };
  }

  const { calculateCohortAnalysis } = await import('@/lib/services/shopify/analytics/cohort');
  
  const results = [];
  for (const store of stores) {
    try {
      const result = await calculateCohortAnalysis(store.id, store.organization_id);
      results.push({
        store: store.shop_domain,
        success: result.success,
        cohortsAnalyzed: result.cohortsAnalyzed,
        dataPoints: result.dataPoints,
      });
    } catch (e: any) {
      results.push({ store: store.shop_domain, success: false, error: e.message });
    }
  }

  return { storesProcessed: stores.length, results };
}

async function runCleanupJob(supabase: ReturnType<typeof createClient>) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  // Limpar logs de sync antigos
  const { count: syncLogsDeleted } = await supabase
    .from('shopify_sync_logs')
    .delete()
    .lt('started_at', thirtyDaysAgo.toISOString())
    .select('id', { count: 'exact' });

  // Limpar webhook events antigos (se existir tabela)
  let webhookEventsDeleted = 0;
  try {
    const { count } = await supabase
      .from('shopify_webhook_events')
      .delete()
      .lt('created_at', thirtyDaysAgo.toISOString())
      .select('id', { count: 'exact' });
    webhookEventsDeleted = count || 0;
  } catch {
    // Tabela pode não existir
  }

  return {
    syncLogsDeleted: syncLogsDeleted || 0,
    webhookEventsDeleted,
    cutoffDate: thirtyDaysAgo.toISOString(),
  };
}

// =============================================
// GET: Run Cron Job
// =============================================

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  // ✅ CORREÇÃO D: Verificar auth (fail-closed)
  const authResult = verifyCronAuth(request);
  if (!authResult.valid) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const job = searchParams.get('job');
  
  if (!job) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Missing job parameter',
        availableJobs: ['sync', 'rfm', 'cohort', 'analytics', 'cleanup', 'all']
      },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    let result: any;

    console.log(`[Cron] Starting job: ${job}`);

    switch (job) {
      case 'sync':
        result = await runSyncJob(supabase);
        break;
        
      case 'rfm':
        result = await runRFMJob(supabase);
        break;
        
      case 'cohort':
        result = await runCohortJob(supabase);
        break;
        
      case 'analytics':
        const rfmResult = await runRFMJob(supabase);
        const cohortResult = await runCohortJob(supabase);
        result = { rfm: rfmResult, cohort: cohortResult };
        break;
        
      case 'cleanup':
        result = await runCleanupJob(supabase);
        break;
        
      case 'all':
        const allSync = await runSyncJob(supabase);
        const allRfm = await runRFMJob(supabase);
        const allCohort = await runCohortJob(supabase);
        const allCleanup = await runCleanupJob(supabase);
        result = {
          sync: allSync,
          rfm: allRfm,
          cohort: allCohort,
          cleanup: allCleanup,
        };
        break;
        
      default:
        return NextResponse.json(
          { 
            success: false, 
            error: `Unknown job: ${job}`,
            availableJobs: ['sync', 'rfm', 'cohort', 'analytics', 'cleanup', 'all']
          },
          { status: 400 }
        );
    }

    const durationMs = Date.now() - startTime;
    console.log(`[Cron] Job ${job} completed in ${durationMs}ms`);

    return NextResponse.json({
      success: true,
      job,
      result,
      durationMs,
    });

  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    console.error(`[Cron] Job ${job} failed after ${durationMs}ms:`, error);

    return NextResponse.json(
      {
        success: false,
        job,
        error: error.message,
        durationMs,
      },
      { status: 500 }
    );
  }
}

// POST também aceita (para flexibilidade)
export async function POST(request: NextRequest) {
  return GET(request);
}
