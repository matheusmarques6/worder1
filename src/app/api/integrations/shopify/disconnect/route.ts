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
  let query = supabase
    .from('shopify_stores')
    .update({
      is_active: false,
      status: 'disconnected',
      connection_status: 'disconnected',
      access_token: null,
      api_secret: null,
      pixel_installed: false,
      embed_installed: false,
      uninstalled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('organization_id', orgIds)
    .eq('is_active', true);

  if (storeId) {
    query = query.eq('id', storeId);
  }

  const { error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
