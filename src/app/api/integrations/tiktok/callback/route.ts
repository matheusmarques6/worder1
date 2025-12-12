import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const authCode = searchParams.get('auth_code');
  const state = searchParams.get('state'); // organizationId
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=tiktok_${error}`
    );
  }

  if (!authCode || !state) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=missing_params`
    );
  }

  try {
    // Exchange auth code for access token
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
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=no_tiktok_advertisers`
      );
    }

    // Get advertiser info
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

    const advertiser = advertiserData.data.list[0];
    const supabase = getSupabaseClient();

    await supabase?.from('tiktok_accounts').upsert({
      organization_id: state,
      access_token: access_token,
      advertiser_id: advertiser_ids[0],
      advertiser_name: advertiser?.name || `Advertiser ${advertiser_ids[0]}`,
      currency: advertiser?.currency || 'BRL',
      timezone: advertiser?.timezone || 'America/Sao_Paulo',
      is_active: true,
      last_sync_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,advertiser_id' });

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&success=tiktok_connected`
    );
  } catch (error: any) {
    console.error('TikTok OAuth error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=tiktok_oauth_failed`
    );
  }
}
