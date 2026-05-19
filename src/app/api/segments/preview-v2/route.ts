// /api/segments/preview-v2 — preview a v2 SegmentRule before saving.
//
// Returns count + sample (default 10 contacts). Caps the resolver at
// 5k rows so a malformed rule against millions of contacts can't blow
// up the function timeout.
//
// Body: { rule: SegmentRule, organization_id?: string, store_id?: string|null, sample_size?: number }

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { previewByRule, validateSegmentRule } from '@/lib/segments';
import { checkRateLimit, LIMITS } from '@/lib/segments/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  const body = await req.json().catch(() => ({}));
  const rule = body.rule;
  const validated = validateSegmentRule(rule);
  if (!validated.ok) {
    return NextResponse.json({ error: 'invalid rule', details: validated.errors }, { status: 400 });
  }

  // Multi-org scope check
  const { data: memberships } = await supabaseAdmin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', auth.user.id);
  const orgIds = [...new Set([
    auth.user.organization_id,
    ...(memberships?.map((m: any) => m.organization_id) || []),
  ])];
  const orgId = body.organization_id || auth.user.organization_id;
  if (!orgIds.includes(orgId)) {
    return NextResponse.json({ error: 'invalid organization_id' }, { status: 403 });
  }

  // Rate-limit per org: preview is the heaviest read endpoint we
  // expose (full resolver run on the contact universe). Cap to 60/
  // min/org so a runaway client-side debounce or scripted client
  // can't pin the function and degrade other merchants.
  const rate = checkRateLimit(LIMITS.preview, orgId);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rate.message },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } }
    );
  }

  try {
    const preview = await previewByRule(supabaseAdmin, validated.rule, orgId, {
      storeId: body.store_id ?? null,
      limit: 5000,
      sampleSize: Math.min(body.sample_size ?? 10, 50),
    });

    // Hydrate the sample so the UI can render readable contact rows.
    let sampleContacts: any[] = [];
    if (preview.sampleIds.length > 0) {
      const { data } = await supabaseAdmin
        .from('contacts')
        .select('id, email, first_name, last_name, phone, total_orders, total_spent, lifecycle_stage')
        .in('id', preview.sampleIds);
      // Preserve the order the resolver returned (which matches its
      // contact universe scan — newer rows tend to appear later).
      const byId = new Map((data || []).map((c: any) => [c.id, c]));
      sampleContacts = preview.sampleIds.map((id) => byId.get(id)).filter(Boolean);
    }

    return NextResponse.json({
      count: preview.count,
      truncated: preview.truncated,
      duration_ms: preview.durationMs,
      sample: sampleContacts,
    });
  } catch (err: any) {
    console.error('[segments/preview-v2]', err);
    return NextResponse.json({ error: err?.message || 'preview failed' }, { status: 500 });
  }
}
