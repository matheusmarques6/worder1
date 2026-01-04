import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const { searchParams } = new URL(request.url);
    const shop = searchParams.get('shop');

    if (!shop) {
      return NextResponse.json({ error: 'Shop domain required' }, { status: 400 });
    }

    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/shopify/callback`;
    const scopes = 'read_products,read_orders,read_customers,write_customers';
    const state = Buffer.from(JSON.stringify({ organizationId, userId: auth.user.id })).toString('base64');

    const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;

    return NextResponse.json({ authUrl });
  } catch (error: any) {
    console.error('Shopify Auth GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
