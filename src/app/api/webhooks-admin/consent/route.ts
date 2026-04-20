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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ accepted: !!data, accepted_at: data?.created_at ?? null });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { user } = auth;

  const admin = getSupabaseAdmin();
  const { error } = await admin.from('audit_logs').insert({
    organization_id: user.organization_id,
    user_id: user.id,
    action: CONSENT_ACTION,
    metadata: {
      spec_version: '1',
      user_agent: req.headers.get('user-agent')?.slice(0, 200) ?? null,
    },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
