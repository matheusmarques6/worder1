import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const CONSENT_ACTION = 'webhook_pii_consent_accepted';

export async function GET() {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { user } = auth;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('audit_logs')
    .select('id, created_at')
    .eq('organization_id', user.organization_id)
    .eq('action', CONSENT_ACTION)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // If the table doesn't exist or has an incompatible schema, treat as
  // "not accepted yet" rather than 500 — the POST will create the record.
  if (error && (error.code === '42P01' || error.code === '42703' || error.code === 'PGRST204')) {
    return NextResponse.json({ accepted: false, accepted_at: null });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ accepted: !!data, accepted_at: data?.created_at ?? null });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { user } = auth;

  const admin = getSupabaseAdmin();
  const ua = req.headers.get('user-agent')?.slice(0, 200) ?? null;

  // Try the canonical payload first (matches spec migration 20260419).
  // Prod DBs may have a legacy audit_logs schema with different column
  // names (entity_type instead of metadata, resource_type instead of
  // entity_type, etc.). Fall through variants on column-not-found so
  // LGPD consent works regardless of which schema rev was applied.
  const variants: Record<string, any>[] = [
    {
      organization_id: user.organization_id,
      user_id: user.id,
      action: CONSENT_ACTION,
      entity_type: 'webhook_consent',
      metadata: { spec_version: '1', user_agent: ua },
    },
    {
      organization_id: user.organization_id,
      user_id: user.id,
      action: CONSENT_ACTION,
      entity_type: 'webhook_consent',
      details: JSON.stringify({ spec_version: '1', user_agent: ua }),
    },
    {
      organization_id: user.organization_id,
      action: CONSENT_ACTION,
      entity_type: 'webhook_consent',
    },
  ];

  const attempts: any[] = [];
  for (let i = 0; i < variants.length; i++) {
    const payload = variants[i];
    const { error } = await admin.from('audit_logs').insert(payload);
    if (!error) {
      console.log(`[Consent] audit_logs insert OK on variant ${i}`);
      return NextResponse.json({ ok: true });
    }
    console.error(`[Consent] audit_logs variant ${i} failed:`, {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      payload_keys: Object.keys(payload),
    });
    attempts.push({ variant: i, code: error.code, message: error.message, details: error.details });
    // Only try next variant if error looks schema-related
    if (error.code !== '42703' && error.code !== 'PGRST204' && error.code !== '23502') {
      break;
    }
  }

  const lastErr = attempts[attempts.length - 1];
  if (lastErr?.code === '42P01') {
    return NextResponse.json({ error: 'Audit log table missing. Run the migrations.' }, { status: 503 });
  }
  return NextResponse.json({
    error: lastErr?.message || 'Failed to record consent',
    details: lastErr?.details,
    code: lastErr?.code,
    attempts,
  }, { status: 500 });
}
