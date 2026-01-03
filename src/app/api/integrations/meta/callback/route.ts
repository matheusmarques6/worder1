import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { consumeOAuthState, logOAuthAttempt } from '@/lib/oauth-security';

const META_API_VERSION = 'v19.0';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // 1. Verificar erro do Meta
  if (error) {
    logOAuthAttempt('meta', false, undefined, `meta_error: ${error}`);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=meta_${error}`
    );
  }

  // 2. Verificar parâmetros obrigatórios
  if (!code || !state) {
    logOAuthAttempt('meta', false, undefined, 'missing_params');
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=missing_params`
    );
  }

  // 3. VALIDAR STATE (CRÍTICO!)
  const stateData = await consumeOAuthState(state, 'meta');
  
  if (!stateData) {
    logOAuthAttempt('meta', false, undefined, 'invalid_or_expired_state');
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=invalid_state`
    );
  }

  const { organizationId, userId } = stateData;

  try {
    // 4. Trocar code por access token
    const tokenUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', process.env.META_APP_ID!);
    tokenUrl.searchParams.set('client_secret', process.env.META_APP_SECRET!);
    tokenUrl.searchParams.set('redirect_uri', `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/meta/callback`);
    tokenUrl.searchParams.set('code', code);

    const tokenResponse = await fetch(tokenUrl.toString());
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(tokenData.error.message);
    }

    const accessToken = tokenData.access_token;

    // 5. Obter long-lived token
    const longLivedUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`);
    longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longLivedUrl.searchParams.set('client_id', process.env.META_APP_ID!);
    longLivedUrl.searchParams.set('client_secret', process.env.META_APP_SECRET!);
    longLivedUrl.searchParams.set('fb_exchange_token', accessToken);

    const longLivedResponse = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedResponse.json();

    const longLivedToken = longLivedData.access_token || accessToken;

    // 6. Buscar ad accounts
    const adAccountsUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/me/adaccounts`);
    adAccountsUrl.searchParams.set('access_token', longLivedToken);
    adAccountsUrl.searchParams.set('fields', 'id,name,account_id,currency,timezone_name');

    const adAccountsResponse = await fetch(adAccountsUrl.toString());
    const adAccountsData = await adAccountsResponse.json();

    if (!adAccountsData.data || adAccountsData.data.length === 0) {
      logOAuthAttempt('meta', false, organizationId, 'no_ad_accounts');
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=no_ad_accounts`
      );
    }

    // 7. Salvar token (usando organization_id validado do state!)
    const firstAccount = adAccountsData.data[0];
    const supabase = getSupabaseAdmin();

    await supabase.from('meta_accounts').upsert({
      organization_id: organizationId, // ← Vem do state validado, não do client!
      access_token: longLivedToken,
      ad_account_id: firstAccount.account_id,
      ad_account_name: firstAccount.name,
      currency: firstAccount.currency,
      timezone: firstAccount.timezone_name,
      is_active: true,
      connected_by: userId, // Registrar quem conectou
      token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      last_sync_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,ad_account_id' });

    logOAuthAttempt('meta', true, organizationId);

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&success=meta_connected`
    );
  } catch (error: any) {
    console.error('Meta OAuth error:', error);
    logOAuthAttempt('meta', false, organizationId, error.message);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=meta_oauth_failed`
    );
  }
}
