/**
 * API: Automation Delay Worker
 * Resumes automation runs that are waiting (delayed).
 * Runs every minute via Vercel Cron.
 *
 * GET /api/workers/automation-delay
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ============================================
// GET - Resume delayed automation runs
// ============================================

export async function GET(request: NextRequest) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';

  if (!isVercelCron && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find runs that are waiting and whose delay has expired
    const { data: waitingRuns, error: queryError } = await supabase
      .from('automation_runs')
      .select('id, automation_id, metadata')
      .eq('status', 'waiting')
      .lte('waiting_until', new Date().toISOString())
      .limit(50);

    if (queryError) {
      console.error('[AutomationDelay] Query error:', queryError);
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    const total = waitingRuns?.length || 0;
    let processed = 0;

    for (const run of waitingRuns || []) {
      try {
        // Check if the associated automation is still active
        const { data: automation, error: autoError } = await supabase
          .from('automations')
          .select('id, status')
          .eq('id', run.automation_id)
          .single();

        if (autoError || !automation) {
          console.warn(`[AutomationDelay] Automation ${run.automation_id} not found for run ${run.id}`);
          continue;
        }

        if (automation.status === 'active') {
          // Update run status to 'running'
          await supabase
            .from('automation_runs')
            .update({ status: 'running' })
            .eq('id', run.id);

          // Call the automation worker endpoint to continue execution
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : 'http://localhost:3000';

          await fetch(`${baseUrl}/api/workers/automation`, {
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

          processed++;
        } else {
          // Automation is no longer active — cancel the run
          await supabase
            .from('automation_runs')
            .update({
              status: 'cancelled',
              completed_at: new Date().toISOString(),
              last_error: `Automation is no longer active (status: ${automation.status})`,
            })
            .eq('id', run.id);

          processed++;
        }
      } catch (err: any) {
        console.error(`[AutomationDelay] Error processing run ${run.id}:`, err.message);
      }
    }

    console.log(`[AutomationDelay] Processed ${processed}/${total} waiting runs`);

    return NextResponse.json({
      processed,
      total,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[AutomationDelay] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
