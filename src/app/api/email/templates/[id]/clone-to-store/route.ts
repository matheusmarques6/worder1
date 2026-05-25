// =============================================
// POST /api/email/templates/[id]/clone-to-store
// Clone an email template to one or more target stores.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface CloneRequest {
  targetStoreIds: string[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: templateId } = await params;
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  let body: CloneRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const targetStoreIds = Array.isArray(body.targetStoreIds) ? body.targetStoreIds : [];
  if (targetStoreIds.length === 0) {
    return NextResponse.json({ error: 'targetStoreIds (array) is required' }, { status: 400 });
  }

  // 1. Fetch the original template
  const { data: original, error: fetchError } = await supabase
    .from('email_templates')
    .select('*')
    .eq('id', templateId)
    .eq('organization_id', organizationId)
    .single();

  if (fetchError || !original) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // 2. Validate target stores
  const { data: validStores } = await supabase
    .from('shopify_stores')
    .select('id, shop_name')
    .eq('organization_id', organizationId)
    .in('id', targetStoreIds);

  const validStoreIds = new Set((validStores || []).map((s: any) => s.id));
  const invalidIds = targetStoreIds.filter(id => !validStoreIds.has(id));
  if (invalidIds.length > 0) {
    return NextResponse.json({
      error: 'One or more target stores are invalid or you don\'t have access',
      invalidIds,
    }, { status: 403 });
  }

  // 3. For each target store, clone the template
  const results: Array<{ storeId: string; storeName?: string; templateId?: string; error?: string }> = [];

  for (const targetStoreId of targetStoreIds) {
    try {
      const targetStore = validStores?.find((s: any) => s.id === targetStoreId);

      const { data: clone, error: cloneErr } = await supabase
        .from('email_templates')
        .insert({
          organization_id: organizationId,
          store_id: targetStoreId,
          name: `${original.name}${targetStore?.shop_name ? ` (${targetStore.shop_name})` : ''}`,
          subject: original.subject,
          preview_text: original.preview_text,
          from_name: original.from_name,
          from_email: original.from_email,
          reply_to: original.reply_to,
          html: original.html,
          design: original.design,
          design_json: original.design_json,
          category: original.category,
          tags: original.tags,
          thumbnail_url: original.thumbnail_url,
          created_by: user.id,
        })
        .select('id')
        .single();

      if (cloneErr || !clone) {
        throw new Error(cloneErr?.message || 'Failed to clone template');
      }

      results.push({
        storeId: targetStoreId,
        storeName: targetStore?.shop_name,
        templateId: clone.id,
      });
    } catch (err: any) {
      results.push({
        storeId: targetStoreId,
        error: err?.message || 'Clone failed',
      });
    }
  }

  const successCount = results.filter(r => !r.error).length;
  const failureCount = results.filter(r => r.error).length;

  return NextResponse.json({
    success: failureCount === 0,
    cloned: successCount,
    failed: failureCount,
    results,
  });
}
