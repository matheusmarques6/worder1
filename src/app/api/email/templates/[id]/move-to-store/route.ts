// =============================================
// POST /api/email/templates/[id]/move-to-store
// Move (not clone) an email template to a different store.
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
  const templateId = params.id;
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

  // Validate the template belongs to the user's organization
  const { data: template, error: tplErr } = await supabase
    .from('email_templates')
    .select('id, store_id, name')
    .eq('id', templateId)
    .eq('organization_id', organizationId)
    .single();

  if (tplErr || !template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // Validate target store
  const { data: targetStore, error: storeErr } = await supabase
    .from('shopify_stores')
    .select('id, shop_name')
    .eq('id', targetStoreId)
    .eq('organization_id', organizationId)
    .single();

  if (storeErr || !targetStore) {
    return NextResponse.json({ error: 'Target store invalid or no access' }, { status: 403 });
  }

  // Move
  const { error: updErr } = await supabase
    .from('email_templates')
    .update({ store_id: targetStoreId })
    .eq('id', templateId);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    template: { id: template.id, name: template.name },
    movedTo: { id: targetStore.id, name: targetStore.shop_name },
  });
}
