// =============================================
// POST /api/automations/[id]/move-to-store
// Move (not clone) an automation to a different store.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface MoveRequest {
  targetStoreId: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const automationId = params.id;
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  let body: MoveRequest;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const targetStoreId = body.targetStoreId;
  if (!targetStoreId) {
    return NextResponse.json({ error: 'targetStoreId required' }, { status: 400 });
  }

  const { data: automation, error: autoErr } = await supabase
    .from('automations')
    .select('id, store_id, name')
    .eq('id', automationId)
    .eq('organization_id', organizationId)
    .single();

  if (autoErr || !automation) {
    return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
  }

  const { data: targetStore, error: storeErr } = await supabase
    .from('shopify_stores')
    .select('id, shop_name')
    .eq('id', targetStoreId)
    .eq('organization_id', organizationId)
    .single();

  if (storeErr || !targetStore) {
    return NextResponse.json({ error: 'Target store invalid or no access' }, { status: 403 });
  }

  const { error: updErr } = await supabase
    .from('automations')
    .update({ store_id: targetStoreId })
    .eq('id', automationId);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    automation: { id: automation.id, name: automation.name },
    movedTo: { id: targetStore.id, name: targetStore.shop_name },
  });
}
