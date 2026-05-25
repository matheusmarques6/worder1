// =============================================
// POST /api/automations/[id]/move-to-store
// Move an automation to a different store. Also clones
// referenced email templates to the target store and rewrites
// node templateId references so emails render correctly.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface MoveRequest {
  targetStoreId: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: automationId } = await params;
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
    .select('*')
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

  // Clone email templates referenced by action_email nodes to the target store
  const nodes: any[] = Array.isArray(automation.nodes) ? automation.nodes : [];
  const templateIds = new Set<string>();
  for (const node of nodes) {
    const tplId = node?.data?.config?.templateId;
    if (tplId && tplId !== '__new__' && typeof tplId === 'string') {
      templateIds.add(tplId);
    }
  }

  const templateIdMap = new Map<string, string>();
  if (templateIds.size > 0) {
    const { data: tpls } = await supabase
      .from('email_templates')
      .select('*')
      .eq('organization_id', organizationId)
      .in('id', Array.from(templateIds));

    for (const tpl of (tpls || [])) {
      // Skip if template already belongs to the target store
      if (tpl.store_id === targetStoreId) {
        templateIdMap.set(tpl.id, tpl.id);
        continue;
      }
      const { data: newTpl } = await supabase
        .from('email_templates')
        .insert({
          organization_id: organizationId,
          store_id: targetStoreId,
          name: tpl.name,
          subject: tpl.subject,
          preview_text: tpl.preview_text,
          from_name: tpl.from_name,
          from_email: tpl.from_email,
          reply_to: tpl.reply_to,
          html: tpl.html,
          design: tpl.design,
          design_json: tpl.design_json,
          category: tpl.category,
          tags: tpl.tags,
          thumbnail_url: tpl.thumbnail_url,
          created_by: user.id,
        })
        .select('id')
        .single();
      if (newTpl) templateIdMap.set(tpl.id, newTpl.id);
    }
  }

  // Rewrite node templateId references if templates were cloned
  let updatedNodes = nodes;
  if (templateIdMap.size > 0) {
    updatedNodes = nodes.map((node: any) => {
      const oldTplId = node?.data?.config?.templateId;
      if (oldTplId && templateIdMap.has(oldTplId) && templateIdMap.get(oldTplId) !== oldTplId) {
        return {
          ...node,
          data: {
            ...node.data,
            config: {
              ...(node.data?.config || {}),
              templateId: templateIdMap.get(oldTplId),
            },
          },
        };
      }
      return node;
    });
  }

  const { error: updErr } = await supabase
    .from('automations')
    .update({
      store_id: targetStoreId,
      nodes: updatedNodes,
    })
    .eq('id', automationId);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    automation: { id: automation.id, name: automation.name },
    movedTo: { id: targetStore.id, name: targetStore.shop_name },
    templatesMigrated: templateIdMap.size,
  });
}
