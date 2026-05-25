import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: automationId } = await params;
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;

  try {
    const { data: original, error: fetchError } = await supabase
      .from('automations')
      .select('*')
      .eq('id', automationId)
      .eq('organization_id', user.organization_id)
      .single();

    if (fetchError || !original) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }

    // Clone email templates so the duplicate has independent copies
    const nodes: any[] = Array.isArray(original.nodes) ? original.nodes : [];
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
        .eq('organization_id', user.organization_id)
        .in('id', Array.from(templateIds));

      for (const tpl of (tpls || [])) {
        const { data: newTpl } = await supabase
          .from('email_templates')
          .insert({
            organization_id: user.organization_id,
            store_id: original.store_id,
            name: `${tpl.name} (cópia)`,
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

    // Generate fresh node IDs and remap template + edge references
    const nodeIdMap = new Map<string, string>();
    const clonedNodes = nodes.map((node: any) => {
      const newNodeId = randomUUID();
      nodeIdMap.set(node.id, newNodeId);

      const oldTplId = node?.data?.config?.templateId;
      const newConfig = { ...(node.data?.config || {}) };
      if (oldTplId && templateIdMap.has(oldTplId)) {
        newConfig.templateId = templateIdMap.get(oldTplId);
      }

      return { ...node, id: newNodeId, data: { ...node.data, config: newConfig } };
    });

    const originalEdges: any[] = Array.isArray(original.edges) ? original.edges : [];
    const clonedEdges = originalEdges.map((edge: any) => ({
      ...edge,
      id: randomUUID(),
      source: nodeIdMap.get(edge.source) || edge.source,
      target: nodeIdMap.get(edge.target) || edge.target,
    }));

    const { data: duplicate, error: insertError } = await supabase
      .from('automations')
      .insert({
        organization_id: original.organization_id,
        store_id: original.store_id,
        name: `Cópia de ${original.name}`,
        description: original.description,
        trigger_type: original.trigger_type,
        trigger_config: original.trigger_config,
        trigger_filters: original.trigger_filters || [],
        audience_filters: original.audience_filters || [],
        exit_conditions: original.exit_conditions || [],
        frequency_config: original.frequency_config || { type: 'once' },
        nodes: clonedNodes,
        edges: clonedEdges,
        status: 'draft',
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ automation: duplicate }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
