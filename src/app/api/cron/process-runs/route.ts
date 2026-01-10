/**
 * CRON: Process Pending Automation Runs
 * Processa runs que estão em "pending" sem depender do QStash
 * Configurar no Vercel: a cada 1 minuto
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  // Verificar autorização
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const isInternal = request.headers.get('X-Internal-Request') === 'true';
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  const isAuthorized = isVercelCron || isInternal || 
    (cronSecret && authHeader === `Bearer ${cronSecret}`);
  
  if (!isAuthorized) {
    console.log('[ProcessRuns] Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[ProcessRuns] Starting check (Vercel Cron:', isVercelCron, ')');

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // 1. Buscar runs pendentes (criados há mais de 5 segundos para evitar race condition)
    const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
    
    const { data: pendingRuns, error: runsError } = await supabase
      .from('automation_runs')
      .select('id, automation_id, created_at')
      .eq('status', 'pending')
      .lt('created_at', fiveSecondsAgo)
      .order('created_at', { ascending: true })
      .limit(10);

    if (runsError) {
      throw runsError;
    }

    if (!pendingRuns || pendingRuns.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending runs',
        processed: 0,
      });
    }

    console.log(`[CRON:ProcessRuns] Found ${pendingRuns.length} pending runs`);

    // 2. Processar cada run
    const results: any[] = [];
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.VERCEL_URL}`;

    for (const run of pendingRuns) {
      try {
        // Chamar o worker de automation diretamente
        const response = await fetch(`${appUrl}/api/workers/automation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Request': 'true',
          },
          body: JSON.stringify({
            action: 'execute_run',
            runId: run.id,
          }),
        });

        const data = await response.json();
        
        results.push({
          runId: run.id,
          success: response.ok,
          status: data.status,
          error: data.error,
        });

        console.log(`[CRON:ProcessRuns] Run ${run.id}: ${response.ok ? 'success' : 'failed'}`);

      } catch (error: any) {
        console.error(`[CRON:ProcessRuns] Error processing run ${run.id}:`, error);
        
        // Marcar como falho
        await supabase
          .from('automation_runs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            last_error: error.message,
          })
          .eq('id', run.id);

        results.push({
          runId: run.id,
          success: false,
          error: error.message,
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      processed: pendingRuns.length,
      successful,
      failed,
      results,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('[CRON:ProcessRuns] Exception:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}

// Suporte para POST
export async function POST(request: NextRequest) {
  return GET(request);
}
