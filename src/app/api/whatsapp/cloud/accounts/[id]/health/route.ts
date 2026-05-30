// =============================================
// API: GET /api/whatsapp/cloud/accounts/[id]/health
//
// Probes Meta Graph with the stored access_token for a WhatsApp Business
// Account and persists the result in the new last_health_* columns
// (see docs/whatsapp-onda6-account-health-columns.sql).
//
// The Settings UI calls this manually ("Verificar agora") so users can
// diagnose token issues without touching the DB. The persisted snapshot
// also feeds the badge that the UI shows on first paint.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOrgFromAuth } from '@/lib/auth/require-org';
import { checkAccountHealth, deriveHealthStatus } from '@/lib/whatsapp/account-health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const resolved = await Promise.resolve(params as Promise<{ id: string }>);
    const accountId = resolved.id;

    const auth = await requireOrgFromAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { orgId } = auth;

    const { data: account, error: accountError } = await supabaseAdmin
      .from('whatsapp_business_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (accountError) {
      console.error('[accounts/health] DB error:', accountError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const health = await checkAccountHealth(account);
    const status = deriveHealthStatus(health);

    // Persist snapshot (non-blocking semantics — if it fails we still return
    // the live result, since the diagnostic is the primary value).
    const { error: updateError } = await supabaseAdmin
      .from('whatsapp_business_accounts')
      .update({
        last_health_check_at: health.checkedAt,
        last_health_status: status,
        last_health_error_code: health.errorCode ?? null,
        last_health_expires_at: health.expiresAt ?? null,
      })
      .eq('id', account.id);

    const persisted = !updateError;
    if (updateError) {
      console.warn('[accounts/health] failed to persist snapshot:', updateError.message);
    }

    return NextResponse.json({ health: { ...health, status }, persisted });
  } catch (e: any) {
    console.error('[accounts/health] unhandled:', e);
    return NextResponse.json(
      { error: 'Internal server error', details: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
