// =============================================
// POST /api/automations/[id]/clone-to-store
// Clone an automation to one or more target stores.
// Also clones every email template referenced by action_email nodes
// and rewrites the cloned automation's templateId references.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface CloneRequest {
  targetStoreIds: string[];
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

  // 1. Fetch the original automation
  const { data: original, error: fetchError } = await supabase
    .from('automations')
    .select('*')
    .eq('id', automationId)
    .eq('organization_id', organizationId)
    .single();

  if (fetchError || !original) {
    return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
  }

  // 2. Validate every target store belongs to the user's organization
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

  // 3. Collect all email template IDs referenced by action_email nodes
  const nodes: any[] = Array.isArray(original.nodes) ? original.nodes : [];
  const templateIds = new Set<string>();
  for (const node of nodes) {
    const tplId = node?.data?.config?.templateId;
    if (tplId && tplId !== '__new__' && typeof tplId === 'string') {
      templateIds.add(tplId);
    }
  }

  // 4. Fetch all referenced templates
  let templates: any[] = [];
  if (templateIds.size > 0) {
    const { data: tpls } = await supabase
      .from('email_templates')
      .select('*')
      .eq('organization_id', organizationId)
      .in('id', Array.from(templateIds));
    templates = tpls || [];
  }

  // 5. For each target store, create a fresh clone of the automation + its templates
  const results: Array<{ storeId: string; storeName?: string; automationId?: string; error?: string }> = [];

  for (const targetStoreId of targetStoreIds) {
    try {
      const targetStore = validStores?.find((s: any) => s.id === targetStoreId);

      // Clone every template referenced by this automation into the target store
      const templateIdMap = new Map<string, string>();
      for (const tpl of templates) {
        const { data: newTpl, error: tplErr } = await supabase
          .from('email_templates')
          .insert({
            organization_id: organizationId,
            store_id: targetStoreId,
            name: tpl.name,
            subject: tpl.subject,
            preheader: tpl.preheader,
            from_name: tpl.from_name,
            from_email: tpl.from_email,
            reply_to: tpl.reply_to,
            html: tpl.html,
            design: tpl.design,
            design_json: tpl.design_json,
            category: tpl.category,
            tags: tpl.tags,
          })
          .select('id')
          .single();

        if (tplErr || !newTpl) {
          throw new Error(`Failed to clone template ${tpl.id}: ${tplErr?.message || 'unknown'}`);
        }
        templateIdMap.set(tpl.id, newTpl.id);
      }

      // Rewrite node templateId references with the cloned IDs
      const clonedNodes = nodes.map((node: any) => {
        const oldTplId = node?.data?.config?.templateId;
        if (oldTplId && templateIdMap.has(oldTplId)) {
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

      // Insert the cloned automation
      const { data: clone, error: cloneErr } = await supabase
        .from('automations')
        .insert({
          organization_id: organizationId,
          store_id: targetStoreId,
          name: `${original.name}${targetStore?.shop_name ? ` (${targetStore.shop_name})` : ''}`,
          description: original.description,
          trigger_type: original.trigger_type,
          trigger_config: original.trigger_config,
          trigger_filters: original.trigger_filters || [],
          audience_filters: original.audience_filters || [],
          exit_conditions: original.exit_conditions || [],
          frequency_config: original.frequency_config || { type: 'once' },
          nodes: clonedNodes,
          edges: original.edges || [],
          status: 'draft', // Always draft on clone
        })
        .select('id')
        .single();

      if (cloneErr || !clone) {
        throw new Error(cloneErr?.message || 'Failed to insert cloned automation');
      }

      results.push({
        storeId: targetStoreId,
        storeName: targetStore?.shop_name,
        automationId: clone.id,
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
    templatesCloned: templates.length,
    results,
  });
}
