import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // organizationId
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=google_${error}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=missing_params`
    );
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }

    const { access_token, refresh_token } = tokenData;

    if (!refresh_token) {
      throw new Error('No refresh token received. Please revoke access and try again.');
    }

    // Get accessible customer IDs using Google Ads API
    const customersResponse = await fetch(
      'https://googleads.googleapis.com/v16/customers:listAccessibleCustomers',
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
        },
      }
    );

    const customersData = await customersResponse.json();

    if (!customersData.resourceNames || customersData.resourceNames.length === 0) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=no_google_ads_accounts`
      );
    }

    // Get first customer ID (format: customers/1234567890)
    const customerId = customersData.resourceNames[0].split('/')[1];

    // Get customer details
    const customerDetailResponse = await fetch(
      `https://googleads.googleapis.com/v16/customers/${customerId}`,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
        },
      }
    );

    const customerDetail = await customerDetailResponse.json();

    // Save to database
    const supabase = getSupabaseClient();

    await supabase?.from('google_ads_accounts').upsert({
      organization_id: state,
      refresh_token: refresh_token,
      customer_id: customerId,
      customer_name: customerDetail.descriptiveName || `Account ${customerId}`,
      currency: customerDetail.currencyCode || 'BRL',
      timezone: customerDetail.timeZone || 'America/Sao_Paulo',
      is_active: true,
      last_sync_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,customer_id' });

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&success=google_connected`
    );
  } catch (error: any) {
    console.error('Google OAuth error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=integrations&error=google_oauth_failed`
    );
  }
}
