// =============================================================
// WORDER: Email template version history
// /src/app/api/email/templates/[id]/versions/route.ts
//
// GET           → list snapshots (newest first)
// POST { version } → restore a snapshot. The restore is itself an UPDATE,
//                    so the BEFORE-UPDATE trigger snapshots the current
//                    (pre-restore) state — you can always undo a restore.
//
// Both halves scope every query to the caller's organization so a
// template id from another tenant can't be read or mutated.
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: templateId } = await params;
  const auth = await getAuthClient();
  if (!auth) return authError();

  // Don't ship the full design_json in the list payload — it can be large
  // and the picker only needs metadata. The restore POST re-reads the
  // chosen row's JSON server-side.
  const { data, error } = await supabaseAdmin
    .from('email_template_versions')
    .select('id, version, editor_type, comment, created_at, created_by')
    .eq('template_id', templateId)
    .eq('organization_id', auth.user.organization_id)
    .order('version', { ascending: false })
    .limit(40);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ versions: data || [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: templateId } = await params;
  const auth = await getAuthClient();
  if (!auth) return authError();

  const body = await req.json().catch(() => ({}));
  const version = body?.version;
  if (!version) {
    return NextResponse.json({ error: 'version is required' }, { status: 400 });
  }

  const { data: ver } = await supabaseAdmin
    .from('email_template_versions')
    .select('design_json, editor_type')
    .eq('template_id', templateId)
    .eq('organization_id', auth.user.organization_id)
    .eq('version', Number(version))
    .maybeSingle();

  if (!ver) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  // Re-render the stored HTML for the restored design so the row the
  // send pipeline reads stays consistent with the canvas. Text and
  // visual templates use different renderers, picked by editor_type.
  let restoredHtml: string | undefined;
  try {
    const design = ver.design_json as any;
    if (ver.editor_type === 'text') {
      const { renderTextEmailToHtml } = await import('@/lib/email/text-render');
      const doc = design?.doc || design;
      restoredHtml = renderTextEmailToHtml(doc, { preheader: design?.previewText || undefined });
    } else {
      const { renderDocumentToHtml } = await import('@/lib/email/render-html');
      restoredHtml = renderDocumentToHtml(design);
    }
  } catch {
    // If re-render fails we still restore the design_json; the editor
    // re-renders on next save.
  }

  const updatePayload: Record<string, any> = {
    design_json: ver.design_json,
    design: ver.design_json,
    updated_at: new Date().toISOString(),
  };
  if (restoredHtml !== undefined) updatePayload.html = restoredHtml;

  const { data: updated, error } = await supabaseAdmin
    .from('email_templates')
    .update(updatePayload)
    .eq('id', templateId)
    .eq('organization_id', auth.user.organization_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ template: updated, restored: version });
}
