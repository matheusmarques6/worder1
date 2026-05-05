// =============================================
// POST /api/email/sync-defaults
// Update sender_name / sender_email / reply_to across all email
// resources (automation action_email nodes + email templates) when
// the org default changes — Klaviyo-style "apply to all" prompt.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface SyncRequest {
  senderName?: string;
  senderEmail?: string;
  replyTo?: string;
  /** Which resources to update. Defaults to all if omitted. */
  scope?: ('automations' | 'templates')[];
  /** Only update resources that currently have empty/old values? */
  onlyEmpty?: boolean;
  /** When provided, only update emails matching the previous email (precise replace). */
  previousEmail?: string;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  let body: SyncRequest;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { senderName, senderEmail, replyTo, scope = ['automations', 'templates'], onlyEmpty = false, previousEmail } = body;

  if (!senderName && !senderEmail && !replyTo) {
    return NextResponse.json({ error: 'At least one of senderName/senderEmail/replyTo required' }, { status: 400 });
  }

  let automationsUpdated = 0;
  let nodesUpdated = 0;
  let templatesUpdated = 0;

  // 1. Update all automations: walk through nodes, patch action_email config
  if (scope.includes('automations')) {
    const { data: automations } = await supabase
      .from('automations')
      .select('id, nodes')
      .eq('organization_id', organizationId);

    for (const auto of automations || []) {
      if (!Array.isArray(auto.nodes)) continue;
      let changed = false;
      const newNodes = auto.nodes.map((node: any) => {
        if (node?.data?.nodeType !== 'action_email') return node;
        const cfg = { ...(node.data.config || {}) };
        let nodeChanged = false;

        const shouldUpdate = (key: string, currentValue: any) => {
          if (onlyEmpty) return !currentValue || currentValue === '';
          if (previousEmail && key === 'senderEmail') {
            return !currentValue || currentValue === previousEmail;
          }
          return true;
        };

        if (senderName && shouldUpdate('senderName', cfg.senderName)) {
          if (cfg.senderName !== senderName) { cfg.senderName = senderName; nodeChanged = true; }
        }
        if (senderEmail && shouldUpdate('senderEmail', cfg.senderEmail)) {
          if (cfg.senderEmail !== senderEmail) { cfg.senderEmail = senderEmail; nodeChanged = true; }
        }
        if (replyTo && shouldUpdate('replyTo', cfg.replyTo)) {
          if (cfg.replyTo !== replyTo) { cfg.replyTo = replyTo; nodeChanged = true; }
        }

        if (nodeChanged) {
          changed = true;
          nodesUpdated++;
          return { ...node, data: { ...node.data, config: cfg } };
        }
        return node;
      });

      if (changed) {
        await supabase
          .from('automations')
          .update({ nodes: newNodes })
          .eq('id', auto.id);
        automationsUpdated++;
      }
    }
  }

  // 2. Update email_templates with from_name / from_email / reply_to columns
  if (scope.includes('templates')) {
    const updates: Record<string, any> = {};
    if (senderName) updates.from_name = senderName;
    if (senderEmail) updates.from_email = senderEmail;
    if (replyTo) updates.reply_to = replyTo;

    let q = supabase
      .from('email_templates')
      .update(updates)
      .eq('organization_id', organizationId);

    if (onlyEmpty) {
      // Update only when the field is null
      if (senderName) q = q.is('from_name', null);
      if (senderEmail) q = q.is('from_email', null);
      if (replyTo) q = q.is('reply_to', null);
    } else if (previousEmail && senderEmail) {
      q = q.eq('from_email', previousEmail);
    }

    const { data: updatedRows, error: updErr } = await q.select('id');
    if (updErr) {
      console.error('[sync-defaults] templates update error:', updErr);
    }
    templatesUpdated = updatedRows?.length || 0;
  }

  return NextResponse.json({
    success: true,
    automationsUpdated,
    nodesUpdated,
    templatesUpdated,
  });
}
