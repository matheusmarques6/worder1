import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  const supabase = getSupabaseAdmin();
  const userId = auth.user.id;
  const userOrgId = auth.user.organization_id;

  // Multi-org lookup
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId);

  const orgIds = [...new Set([
    userOrgId,
    ...(memberships?.map((m: any) => m.organization_id) || []),
  ])];

  // Optional: disconnect a specific store only (multi-store support)
  let body: any = {};
  try { body = await request.json(); } catch {}
  const storeId = body?.storeId;

  // Mark the row inactive — that's the canonical signal for "disconnected"
  // throughout Worder (status endpoint, webhook resolver, store switcher
  // all filter on is_active). We DELIBERATELY do NOT null access_token /
  // api_secret here:
  //   - access_token has a NOT NULL constraint in older schemas, so the
  //     UPDATE explodes with "null value violates not-null constraint"
  //   - leaving them in place is fine because is_active=false stops every
  //     downstream consumer from using them (webhook handler refuses,
  //     status endpoint refuses, status_endpoint refuses)
  //   - on reactivation the merchant pastes new credentials anyway via
  //     swap-backend, which overwrites both
  //
  // The fallback chain handles missing optional columns (older schemas
  // without connection_status / uninstalled_at).
  function isMissingColumnError(err: any, col: string): boolean {
    if (!err) return false;
    const code = err.code || '';
    const msg = String(err.message || '');
    if (code === 'PGRST204' || code === '42703') return msg.includes(col);
    return msg.includes(col) && (msg.includes('column') || msg.includes('schema cache'));
  }
  const fullUpdate: Record<string, any> = {
    is_active: false,
    status: 'disconnected',
    connection_status: 'disconnected',
    pixel_installed: false,
    embed_installed: false,
    uninstalled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  // Optional fields whose absence shouldn't block disconnect
  const fallbackChain = ['connection_status', 'uninstalled_at', 'pixel_installed', 'embed_installed'];

  let attempt: Record<string, any> = { ...fullUpdate };
  let lastErr: any = null;
  for (let i = 0; i <= fallbackChain.length; i++) {
    let q = supabase
      .from('shopify_stores')
      .update(attempt)
      .in('organization_id', orgIds);
    // Only restrict to is_active=true when no specific storeId is passed.
    // With a storeId we want disconnect to be idempotent — re-clicking
    // when the row is already inactive should still null the credentials
    // (defensive against a half-disconnected state from a prior failure).
    if (storeId) {
      q = q.eq('id', storeId);
    } else {
      q = q.eq('is_active', true);
    }
    const { error } = await q;
    if (!error) { lastErr = null; break; }
    lastErr = error;
    const dropCol = fallbackChain.find(c => isMissingColumnError(error, c) && c in attempt);
    if (!dropCol) break;
    const { [dropCol]: _, ...rest } = attempt;
    attempt = rest;
  }

  if (lastErr) {
    console.error('[Shopify Disconnect] Failed:', lastErr);
    return NextResponse.json({
      error: lastErr.message || 'Failed to disconnect',
      code: lastErr.code,
      hint: 'Verifique se as migrations recentes foram aplicadas no DB.',
    }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
