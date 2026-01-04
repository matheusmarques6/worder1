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
      .from('google_accounts')
      .select('*')
      .eq('organization_id', organizationId);

    if (error) throw error;
    return NextResponse.json({ accounts: data || [] });
  } catch (error: any) {
    console.error('Google GET error:', error);
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
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`;
      const scope = 'https://www.googleapis.com/auth/adwords';
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${organizationId}`;
      
      return NextResponse.json({ authUrl });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Google POST error:', error);
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
      .from('google_accounts')
      .delete()
      .eq('id', accountId)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Google DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
