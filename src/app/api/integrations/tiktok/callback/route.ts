import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { consumeOAuthState, logOAuthAttempt } from '@/lib/oauth-security';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const authCode = searchParams.get('auth_code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // 1. Verificar erro do TikTok
  if (error) {
    logOAuthAttempt('tiktok', false, undefined, `tiktok_error: ${error}`);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=tiktok_${error}`
    );
  }

  // 2. Verificar parâmetros obrigatórios
  if (!authCode || !state) {
    logOAuthAttempt('tiktok', false, undefined, 'missing_params');
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=missing_params`
    );
  }

  // 3. VALIDAR STATE (CRÍTICO!)
  const stateData = await consumeOAuthState(state, 'tiktok');
  
  if (!stateData) {
    logOAuthAttempt('tiktok', false, undefined, 'invalid_or_expired_state');
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=invalid_state`
    );
  }

  const { organizationId, userId } = stateData;

  try {
    // 4. Trocar auth code por access token
    const tokenResponse = await fetch('https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: process.env.TIKTOK_APP_ID,
        secret: process.env.TIKTOK_APP_SECRET,
        auth_code: authCode,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.code !== 0) {
      throw new Error(tokenData.message || 'Failed to get access token');
    }

    const { access_token, advertiser_ids } = tokenData.data;

    if (!advertiser_ids || advertiser_ids.length === 0) {
      logOAuthAttempt('tiktok', false, organizationId, 'no_advertisers');
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=no_tiktok_advertisers`
      );
    }

    // 5. Buscar info do advertiser
    const advertiserResponse = await fetch(
      `https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?` +
      `advertiser_ids=${JSON.stringify(advertiser_ids)}&fields=${JSON.stringify(['name', 'currency', 'timezone'])}`,
      {
        headers: {
          'Access-Token': access_token,
          'Content-Type': 'application/json',
        },
      }
    );

    const advertiserData = await advertiserResponse.json();

    if (advertiserData.code !== 0) {
      throw new Error(advertiserData.message || 'Failed to get advertiser info');
    }

    // 6. Salvar token (usando organization_id validado do state!)
    const advertiser = advertiserData.data.list[0];
    const supabase = getSupabaseAdmin();

    await supabase.from('tiktok_accounts').upsert({
      organization_id: organizationId, // ← Vem do state validado, não do client!
      access_token: access_token,
      advertiser_id: advertiser_ids[0],
      advertiser_name: advertiser?.name || `Advertiser ${advertiser_ids[0]}`,
      currency: advertiser?.currency || 'BRL',
      timezone: advertiser?.timezone || 'America/Sao_Paulo',
      is_active: true,
      connected_by: userId, // Registrar quem conectou
      last_sync_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,advertiser_id' });

    logOAuthAttempt('tiktok', true, organizationId);

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&success=tiktok_connected`
    );
  } catch (error: any) {
    console.error('TikTok OAuth error:', error);
    logOAuthAttempt('tiktok', false, organizationId, error.message);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=tiktok_oauth_failed`
    );
  }
}
