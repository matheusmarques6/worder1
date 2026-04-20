import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// GET /api/webhooks-admin/deliveries?subscription_id=...&status=...&limit=100
// Lista as últimas N entregas (default 100, max 500). RLS filtra por org.
export async function GET(req: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  const subId = req.nextUrl.searchParams.get('subscription_id');
  if (!subId) {
    return NextResponse.json({ error: 'subscription_id required' }, { status: 400 });
  }
  const statusParam = req.nextUrl.searchParams.get('status');
  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '100', 10);
  const limit = Math.min(Math.max(limitParam, 1), 500);

  let query = supabase
    .from('webhook_deliveries')
    .select('id, event_type, event_id, status, response_code, attempt_count, max_attempts, error_message, created_at, delivered_at, last_attempt_at, next_retry_at')
    .eq('subscription_id', subId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (statusParam) {
    query = query.eq('status', statusParam);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deliveries: data ?? [] });
}
