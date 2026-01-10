/**
 * API: Check Delayed Runs
 * Cron job para verificar runs que estão esperando (delay) e devem ser retomados
 * 
 * GET /api/cron/check-delayed-runs (chamado pelo Vercel Cron)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enqueueAutomationRun } from '@/lib/queue';

// ============================================
// CONFIG
// ============================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================
// GET - Check delayed runs (Cron)
// ============================================

export async function GET(request: NextRequest) {
  // Verificar autorização
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const isInternal = request.headers.get('X-Internal-Request') === 'true';
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isDev = process.env.NODE_ENV === 'development';
  
  const isAuthorized = isDev || isVercelCron || isInternal || 
    (cronSecret && authHeader === `Bearer ${cronSecret}`);
  
  if (!isAuthorized) {
    console.log('[Check Delayed] Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Check Delayed] Starting check (Vercel Cron:', isVercelCron, ')');

  try {
    const now = new Date().toISOString();

    // Buscar runs que estão em 'waiting' e já passaram do tempo
    // JUNTO com a automação para verificar status
    const { data: runs, error } = await supabase
      .from('automation_runs')
      .select('id, automation_id, current_node_id, waiting_until, automations!inner(id, status)')
      .eq('status', 'waiting')
      .lte('waiting_until', now)
      .limit(50);

    if (error) {
      console.error('[Check Delayed] Error fetching runs:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!runs || runs.length === 0) {
      return NextResponse.json({
        message: 'No delayed runs to process',
        checked: 0,
        enqueued: 0,
        cancelled: 0,
      });
    }

    console.log(`[Check Delayed] Found ${runs.length} runs to check`);

    let enqueued = 0;
    let cancelled = 0;
    const errors: string[] = [];

    for (const run of runs) {
      try {
        // ⚠️ CRITICAL: Check if automation is still active
        const automation = (run as any).automations;
        if (automation?.status !== 'active') {
          console.log(`[Check Delayed] Automation ${run.automation_id} is not active, cancelling run ${run.id}`);
          
          await supabase
            .from('automation_runs')
            .update({
              status: 'cancelled',
              waiting_until: null,
              completed_at: new Date().toISOString(),
              last_error: `Automação desativada (status: ${automation?.status})`,
            })
            .eq('id', run.id);
          
          cancelled++;
          continue;
        }

        // Atualizar status para pending
        await supabase
          .from('automation_runs')
          .update({ 
            status: 'pending',
            waiting_until: null,
          })
          .eq('id', run.id);

        // Enfileirar para execução
        const messageId = await enqueueAutomationRun(run.id);
        
        if (messageId) {
          enqueued++;
          console.log(`[Check Delayed] Enqueued run ${run.id}`);
        } else {
          // Fallback: executar diretamente
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
          await fetch(`${appUrl}/api/workers/automation`, {
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
          enqueued++;
        }
      } catch (err: any) {
        console.error(`[Check Delayed] Error processing run ${run.id}:`, err);
        errors.push(`${run.id}: ${err.message}`);
      }
    }

    return NextResponse.json({
      message: 'Delayed runs checked',
      checked: runs.length,
      enqueued,
      cancelled,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: now,
    });

  } catch (error: any) {
    console.error('[Check Delayed] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// POST - Manual trigger
// ============================================

export async function POST(request: NextRequest) {
  // Mesma lógica do GET
  return GET(request);
}
