import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';

const META_API_VERSION = 'v19.0';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // organizationId
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=meta_${error}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=missing_params`
    );
  }

  try {
    // Exchange code for access token
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

    // Get long-lived token
    const longLivedUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`);
    longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longLivedUrl.searchParams.set('client_id', process.env.META_APP_ID!);
    longLivedUrl.searchParams.set('client_secret', process.env.META_APP_SECRET!);
    longLivedUrl.searchParams.set('fb_exchange_token', accessToken);

    const longLivedResponse = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedResponse.json();

    const longLivedToken = longLivedData.access_token || accessToken;

    // Get user's ad accounts
    const adAccountsUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/me/adaccounts`);
    adAccountsUrl.searchParams.set('access_token', longLivedToken);
    adAccountsUrl.searchParams.set('fields', 'id,name,account_id,currency,timezone_name');

    const adAccountsResponse = await fetch(adAccountsUrl.toString());
    const adAccountsData = await adAccountsResponse.json();

    if (!adAccountsData.data || adAccountsData.data.length === 0) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=no_ad_accounts`
      );
    }

    // Store token and redirect to account selection or auto-connect first account
    const firstAccount = adAccountsData.data[0];
    const supabase = getSupabaseClient();

    await supabase?.from('meta_accounts').upsert({
      organization_id: state,
      access_token: longLivedToken,
      ad_account_id: firstAccount.account_id,
      ad_account_name: firstAccount.name,
      currency: firstAccount.currency,
      timezone: firstAccount.timezone_name,
      is_active: true,
      token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // ~60 days
      last_sync_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,ad_account_id' });

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&success=meta_connected`
    );
  } catch (error: any) {
    console.error('Meta OAuth error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=meta_oauth_failed`
    );
  }
}
