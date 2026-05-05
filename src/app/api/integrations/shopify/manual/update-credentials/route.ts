// =============================================
// PATCH /api/integrations/shopify/manual/update-credentials
//
// Updates Client ID and/or Client Secret of an existing manual
// (Client Credentials Grant) Shopify connection.
//
// Use case: the merchant rotated the Client Secret in the Shopify
// Dev Dashboard, or pasted a wrong value initially. Without this
// endpoint they would have to disconnect and reconnect, which
// drops webhooks and triggers a full re-sync.
//
// Flow:
//   1. Verify the store belongs to the caller's organization.
//   2. Exchange the new credentials for a fresh 24h access token.
//   3. Update access_token, client_id, api_secret, webhook_secret,
//      token_expires_at on the shopify_stores row.
//   4. Return the new token expiry so the UI can refresh.
// =============================================
import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAccessTokenViaClientCredentials } from '@/lib/shopify/client-credentials';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { storeId, clientId, clientSecret } = body || {};

    if (!storeId || !clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'storeId, clientId e clientSecret são obrigatórios' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: store, error: storeErr } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, connection_type, organization_id')
      .eq('id', storeId)
      .eq('organization_id', organizationId)
      .single();

    if (storeErr || !store) {
      return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 });
    }

    if (store.connection_type !== 'manual') {
      return NextResponse.json(
        { error: 'Esta loja foi conectada via OAuth. Use o fluxo de reconexão oficial.' },
        { status: 400 }
      );
    }

    const cleanClientId = String(clientId).trim();
    const cleanClientSecret = String(clientSecret).trim();

    let tokenResult;
    try {
      tokenResult = await getAccessTokenViaClientCredentials(
        store.shop_domain,
        cleanClientId,
        cleanClientSecret
      );
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const accessToken = tokenResult.access_token;
    const expiresIn = tokenResult.expires_in;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const scopesList = tokenResult.scope
      ? tokenResult.scope.split(/[\s,]+/).map((s: string) => s.trim()).filter(Boolean)
      : [];

    const { error: updErr } = await supabase
      .from('shopify_stores')
      .update({
        access_token: accessToken,
        client_id: cleanClientId,
        api_secret: cleanClientSecret,
        webhook_secret: cleanClientSecret,
        token_expires_at: tokenExpiresAt,
        scopes: scopesList,
        status: 'active',
        is_active: true,
      })
      .eq('id', storeId);

    if (updErr) {
      return NextResponse.json(
        { error: `Falha ao salvar: ${updErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      token: {
        obtained: true,
        expiresIn,
        expiresAt: tokenExpiresAt,
      },
      scopes: scopesList,
    });
  } catch (err: any) {
    console.error('[Shopify Manual Update] Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro ao atualizar credenciais' },
      { status: 500 }
    );
  }
}
