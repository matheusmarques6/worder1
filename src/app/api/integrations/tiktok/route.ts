import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const orgParam = searchParams.get('organizationId') || searchParams.get('organization_id');
  if (orgParam && orgParam !== organizationId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { data, error } = await supabase
      .from('tiktok_accounts')
      .select('*')
      .eq('organization_id', organizationId);

    if (error) throw error;
    return NextResponse.json({ accounts: data || [] });
  } catch (error: any) {
    console.error('TikTok GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'connect') {
      const clientId = process.env.TIKTOK_CLIENT_KEY;
      const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/tiktok/callback`;
      const state = Buffer.from(JSON.stringify({ organizationId, userId: auth.user.id })).toString('base64');
      const authUrl = `https://business-api.tiktok.com/portal/auth?app_id=${clientId}&redirect_uri=${redirectUri}&state=${state}`;
      
      return NextResponse.json({ authUrl });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('TikTok POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');

  if (!accountId) {
    return NextResponse.json({ error: 'accountId required' }, { status: 400 });
  }

  try {
    const { error } = await supabase
      .from('tiktok_accounts')
      .delete()
      .eq('id', accountId)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('TikTok DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
