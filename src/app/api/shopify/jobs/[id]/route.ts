// =============================================
// GET /api/shopify/jobs/[id]
//
// Read the live state of a Shopify import job — used by the UI to
// poll progress while a background sync is running. Returns the
// shape the dashboard's progress bar consumes:
//
//   { id, status, processedCount, totalCount, currentPage, percentage,
//     syncType, startedAt, completedAt, lastError }
//
// Idempotent and cheap (single indexed lookup); the dashboard polls
// it every 2s while status is in ['pending', 'running', 'paused'].
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  const { data: job, error } = await supabaseAdmin
    .from('shopify_import_jobs')
    .select(
      'id, store_id, status, config, processed_count, total_customers, current_page, total_pages, started_at, completed_at, last_processed_at, last_error'
    )
    .eq('id', params.id)
    .eq('organization_id', auth.user.organization_id)
    .maybeSingle();

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // Roll the total: prefer total_customers when set (customer sync
  // populates it), fall back to total_pages × an estimated page size
  // so the bar moves even when we haven't probed Shopify's connection
  // size yet. Worst case the UI shows the indeterminate styling.
  const totalCount =
    job.total_customers && job.total_customers > 0
      ? job.total_customers
      : null;

  const percentage =
    totalCount && totalCount > 0
      ? Math.min(100, Math.round((job.processed_count / totalCount) * 100))
      : null;

  return NextResponse.json({
    id: job.id,
    storeId: job.store_id,
    status: job.status,
    syncType: (job.config as any)?.sync_type || 'unknown',
    bulkOperationId: (job.config as any)?.bulk_operation_id || null,
    processedCount: job.processed_count || 0,
    totalCount,
    currentPage: job.current_page || 0,
    totalPages: job.total_pages || 0,
    percentage,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    lastProcessedAt: job.last_processed_at,
    lastError: job.last_error,
  });
}
