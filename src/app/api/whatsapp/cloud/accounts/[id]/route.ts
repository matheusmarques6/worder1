// =============================================
// API: PATCH /api/whatsapp/cloud/accounts/[id]
//
// Updates the access_token for a WhatsApp Business Account.
//
// Flow:
//   1. Validate caller owns the account
//   2. Probe the *new* token against Meta (checkAccountHealth)
//   3. If invalid -> 400 with reason (don't persist a known-bad token)
//   4. If valid -> encrypt via encryptToken, NULL the legacy plaintext
//      column, and refresh the last_health_* snapshot
//
// Only supports updating the token. Other account mutations should keep
// going through the existing /api/whatsapp/business-accounts surface.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOrgFromAuth } from '@/lib/auth/require-org';
import { encryptToken } from '@/lib/whatsapp/token-encryption';
import { checkAccountHealth, deriveHealthStatus } from '@/lib/whatsapp/account-health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const resolved = await Promise.resolve(params as Promise<{ id: string }>);
    const accountId = resolved.id;

    const auth = await requireOrgFromAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { orgId } = auth;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const newToken: string | undefined = body?.access_token;
    if (!newToken || typeof newToken !== 'string' || newToken.length < 20) {
      return NextResponse.json(
        { error: 'access_token is required (string with at least 20 chars)' },
        { status: 400 },
      );
    }

    const { data: account, error: accountError } = await supabaseAdmin
      .from('whatsapp_business_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (accountError) {
      console.error('[accounts PATCH] DB error:', accountError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Validate the new token against Meta before persisting. Build a temp
    // account row carrying ONLY the candidate plaintext token so
    // getAccessToken uses it directly (avoids decrypting the old value).
    const tempAccount = {
      ...account,
      access_token: newToken.trim(),
      access_token_encrypted: null,
    };
    const health = await checkAccountHealth(tempAccount);

    if (!health.valid) {
      return NextResponse.json(
        {
          error: 'Token validation failed',
          details: health.errorMessage,
          code: health.errorCode,
        },
        { status: 400 },
      );
    }

    let encrypted: string;
    try {
      encrypted = encryptToken(newToken.trim());
    } catch (e: any) {
      console.error('[accounts PATCH] encrypt error:', e);
      return NextResponse.json(
        { error: 'Encryption configuration error', details: e?.message },
        { status: 500 },
      );
    }

    const status = deriveHealthStatus(health);

    const { error: updateError } = await supabaseAdmin
      .from('whatsapp_business_accounts')
      .update({
        access_token_encrypted: encrypted,
        access_token: null,
        last_health_check_at: health.checkedAt,
        last_health_status: status,
        last_health_error_code: null,
        last_health_expires_at: health.expiresAt ?? null,
      })
      .eq('id', account.id);

    if (updateError) {
      console.error('[accounts PATCH] persist error:', updateError);
      return NextResponse.json({ error: 'Failed to save token' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, health: { ...health, status } });
  } catch (e: any) {
    console.error('[accounts PATCH] unhandled:', e);
    return NextResponse.json(
      { error: 'Internal server error', details: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
