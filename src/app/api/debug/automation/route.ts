/**
 * DEBUG: Test Automation Execution
 * Endpoint para testar manualmente a execução de automações
 * 
 * GET /api/debug/automation?action=status
 * GET /api/debug/automation?action=process-events
 * GET /api/debug/automation?action=process-runs
 * GET /api/debug/automation?action=execute-run&runId=xxx
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { EventProcessor } from '@/lib/automation/event-processor';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'status';
  const runId = searchParams.get('runId');

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    switch (action) {
      case 'status': {
        // Mostrar status geral
        const [events, runs, automations] = await Promise.all([
          supabase.from('event_logs').select('id, event_type, processed, created_at').order('created_at', { ascending: false }).limit(10),
          supabase.from('automation_runs').select('id, status, created_at, automation_id').order('created_at', { ascending: false }).limit(10),
          supabase.from('automations').select('id, name, status, trigger_type').order('created_at', { ascending: false }).limit(10),
        ]);

        return NextResponse.json({
          env: {
            QSTASH_TOKEN: !!process.env.QSTASH_TOKEN,
            QSTASH_CURRENT_SIGNING_KEY: !!process.env.QSTASH_CURRENT_SIGNING_KEY,
            NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || null,
            VERCEL_URL: process.env.VERCEL_URL || null,
          },
          recentEvents: events.data,
          recentRuns: runs.data,
          automations: automations.data,
        });
      }

      case 'process-events': {
        // Processar eventos pendentes manualmente
        console.log('[DEBUG] Processing pending events...');
        const result = await EventProcessor.processPendingEvents(10);
        return NextResponse.json({
          action: 'process-events',
          result,
        });
      }

      case 'process-runs': {
        // Processar runs pendentes
        const { data: pendingRuns } = await supabase
          .from('automation_runs')
          .select('id')
          .eq('status', 'pending')
          .limit(5);

        if (!pendingRuns || pendingRuns.length === 0) {
          return NextResponse.json({ message: 'No pending runs' });
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.VERCEL_URL}`;
        const results = [];

        for (const run of pendingRuns) {
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
          results.push({ runId: run.id, response: data });
        }

        return NextResponse.json({
          action: 'process-runs',
          processed: pendingRuns.length,
          results,
        });
      }

      case 'execute-run': {
        if (!runId) {
          return NextResponse.json({ error: 'runId required' }, { status: 400 });
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.VERCEL_URL}`;
        
        const response = await fetch(`${appUrl}/api/workers/automation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Request': 'true',
          },
          body: JSON.stringify({
            action: 'execute_run',
            runId,
          }),
        });

        const data = await response.json();
        return NextResponse.json({
          action: 'execute-run',
          runId,
          response: data,
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error: any) {
    console.error('[DEBUG] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
