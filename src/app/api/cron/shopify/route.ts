// =============================================
// API: Shopify Cron Jobs
// src/app/api/cron/shopify/route.ts
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
  
  if (!cronSecret) {
    console.error('[Cron] CRON_SECRET not configured - blocking request');
    return { 
      valid: false, 
      error: 'CRON_SECRET not configured. Set it in environment variables.' 
    };
  }
  
  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${cronSecret}`) {
    return { valid: true };
  }
  
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
// JOB HANDLERS
// =============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runSyncJob(supabase: any) {
  const { data: stores, error } = await supabase
    .from('shopify_stores')
    .select('*')
    .eq('is_active', true);

  if (error || !stores || stores.length === 0) {
    return { storesProcessed: 0, message: 'No active stores' };
  }

  const { runFullSync } = await import('@/lib/services/shopify/full-sync');
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = [];
  for (const store of stores) {
    try {
      const result = await runFullSync(store, {
        syncProducts: false,
        syncLocations: false,
        syncCustomers: true,
        syncOrders: true,
        syncCheckouts: true,
      });
      results.push({ store: store.shop_domain || 'unknown', ...result });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      results.push({ store: store.shop_domain || 'unknown', success: false, error: errorMessage });
    }
  }

  return { storesProcessed: stores.length, results };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runRFMJob(supabase: any) {
  const { data: stores, error } = await supabase
    .from('shopify_stores')
    .select('id, organization_id, shop_domain')
    .eq('is_active', true);

  if (error || !stores || stores.length === 0) {
    return { storesProcessed: 0, results: [] };
  }

  const { calculateRFMScores } = await import('@/lib/services/shopify/analytics/rfm');
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = [];
  for (const store of stores) {
    try {
      const result = await calculateRFMScores(store.id, store.organization_id);
      results.push({
        store: store.shop_domain,
        success: result.success,
        customersAnalyzed: result.customersAnalyzed,
        segments: result.segmentCounts,
      });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      results.push({ store: store.shop_domain, success: false, error: errorMessage });
    }
  }

  return { storesProcessed: stores.length, results };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runCohortJob(supabase: any) {
  const { data: stores, error } = await supabase
    .from('shopify_stores')
    .select('id, organization_id, shop_domain')
    .eq('is_active', true);

  if (error || !stores || stores.length === 0) {
    return { storesProcessed: 0, results: [] };
  }

  const { calculateCohortAnalysis } = await import('@/lib/services/shopify/analytics/cohort');
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = [];
  for (const store of stores) {
    try {
      const result = await calculateCohortAnalysis(store.id, store.organization_id);
      results.push({
        store: store.shop_domain,
        success: result.success,
        cohortsAnalyzed: result.cohortsAnalyzed,
        dataPoints: result.dataPoints,
      });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      results.push({ store: store.shop_domain, success: false, error: errorMessage });
    }
  }

  return { storesProcessed: stores.length, results };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runCleanupJob(supabase: any) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const { error: syncError } = await supabase
    .from('shopify_sync_logs')
    .delete()
    .lt('started_at', thirtyDaysAgo.toISOString());

  let webhookCleanupStatus = 'skipped';
  try {
    const { error } = await supabase
      .from('shopify_webhook_events')
      .delete()
      .lt('created_at', thirtyDaysAgo.toISOString());
    webhookCleanupStatus = error ? 'error' : 'success';
  } catch {
    webhookCleanupStatus = 'table_not_found';
  }

  return {
    syncLogsCleanup: syncError ? 'error' : 'success',
    webhookCleanup: webhookCleanupStatus,
    cutoffDate: thirtyDaysAgo.toISOString(),
  };
}

// =============================================
// GET: Run Cron Job
// =============================================

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        
      case 'analytics': {
        const rfmResult = await runRFMJob(supabase);
        const cohortResult = await runCohortJob(supabase);
        result = { rfm: rfmResult, cohort: cohortResult };
        break;
      }
        
      case 'cleanup':
        result = await runCleanupJob(supabase);
        break;
        
      case 'all': {
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
      }
        
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

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Cron] Job ${job} failed after ${durationMs}ms:`, error);

    return NextResponse.json(
      {
        success: false,
        job,
        error: errorMessage,
        durationMs,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
