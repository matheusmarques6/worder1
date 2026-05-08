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

  // Clear credentials on disconnect so a future reconnect can't silently
  // reuse them. Without nulling these, the merchant would click "Conectar
  // novamente", the status endpoint would still find a row carrying a
  // valid access_token, and the form would never appear — they'd jump
  // straight to the connected view of the disconnected integration.
  // We keep the row (data preservation) but strip what makes it
  // "Shopify-connected" from the status endpoint's perspective.
  //
  // The full set is tried first; if the DB schema is missing any of the
  // optional columns (connection_status from add-shopify-import-columns,
  // uninstalled_at from 20260330_shopify_graphql_cdp), we fall back to a
  // progressively smaller set so disconnect always works regardless of
  // which migrations have been applied.
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
    access_token: null,
    api_secret: null,
    pixel_installed: false,
    embed_installed: false,
    uninstalled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  // Optional fields whose absence shouldn't block disconnect
  const fallbackChain = ['connection_status', 'uninstalled_at', 'pixel_installed', 'embed_installed', 'api_secret'];

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
