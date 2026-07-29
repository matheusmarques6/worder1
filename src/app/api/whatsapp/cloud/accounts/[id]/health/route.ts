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
import { wlog } from '@/lib/observability/whatsapp-logger';

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
    //
    // O veredito do webhook NAO e persistido de proposito. webhook_configured
    // significa outra coisa — "a URL do webhook passou pelo challenge da Meta"
    // (cloud/webhook/route.ts) — e e renderizado como tal em
    // /integrations/meta. Sobrescrever com o estado da inscricao juntaria dois
    // fatos independentes e apagaria o original. Enquanto nao houver coluna
    // propria, o veredito e ao vivo: quem quer saber clica em "Verificar agora".
    const snapshot = {
      last_health_check_at: health.checkedAt,
      last_health_status: status,
      last_health_error_code: health.errorCode ?? null,
      last_health_expires_at: health.expiresAt ?? null,
    };

    if (health.webhook?.subscribed === false) {
      wlog.error('whatsapp.webhook.subscription_missing', {
        account_id: account.id,
        organization_id: orgId,
        waba_id: account.waba_id,
        phone_number_id: account.phone_number_id,
        app_count: health.webhook.appCount,
      });
    }

    const { error: updateError } = await supabaseAdmin
      .from('whatsapp_business_accounts')
      .update(snapshot)
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
